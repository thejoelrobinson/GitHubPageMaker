/**
 * Algorithmic content analysis.
 * Takes raw text + image assets extracted from uploaded documents and
 * produces a ContentMap + assembled block prefill data — no AI required.
 */

import type { NavLink, Theme } from '../types';
import type { ExtractedTable } from './doc-extract';
import { shortNavLabel, stripMd } from '../utils';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ImageAsset {
  filename: string;
  base64: string;
  mediaType: string;
  /** Approximate file size in bytes (used for "largest image" heuristic) */
  sizeBytes: number;
}

export interface SubSection {
  heading: string;
  paragraphs: string[];
  stats: StatItem[];
}

export interface ContentSection {
  heading: string;
  paragraphs: string[];
  /** H3-level sub-topics nested under this section. Empty array if none. */
  subSections: SubSection[];
  /** Stats extracted from only this section's text (not in global pool). */
  sectionStats: StatItem[];
  /** Heading depth from the source document (1=H1, 2=H2, 3=H3). Default 2. */
  depth: 1 | 2 | 3;
}

export interface BulletGroup {
  items: string[];
}

export interface FaqPair {
  question: string;
  answer: string;
}

/** A bold-label: description item extracted from DOCX "§ **label** § body" lines */
export interface LabeledItem {
  label: string;
  body: string;
}

export interface StatItem {
  value: string;
  label: string;
  /** null = lives in global pool; string = owned by named section (excluded from global block). */
  sourceSection: string | null;
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
  tables?: ExtractedTable[];
  faqPairs: FaqPair[];
  /** Document-level profile populated by analyzeContent(). */
  profile: DocumentProfile;
}

/** Prefill map passed to addBlockAfter() — dotted "bag.field" keys */
export type BlockPrefill = Record<string, string | boolean | number | NavLink[]>;

export interface AssembledBlock {
  type: string;
  prefill: BlockPrefill;
  /** The section heading this block was generated from (used for multi-page grouping). */
  sectionTitle?: string;
  /** URL-safe anchor id for the first block of each major section (e.g. "associate-engagement"). */
  sectionId?: string;
}

/** Document-level profile computed from the full ContentMap. Drives adaptive layout decisions. */
export interface DocumentProfile {
  docType: 'annual-report' | 'pitch-deck' | 'policy' | 'one-pager' | 'narrative' | 'product-overview' | 'unknown';
  /** 0–1: fraction of sections with 4+ paragraphs. */
  densityScore: number;
  /** true when doc has meaningful H3 subsections (hierarchyConfidence >= 0.5 and h3Count >= 2). */
  isHierarchical: boolean;
  /** 0–1: stat-bearing lines / total lines. */
  statsRichness: number;
  /** Approximate page count (totalWords / 300). */
  estimatedPageCount: number;
  hasClosingSection: boolean;
  closingSectionIndex: number;
}

/** Per-section intelligence computed before block assembly. */
export interface SectionProfile {
  wordCount: number;
  paragraphCount: number;
  /** Multi-signal: paragraphs AND words AND overall doc density must all be above threshold. */
  isDense: boolean;
  hasSubTopics: boolean;
  hasOwnStats: boolean;
  /** First 2 paragraphs (dense) or all paragraphs (sparse). Used as section lead. */
  leadParagraphs: string[];
  /** Paragraphs 3+ for dense sections; empty for sparse. */
  bodyParagraphs: string[];
  isClosing: boolean;
}

// ── Hero Image Selection ─────────────────────────────────────────────────────

const HERO_FILENAME_RE = /banner|hero|header|background|bg|cover/i;
const LOGO_ICON_FILENAME_RE = /logo|icon|badge|seal|favicon/i;
const HERO_MIN_SCORE = -10;

function scoreImageForHero(
  image: ImageAsset,
  index: number,
  logoCandidate: ImageAsset | null | undefined,
): number {
  if (logoCandidate && image === logoCandidate) return -999;
  if (LOGO_ICON_FILENAME_RE.test(image.filename)) return -999;

  let score = 0;
  if (image.sizeBytes > 0) score += Math.log2(image.sizeBytes / 1024);
  if (HERO_FILENAME_RE.test(image.filename)) score += 50;
  score += Math.max(0, 20 - index * 5);

  const approxBytes = image.base64
    ? Math.round(image.base64.length * 0.75)
    : image.sizeBytes;
  if (approxBytes < 10_240) score -= 30;

  return score;
}

function selectHeroImage(
  images: ImageAsset[],
  logoCandidate: ImageAsset | null | undefined,
): ImageAsset | null {
  if (images.length === 0) return null;

  let bestImage: ImageAsset | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < images.length; i++) {
    const score = scoreImageForHero(images[i], i, logoCandidate);
    if (score > bestScore) {
      bestScore = score;
      bestImage = images[i];
    }
  }

  return bestScore < HERO_MIN_SCORE ? null : bestImage;
}

// ── Adaptive processing helpers ───────────────────────────────────────────────

const CLOSING_RE = /thank\s*you\b|looking forward\b|in closing\b|as we look\b|year ahead\b|this journey\b|our journey\b|with gratitude\b/i;
const CTA_RE_SMART = /\bget started\b|\bcontact us\b|\bsign up\b|\breach out\b|\bbook a demo\b|\brequest a quote\b|\bhire us\b|\bwork with us\b/i;

/**
 * Extract stats from a specific set of paragraphs and remove found values from
 * globalSeen so they're no longer eligible for the global stats block.
 */
function detectPerSectionStats(paragraphs: string[], globalSeen: Set<string>): StatItem[] {
  const text = paragraphs.join('\n');
  const found: StatItem[] = [];
  const localSeen = new Set<string>();

  for (const pattern of STAT_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null && found.length < 4) {
      const value = m[1] + (m[2] ?? '');
      const label = (m[3] ?? m[2] ?? '').trim().replace(/\s+/g, ' ');
      if (!localSeen.has(value) && label.length > 1) {
        localSeen.add(value);
        found.push({ value: value.toUpperCase(), label: toTitleCase(label), sourceSection: null });
        globalSeen.delete(value.toUpperCase());
      }
    }
  }
  return found;
}

