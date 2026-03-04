/**
 * In-browser LLM inference via @huggingface/transformers (ONNX + WebAssembly/WebGPU).
 *
 * Model weights are downloaded once from HuggingFace Hub and cached by the
 * browser's Cache API — subsequent loads are instant and work offline.
 *
 * The 21 MB ONNX WASM runtime is fetched from the jsDelivr CDN (see vite.config.ts
 * for the build-time redirect that prevents it being inlined into the HTML).
 */

import { pipeline, env } from '@huggingface/transformers';
import type { ContentMap, AssembledBlock } from './content-extract';
import type { EnrichedSchema, EnrichedSection, ImpactCard, HeroFields, SectionType } from './premium-renderer';
import { buildPremiumFromSchema } from './premium-renderer';

// ── WASM CDN path ─────────────────────────────────────────────────────────────
// Mirrors vite.config.ts wasmCdnRedirect — belt-and-suspenders in case the
// build-time URL replacement doesn't cover a code path.
const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (env.backends.onnx as any).wasm.wasmPaths = WASM_CDN;
} catch { /* already initialised or unavailable */ }

// ── Public constants ──────────────────────────────────────────────────────────

export const BROWSER_LLM_MODELS: Record<string, string> = {
  'onnx-community/Qwen3-0.6B-ONNX':          'Qwen 3 0.6B (~570 MB)',
  'onnx-community/Qwen2.5-0.5B-Instruct':    'Qwen 2.5 0.5B (~350 MB)',
  'HuggingFaceTB/SmolLM2-360M-Instruct':     'SmolLM2 360M (~200 MB)',
  'HuggingFaceTB/SmolLM2-135M-Instruct':     'SmolLM2 135M (~90 MB)',
};

export const DEFAULT_BROWSER_MODEL = 'onnx-community/Qwen3-0.6B-ONNX';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BrowserLLMStatus = 'idle' | 'downloading' | 'ready' | 'error';

export interface BrowserLLMProgress {
  status:    BrowserLLMStatus;
  progress?: number;   // 0-100
  message:   string;
}

type ProgressCallback = (info: BrowserLLMProgress) => void;

// ── Singleton engine ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _engine:      any                  = null;
let _loadedModel  = '';
let _status:      BrowserLLMStatus     = 'idle';
let _initPromise: Promise<void> | null = null;

export function getBrowserLLMStatus(): BrowserLLMStatus { return _status; }
export function isBrowserLLMReady():    boolean          { return _status === 'ready' && _engine !== null; }

/** Reset engine so a different model can be loaded on the next initBrowserLLM call. */
export function resetBrowserLLM(): void {
  _engine      = null;
  _loadedModel = '';
  _status      = 'idle';
  _initPromise = null;
}

export async function initBrowserLLM(
  model       = DEFAULT_BROWSER_MODEL,
  onProgress?: ProgressCallback,
): Promise<void> {
  if (_status === 'ready' && _loadedModel === model) {
    onProgress?.({ status: 'ready', progress: 100, message: 'AI ready' });
    return;
  }
  // Model changed — discard current engine
  if (_loadedModel && _loadedModel !== model) resetBrowserLLM();

  // De-duplicate concurrent calls
  if (_initPromise) return _initPromise;

  _initPromise = _doInit(model, onProgress);
  return _initPromise;
}

async function _doInit(model: string, onProgress?: ProgressCallback): Promise<void> {
  _status      = 'downloading';
  _loadedModel = model;
  onProgress?.({ status: 'downloading', progress: 0, message: 'Loading AI model…' });

  // Aggregate per-file progress into one percentage
  const fileProgress: Record<string, number> = {};

  try {
    _engine = await pipeline('text-generation', model, {
      dtype:  { webgpu: 'q4f16', wasm: 'q4' },
      device: 'auto',  // WebGPU when available, WASM otherwise
      progress_callback: (raw: unknown) => {
        const p = raw as { status: string; progress?: number; file?: string };
        if (p.status === 'progress' && p.file && typeof p.progress === 'number') {
          fileProgress[p.file] = p.progress;
          const values = Object.values(fileProgress);
          const avg    = Math.round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.length));
          onProgress?.({ status: 'downloading', progress: avg, message: `AI model ${avg}%` });
        }
      },
    });
    _status = 'ready';
    onProgress?.({ status: 'ready', progress: 100, message: 'AI ready' });
  } catch (e) {
    _status      = 'error';
    _loadedModel = '';
    _initPromise = null;
    onProgress?.({ status: 'error', message: 'AI model failed to load' });
    console.warn('[browser-llm] init failed:', e);
  }
}

