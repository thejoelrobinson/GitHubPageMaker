/**
 * Optional Ollama LLM integration for validating/correcting section headings
 * extracted by the Doc-to-Page pipeline.
 *
 * Completely non-blocking: every public function catches its own errors and
 * falls back gracefully so the wizard always completes even if Ollama is absent.
 */

import type { ContentMap } from './content-extract';

// ── Public types ─────────────────────────────────────────────────────────────

export interface OllamaOpts {
  endpoint:  string;
  model:     string;
  timeoutMs?: number;
}

export interface OllamaProbeResult {
  available: boolean;
  models:    string[];
}

// ── Internal types ───────────────────────────────────────────────────────────

interface LLMHeadingResult {
  i:      number;
  action: 'keep' | 'body' | 'rename';
  label?: string;
}

interface LLMResponse {
  results: LLMHeadingResult[];
}

// ── Probe ────────────────────────────────────────────────────────────────────

/**
 * Quick availability check — hits GET /api/tags with a 3 s timeout.
 * Returns { available: false, models: [] } on any error.
 */
export async function detectOllama(endpoint: string): Promise<OllamaProbeResult> {
  const url = endpoint.replace(/\/$/, '') + '/api/tags';
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 3000);
    const res  = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return { available: false, models: [] };
    const data = await res.json() as { models?: Array<{ name: string }> };
    const models = (data.models ?? []).map(m => m.name);
    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}

// ── Main validator ────────────────────────────────────────────────────────────

/**
 * Run all section headings in `contentMap` past the LLM.
 * Returns a patched ContentMap on success, the original on any error.
 */
export async function validateHeadings(
  contentMap: ContentMap,
  opts: OllamaOpts,
): Promise<ContentMap> {
  if (contentMap.sections.length === 0) return contentMap;

  try {
    const headings = contentMap.sections.map(s => s.heading);
    const response = await callOllama(opts, headings);
    if (!response) return contentMap;
    return applyCorrections(contentMap, response.results);
  } catch {
    return contentMap;
  }
}

// ── Ollama chat call ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a document-structure auditor. You will receive a numbered list of section headings extracted from a business document. For each heading decide:
- "keep"   — it is a genuine, concise section heading (≤ 8 words)
- "rename" — it is a genuine heading but too long (> 8 words); also provide a short "label" (≤ 6 words)
- "body"   — it looks like body text that was accidentally styled as a heading

Respond ONLY with valid JSON in exactly this schema, no other text:
{"results":[{"i":0,"action":"keep"},{"i":1,"action":"rename","label":"Short Label"},{"i":2,"action":"body"}]}`;

async function callOllama(
  opts: OllamaOpts,
  headings: string[],
): Promise<LLMResponse | null> {
  const url = opts.endpoint.replace(/\/$/, '') + '/api/chat';
  const numbered = headings
    .map((h, i) => `${i}: "${h.replace(/"/g, '\\"')}"`)
    .join('\n');

  const body = JSON.stringify({
    model:   opts.model,
    stream:  false,
    format:  'json',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: `Audit these headings:\n${numbered}` },
    ],
    options: { temperature: 0.1, num_predict: 512 },
  });

  const timeoutMs = opts.timeoutMs ?? 30_000;
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal:  ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;

    const data = await res.json() as { message?: { content?: string } };
    let raw = data.message?.content ?? '';

    // Strip markdown code fences if present
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    const parsed = JSON.parse(raw) as LLMResponse;
    if (!Array.isArray(parsed.results)) return null;
    return parsed;
  } catch {
    clearTimeout(tid);
    return null;
  }
}

// ── Patch content map ─────────────────────────────────────────────────────────

function applyCorrections(
  contentMap: ContentMap,
  results: LLMHeadingResult[],
): ContentMap {
  // Deep-clone sections so the original is not mutated
  const sections = contentMap.sections.map(s => ({
    ...s,
    paragraphs: [...s.paragraphs],
    subSections: s.subSections.map(ss => ({ ...ss, paragraphs: [...ss.paragraphs] })),
  }));

  for (const result of results) {
    const sec = sections[result.i];
    if (!sec) continue;

    if (result.action === 'rename' && result.label) {
      sec.heading = result.label.trim();
    } else if (result.action === 'body') {
      // Demote: prepend old heading into paragraphs so content is preserved
      if (sec.heading.trim()) {
        sec.paragraphs.unshift(sec.heading.trim());
      }
      sec.heading = '';
    }
    // 'keep' → no change
  }

  return { ...contentMap, sections };
}
