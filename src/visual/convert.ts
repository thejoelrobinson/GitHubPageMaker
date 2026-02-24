/**
 * convert.ts
 *
 * Parses a raw HTML page into an array of visual blocks, one per top-level
 * structural element (nav, header, section, footer, etc.).
 *
 * Pure functions — no DOM dependency, no side effects, fully unit-testable.
 */

import type { Block } from '../types';
import { uid } from '../utils';

// ── Public API ────────────────────────────────────────────────────────

export interface ConvertResult {
  blocks:        Block[];
  preservedHead: string;   // raw inner HTML of <head> (for re-use at publish)
}

/**
 * Convert a raw HTML string into an array of `custom` blocks.
 * Each top-level structural element in <body> becomes one block.
 */
export function parseHtmlToBlocks(html: string): ConvertResult {
  const preservedHead = extractHead(html);
  const bodyContent   = extractBody(html);
  const sections      = splitIntoSections(bodyContent);

  const blocks: Block[] = sections
    .filter(s => s.trim().length > 0)
    .map((sectionHtml, i) => ({
      id:       uid(),
      type:     'custom' as const,
      content:  {
        html:  sectionHtml,
        label: inferLabel(sectionHtml, i + 1),
      },
      settings: {},
    }));

  return { blocks, preservedHead };
}

// ── Head / body extraction ────────────────────────────────────────────

function extractHead(html: string): string {
  const m = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  return m ? m[1] : '';
}

function extractBody(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1] : html; // fallback: treat whole string as body
}

// ── Section splitter ──────────────────────────────────────────────────
// Walk the body HTML character-by-character tracking tag nesting.
// Cut a new section every time a top-level block element closes.

const SECTION_TAGS = new Set([
  'nav', 'header', 'footer', 'main', 'section', 'article',
  'aside', 'div', 'form',
]);

function splitIntoSections(body: string): string[] {
  const sections: string[] = [];
  let depth = 0;
  let start = 0;
  let i     = 0;

  while (i < body.length) {
    if (body[i] !== '<') { i++; continue; }

    // Find end of tag
    const tagEnd = body.indexOf('>', i);
    if (tagEnd === -1) break;
    const tag = body.slice(i, tagEnd + 1);

    const closingM = tag.match(/^<\/([a-zA-Z][a-zA-Z0-9]*)/);
    const openingM = tag.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
    const isSelf   = tag.endsWith('/>') || VOID_ELEMENTS.has((openingM?.[1] ?? '').toLowerCase());

    if (closingM) {
      const tagName = closingM[1].toLowerCase();
      if (depth > 0) depth--;
      if (depth === 0 && SECTION_TAGS.has(tagName)) {
        // Closed a top-level section element — cut here
        const chunk = body.slice(start, tagEnd + 1).trim();
        if (chunk) sections.push(chunk);
        start = tagEnd + 1;
      }
    } else if (openingM && !isSelf) {
      depth++;
    }

    i = tagEnd + 1;
  }

  // Anything left over (inline content, scripts, etc.)
  const remainder = body.slice(start).trim();
  if (remainder) sections.push(remainder);

  // If nothing was split (flat body), return the whole body as one section
  if (!sections.length && body.trim()) return [body.trim()];

  return sections;
}

const VOID_ELEMENTS = new Set([
  'area','base','br','col','embed','hr','img','input',
  'link','meta','param','source','track','wbr',
]);

// ── Label inference ───────────────────────────────────────────────────

function inferLabel(html: string, index: number): string {
  // Extract tag name and key attributes from the outermost element
  const m = html.match(/^<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/);
  if (!m) return `Section ${index}`;

  const tag    = m[1].toLowerCase();
  const attrs  = m[2];
  const idM    = attrs.match(/\bid=["']([^"']+)["']/);
  const classM = attrs.match(/\bclass=["']([^"']+)["']/);
  const id     = idM?.[1]  ?? '';
  const cls    = classM?.[1] ?? '';

  // Semantic tags
  if (tag === 'nav')    return 'Navigation';
  if (tag === 'header') return 'Header';
  if (tag === 'footer') return 'Footer';
  if (tag === 'main')   return 'Main';
  if (tag === 'form')   return 'Form';

  // Id-based labels (common in single-page sites)
  const knownIds: Record<string, string> = {
    hero: 'Hero', banner: 'Hero',
    about: 'About', story: 'About',
    services: 'Services', work: 'Work',
    brands: 'Brands', portfolio: 'Portfolio',
    projects: 'Projects', team: 'Team',
    testimonials: 'Testimonials', reviews: 'Reviews',
    contact: 'Contact', cta: 'Call to Action',
    pricing: 'Pricing', faq: 'FAQ',
    blog: 'Blog', news: 'News',
    gallery: 'Gallery', media: 'Media',
    preloader: 'Preloader',
  };
  for (const [key, label] of Object.entries(knownIds)) {
    if (id.toLowerCase().includes(key) || cls.toLowerCase().includes(key)) return label;
  }

  // Capitalise the id if present
  if (id) return id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, ' ');

  // Fall back to "Section N"
  return `Section ${index}`;
}