/** Classify the document type and overall characteristics from a ContentMap. */
function classifyDocument(map: Pick<ContentMap, 'sections' | 'stats' | 'images' | 'heroParagraph'>): DocumentProfile {
  const allText = map.sections.flatMap(s => [...s.paragraphs, ...s.subSections.flatMap(ss => ss.paragraphs)]).join('\n');
  const lines = allText.split('\n').filter(l => l.trim());
  const totalWords = allText.split(/\s+/).filter(Boolean).length;
  const estimatedPageCount = totalWords / 300;

  const denseSectionCount = map.sections.filter(s => s.paragraphs.length >= 4).length;
  const densityScore = map.sections.length > 0 ? denseSectionCount / map.sections.length : 0;

  const h3Count = map.sections.reduce((n, s) => n + s.subSections.length, 0);
  const hierarchyConfidence = h3Count / Math.max(map.sections.length, 1);
  const isHierarchical = hierarchyConfidence >= 0.5 && h3Count >= 2;

  const statLineCount = lines.filter(l => /\d[\d,.]*\s*[%+KMBkmb×x]|\$\s*\d/.test(l)).length;
  const statsRichness = lines.length > 0 ? statLineCount / lines.length : 0;

  let closingSectionIndex = -1;
  for (let i = Math.max(0, map.sections.length - 2); i < map.sections.length; i++) {
    const text = map.sections[i].heading + ' ' + (map.sections[i].paragraphs[0] ?? '');
    if (CLOSING_RE.test(text)) { closingSectionIndex = i; break; }
  }

  let docType: DocumentProfile['docType'] = 'unknown';
  if (estimatedPageCount <= 3 && densityScore < 0.4 && statsRichness < 0.04)             docType = 'one-pager';
  else if (statsRichness >= 0.08 && densityScore >= 0.5 && estimatedPageCount >= 8)       docType = 'annual-report';
  else if (isHierarchical && estimatedPageCount >= 5 && statsRichness < 0.06)             docType = 'policy';
  else if (estimatedPageCount <= 6 && statsRichness >= 0.04 && densityScore < 0.5)        docType = 'pitch-deck';
  else if (estimatedPageCount >= 6 && densityScore >= 0.4 && statsRichness < 0.04)       docType = 'narrative';
  else if (estimatedPageCount >= 3 && estimatedPageCount <= 10 && densityScore < 0.45)   docType = 'product-overview';

  return { docType, densityScore, isHierarchical, statsRichness, estimatedPageCount,
    hasClosingSection: closingSectionIndex >= 0, closingSectionIndex };
}

/** Compute per-section intelligence used by adaptiveSectionBlocks(). */
function profileSection(sec: ContentSection, docProfile: DocumentProfile): SectionProfile {
  const wordCount = sec.paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
  const paragraphCount = sec.paragraphs.length;

  const denseThreshold =
    docProfile.docType === 'annual-report'    ? 3
    : docProfile.docType === 'one-pager'      ? Infinity
    : docProfile.docType === 'narrative'      ? 6
    : 4;

  // wordCount >= 150 is the content gate; densityScore is dropped because it uses
  // a 4-paragraph threshold that is incompatible with annual-report's denseThreshold of 3.
  const isDense =
    paragraphCount >= denseThreshold &&
    wordCount >= 150;

  // Both branches require isHierarchical so a one-pager that accidentally produces
  // sub-sections never triggers multi-block emission.
  const hasSubTopics =
    (docProfile.isHierarchical && sec.subSections.length >= 2) ||
    (docProfile.isHierarchical && sec.subSections.length >= 1 && paragraphCount >= 3);

  const hasOwnStats =
    sec.sectionStats.length >= 2 &&
    (docProfile.statsRichness >= 0.04 || docProfile.docType === 'annual-report');

  const leadParagraphs = isDense ? sec.paragraphs.slice(0, 2) : sec.paragraphs;
  const bodyParagraphs = isDense ? sec.paragraphs.slice(2) : [];

  const checkText = sec.heading + ' ' + (sec.paragraphs[0] ?? '');
  const isClosing = CLOSING_RE.test(checkText);

  return { wordCount, paragraphCount, isDense, hasSubTopics, hasOwnStats,
    leadParagraphs, bodyParagraphs, isClosing };
}

