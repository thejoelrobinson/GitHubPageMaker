/**
 * Algorithmic content analysis.
 * Takes raw text + image assets extracted from uploaded documents and
 * produces a ContentMap + assembled block prefill data — no AI required.
 */

import type { NavLink } from '../types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ImageAsset {
  filename: string;
  base64: string;
  mediaType: string;
  /** Approximate file size in bytes (used for "largest image" heuristic) */
  sizeBytes: number;
}

export interface ContentSection {
  heading: string;
  paragraphs: string[];
}

export interface BulletGroup {
  items: string[];
}

/** A bold-label: description item extracted from DOCX "§ **label** § body" lines */
export interface LabeledItem {
  label: string;
  body: string;
}

export interface StatItem {
  value: string;
  label: string;
}

export interface QuoteItem {
  text: string;
  author: string;
}

export interface ContentMap {
  pageTitle: string;
  heroParagraph: string;
  sections: ContentSection[];
  bullets: BulletGroup[];
  labeledGroups: LabeledItem[][];
  stats: StatItem[];
  quotes: QuoteItem[];
  images: ImageAsset[];
  logoCandidate?: ImageAsset;
}

/** Prefill map passed to addBlockAfter() — dotted "bag.field" keys */
export type BlockPrefill = Record<string, string | boolean | number | NavLink[]>;

export interface AssembledBlock {
  type: string;
  prefill: BlockPrefill;
}

// ── Main entry points ─────────────────────────────────────────────────────────

export function analyzeContent(
  textSources: string[],
  images: ImageAsset[],
): ContentMap {
  const fullText = textSources.filter(Boolean).join('\n\n');
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);

  const pageTitle     = detectTitle(lines, images);
  const heroParagraph = detectHeroParagraph(lines, pageTitle);
  const sections      = detectSections(lines, pageTitle);
  const bullets       = detectBulletGroups(lines);
  const labeledGroups = detectLabeledGroups(lines);
  const stats         = detectStats(fullText);
  const quotes        = detectQuotes(fullText);

  // Logo: SVG file, or filename contains "logo", or very small image (<30KB)
  const logoCandidate = images.find(
    img => img.filename.toLowerCase().includes('logo') ||
           img.mediaType === 'image/svg+xml' ||
           img.sizeBytes < 30_000,
  );

  // Sort remaining images by size (largest first — likely the hero/feature images)
  const sortedImages = [...images].sort((a, b) => b.sizeBytes - a.sizeBytes);

  return { pageTitle, heroParagraph, sections, bullets, labeledGroups, stats, quotes, images: sortedImages, logoCandidate };
}

/** Strip markdown bold/italic markers and heading prefixes from a string.
 *  Used for short UI labels (logo, copyright) where raw ** looks broken. */
function stripMd(s: string): string {
  return s
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/\*+/g, '')
    .trim();
}