// ── Heading validation ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a document-structure auditor. \
Review section headings extracted from a business document.

For each heading decide:
- "keep"   — genuine concise heading (≤8 words)
- "rename" — genuine but too long (>8 words); provide a short "label" (≤6 words)
- "body"   — body text accidentally styled as a heading

Respond ONLY with valid JSON matching this exact schema, no other text:
{"results":[{"i":0,"action":"keep"},{"i":1,"action":"rename","label":"Short Label"},{"i":2,"action":"body"}]}`;

export async function validateHeadingsInBrowser(contentMap: ContentMap): Promise<ContentMap> {
  if (!isBrowserLLMReady()) return contentMap;
  if (contentMap.sections.length === 0) return contentMap;

  try {
    const numbered = contentMap.sections
      .map((s, i) => `${i}: "${s.heading.replace(/"/g, '\\"')}"`)
      .join('\n');

    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
    const output = await _engine(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `Audit these headings:\n${numbered}` },
      ],
      { max_new_tokens: 512, temperature: 0.1, do_sample: false },
    );
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */

    // output: [{ generated_text: [{role,content}, ...] }]
    const genText = (output as Array<{ generated_text: unknown }>)[0]?.generated_text;
    let raw = '';
    if (Array.isArray(genText)) {
      const last = genText[genText.length - 1] as { role: string; content: string };
      raw = last?.content?.trim() ?? '';
    } else {
      raw = String(genText ?? '').trim();
    }

    // Strip markdown code fences, then find first JSON object
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return contentMap;

    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      results: Array<{ i: number; action: 'keep' | 'body' | 'rename'; label?: string }>;
    };
    if (!Array.isArray(parsed.results)) return contentMap;

    return applyCorrections(contentMap, parsed.results);
  } catch {
    return contentMap;
  }
}

// ── Post-assembly polish ──────────────────────────────────────────────────────

const POLISH_SYSTEM = `You are a professional web copywriter polishing auto-generated website content.
Keep all factual data intact. Respond ONLY with valid JSON matching the schema provided.`;

interface PolishResult {
  heroTagline?: string;
  subtitles?:  Array<{ i: number; subtitle: string }>;
  headings?:   Array<{ i: number; heading: string }>;
}

