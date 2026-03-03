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
import type { ContentMap } from './content-extract';

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
  'onnx-community/Qwen2.5-0.5B-Instruct': 'Qwen 2.5 0.5B (~350 MB)',
  'HuggingFaceTB/SmolLM2-360M-Instruct':  'SmolLM2 360M (~200 MB)',
  'HuggingFaceTB/SmolLM2-135M-Instruct':  'SmolLM2 135M (~90 MB)',
};

export const DEFAULT_BROWSER_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';

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
      dtype:  'q4',
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