export function assembleBlocks(map: ContentMap): AssembledBlock[] {
  const blocks: AssembledBlock[] = [];
  const remainingImages = map.images.filter(img => img !== map.logoCandidate);

  // ── nav ──────────────────────────────────────────────────────────────────
  const plainTitle = stripMd(map.pageTitle);
  blocks.push({
    type: 'nav',
    prefill: {
      'content.logo':  plainTitle,
      'content.links': [
        { text: 'Home',    href: '/' },
        { text: 'About',   href: '#about' },
        { text: 'Contact', href: '#contact' },
      ] as NavLink[],
    },
  });

  // ── hero ─────────────────────────────────────────────────────────────────
  const heroImage = remainingImages.shift();
  const heroPrefill: BlockPrefill = {
    'content.headline': map.pageTitle,
    'content.subhead':  map.heroParagraph || 'Welcome — explore our work and get in touch.',
    'content.cta':      'Learn More',
    'content.ctaHref':  '#about',
    'settings.bgType':  heroImage ? 'image' : 'color',
  };
  if (heroImage) heroPrefill['settings.bgImage'] = `assets/${heroImage.filename}`;

  blocks.push({ type: 'hero', prefill: heroPrefill });

  // ── features: labeled groups (title+body cards) take priority over plain bullets ──
  const featureSourceGroups: Array<{ heading: string; items: Array<{ title: string; body: string }> }> = [];

  // Labeled groups ("Me@ Platforms: Modernized...") → rich cards with title + body
  map.labeledGroups.forEach((group, gi) => {
    featureSourceGroups.push({
      heading: map.sections[gi]?.heading ?? 'Key Highlights',
      items: group.slice(0, 6).map(item => ({ title: item.label, body: item.body })),
    });
  });

  // Plain bullet groups → title-only cards (no body)
  map.bullets.forEach((group, gi) => {
    const offset = map.labeledGroups.length;
    featureSourceGroups.push({
      heading: map.sections[gi + offset]?.heading ?? 'What We Offer',
      items: group.items.slice(0, 6).map(item => ({ title: item, body: '' })),
    });
  });

  // Emit one features block per group (up to 3 columns per block; overflow into next block)
  for (const src of featureSourceGroups) {
    for (let offset = 0; offset < src.items.length; offset += 3) {
      const chunk = src.items.slice(offset, offset + 3);
      const [c1, c2, c3] = chunk;
      blocks.push({
        type: 'features',
        prefill: {
          'content.headline': offset === 0 ? src.heading : `${src.heading} (cont.)`,
          'content.col1Title': c1?.title ?? '',
          'content.col1Body':  c1?.body  ?? '',
          'content.col2Title': c2?.title ?? '',
          'content.col2Body':  c2?.body  ?? '',
          'content.col3Title': c3?.title ?? '',
          'content.col3Body':  c3?.body  ?? '',
        },
      });
    }
  }

  // ── split / text blocks — ALL sections ────────────────────────────────────
  // Skip sections already consumed as feature-block headings (labeled groups + bullet groups)
  const startIdx = map.labeledGroups.length + map.bullets.length;
  const textSections = map.sections.slice(startIdx);
  let splitCount = 0;
  for (const sec of textSections) {
    if (splitCount < 2 && remainingImages.length > 0) {
      const img = remainingImages.shift()!;
      blocks.push({
        type: 'split',
        prefill: {
          'content.headline':  sec.heading,
          'content.body':      sec.paragraphs.join('\n\n'),
          'content.imageUrl':  `assets/${img.filename}`,
          'content.imageAlt':  sec.heading,
          'content.cta':       '',
          'settings.imageRight': splitCount % 2 === 1,
        },
      });
      splitCount++;
    } else {
      blocks.push({
        type: 'text',
        prefill: {
          'content.headline': sec.heading,
          'content.body':     sec.paragraphs.join('\n\n'),
        },
      });
    }
  }

  // ── stats ─────────────────────────────────────────────────────────────────
  if (map.stats.length >= 2) {
    const prefill: BlockPrefill = {};
    map.stats.slice(0, 4).forEach((s, i) => {
      prefill[`content.stat${i + 1}`]  = s.value;
      prefill[`content.label${i + 1}`] = s.label;
    });
    blocks.push({ type: 'stats', prefill });
  }

  // ── testimonial ───────────────────────────────────────────────────────────
  if (map.quotes.length > 0) {
    const q = map.quotes[0];
    blocks.push({
      type: 'testimonial',
      prefill: {
        'content.quote':   q.text,
        'content.author':  q.author,
        'content.role':    '',
        'content.company': '',
      },
    });
  }

  // ── gallery (remaining images, 3–6) ──────────────────────────────────────
  if (remainingImages.length >= 3) {
    const galleryImgs = remainingImages.splice(0, 6);
    const gPrefill: BlockPrefill = { 'content.headline': 'Gallery' };
    galleryImgs.forEach((img, i) => {
      gPrefill[`content.img${i + 1}`] = `assets/${img.filename}`;
      gPrefill[`content.alt${i + 1}`] = img.filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    });
    blocks.push({ type: 'gallery', prefill: gPrefill });
  }

  // ── cta ───────────────────────────────────────────────────────────────────
  const ctaText = detectCtaText(map);
  blocks.push({
    type: 'cta',
    prefill: {
      'content.headline': ctaText.headline,
      'content.body':     ctaText.body,
      'content.cta':      ctaText.cta,
      'content.ctaHref':  '#contact',
      'settings.variant': '1',
    },
  });

  // ── footer ────────────────────────────────────────────────────────────────
  blocks.push({
    type: 'footer',
    prefill: {
      'content.logo':      plainTitle,
      'content.tagline':   stripMd(map.heroParagraph.slice(0, 80)) || '',
      'content.copyright': `© ${new Date().getFullYear()} ${plainTitle}`,
      'content.links': [
        { text: 'Home', href: '/' },
        { text: 'About', href: '#about' },
      ] as NavLink[],
    },
  });

  return blocks;
}