export async function polishAssembledBlocksInBrowser(
  blocks: AssembledBlock[],
  pageTitle: string,
): Promise<AssembledBlock[]> {
  if (!isBrowserLLMReady()) return blocks;

  const heroIdx = blocks.findIndex(b => b.type === 'hero');
  const featureIndices = blocks
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.type === 'features')
    .map(({ i }) => i);
  const longHeadingIndices = blocks
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => {
      if (['nav', 'footer', 'hero', 'stats', 'gallery'].includes(b.type)) return false;
      const h = String(b.prefill['content.heading'] ?? b.prefill['content.sectionTitle'] ?? '');
      return h.split(/\s+/).length > 7;
    })
    .map(({ i }) => i);

  if (heroIdx === -1 && featureIndices.length === 0 && longHeadingIndices.length === 0) {
    return blocks;
  }

  const parts: string[] = [`PAGE TITLE: "${pageTitle}"`];

  if (heroIdx !== -1) {
    const tagline = String(blocks[heroIdx].prefill['content.subheading'] ?? '');
    parts.push(`\nHERO (block ${heroIdx}):\n  tagline: "${tagline}"\n  Task: rewrite as punchy, professional (max 15 words, no corporate jargon)`);
  }
  if (featureIndices.length > 0) {
    const lines = featureIndices.map(i => `  block ${i}: "${String(blocks[i].prefill['content.sectionTitle'] ?? '')}"`);
    parts.push(`\nFEATURES SECTIONS — generate a one-sentence subtitle (max 15 words) for each:\n${lines.join('\n')}`);
  }
  if (longHeadingIndices.length > 0) {
    const lines = longHeadingIndices.map(i => {
      const h = String(blocks[i].prefill['content.heading'] ?? blocks[i].prefill['content.sectionTitle'] ?? '');
      return `  block ${i}: "${h}"`;
    });
    parts.push(`\nLONG HEADINGS — shorten to ≤6 words while preserving meaning:\n${lines.join('\n')}`);
  }

  parts.push(`\nReturn JSON:\n{"heroTagline":"...","subtitles":[{"i":N,"subtitle":"..."}],"headings":[{"i":N,"heading":"..."}]}`);

  try {
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
    const output = await _engine(
      [
        { role: 'system', content: POLISH_SYSTEM },
        { role: 'user',   content: parts.join('\n') },
      ],
      { max_new_tokens: 1024, temperature: 0.15, do_sample: false },
    );
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */

    const genText = (output as Array<{ generated_text: unknown }>)[0]?.generated_text;
    let raw = '';
    if (Array.isArray(genText)) {
      const last = genText[genText.length - 1] as { role: string; content: string };
      raw = last?.content?.trim() ?? '';
    } else {
      raw = String(genText ?? '').trim();
    }

    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return blocks;

    const result = JSON.parse(raw.slice(start, end + 1)) as PolishResult;
    const updated = blocks.map(b => ({ ...b, prefill: { ...b.prefill } }));

    if (result.heroTagline && heroIdx !== -1) {
      updated[heroIdx].prefill['content.subheading'] = result.heroTagline;
    }
    for (const { i, subtitle } of result.subtitles ?? []) {
      if (updated[i]) updated[i].prefill['content.sectionSub'] = subtitle;
    }
    for (const { i, heading } of result.headings ?? []) {
      if (!updated[i]) continue;
      if ('content.heading' in updated[i].prefill) {
        updated[i].prefill['content.heading'] = heading;
      } else {
        updated[i].prefill['content.sectionTitle'] = heading;
      }
    }
    return updated;
  } catch {
    return blocks;
  }
}

function applyCorrections(
  contentMap: ContentMap,
  results: Array<{ i: number; action: 'keep' | 'body' | 'rename'; label?: string }>,
): ContentMap {
  const sections = contentMap.sections.map(s => ({
    ...s,
    paragraphs:  [...s.paragraphs],
    subSections: s.subSections.map(ss => ({ ...ss, paragraphs: [...ss.paragraphs] })),
  }));
  for (const r of results) {
    const sec = sections[r.i];
    if (!sec) continue;
    if (r.action === 'rename' && r.label) {
      sec.heading = r.label.trim();
    } else if (r.action === 'body') {
      if (sec.heading.trim()) sec.paragraphs.unshift(sec.heading.trim());
      sec.heading = '';
    }
  }
  return { ...contentMap, sections };
}

// ── Browser LLM premium generation ───────────────────────────────────────────

/**
 * Shared engine-call helper. Runs the loaded model with given messages,
 * extracts the assistant reply, strips fences, and returns the first
 * JSON object substring (`{...}`) or null on any failure.
 */
async function callBrowserEngine(
  system: string,
  user: string,
  maxTokens: number,
  temp: number,
): Promise<string | null> {
  if (!isBrowserLLMReady()) return null;
  try {
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
    const output = await _engine(
      [
        { role: 'system', content: system },
        { role: 'user',   content: user   },
      ],
      { max_new_tokens: maxTokens, temperature: temp, do_sample: false },
    );
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */

    const genText = (output as Array<{ generated_text: unknown }>)[0]?.generated_text;
    let raw = '';
    if (Array.isArray(genText)) {
      const last = genText[genText.length - 1] as { role: string; content: string };
      raw = last?.content?.trim() ?? '';
    } else {
      raw = String(genText ?? '').trim();
    }

    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return raw.slice(start, end + 1);
  } catch {
    return null;
  }
}

