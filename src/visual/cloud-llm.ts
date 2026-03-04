/**
 * Cloud AI integration — Google Gemini (gemini-2.0-flash).
 *
 * Auth: API key from aistudio.google.com/apikey (free, any Google account,
 * 1,500 req/day). Stored in localStorage alongside the GitHub token.
 *
 * Tasks:
 *   • validateHeadingsCloud   — heading keep/rename/body (pre-assembleBlocks)
 *   • polishAssembledBlocks   — hero tagline + subtitles + heading improvements
 *                               (post-assembleBlocks, single API call)
 *   • verifyGeminiKey         — lightweight connectivity check
 */

import { state } from '../state';
import type { ContentMap, ContentSection } from './content-extract';
import type { AssembledBlock } from './content-extract';
import { assemblePremiumPage } from './premium-renderer';

// ── State helpers ─────────────────────────────────────────────────────────────

export function isGeminiReady(): boolean {
  return !!state.geminiApiKey.trim();
}

export function getGeminiConfig(): string {
  return state.geminiApiKey.trim();
}

/** Test the API key with a lightweight models-list request. */
export async function verifyGeminiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { signal: ctrl.signal },
    );
    clearTimeout(tid);
    if (res.ok) {
      return { ok: true, message: '✓ Connected — gemini-2.0-flash ready' };
    }
    const data = await res.json() as { error?: { message?: string } };
    return { ok: false, message: `✗ ${data.error?.message ?? `HTTP ${res.status}`}` };
  } catch (e) {
    clearTimeout(tid);
    return { ok: false, message: (e as Error).name === 'AbortError' ? '✗ Request timed out' : '✗ Could not reach Gemini API' };
  }
}

// ── Gemini REST client ────────────────────────────────────────────────────────

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const TIMEOUT_MS = 30_000;

interface GeminiRequest {
  system_instruction?: { parts: Array<{ text: string }> };
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  generationConfig?: {
    responseMimeType?: 'application/json' | 'text/plain';
    temperature?: number;
    maxOutputTokens?: number;
  };
}