// ── Heuristic helpers ─────────────────────────────────────────────────────────

function detectTitle(lines: string[], images: ImageAsset[]): string {
  // 1. Markdown H1
  const h1 = lines.find(l => /^#\s+\S/.test(l));
  if (h1) return h1.replace(/^#+\s*/, '').trim();

  // 2. Short all-caps or title-case line (< 80 chars, no period at end)
  const caps = lines.find(l =>
    l.length > 2 && l.length < 80 &&
    !l.endsWith('.') &&
    (l === l.toUpperCase() || /^([A-Z][a-z']+\s*){2,6}$/.test(l)),
  );
  if (caps) return toTitleCase(caps.trim());

  // 3. First short line of any kind
  const firstShort = lines.find(l => l.length > 4 && l.length < 70 && !l.endsWith('.'));
  if (firstShort) return toTitleCase(firstShort);

  // 4. Largest image filename (de-slugged)
  if (images.length > 0) {
    const sorted = [...images].sort((a, b) => b.sizeBytes - a.sizeBytes);
    return deSlug(sorted[0].filename.replace(/\.[^.]+$/, ''));
  }

  return 'My Website';
}

function detectHeroParagraph(lines: string[], title: string): string {
  let foundTitle = false;
  for (const line of lines) {
    if (!foundTitle) {
      if (line.toLowerCase().includes(title.toLowerCase().slice(0, 12))) {
        foundTitle = true;
      }
      continue;
    }
    // First paragraph after title: 40–300 chars, not a heading
    if (line.length >= 40 && line.length <= 300 && !/^#/.test(line)) {
      return line;
    }
  }
  // Fallback: first sufficiently long line
  return lines.find(l => l.length >= 40 && l.length <= 300 && !/^#/.test(l)) ?? '';
}

function detectSections(lines: string[], _title: string): ContentSection[] {
  const sections: ContentSection[] = [];
  let current: ContentSection | null = null;

  for (const line of lines) {
    // Any markdown heading (H1 / H2 / H3) — DOCX and PPTX both emit these
    if (/^#{1,3}\s+\S/.test(line)) {
      if (current) sections.push(current);
      current = { heading: line.replace(/^#+\s*/, '').trim(), paragraphs: [] };

    // Implicit heading: only start a new section if we already have paragraph
    // content in the current one (avoids false positives at document start)
    } else if (isImplicitHeading(line)) {
      if (current && current.paragraphs.length > 0) {
        sections.push(current);
        current = { heading: normalizeHeadingLine(line), paragraphs: [] };
      } else if (!current) {
        current = { heading: normalizeHeadingLine(line), paragraphs: [] };
      } else {
        // Current section has no body yet — treat as a subtitle / sub-heading body
        current.paragraphs.push(line);
      }

    } else if (isLabeledLine(line)) {
      // Achievement items — skip from section body; handled by detectLabeledGroups
    } else if (current && line.length > 20) {
      current.paragraphs.push(line);

    } else if (!current && line.length > 20 && !/^[#\-*•]/.test(line)) {
      if (sections.length === 0) {
        current = { heading: 'Overview', paragraphs: [line] };
      }
    }
  }
  if (current) sections.push(current);

  // Algorithmically split any section that has too many paragraphs
  const result: ContentSection[] = [];
  for (const sec of sections) {
    result.push(...(sec.paragraphs.length > 5 ? splitLargeSection(sec) : [sec]));
  }

  return result.slice(0, 24);
}

/** Returns true for lines that look like headings but lack a # prefix. */
function isImplicitHeading(line: string): boolean {
  if (line.length < 3 || line.length > 80) return false;
  if (/^[#\-*•→›]/.test(line)) return false;
  if (/[.,;:]$/.test(line)) return false; // ends like a sentence

  // All-caps with at least 3 letters
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 3 && line === line.toUpperCase() && /[A-Z]/.test(line)) return true;

  // Numbered section: "1. Title", "1.1 Title", "I. Title"
  if (/^\d+(\.\d+)*\s+[A-Z]/.test(line) && line.length < 70) return true;
  if (/^[IVX]+\.\s+[A-Z]/.test(line) && line.length < 70) return true;

  // Standalone well-known section keyword (whole line)
  if (/^(Abstract|Introduction|Background|Overview|Summary|Conclusion|Results?|Methods?|Discussion|References?|Appendix|Acknowledgements?|Executive Summary|Problem Statement|Solution|Recommendations?|Objectives?|Scope|Purpose|Goals?|Key Features?|Benefits?|Requirements?|Architecture|Implementation|Approach|Use Cases?|FAQ|Terms|Privacy|About Us?|Contact|Team|Pricing|Support)$/i.test(line.trim())) return true;

  return false;
}

function normalizeHeadingLine(line: string): string {
  return toTitleCase(line.replace(/^(\d+(\.\d+)*|[IVX]+)\.\s*/, '').trim());
}

// Matches strong topic-shift words at the very start of a paragraph
const TOPIC_SHIFT_RE = /^(Introduction|Background|Overview|Summary|Conclusion|Results?|Methods?|Discussion|References?|Appendix|Objectives?|Goals?|Features?|Benefits?|Requirements?|Implementation|Architecture|Design|Approach|Solution|Use Cases?|Problem|Context|Analysis|Findings|Recommendations?|Next Steps?|Action Items?|Scope|Limitations?|Timeline|Budget|Risks?|Testing|Deployment|Maintenance|FAQ)\b/i;

/** Split a section that has many paragraphs into logical sub-sections. */
function splitLargeSection(sec: ContentSection): ContentSection[] {
  const out: ContentSection[] = [{ heading: sec.heading, paragraphs: [] }];
  let cur = out[0];

  for (let i = 0; i < sec.paragraphs.length; i++) {
    const para = sec.paragraphs[i];

    // Split if paragraph starts with a known topic keyword and we have content
    const topicShift = TOPIC_SHIFT_RE.test(para) && cur.paragraphs.length >= 2;

    // Split if the paragraph looks like an inline heading: short, title-cased,
    // no sentence-ending punctuation, at least 3 paragraphs of context before it
    const inlineHeading =
      para.length < 70 &&
      !/[.,;:!?]$/.test(para) &&
      cur.paragraphs.length >= 3 &&
      !para.startsWith('*') &&
      !para.startsWith('-') &&
      (() => {
        const words = para.split(/\s+/);
        return words.length >= 2 && words.filter(w => /^[A-Z]/.test(w)).length / words.length >= 0.7;
      })();

    if (i > 0 && (topicShift || inlineHeading)) {
      const heading = para.length < 70
        ? normalizeHeadingLine(para)
        : para.split(/\s+/).slice(0, 5).join(' ') + '…';
      cur = { heading, paragraphs: topicShift && para.length >= 70 ? [para] : [] };
      out.push(cur);
    } else {
      cur.paragraphs.push(para);
    }
  }

  return out.filter(s => s.paragraphs.length > 0);
}

/** Sentinel format emitted by docxExtract when bold part ends with ":" */
const LABELED_RE = /^§ \*\*(.+?)\*\* § (.+)$/;

/** Inline format: entire "**Label: description body**" is bold, optional non-bold tail follows.
 *  Matches e.g.  **Me@ Platforms: Modernized the platform.** Launched my.walmart.com...  */
const BOLD_COLON_RE = /^\*\*([^*:]{3,60}): (.+?)\*\*(.*)?$/;

/** Returns true for lines that are labeled items (either format). */
function isLabeledLine(line: string): boolean {
  return LABELED_RE.test(line) || BOLD_COLON_RE.test(line);
}

/**
 * Detects groups of labeled "Label: description" items from two sources:
 *   1. "§ **Label** § body"  — when the bold part ended with a bare colon
 *   2. "**Label: description**" — when the entire label+desc was bold
 * Consecutive items are grouped so assembleBlocks builds features blocks with
 * title + body per card.
 */
function detectLabeledGroups(lines: string[]): LabeledItem[][] {
  const groups: LabeledItem[][] = [];
  let current: LabeledItem[] = [];

  for (const line of lines) {
    const m1 = LABELED_RE.exec(line);
    if (m1) {
      current.push({ label: m1[1].trim(), body: m1[2].trim() });
      continue;
    }
    const m2 = BOLD_COLON_RE.exec(line);
    if (m2) {
      const tail = (m2[3] ?? '').trim();
      const body = tail ? `${m2[2].trim()} ${tail}`.trim() : m2[2].trim();
      current.push({ label: m2[1].trim(), body });
      continue;
    }
    if (current.length >= 2) groups.push(current);
    current = [];
  }
  if (current.length >= 2) groups.push(current);
  return groups;
}

function detectBulletGroups(lines: string[]): BulletGroup[] {
  const groups: BulletGroup[] = [];
  let currentGroup: string[] = [];

  for (const line of lines) {
    if (/^[-*•→›]\s+\S/.test(line) || /^\d+\.\s+\S/.test(line)) {
      currentGroup.push(line.replace(/^[-*•→›\d.]+\s*/, '').trim());
    } else {
      if (currentGroup.length >= 3) {
        groups.push({ items: currentGroup.slice(0, 6) });
      }
      currentGroup = [];
    }
  }
  if (currentGroup.length >= 3) groups.push({ items: currentGroup.slice(0, 6) });

  return groups.slice(0, 8);
}

// Requires at least 2 distinct matches before creating a stats block
const STAT_PATTERNS = [
  /\b(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*([%+])\s*([\w\s]{2,30})/g,
  /\$\s*(\d+(?:\.\d+)?[KMBkmb]?)\s+([\w\s]{2,25})/g,
  /\b(\d+)\s+(years?|clients?|projects?|awards?|customers?|employees?)\b/gi,
];

function detectStats(text: string): StatItem[] {
  const found: StatItem[] = [];
  const seen = new Set<string>();

  for (const pattern of STAT_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null && found.length < 4) {
      const value = m[1] + (m[2] ?? '');
      const label = (m[3] ?? m[2] ?? '').trim().replace(/\s+/g, ' ');
      if (!seen.has(value) && label.length > 1) {
        seen.add(value);
        found.push({ value: value.toUpperCase(), label: toTitleCase(label) });
      }
    }
  }

  return found.length >= 2 ? found : [];
}

const QUOTE_RE = /"([^"]{20,200})"\s*[—–\-]\s*([A-Z][^,\n]{2,50})/g;
const QUOTE_RE2 = /'([^']{20,200})'\s*[—–\-]\s*([A-Z][^,\n]{2,50})/g;

function detectQuotes(text: string): QuoteItem[] {
  const found: QuoteItem[] = [];
  for (const re of [QUOTE_RE, QUOTE_RE2]) {
    const r = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(text)) !== null && found.length < 3) {
      found.push({ text: m[1].trim(), author: m[2].trim() });
    }
  }
  return found;
}

function detectCtaText(map: ContentMap): { headline: string; body: string; cta: string } {
  // Try to find explicit CTA-like text in sections
  for (const sec of map.sections) {
    const body = sec.paragraphs.join(' ').toLowerCase();
    if (/contact|reach out|get in touch|let.s talk|work with us|hire us/i.test(body)) {
      return {
        headline: sec.heading,
        body: sec.paragraphs[0]?.slice(0, 120) ?? '',
        cta: 'Get in Touch',
      };
    }
  }
  return {
    headline: 'Ready to Get Started?',
    body: 'We\'d love to hear from you.',
    cta: 'Contact Us',
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function deSlug(str: string): string {
  return str.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