// ── Micro-task 1: classify sections ──────────────────────────────────────────

async function _classifySections(
  contentMap: ContentMap,
): Promise<Array<{ i: number; type: SectionType }>> {
  const sections = contentMap.sections.slice(0, 10);
  const lines = sections.map((s, i) => {
    const preview = (s.paragraphs[0] ?? '').slice(0, 80);
    const hasStats = s.sectionStats.length > 0;
    return `${i}: "${s.heading.replace(/"/g, "'")}"|"${preview.replace(/"/g, "'")}"|hasStats:${hasStats}`;
  });

  const system = `Classify each document section into exactly one type: "impact-cards", "stats-highlight", "two-col", "text", or "closing".
Respond ONLY with valid JSON: {"results":[{"i":0,"type":"impact-cards"}]}`;
  const user = `Classify these sections:\n${lines.join('\n')}`;

  const raw = await callBrowserEngine(system, user, 256, 0.1);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { results?: Array<{ i: number; type: string }> };
      if (Array.isArray(parsed.results)) {
        const result = parsed.results.map(r => ({
          i:    r.i,
          type: (['impact-cards','stats-highlight','two-col','text','closing'].includes(r.type)
            ? r.type : 'text') as SectionType,
        }));
        capStatsHighlight(result);
        return result;
      }
    } catch { /* fall through to heuristic */ }
  }

  // Heuristic fallback
  const result = sections.map((s, i) => {
    const closingKw = /thank|closing|conclusion|together|future|forward/i.test(s.heading);
    const isLast    = i === sections.length - 1;
    let type: SectionType;
    if ((isLast || closingKw) && i > 0) {
      type = 'closing';
    } else if (s.sectionStats.length >= 2) {
      type = 'stats-highlight';
    } else if (s.subSections.length >= 2) {
      type = 'impact-cards';
    } else {
      type = 'text';
    }
    return { i, type };
  });
  capStatsHighlight(result);
  return result;
}

/** Ensure no more than 40% of sections are stats-highlight (converts excess to text/two-col). */
function capStatsHighlight(result: Array<{ i: number; type: SectionType }>): void {
  const maxStatsHL = Math.max(1, Math.round(result.length * 0.4));
  let statsHLCount = result.filter(r => r.type === 'stats-highlight').length;
  if (statsHLCount <= maxStatsHL) return;
  for (const r of result) {
    if (statsHLCount <= maxStatsHL) break;
    if (r.type !== 'stats-highlight') continue;
    r.type = r.i % 2 === 0 ? 'text' : 'two-col';
    statsHLCount--;
  }
}

// ── Micro-task 2: extract hero fields ────────────────────────────────────────

async function _extractHero(contentMap: ContentMap): Promise<HeroFields> {
  const titlePart   = contentMap.pageTitle.slice(0, 100);
  const heroPart    = (contentMap.heroParagraph ?? '').slice(0, 200);
  const firstSecPar = (contentMap.sections[0]?.paragraphs[0] ?? '').slice(0, 200);

  const system = `Extract hero fields for a premium website from a document title and intro text.
Respond ONLY with valid JSON: {"orgLine":"...","highlightPhrase":"...","tagline":"...","prose":"..."}
orgLine: organization or team name (≤5 words). highlightPhrase: 3-5 impactful words for gradient title highlight. tagline: punchy phrase ≤12 words. prose: 1-2 sentences about impact.`;
  const user = `Title: "${titlePart}"\nIntro: "${heroPart}"\nFirst section: "${firstSecPar}"`;

  const raw = await callBrowserEngine(system, user, 200, 0.2);
  if (raw) {
    try {
      const p = JSON.parse(raw) as Partial<HeroFields>;
      if (p.orgLine && p.highlightPhrase && p.tagline && p.prose) {
        return p as HeroFields;
      }
    } catch { /* fall through */ }
  }

  // Fallback
  const words = contentMap.pageTitle.split(/\s+/);
  return {
    orgLine:         words.slice(0, 3).join(' '),
    highlightPhrase: words.slice(-2).join(' '),
    tagline:         (contentMap.heroParagraph ?? contentMap.pageTitle).split('.')[0].slice(0, 80),
    prose:           contentMap.heroParagraph ?? contentMap.pageTitle,
  };
}