/** Join paragraphs, trimming any that start with continuation punctuation (, ; : — ). */
function joinParas(paras: string[]): string {
  return paras
    .map(p => p.replace(/^[,;:—–\s]+/, '').trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Emit 1–3 blocks for a single section based on its density profile.
 * Replaces the flat split/text fallback for sections not handled by intent routing.
 */
function adaptiveSectionBlocks(
  sec: ContentSection,
  profile: SectionProfile,
  altBg: string,
  remainingImgs: ImageAsset[],
  splitCount: { value: number },
): AssembledBlock[] {
  const id = slugify(sec.heading);
  const bgPrefill: BlockPrefill = {};
  if (altBg) bgPrefill['settings.bg'] = altBg;

  // Closing section → dark text block, no button
  if (profile.isClosing) {
    return [{
      type: 'text',
      prefill: { ...bgPrefill, 'content.heading': sec.heading, 'content.body': profile.leadParagraphs.join('\n\n') },
      sectionTitle: sec.heading, sectionId: id,
    }];
  }

  // Dense + has sub-topics → lead text + features cards (sub-sections) + optional stats
  if (profile.isDense && profile.hasSubTopics) {
    const out: AssembledBlock[] = [];
    out.push({
      type: 'text',
      prefill: { ...bgPrefill, 'content.heading': sec.heading, 'content.body': profile.leadParagraphs.join('\n\n') },
      sectionTitle: sec.heading, sectionId: id,
    });
    const cards = sec.subSections.slice(0, 3);
    const cardPrefill: BlockPrefill = { 'content.sectionTitle': '' };
    cards.forEach((ss, i) => {
      cardPrefill[`content.card${i + 1}Title`] = stripMd(ss.heading);
      cardPrefill[`content.card${i + 1}Desc`]  = stripMd(ss.paragraphs[0] ?? '').slice(0, 160);
    });
    out.push({ type: 'features', prefill: cardPrefill, sectionTitle: sec.heading });
    if (profile.hasOwnStats) {
      const sp: BlockPrefill = {};
      sec.sectionStats.slice(0, 4).forEach((s, i) => {
        sp[`content.stat${i + 1}Num`]   = s.value;
        sp[`content.stat${i + 1}Label`] = s.label;
      });
      out.push({ type: 'stats', prefill: sp, sectionTitle: sec.heading });
    }
    return out;
  }

  // Dense, no sub-topics → lead text (truncated) + optional stats
  if (profile.isDense) {
    const body = [...profile.leadParagraphs];
    if (profile.bodyParagraphs.length > 0) {
      const firstSentence = profile.bodyParagraphs[0].split(/(?<=[.!?])\s+/)[0] ?? '';
      if (firstSentence.length > 40) body.push(firstSentence);
    }
    const out: AssembledBlock[] = [{
      type: 'text',
      prefill: { ...bgPrefill, 'content.heading': sec.heading, 'content.body': body.join('\n\n') },
      sectionTitle: sec.heading, sectionId: id,
    }];
    if (profile.hasOwnStats) {
      const sp: BlockPrefill = {};
      sec.sectionStats.slice(0, 4).forEach((s, i) => {
        sp[`content.stat${i + 1}Num`]   = s.value;
        sp[`content.stat${i + 1}Label`] = s.label;
      });
      out.push({ type: 'stats', prefill: sp, sectionTitle: sec.heading });
    }
    return out;
  }

  // Sparse section → original split/text logic
  if (splitCount.value < 2 && remainingImgs.length > 0) {
    const img = remainingImgs.shift()!;
    // Check before increment: even index → image right, odd → image left
    const imageRight = splitCount.value % 2 === 0;
    splitCount.value++;
    return [{
      type: 'split',
      prefill: {
        ...bgPrefill,
        'content.heading':  sec.heading,
        'content.body':     joinParas(sec.paragraphs),
        'content.imageUrl': `assets/${img.filename}`,
        'content.imageAlt': sec.heading,
        'content.showBtn':  false,
        'settings.side':    imageRight ? 'right' : 'left',
      },
      sectionTitle: sec.heading, sectionId: id,
    }];
  }
  return [{
    type: 'text',
    prefill: { ...bgPrefill, 'content.heading': sec.heading, 'content.body': joinParas(sec.paragraphs) },
    sectionTitle: sec.heading, sectionId: id,
  }];
}

// ── Main entry points ─────────────────────────────────────────────────────────

export function analyzeContent(
  textSources: string[],
  images: ImageAsset[],
  tables?: ExtractedTable[],
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
  const faqPairs      = detectFaqPairsFromText(fullText, lines);

  // Per-section stats post-pass: extract stats owned by each section and remove
  // them from the global pool so they're not double-emitted in the global stats block.
  const globalStatValues = new Set(stats.map(s => s.value));
  for (const sec of sections) {
    const allParas = [...sec.paragraphs, ...sec.subSections.flatMap(ss => ss.paragraphs)];
    sec.sectionStats = detectPerSectionStats(allParas, globalStatValues);
    sec.sectionStats.forEach(s => { s.sourceSection = sec.heading; });
    for (const ss of sec.subSections) {
      ss.stats = detectPerSectionStats(ss.paragraphs, globalStatValues);
      ss.stats.forEach(s => { s.sourceSection = `${sec.heading} / ${ss.heading}`; });
    }
  }
  // Rebuild global stats: only those not claimed by any section
  const globalStats = stats.filter(s => globalStatValues.has(s.value));

  // Logo: SVG file, or filename contains "logo", or very small image (<30KB)
  const logoCandidate = images.find(
    img => img.filename.toLowerCase().includes('logo') ||
           img.mediaType === 'image/svg+xml' ||
           img.sizeBytes < 30_000,
  );

  // Sort remaining images by size (largest first — likely the hero/feature images)
  const sortedImages = [...images].sort((a, b) => b.sizeBytes - a.sizeBytes);

  const profile = classifyDocument({ sections, stats: globalStats, images: sortedImages, heroParagraph });

  return { pageTitle, heroParagraph, sections, bullets, labeledGroups,
    stats: globalStats, quotes, faqPairs, images: sortedImages, logoCandidate, tables, profile };
}

/** Strip markdown bold/italic markers and heading prefixes from a string.
 *  Used for short UI labels (logo, copyright) where raw ** looks broken. */
// ── Section Intent Classification ─────────────────────────────────────────────

interface IntentRule {
  keywords: string[];
  blockType: string;
}

const INTENT_RULES: IntentRule[] = [
  // More specific multi-word phrases first to avoid false positives
  { keywords: ['our team', 'meet the', 'the team'],        blockType: 'team' },
  { keywords: ['about us', 'our story', 'who we are'],     blockType: 'about' },
  { keywords: ['what we do'],                               blockType: 'services' },
  { keywords: ['frequently asked', 'what clients say', 'what people say', 'what customers say'], blockType: '_phrase' },
  { keywords: ['reach us', 'get in touch'],                 blockType: 'contact' },
  { keywords: ['our work', 'trusted by'],                   blockType: '_phrase2' },

  // Single-word matches (checked after phrases)
  { keywords: ['team', 'people', 'staff'],                  blockType: 'team' },
  { keywords: ['pricing', 'plans', 'packages', 'tiers'],   blockType: 'pricing' },
  { keywords: ['faq', 'frequently asked', 'questions'],    blockType: 'faq' },
  { keywords: ['testimonials', 'reviews'],                  blockType: 'testimonial' },
  { keywords: ['contact', 'connect'],                       blockType: 'contact' },
  { keywords: ['gallery', 'portfolio', 'projects'],         blockType: 'gallery' },
  { keywords: ['background'],                               blockType: 'about' },
  { keywords: ['services', 'offerings', 'solutions'],       blockType: 'services' },
  { keywords: ['partners', 'clients', 'logos'],             blockType: 'logos' },
];

/**
 * Classify a section title into a semantic intent.
 * Returns a normalized intent string or null if no match.
 */
function classifySectionIntent(title: string): string | null {
  const lower = title.toLowerCase();

  // Phrase-based matches first (multi-word patterns checked via includes)
  // "frequently asked" → faq, "what clients say" / "what people say" → testimonial
  if (lower.includes('frequently asked')) return 'faq';
  if (lower.includes('what clients say') || lower.includes('what people say') || lower.includes('what customers say')) return 'testimonial';
  if (lower.includes('our work')) return 'gallery';
  if (lower.includes('trusted by')) return 'logos';

  for (const rule of INTENT_RULES) {
    if (rule.blockType.startsWith('_')) continue; // phrase-only rules handled above
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) return rule.blockType;
    }
  }
  return null;
}

// ── Table → Block Classification ─────────────────────────────────────────────

/**
 * Classify an extracted DOCX table into a website block.
 * Returns null if the table can't be meaningfully mapped.
 */