async function callGemini(
  apiKey: string,
  system: string,
  user: string,
  jsonMode = true,
  maxOutputTokens = 1024,
): Promise<string | null> {
  const body: GeminiRequest = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) {
      console.warn('[cloud-llm] Gemini error', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch (e) {
    clearTimeout(tid);
    console.warn('[cloud-llm] Gemini call failed:', e);
    return null;
  }
}

// ── Task 1: Heading validation ────────────────────────────────────────────────

const HEADING_SYSTEM = `You are a document-structure auditor. Review section headings from a business document.

For each heading decide:
- "keep"   — genuine concise heading (≤8 words)
- "rename" — genuine but too long (>8 words); provide a short "label" (≤6 words)
- "body"   — body text accidentally styled as a heading

Respond ONLY with valid JSON:
{"results":[{"i":0,"action":"keep"},{"i":1,"action":"rename","label":"Short Label"},{"i":2,"action":"body"}]}`;

export async function validateHeadingsCloud(
  contentMap: ContentMap,
  apiKey: string,
): Promise<ContentMap> {
  if (contentMap.sections.length === 0) return contentMap;

  const numbered = contentMap.sections
    .map((s, i) => `${i}: "${s.heading.replace(/"/g, '\\"')}"`)
    .join('\n');

  const raw = await callGemini(apiKey, HEADING_SYSTEM, `Audit these headings:\n${numbered}`);
  if (!raw) return contentMap;

  try {
    const parsed = JSON.parse(raw) as {
      results: Array<{ i: number; action: 'keep' | 'body' | 'rename'; label?: string }>;
    };
    if (!Array.isArray(parsed.results)) return contentMap;

    const sections: ContentSection[] = contentMap.sections.map(s => ({
      ...s,
      paragraphs:  [...s.paragraphs],
      subSections: s.subSections.map(ss => ({ ...ss, paragraphs: [...ss.paragraphs] })),
    }));
    for (const r of parsed.results) {
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
  } catch {
    return contentMap;
  }
}

// ── Task 2–4: Post-assembly polish ────────────────────────────────────────────

const POLISH_SYSTEM = `You are a professional web copywriter polishing auto-generated website content.
Keep all factual data intact. Respond ONLY with valid JSON matching the schema provided.`;

interface PolishResult {
  heroTagline?: string;
  subtitles?:  Array<{ i: number; subtitle: string }>;
  headings?:   Array<{ i: number; heading: string }>;
}

export async function polishAssembledBlocks(
  blocks: AssembledBlock[],
  pageTitle: string,
  apiKey: string,
): Promise<AssembledBlock[]> {
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

  const raw = await callGemini(apiKey, POLISH_SYSTEM, parts.join('\n'));
  if (!raw) return blocks;

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const result  = JSON.parse(cleaned) as PolishResult;

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

// ── Full-page HTML generation ─────────────────────────────────────────────────

const HTML_GEN_SYSTEM = `You are a world-class web designer creating a bespoke, visually stunning annual-report microsite from a business document.

OUTPUT FORMAT: Return ONLY the HTML body content — from <body> to </body> inclusive. No <!DOCTYPE>, no <html>, no <head>, no <style>, no <script> tags.

AVAILABLE CSS CLASSES (use these — they are pre-defined):
• Layout: .container (1140px centered), .section + modifiers .section--dark .section--gray .section--light .section--deep, .section-marker (big bg number like "01")
• Nav: <nav class="sticky-nav"><div class="sticky-nav__bar"><div class="scroll-progress"></div><div class="sticky-nav__inner"><div class="sticky-nav__brand"><span class="sticky-nav__brand-text">Name</span></div><ul class="sticky-nav__links"><li><a class="sticky-nav__link" href="#id">Label</a></li></ul></div></div></nav>
• Hero: <section class="hero"><div class="hero__bg"><img src="..." alt=""></div><div class="hero__overlay"></div><div class="hero__content"><p class="hero__org">ORG NAME</p><h1 class="hero-title">Title <span class="highlight">words</span></h1><p class="hero__tagline">tagline</p><div class="hero__divider"></div><div class="hero__prose"><p>prose text</p></div></div><div class="hero__scroll-cue"><div class="scroll-line"></div><span>Scroll</span></div></section>
• Typography: h2, h3, .lead (large text), .pillar-badge (colored pill label), .section__header (wraps badge+h2+lead)
• Stats: <div class="stats-row"><div class="stat-inline"><div class="stat-inline__number">99%</div><div class="stat-inline__label">Label</div></div></div>
• Cards: <div class="impact-cards impact-cards--3"><div class="impact-card reveal"><div class="impact-card__stat">300K</div><div class="impact-card__label">Label</div><div class="impact-card__desc">Full description.</div></div></div>
• Split: <div class="two-col"><div class="two-col__content"><h3>...</h3><p>...</p></div><div class="two-col__media"><img src="..." alt="..."></div></div> — use .two-col--reverse to flip, .two-col--wide for 1.5/1 ratio
• Prose: .emphasis-block (large lead text with <em> for bold phrases)
• Quote: <div class="editorial-quote"><div class="editorial-quote__mark">"</div><div class="editorial-quote__text">Quote text</div></div>
• Footer: <footer class="footer"><div class="container"><div class="footer__inner"><div><div class="footer__brand">Name</div><p class="footer__tagline">desc</p></div></div><div class="footer__copyright">© Year</div></div></footer>
• Animations: .reveal / .reveal--left / .reveal--right (+ .reveal--delay-1/2/3) — add to cards, paragraphs, section content

DESIGN RULES:
1. Extract ALL key statistics — put every number in .stat-inline with value + label. Never omit stats.
2. Create .impact-card for every major initiative/program/achievement mentioned. Include stat OR brief description.
3. Use .two-col with images — one image per section where available. Alternate .two-col vs .two-col--reverse.
4. Alternate section backgrounds every section: --light → --gray → --dark → --light (vary for visual rhythm)
5. Every <section> gets a .section-marker child with its number text ("01", "02", ...)
6. Use .pillar-badge above every h2 to label the domain (e.g. "Associate Platforms", "Data & AI")
7. Use .editorial-quote for a compelling key statement from each major content section
8. Hero: first image as background; .hero__org = organization name; .hero-title with <span class="highlight"> on the key phrase; .hero__prose = 2-3 sentences overview
9. Sticky nav links every section by its id (kebab-case from heading)
10. Include the FULL content from every section — do not abbreviate or truncate anything
11. Add .reveal/.reveal--left/.reveal--right to impact-cards, two-col sections, stats-rows, and paragraphs
12. Use image paths exactly as provided (e.g. assets/image1.png)
13. End with a closing/CTA section (class="section section--dark") and the footer`;

/**
 * Generate a complete, bespoke premium HTML page from document content using Gemini.
 * Returns full <!DOCTYPE html> string or null on failure.
 */
export async function generateFullPageHTML(
  docText: string,
  pageTitle: string,
  imagePaths: string[],
  apiKey: string,
): Promise<string | null> {
  const imageList = imagePaths.length > 0
    ? `\nAVAILABLE IMAGES (use all of them, distribute across hero + sections):\n${imagePaths.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}\n`
    : '';

  const cleanDocText = docText.replace(/^\[IMAGE:[^\]]+\]\n?/gm, '');
  const userMsg =
    `PAGE TITLE: "${pageTitle}"${imageList}\nDOCUMENT CONTENT:\n${cleanDocText}\n\nCreate a complete, stunning body HTML using the design system. Every section of the document must be represented.`;

  const body = await callGemini(apiKey, HTML_GEN_SYSTEM, userMsg, false, 8192);
  if (!body) return null;
  return assemblePremiumPage(body, pageTitle);
}