// ── Micro-task 3: badges and leads ───────────────────────────────────────────

async function _extractBadgesAndLeads(
  contentMap: ContentMap,
  typesArr: Array<{ i: number; type: SectionType }>,
): Promise<Array<{ i: number; badge: string; lead: string }>> {
  const nonClosing = typesArr
    .filter(t => t.type !== 'closing')
    .slice(0, 8);

  const lines = nonClosing.map(t => {
    const s          = contentMap.sections[t.i];
    const firstSent  = (s?.paragraphs[0] ?? '').split('.')[0].slice(0, 120);
    return `${t.i}: "${(s?.heading ?? '').replace(/"/g, "'")}" | "${firstSent.replace(/"/g, "'")}"`;
  });

  const system = `Generate a short badge label (2-3 words) and a single lead sentence (≤18 words) for each section.
Respond ONLY with valid JSON: {"items":[{"i":0,"badge":"Short Label","lead":"One sentence."}]}`;
  const user = `Sections:\n${lines.join('\n')}`;

  const raw = await callBrowserEngine(system, user, 350, 0.15);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { items?: Array<{ i: number; badge: string; lead: string }> };
      if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        return parsed.items;
      }
    } catch { /* fall through */ }
  }

  // Fallback: badge = first 3 words of heading, lead = first sentence
  return nonClosing.map(t => {
    const s    = contentMap.sections[t.i];
    const hdng = s?.heading ?? '';
    return {
      i:     t.i,
      badge: hdng.split(/\s+/).slice(0, 3).join(' '),
      lead:  (s?.paragraphs[0] ?? '').split('.')[0].trim() + '.',
    };
  });
}

// ── Micro-task 4: impact cards ────────────────────────────────────────────────

async function _enrichImpactCards(
  sectionIndex: number,
  section: ContentMap['sections'][number],
): Promise<ImpactCard[]> {
  const candidates: Array<{ title: string; body: string }> =
    section.subSections.map(ss => ({ title: ss.heading, body: ss.paragraphs[0] ?? '' }));

  if (candidates.length === 0) return [];

  const lines = candidates.slice(0, 6).map((c, j) =>
    `${j}: title="${c.title.replace(/"/g, "'")}" | facts="${c.body.slice(0, 120).replace(/"/g, "'")}"`
  );

  const system = `Generate impact card content from section items. For each item, extract: title (concise label), stat (a numeric highlight like "300K" or null if none), and desc (15-20 word description).
Respond ONLY with valid JSON: {"sectionIndex":N,"cards":[{"title":"...","stat":"300K","desc":"..."}]}`;
  const user = `Section ${sectionIndex} items:\n${lines.join('\n')}`;

  const statRegex = /\b(\d[\d,.]*\s*(?:%|K|M|B|\+)?)\b/;

  const raw = await callBrowserEngine(system, user, 400, 0.15);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { cards?: Array<{ title: string; stat?: string | null; desc: string }> };
      if (Array.isArray(parsed.cards) && parsed.cards.length > 0) {
        return parsed.cards.map(c => ({
          title: c.title,
          stat:  c.stat && c.stat !== 'null' ? c.stat : undefined,
          desc:  c.desc,
        }));
      }
    } catch { /* fall through */ }
  }

  // Fallback
  return candidates.slice(0, 4).map(c => {
    const statMatch = c.body.match(statRegex);
    return {
      title: c.title,
      stat:  statMatch ? statMatch[1] : undefined,
      desc:  c.body.split('.')[0].slice(0, 100),
    };
  });
}

// ── Micro-task 5: pick editorial quotes ──────────────────────────────────────