function classifyTable(
  table: ExtractedTable,
): { block: AssembledBlock; extraBlocks?: AssembledBlock[]; stats?: StatItem[] } | null {
  const { rows, hasHeader } = table;
  if (rows.length === 0) return null;

  const colCount = Math.max(...rows.map(r => r.length));
  if (colCount === 0) return null;

  const dataRows = hasHeader ? rows.slice(1) : rows;
  if (dataRows.length === 0 && rows.length <= 1) {
    return classifyTableFallback(rows);
  }

  // ── 2-column FAQ: first column ends with "?" ────────────────────────────
  if (colCount === 2 && dataRows.length >= 1) {
    const questionRows = dataRows.filter(r => r[0]?.trim().endsWith('?'));
    if (questionRows.length >= dataRows.length * 0.6 && questionRows.length >= 1) {
      const prefill: BlockPrefill = { 'content.heading': 'Frequently Asked Questions' };
      const count = Math.min(questionRows.length, 6);
      for (let i = 0; i < count; i++) {
        prefill[`content.q${i + 1}`] = questionRows[i][0].trim();
        prefill[`content.a${i + 1}`] = (questionRows[i][1] ?? '').trim();
      }
      prefill['content.count'] = count;
      return { block: { type: 'faq', prefill } };
    }
  }

  // ── Stats: 1–2 rows of numbers + short labels ────────────────────────────
  if (rows.length <= 3 && colCount >= 2) {
    const statItems: StatItem[] = [];
    // 2-row layout: value row + label row
    if (rows.length === 2 && rows[0].length === rows[1].length) {
      const valueRow = rows[0];
      const labelRow = rows[1];
      const allNumeric = valueRow.every(c => /\d/.test(c) && c.trim().length < 20);
      const allLabels = labelRow.every(c => c.trim().length > 0 && c.trim().length < 40);
      if (allNumeric && allLabels) {
        for (let i = 0; i < Math.min(valueRow.length, 4); i++) {
          statItems.push({ value: valueRow[i].trim(), label: labelRow[i].trim(), sourceSection: null });
        }
      }
    }
    // Single-row: cells like "50% Retention", "$2M Revenue"
    if (statItems.length === 0 && rows.length === 1) {
      const statRe = /^([\d,.]+[%+KMBkmb$]?|\$[\d,.]+[KMBkmb]?)\s+(.{2,30})$/;
      for (const cell of rows[0]) {
        const m = statRe.exec(cell.trim());
        if (m) statItems.push({ value: m[1], label: m[2].trim(), sourceSection: null });
      }
    }
    if (statItems.length >= 2) {
      return { block: { type: 'stats', prefill: {} }, stats: statItems };
    }
  }

  // ── Pricing: 3+ cols, header row, "$" in data ─────────────────────────────
  if (colCount >= 3 && hasHeader && dataRows.length >= 1) {
    const allCells = dataRows.flatMap(r => r);
    if (allCells.some(c => /\$/.test(c))) {
      const header = rows[0];
      const prefill: BlockPrefill = { 'content.heading': 'Pricing', 'content.subtext': '' };
      for (let col = 0; col < Math.min(colCount, 3); col++) {
        const n = col + 1;
        prefill[`content.plan${n}Name`] = header[col] ?? `Plan ${n}`;
        const priceCell = dataRows.find(r => /\$/.test(r[col] ?? ''));
        prefill[`content.plan${n}Price`] = priceCell?.[col]?.trim() ?? '';
        prefill[`content.plan${n}Period`] = '';
        const features = dataRows.filter(r => r !== priceCell).map(r => (r[col] ?? '').trim()).filter(Boolean);
        prefill[`content.plan${n}Features`] = features.join('\n');
        prefill[`content.plan${n}Cta`] = 'Get Started';
      }
      return { block: { type: 'pricing', prefill } };
    }
  }

  // ── 2-col label/value → features block ────────────────────────────────────
  if (colCount === 2 && dataRows.length >= 2) {
    const items = dataRows.slice(0, 6).map(r => ({
      title: (r[0] ?? '').trim(), body: (r[1] ?? '').trim(),
    }));
    const featureBlocks: AssembledBlock[] = [];
    for (let offset = 0; offset < items.length; offset += 3) {
      const chunk = items.slice(offset, offset + 3);
      const [c1, c2, c3] = chunk;
      featureBlocks.push({
        type: 'features',
        prefill: {
          'content.sectionTitle': offset === 0 ? (hasHeader ? rows[0][0] ?? 'Features' : 'Features') : 'Features (cont.)',
          'content.card1Title': stripMd(c1?.title ?? ''), 'content.card1Desc': stripMd(c1?.body ?? '').slice(0, 160),
          'content.card2Title': stripMd(c2?.title ?? ''), 'content.card2Desc': stripMd(c2?.body ?? '').slice(0, 160),
          'content.card3Title': stripMd(c3?.title ?? ''), 'content.card3Desc': stripMd(c3?.body ?? '').slice(0, 160),
          'content.columns': Math.min(chunk.length, 3),
        },
      });
    }
    if (featureBlocks.length > 0) {
      return { block: featureBlocks[0], extraBlocks: featureBlocks.slice(1) };
    }
  }

  // ── Fallback: pipe-table text block ────────────────────────────────────────
  return classifyTableFallback(rows);
}

function classifyTableFallback(rows: string[][]): { block: AssembledBlock } {
  const lines: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    lines.push('| ' + rows[i].map(c => c.trim()).join(' | ') + ' |');
    if (i === 0) {
      lines.push('| ' + rows[i].map(() => '---').join(' | ') + ' |');
    }
  }
  return {
    block: {
      type: 'text',
      prefill: { 'content.heading': '', 'content.body': lines.join('\n') },
    },
  };
}