async function _pickQuotes(
  contentMap: ContentMap,
  typesArr: Array<{ i: number; type: SectionType }>,
): Promise<Array<{ i: number; quote: string }>> {
  // Pre-extract candidates per non-closing section
  type Candidate = { i: number; a: string; b: string };
  const candidates: Candidate[] = [];

  for (const { i, type } of typesArr) {
    if (type === 'closing') continue;
    const s   = contentMap.sections[i];
    if (!s) continue;
    const a   = (s.paragraphs[0] ?? '').split('.')[0].trim();
    const allSents = s.paragraphs.flatMap(p => p.split(/(?<=[.!?])\s+/));
    const b   = allSents.reduce((acc, sent) => sent.length > acc.length ? sent : acc, '');
    if (a && b && a !== b) candidates.push({ i, a, b });
  }

  if (candidates.length === 0) return [];

  const lines = candidates.slice(0, 6).map(c =>
    `Section ${c.i}:\n  A: "${c.a.slice(0, 120).replace(/"/g, "'")}"\n  B: "${c.b.slice(0, 120).replace(/"/g, "'")}"`
  );

  const system = `Pick the most impactful quote candidate (A or B) for each section's editorial pull-quote.
Respond ONLY with valid JSON: {"picks":[{"i":0,"letter":"A"}]}`;
  const user = `Candidates:\n${lines.join('\n')}`;

  const raw = await callBrowserEngine(system, user, 150, 0.1);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { picks?: Array<{ i: number; letter: string }> };
      if (Array.isArray(parsed.picks)) {
        return parsed.picks.map(p => {
          const cand = candidates.find(c => c.i === p.i);
          if (!cand) return null;
          const quote = p.letter === 'B' ? cand.b : cand.a;
          return { i: p.i, quote };
        }).filter((x): x is { i: number; quote: string } => x !== null);
      }
    } catch { /* fall through */ }
  }

  // Fallback: always pick A
  return candidates.map(c => ({ i: c.i, quote: c.a }));
}

// ── Public export ─────────────────────────────────────────────────────────────

/**
 * Generate a premium HTML page using 5 sequential browser LLM micro-tasks,
 * then assemble via TypeScript renderer (buildPremiumFromSchema).
 * Returns complete <!DOCTYPE html> string or null on failure.
 */
export async function generatePremiumPageBrowserLLM(
  contentMap: ContentMap,
  imagePaths: string[],
  onProgress?: (msg: string) => void,
): Promise<string | null> {
  if (!isBrowserLLMReady()) return null;

  try {
    // Task 1: classify sections
    onProgress?.('Step 1/5: Classifying sections…');
    const typesArr = await _classifySections(contentMap);
    const typeMap  = new Map(typesArr.map(t => [t.i, t.type]));

    // Task 2: extract hero
    onProgress?.('Step 2/5: Extracting hero content…');
    const hero = await _extractHero(contentMap);
    hero.imagePath = imagePaths[0];

    // Task 3: badges and leads
    onProgress?.('Step 3/5: Generating section labels…');
    const badgeLeads    = await _extractBadgesAndLeads(contentMap, typesArr);
    const badgeLeadMap  = new Map(badgeLeads.map(b => [b.i, b]));

    // Task 4: impact cards (max 4 impact-card sections)
    onProgress?.('Step 4/5: Enriching impact cards…');
    const cardMap = new Map<number, ImpactCard[]>();
    let   cardCount = 0;
    for (const { i, type } of typesArr) {
      if (type !== 'impact-cards') continue;
      if (cardCount >= 4) break;
      const sec = contentMap.sections[i];
      if (!sec) continue;
      if (sec.subSections.length > 0) {
        cardMap.set(i, await _enrichImpactCards(i, sec));
        cardCount++;
      }
    }

    // Task 5: pick quotes
    onProgress?.('Step 5/5: Selecting editorial quotes…');
    const quoteItems = await _pickQuotes(contentMap, typesArr);
    const quoteMap   = new Map(quoteItems.map(q => [q.i, q.quote]));

    // Distribute images to sections.
    // image[0] → hero. Remaining images are placed in two passes:
    //   Pass 1: honour sectionImages hints (exact document positions); all hints
    //           for a section go in — first becomes imagePath, rest go in photoGrid.
    //   Pass 2: stride-fill any remaining images into sections still lacking one.
    //
    // text sections keep their type — renderText now shows photo-item inline.
    // two-col sections keep their type — renderTwoCol shows two-col__media.
    // closing sections use closing__photo when imagePath is set.
    const sectionImagePath = new Map<number, string>();
    const sectionPhotoGrid = new Map<number, string[]>();

    if (imagePaths.length > 1) {
      const filenameToPath = new Map<string, string>();
      contentMap.images.forEach((img, idx) => {
        if (idx === 0) return; // hero image
        const safe = img.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        filenameToPath.set(img.filename, imagePaths[idx]);
        filenameToPath.set(safe, imagePaths[idx]);
      });

      const usedPaths = new Set<string>();

      // Pass 1: position-aware placement from doc-extractor hints
      for (const { i, type } of typesArr) {
        if (type === 'closing') continue;
        const sec = contentMap.sections[i];
        if (!sec?.sectionImages?.length) continue;
        for (const fn of sec.sectionImages) {
          const path = filenameToPath.get(fn)
            ?? filenameToPath.get(fn.replace(/[^a-zA-Z0-9._-]/g, '_'));
          if (!path || usedPaths.has(path)) continue;
          usedPaths.add(path);
          if (!sectionImagePath.has(i)) {
            sectionImagePath.set(i, path);
          } else {
            const grid = sectionPhotoGrid.get(i) ?? [];
            grid.push(path);
            sectionPhotoGrid.set(i, grid);
          }
        }
      }

      // Pass 2: stride-fill remaining images into sections still without one
      const remainingPaths = imagePaths.slice(1).filter(p => !usedPaths.has(p));
      if (remainingPaths.length > 0) {
        const eligible = typesArr.filter(
          t => t.type !== 'closing' && !sectionImagePath.has(t.i),
        );
        if (eligible.length > 0) {
          const stride = remainingPaths.length >= eligible.length
            ? 1
            : Math.round(eligible.length / remainingPaths.length);
          let ri = 0;
          for (let ei = 0; ei < eligible.length && ri < remainingPaths.length; ei += stride) {
            sectionImagePath.set(eligible[ei].i, remainingPaths[ri++]);
          }
        }
      }
    }

    // Build nav links from sections
    const navLinks: Array<{ text: string; href: string }> = [];
    const usedIds = new Set<string>();

    // Build sections
    const sections: EnrichedSection[] = contentMap.sections
      .slice(0, typesArr.length)
      .map((s, idx) => {
        const type = typeMap.get(idx) ?? 'text';
        const bl   = badgeLeadMap.get(idx);

        // Build sectionId (kebab-case), deduplicate
        let sectionId = s.heading
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          || `section-${idx + 1}`;
        if (usedIds.has(sectionId)) {
          let suffix = 2;
          while (usedIds.has(`${sectionId}-${suffix}`)) suffix++;
          sectionId = `${sectionId}-${suffix}`;
        }
        usedIds.add(sectionId);

        if (type !== 'closing') {
          navLinks.push({ text: s.heading.split(/\s+/).slice(0, 3).join(' '), href: `#${sectionId}` });
        }

        return {
          index:        idx,
          heading:      s.heading,
          sectionId,
          type,
          badge:        bl?.badge ?? s.heading.split(/\s+/).slice(0, 3).join(' '),
          lead:         bl?.lead  ?? (s.paragraphs[0] ?? '').split('.')[0].trim() + '.',
          cards:        cardMap.get(idx) ?? [],
          sectionStats: s.sectionStats.map(st => ({ value: st.value, label: st.label })),
          paragraphs:   s.paragraphs,
          quote:        quoteMap.get(idx),
          imagePath:    sectionImagePath.get(idx),
          photoGrid:    sectionPhotoGrid.get(idx),
        } satisfies EnrichedSection;
      });

    const schema: EnrichedSchema = {
      pageTitle:   contentMap.pageTitle,
      hero,
      sections,
      globalStats: contentMap.stats
        .filter(st => st.sourceSection === null)
        .map(st => ({ value: st.value, label: st.label })),
      navLinks,
    };

    return buildPremiumFromSchema(schema);
  } catch (e) {
    console.warn('[browser-llm] generatePremiumPageBrowserLLM failed:', e);
    return null;
  }
}