export function assembleBlocks(map: ContentMap, theme?: Theme): AssembledBlock[] {
  const blocks: AssembledBlock[] = [];
  const remainingImages = map.images.filter(img => img !== map.logoCandidate);
  const docProfile = map.profile;
  let altIndex = 0;

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
  const heroImage = selectHeroImage(remainingImages, map.logoCandidate);
  if (heroImage) {
    const idx = remainingImages.indexOf(heroImage);
    if (idx !== -1) remainingImages.splice(idx, 1);
  }
  const heroPrefill: BlockPrefill = {
    'content.heading':    map.pageTitle,
    'content.subheading': map.heroParagraph || 'Welcome — explore our work and get in touch.',
    'content.btn1Text':   'Learn More',
    'content.btn1Link':   '#about',
    'content.btn2Text':   'View Work',
    'content.btn2Link':   '#work',
    'settings.bgType':    heroImage ? 'image' : 'gradient',
  };
  if (heroImage) {
    heroPrefill['settings.bgImage'] = `assets/${heroImage.filename}`;
  } else {
    heroPrefill['settings.bgGradient'] = 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';
  }

  blocks.push({ type: 'hero', prefill: heroPrefill, sectionTitle: '_hero' });

  // ── table-derived blocks ──────────────────────────────────────────────────
  // Insert blocks derived from DOCX tables after the hero and before text sections.
  // Stats from tables are merged into the existing stats array rather than adding
  // a separate block (assembleBlocks emits a stats block from map.stats later).
  if (map.tables && map.tables.length > 0) {
    for (const tbl of map.tables) {
      const result = classifyTable(tbl);
      if (!result) continue;
      if (result.stats) {
        // Merge table-derived stats into the content map's stats array
        for (const s of result.stats) {
          if (map.stats.length < 4) map.stats.push(s);
        }
      } else {
        blocks.push(result.block);
        if (result.extraBlocks) blocks.push(...result.extraBlocks);
      }
    }
  }

  // ── features: labeled groups (title+body cards) take priority over plain bullets ──
  const featureSourceGroups: Array<{ heading: string; items: Array<{ title: string; body: string }> }> = [];

  // Labeled groups ("Me@ Platforms: Modernized...") → rich cards with title + body
  // Orphan labeled items (single item) → emit a split block instead of features
  const orphanLabeledSplits: AssembledBlock[] = [];
  map.labeledGroups.forEach((group, gi) => {
    if (group.length === 1) {
      const item = group[0];
      const img = remainingImages.shift();
      const prefill: BlockPrefill = {
        'content.heading':  item.label,
        'content.body':     item.body,
        'content.imageAlt': item.label,
        'content.showBtn':  false,
      };
      if (img) prefill['content.imageUrl'] = `assets/${img.filename}`;
      orphanLabeledSplits.push({
        type: 'split',
        prefill,
        sectionTitle: map.sections[gi]?.heading ?? item.label,
      });
    } else {
      featureSourceGroups.push({
        heading: map.sections[gi]?.heading ?? 'Key Highlights',
        items: group.slice(0, 6).map(item => ({ title: item.label, body: item.body })),
      });
    }
  });

  // Plain bullet groups → title-only cards (no body)
  // Orphan bullets (1–2 items) → merge into corresponding section's body text
  map.bullets.forEach((group, gi) => {
    const offset = map.labeledGroups.length;
    if (group.items.length <= 2) {
      // Merge orphan bullet text into the corresponding section's paragraphs
      const sec = map.sections[gi + offset];
      if (sec) {
        const bulletText = group.items.join('. ');
        sec.paragraphs.unshift(bulletText);
      }
      // Don't push to featureSourceGroups — the section will be processed as text/split
    } else {
      featureSourceGroups.push({
        heading: map.sections[gi + offset]?.heading ?? 'What We Offer',
        items: group.items.slice(0, 6).map(item => ({ title: item, body: '' })),
      });
    }
  });

  // Emit one features block per group (up to 3 columns per block; overflow into next block)
  for (const src of featureSourceGroups) {
    for (let offset = 0; offset < src.items.length; offset += 3) {
      const chunk = src.items.slice(offset, offset + 3);
      const [c1, c2, c3] = chunk;
      blocks.push({
        type: 'features',
        prefill: {
          'content.sectionTitle': offset === 0 ? src.heading : `${src.heading} (cont.)`,
          'content.card1Title': stripMd(c1?.title ?? ''),
          'content.card1Desc':  stripMd(c1?.body  ?? '').slice(0, 160),
          'content.card2Title': stripMd(c2?.title ?? ''),
          'content.card2Desc':  stripMd(c2?.body  ?? '').slice(0, 160),
          'content.card3Title': stripMd(c3?.title ?? ''),
          'content.card3Desc':  stripMd(c3?.body  ?? '').slice(0, 160),
        },
        sectionTitle: src.heading,
      });
    }
  }

  // Insert orphan labeled splits (single labeled items emitted as split blocks)
  blocks.push(...orphanLabeledSplits);

  // ── intent-aware section routing ────────────────────────────────────────────
  // Skip sections consumed as feature-block headings. Orphan groups (single
  // labeled items or 1–2 bullet items) are NOT consumed as features, so their
  // corresponding sections still need processing.
  const consumedSectionIndices = new Set<number>();
  map.labeledGroups.forEach((_group, gi) => {
    // All labeled groups consume their section (multi-item → features, single → split above)
    consumedSectionIndices.add(gi);
  });
  map.bullets.forEach((group, gi) => {
    // Only non-orphan bullet groups (3+ items) consume their section as features.
    // Orphan bullets (1–2 items) merged text INTO the section, which still needs processing.
    if (group.items.length >= 3) consumedSectionIndices.add(map.labeledGroups.length + gi);
  });
  const textSectionEntries: Array<{ sec: ContentSection; origIdx: number }> = [];
  map.sections.forEach((sec, i) => {
    if (!consumedSectionIndices.has(i)) textSectionEntries.push({ sec, origIdx: i });
  });
  let splitCount = 0;
  const usedIntents = new Set<string>();

  for (const { sec, origIdx } of textSectionEntries) {
    const intent = classifySectionIntent(sec.heading);
    const body = joinParas(sec.paragraphs);
    consumedSectionIndices.add(origIdx);

    // If intent already emitted, fall through to default split/text
    if (intent && !usedIntents.has(intent)) {
      usedIntents.add(intent);

      if (intent === 'team' || intent === 'services') {
        // Emit features block — bullets become cards, or paragraphs split into cards
        const items: Array<{ title: string; body: string }> = [];
        // Prefer bullets from full text matching this section
        const sectionBullets = extractBulletsFromParagraphs(sec.paragraphs);
        if (sectionBullets.length >= 2) {
          for (const b of sectionBullets.slice(0, 6)) items.push({ title: b, body: '' });
        } else if (sec.paragraphs.length >= 2) {
          // Use paragraphs as card bodies with generic titles
          for (const p of sec.paragraphs.slice(0, 3)) {
            const title = p.length > 60 ? p.slice(0, 57) + '...' : p;
            items.push({ title, body: '' });
          }
        }
        if (items.length >= 2) {
          for (let offset = 0; offset < items.length; offset += 3) {
            const chunk = items.slice(offset, offset + 3);
            const [c1, c2, c3] = chunk;
            blocks.push({
              type: 'features',
              prefill: {
                'content.sectionTitle': sec.heading,
                'content.card1Title': stripMd(c1?.title ?? ''),
                'content.card1Desc':  stripMd(c1?.body  ?? '').slice(0, 160),
                'content.card2Title': stripMd(c2?.title ?? ''),
                'content.card2Desc':  stripMd(c2?.body  ?? '').slice(0, 160),
                'content.card3Title': stripMd(c3?.title ?? ''),
                'content.card3Desc':  stripMd(c3?.body  ?? '').slice(0, 160),
              },
              sectionTitle: sec.heading,
            });
          }
          continue;
        }
        // Not enough items — fall through to default
      }

      if (intent === 'pricing') {
        blocks.push({
          type: 'pricing',
          prefill: {
            'content.heading': sec.heading,
            'content.subtext': sec.paragraphs[0]?.slice(0, 120) ?? '',
          },
          sectionTitle: sec.heading,
        });
        continue;
      }

      if (intent === 'faq') {
        // Try to extract Q&A pairs from paragraphs (lines ending with ?)
        const faqPrefill: BlockPrefill = { 'content.heading': sec.heading };
        const pairs = extractFaqPairs(sec.paragraphs);
        const count = Math.min(pairs.length, 4);
        if (count >= 1) {
          for (let i = 0; i < count; i++) {
            faqPrefill[`content.q${i + 1}`] = pairs[i].q;
            faqPrefill[`content.a${i + 1}`] = pairs[i].a;
          }
          faqPrefill['content.count'] = count;
        }
        blocks.push({ type: 'faq', prefill: faqPrefill, sectionTitle: sec.heading });
        continue;
      }

      if (intent === 'testimonial') {
        // Use quotes from map if available, otherwise use section body
        const q = map.quotes[0];
        if (q) {
          blocks.push({
            type: 'testimonial',
            prefill: {
              'content.quote':  q.text,
              'content.author': q.author,
              'content.role':   '',
            },
          });
        } else if (body.length > 20) {
          blocks.push({
            type: 'testimonial',
            prefill: {
              'content.quote':  sec.paragraphs[0] ?? body.slice(0, 200),
              'content.author': '',
              'content.role':   '',
            },
          });
        }
        continue;
      }

      if (intent === 'contact') {
        // Emit a CTA block followed by a form block
        blocks.push({
          type: 'cta',
          prefill: {
            'content.heading': sec.heading,
            'content.subtext': sec.paragraphs[0]?.slice(0, 120) ?? 'We\'d love to hear from you.',
            'content.btnText': 'Contact Us',
            'content.btnLink': '#contact',
          },
        });
        blocks.push({
          type: 'form',
          prefill: {
            'content.heading': sec.heading,
            'content.subtext': sec.paragraphs[0]?.slice(0, 120) ?? '',
          },
        });
        continue;
      }

      if (intent === 'gallery') {
        if (remainingImages.length >= 3) {
          const galleryImgs = remainingImages.splice(0, 6);
          const gPrefill: BlockPrefill = { 'content.heading': sec.heading };
          galleryImgs.forEach((img, i) => {
            gPrefill[`content.img${i + 1}`] = `assets/${img.filename}`;
          });
          gPrefill['content.count'] = galleryImgs.length;
          blocks.push({ type: 'gallery', prefill: gPrefill });
          continue;
        }
        // Not enough images — fall through to default
      }

      if (intent === 'about') {
        // Text-heavy split block (or text if no image)
        if (remainingImages.length > 0) {
          const img = remainingImages.shift()!;
          blocks.push({
            type: 'split',
            prefill: {
              'content.heading':  sec.heading,
              'content.body':     body,
              'content.imageUrl': `assets/${img.filename}`,
              'content.imageAlt': sec.heading,
              'content.showBtn':  false,
              'settings.side':    'right',
            },
          });
        } else {
          blocks.push({
            type: 'text',
            prefill: {
              'content.heading': sec.heading,
              'content.body':    body,
            },
          });
        }
        continue;
      }

      if (intent === 'logos') {
        blocks.push({
          type: 'logos',
          prefill: {
            'content.heading': sec.heading,
          },
        });
        continue;
      }
    }

    // Default: adaptive section blocks based on density profile
    {
      const altBg = theme ? (altIndex % 2 === 0 ? theme.bg : theme.bgAlt) : '';
      const splitRef = { value: splitCount };
      const secProfile = profileSection(sec, docProfile);
      const newBlocks = adaptiveSectionBlocks(sec, secProfile, altBg, remainingImages, splitRef);
      splitCount = splitRef.value;
      blocks.push(...newBlocks);
      altIndex++;
    }
  }

  // ── stats (global pool only — section-owned stats already emitted inline) ──
  // map.stats was already filtered in analyzeContent() to exclude stats claimed
  // by individual sections. Emit a block only when 2+ global stats remain.
  if (map.stats.length >= 2) {
    const prefill: BlockPrefill = {};
    map.stats.slice(0, 4).forEach((s, i) => {
      prefill[`content.stat${i + 1}Num`]   = s.value;
      prefill[`content.stat${i + 1}Label`] = s.label;
    });
    blocks.push({ type: 'stats', prefill });
  } else if (map.stats.length === 1) {
    // Orphan stat: weave into hero subtitle or first text block body
    const statStr = `${map.stats[0].value} ${map.stats[0].label}`;
    const heroBlock = blocks.find(b => b.type === 'hero');
    if (heroBlock && heroBlock.prefill['content.subheading']) {
      heroBlock.prefill['content.subheading'] = `${String(heroBlock.prefill['content.subheading'])} \u2014 ${statStr}`;
    } else {
      const textBlock = blocks.find(b => b.type === 'text');
      if (textBlock && textBlock.prefill['content.body']) {
        textBlock.prefill['content.body'] = `${String(textBlock.prefill['content.body'])}\n\n${statStr}.`;
      }
    }
  }

  // ── faq (pattern-detected from full document text) ─────────────────────
  // Only emit if no intent-based faq section was already produced
  if (map.faqPairs.length >= 3 && !usedIntents.has('faq')) {
    const faqPrefill: BlockPrefill = { 'content.heading': 'Frequently Asked Questions' };
    const count = Math.min(map.faqPairs.length, 6);
    for (let i = 0; i < count; i++) {
      faqPrefill[`content.q${i + 1}`] = map.faqPairs[i].question;
      faqPrefill[`content.a${i + 1}`] = map.faqPairs[i].answer;
    }
    faqPrefill['content.count'] = count;
    blocks.push({ type: 'faq', prefill: faqPrefill });
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
    const gPrefill: BlockPrefill = { 'content.heading': 'Gallery' };
    galleryImgs.forEach((img, i) => {
      gPrefill[`content.img${i + 1}`] = `assets/${img.filename}`;
      gPrefill[`content.alt${i + 1}`] = img.filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    });
    blocks.push({ type: 'gallery', prefill: gPrefill });
  }

  // ── cta / closing ─────────────────────────────────────────────────────────
  if (!usedIntents.has('contact')) {
    const ctaText = detectCtaText(map, consumedSectionIndices);
    if (ctaText.source === 'closing') {
      // Closing language → dark text block, no button
      blocks.push({
        type: 'text',
        prefill: {
          'content.heading':    ctaText.headline,
          'content.body':       ctaText.body,
          'settings.bg':        theme?.primary ?? '#0f172a',
          'settings.textColor': '#ffffff',
        },
        sectionTitle: '_closing',
      });
    } else {
      blocks.push({
        type: 'cta',
        prefill: {
          'content.heading': ctaText.headline,
          'content.subtext': ctaText.body,
          'content.btnText': ctaText.cta,
          'content.btnLink': '#contact',
          'settings.variant': '1',
        },
      });
      if (ctaText.source === 'contact-info' || ctaText.source === 'last-section') {
        const formPrefill: BlockPrefill = {
          'content.heading': ctaText.headline,
          'content.subtext': ctaText.body,
        };
        if (ctaText.contactInfo?.emails.length) {
          formPrefill['content.action'] = 'mailto:' + ctaText.contactInfo.emails[0];
        }
        blocks.push({ type: 'form', prefill: formPrefill });
      }
    }
  }

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

  // ── nav anchor post-pass ───────────────────────────────────────────────────
  // Collect sectionId blocks (first block per major section), build anchor links,
  // and update the nav block so its links actually go somewhere.
  const anchorBlocks = blocks.filter(
    b => b.sectionId && b.sectionId !== '_closing' && b.type !== 'hero' && b.type !== 'nav' && b.type !== 'footer',
  );
  if (anchorBlocks.length > 0) {
    const anchorLinks: NavLink[] = anchorBlocks.slice(0, 6).map(b => ({
      text: shortNavLabel(stripMd(b.sectionTitle ?? b.sectionId!)),
      href: `#${b.sectionId}`,
    }));
    const navBlock = blocks[0];
    if (navBlock?.type === 'nav') {
      navBlock.prefill['content.links'] = [
        { text: 'Home', href: '/' },
        ...anchorLinks,
      ] as NavLink[];
    }
  }

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

/** Slugify a heading to a URL-safe anchor id. */
function slugify(heading: string): string {
  return heading.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Returns the H3 heading text if a line is an implicit H3 (bold-first-phrase pattern),
 * or null if not. Detects "**Talent Mobility** launched to help..." → "Talent Mobility".
 */
function detectImplicitH3(line: string): string | null {
  const m = /^\*\*([^*]{3,40})\*\*\s+(.{20,})$/.exec(line);
  if (!m) return null;
  const boldPart = m[1].trim();
  // Reject: labeled-item (ends with ':'), sentence punctuation, or number pattern (stat)
  if (boldPart.endsWith(':')) return null;
  if (/[.,;!?]$/.test(boldPart)) return null;
  if (/\d+\s*[%$KMBkmb]|\$\d|\d{3,}/.test(boldPart)) return null;
  return boldPart;
}

/** Make an empty ContentSection with all new required fields. */
function makeSection(heading: string, depth: 1 | 2 | 3 = 2): ContentSection {
  return { heading, paragraphs: [], subSections: [], sectionStats: [], depth };
}

/** Make an empty SubSection. */
function makeSubSection(heading: string): SubSection {
  return { heading, paragraphs: [], stats: [] };
}

function detectSections(lines: string[], _title: string): ContentSection[] {
  const sections: ContentSection[] = [];
  let current: ContentSection | null = null;
  let currentSub: SubSection | null = null;

  const pushSub = () => {
    // Push the sub-section as long as it has a heading (even if no paragraphs yet,
    // the heading alone is enough to generate a feature card title).
    if (currentSub && current) {
      current.subSections.push(currentSub);
    }
    currentSub = null;
  };

  for (const line of lines) {
    const isH1H2 = /^#{1,2}\s+\S/.test(line);
    const isH3   = /^#{3}\s+\S/.test(line);

    if (isH1H2) {
      const headingText = line.replace(/^#+\s*/, '').trim();
      // Guard: a heading > 120 chars is a mis-styled body paragraph — treat as text
      if (headingText.length > 120) {
        if (!current) current = makeSection('Overview');
        current.paragraphs.push(headingText);
      } else {
        // Push current sub-section and section, start new H2 section
        pushSub();
        if (current) sections.push(current);
        const depth = /^#\s/.test(line) ? 1 : 2;
        current = makeSection(headingText, depth as 1 | 2);
      }

    } else if (isH3) {
      // Start new sub-section within current H2 section
      pushSub();
      if (!current) current = makeSection('Overview');
      currentSub = makeSubSection(line.replace(/^#+\s*/, '').trim());

    } else if (isImplicitHeading(line)) {
      // Implicit H2-level heading
      if (current && current.paragraphs.length > 0) {
        pushSub();
        sections.push(current);
        current = makeSection(normalizeHeadingLine(line));
      } else if (!current) {
        current = makeSection(normalizeHeadingLine(line));
      } else {
        current.paragraphs.push(line);
      }

    } else if (isLabeledLine(line)) {
      // Achievement items — skip from section body; handled by detectLabeledGroups

    } else {
      const implicitH3Heading = detectImplicitH3(line);
      if (implicitH3Heading && current) {
        // Bold-first-phrase → treat as sub-section heading; remainder of line is first paragraph.
        // Use the regex capture group directly (m[2]) rather than re-slicing the line.
        pushSub();
        currentSub = makeSubSection(implicitH3Heading);
        const m3 = /^\*\*([^*]{3,40})\*\*\s+(.{20,})$/.exec(line);
        const rest = (m3?.[2] ?? '').trim();
        if (rest.length > 10) currentSub.paragraphs.push(rest);
      } else if (currentSub && line.length > 20) {
        currentSub.paragraphs.push(line);
      } else if (current && line.length > 20) {
        current.paragraphs.push(line);
      } else if (!current && line.length > 20 && !/^[#\-*•]/.test(line)) {
        if (sections.length === 0) {
          current = makeSection('Overview');
          current.paragraphs.push(line);
        }
      }
    }
  }
  pushSub();
  if (current) sections.push(current);

  // Algorithmically split any section that has too many paragraphs
  // (only for sections without sub-sections — sub-sections handle their own structure)
  const result: ContentSection[] = [];
  for (const sec of sections) {
    if (sec.subSections.length === 0 && sec.paragraphs.length > 5) {
      const split = splitLargeSection(sec);
      result.push(...split);
    } else {
      result.push(sec);
    }
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
  const out: ContentSection[] = [makeSection(sec.heading, sec.depth)];
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
      cur = makeSection(heading, sec.depth);
      if (topicShift && para.length >= 70) cur.paragraphs.push(para);
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
    if (current.length >= 1) groups.push(current);
    current = [];
  }
  if (current.length >= 1) groups.push(current);
  return groups;
}

function detectBulletGroups(lines: string[]): BulletGroup[] {
  const groups: BulletGroup[] = [];
  let currentGroup: string[] = [];

  for (const line of lines) {
    if (/^[-*•→›]\s+\S/.test(line) || /^\d+\.\s+\S/.test(line)) {
      currentGroup.push(line.replace(/^[-*•→›\d.]+\s*/, '').trim());
    } else {
      if (currentGroup.length >= 1) {
        groups.push({ items: currentGroup.slice(0, 6) });
      }
      currentGroup = [];
    }
  }
  if (currentGroup.length >= 1) groups.push({ items: currentGroup.slice(0, 6) });

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
        found.push({ value: value.toUpperCase(), label: toTitleCase(label), sourceSection: null });
      }
    }
  }

  return found;
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

interface ContactInfo { emails: string[]; phones: string[]; urls: string[] }

/** Detect email, phone, and URL contact info in a block of text. */
function detectContactInfo(text: string): ContactInfo {
  const emails = [...text.matchAll(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi)].map(m => m[0]);
  const phones = [...text.matchAll(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g)].map(m => m[0]);
  const urls   = [...text.matchAll(/https?:\/\/[^\s]{8,}/g)].map(m => m[0])
    .filter(u => !/example\.com|placeholder|localhost/i.test(u));
  return { emails, phones, urls };
}

function hasContactInfo(info: ContactInfo): boolean {
  return info.emails.length > 0 || info.phones.length > 0 || info.urls.length > 0;
}

interface CtaResult {
  headline: string;
  body: string;
  cta: string;
  contactInfo?: ContactInfo;
  sectionIndex?: number;
  source: 'keyword' | 'contact-info' | 'last-section' | 'fallback' | 'closing';
}

function detectCtaText(map: ContentMap, consumedSections: Set<number>): CtaResult {
  // Priority 0: Closing language in last 2 sections (thank you / forward-looking)
  // These should become a dark closing block, NOT a CTA with a button.
  for (let i = Math.max(0, map.sections.length - 2); i < map.sections.length; i++) {
    if (consumedSections.has(i)) continue;
    const sec = map.sections[i];
    const checkText = sec.heading + ' ' + (sec.paragraphs[0] ?? '');
    if (CLOSING_RE.test(checkText) && !CTA_RE_SMART.test(checkText)) {
      return {
        headline: sec.heading,
        body: sec.paragraphs.slice(0, 2).join('\n\n'),
        cta: '',
        sectionIndex: i,
        source: 'closing',
      };
    }
  }

  // Priority 1: Explicit keyword match in section body (existing behavior)
  for (let i = 0; i < map.sections.length; i++) {
    if (consumedSections.has(i)) continue;
    const sec = map.sections[i];
    const bodyText = sec.paragraphs.join(' ');
    if (/contact|reach out|get in touch|let.s talk|work with us|hire us/i.test(bodyText)) {
      return {
        headline: sec.heading,
        body: sec.paragraphs[0]?.slice(0, 120) ?? '',
        cta: 'Get in Touch',
        sectionIndex: i,
        source: 'keyword',
      };
    }
  }

  // Priority 2: Section containing contact info (email, phone, URL)
  for (let i = 0; i < map.sections.length; i++) {
    if (consumedSections.has(i)) continue;
    const sec = map.sections[i];
    const fullText = sec.heading + ' ' + sec.paragraphs.join(' ');
    const info = detectContactInfo(fullText);
    if (hasContactInfo(info)) {
      return {
        headline: sec.heading,
        body: sec.paragraphs[0]?.slice(0, 120) ?? "We'd love to hear from you.",
        cta: 'Get in Touch',
        contactInfo: info,
        sectionIndex: i,
        source: 'contact-info',
      };
    }
  }

  // Priority 3: Last section fallback (if not already consumed by another block type)
  const lastIdx = map.sections.length - 1;
  if (lastIdx >= 0 && !consumedSections.has(lastIdx)) {
    const sec = map.sections[lastIdx];
    return {
      headline: sec.heading,
      body: sec.paragraphs[0]?.slice(0, 120) ?? "We'd love to hear from you.",
      cta: 'Contact Us',
      sectionIndex: lastIdx,
      source: 'last-section',
    };
  }

  // Fallback: generic CTA
  return {
    headline: 'Ready to Get Started?',
    body: "We'd love to hear from you.",
    cta: 'Contact Us',
    source: 'fallback',
  };
}

// ── Intent helpers ────────────────────────────────────────────────────────────

/** Extract bullet-like items embedded within paragraph text (lines starting with - * • or numbered). */
function extractBulletsFromParagraphs(paragraphs: string[]): string[] {
  const bullets: string[] = [];
  for (const p of paragraphs) {
    const lines = p.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[-*•→›]\s+\S/.test(trimmed) || /^\d+\.\s+\S/.test(trimmed)) {
        bullets.push(trimmed.replace(/^[-*•→›\d.]+\s*/, '').trim());
      }
    }
  }
  return bullets;
}

/** Extract FAQ question/answer pairs from paragraphs.
 *  Heuristic: lines ending with '?' are questions; the following line is the answer. */
function extractFaqPairs(paragraphs: string[]): Array<{ q: string; a: string }> {
  const pairs: Array<{ q: string; a: string }> = [];
  const lines: string[] = [];
  for (const p of paragraphs) {
    for (const l of p.split('\n')) {
      const trimmed = l.trim();
      if (trimmed) lines.push(trimmed);
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].endsWith('?')) {
      const answer = lines[i + 1] && !lines[i + 1].endsWith('?') ? lines[i + 1] : '';
      pairs.push({ q: lines[i], a: answer });
      if (answer) i++; // skip the answer line
    }
  }
  return pairs;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function deSlug(str: string): string {
  return str.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Full-document FAQ detection ───────────────────────────────────────────────

/** Sentinel format: § **Question?** § Answer — from DOCX bold-question extraction */
const SENTINEL_FAQ_RE = /^§ \*\*(.+?\?)\*\* § (.+)$/;

/**
 * Detect Q&A pairs from the full document text using three pattern strategies.
 * Returns pairs only if >= 3 are found (threshold to avoid false positives).
 */
function detectFaqPairsFromText(_fullText: string, lines: string[]): FaqPair[] {
  const seen = new Set<string>();
  const pairs: FaqPair[] = [];

  function addPair(question: string, answer: string): void {
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a) return;
    const key = q.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ question: q, answer: a });
  }

  // Pattern 1 — Explicit prefix: Q:/Question: followed by A:/Answer:
  const prefixRe = /^(?:Q|Question)\s*:\s*(.+)/i;
  const answerRe = /^(?:A|Answer)\s*:\s*(.+)/i;
  for (let i = 0; i < lines.length; i++) {
    const qm = prefixRe.exec(lines[i]);
    if (qm && i + 1 < lines.length) {
      const am = answerRe.exec(lines[i + 1]);
      if (am) {
        addPair(qm[1], am[1]);
        i++; // skip answer line
      }
    }
  }

  // Pattern 2 — Question line (ends with ?, 40–120 chars) + answer paragraph (20–300 chars, not a question)
  // Require 3+ consecutive pairs to emit (avoids false positives from rhetorical questions in prose)
  let consecutivePairs: FaqPair[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    if (
      line.endsWith('?') &&
      line.length >= 40 && line.length <= 120 &&
      !next.endsWith('?') &&
      next.length >= 20 && next.length <= 300
    ) {
      consecutivePairs.push({ question: line.trim(), answer: next.trim() });
      i++; // skip answer line
    } else {
      // Break in consecutive pattern — only keep if we had 3+
      if (consecutivePairs.length >= 3) {
        for (const p of consecutivePairs) addPair(p.question, p.answer);
      }
      consecutivePairs = [];
    }
  }
  // Flush remaining
  if (consecutivePairs.length >= 3) {
    for (const p of consecutivePairs) addPair(p.question, p.answer);
  }

  // Pattern 3 — Bold question sentinel: § **Question?** § Answer (from DOCX extraction)
  for (const line of lines) {
    const m = SENTINEL_FAQ_RE.exec(line);
    if (m) {
      addPair(m[1], m[2]);
    }
  }

  return pairs.length >= 3 ? pairs : [];
}
