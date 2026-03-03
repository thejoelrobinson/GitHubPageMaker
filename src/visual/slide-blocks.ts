/**
 * PPTX slide-to-block direct mapping.
 * Converts structured ExtractedSlide data into AssembledBlock prefill,
 * bypassing the text-based analysis path for better PPTX fidelity.
 */

import type { NavLink } from '../types';
import type { ExtractedSlide } from './doc-extract';
import type { ImageAsset, AssembledBlock, BlockPrefill, StatItem } from './content-extract';

// ── Patterns ──────────────────────────────────────────────────────────────────

const SLIDE_STAT_RE = /\b(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*([%+])\s*([\w\s]{2,30})/g;
const SLIDE_STAT_RE2 = /\$\s*(\d+(?:\.\d+)?[KMBkmb]?)\s+([\w\s]{2,25})/g;
const SLIDE_STAT_RE3 = /\b(\d+)\s+(years?|clients?|projects?|awards?|customers?|employees?)\b/gi;

const CONTACT_SIGNALS = /\b(contact|email|phone|call|reach|connect|get in touch|schedule|book|demo|@|www\.|\.com|\.org)\b/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripMd(s: string): string {
  return s
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/\*+/g, '')
    .trim();
}

/** Find the first matching image asset for a slide's referenced image filenames. */
function findSlideImage(slide: ExtractedSlide, images: ImageAsset[]): ImageAsset | undefined {
  for (const fn of slide.imageFilenames) {
    const match = images.find(img => img.filename === fn);
    if (match) return match;
  }
  return undefined;
}

/** Detect stat items from text */
function detectSlideStats(text: string): StatItem[] {
  const items: StatItem[] = [];
  const seen = new Set<string>();
  for (const pattern of [SLIDE_STAT_RE, SLIDE_STAT_RE2, SLIDE_STAT_RE3]) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null && items.length < 4) {
      const value = m[1] + (m[2] ?? '');
      const label = (m[3] ?? m[2] ?? '').trim().replace(/\s+/g, ' ');
      if (!seen.has(value) && label.length > 1) {
        seen.add(value);
        items.push({ value: value.toUpperCase(), label, sourceSection: null });
      }
    }
  }
  return items;
}

// ── Per-slide classification ──────────────────────────────────────────────────

/**
 * Classify a single slide into a block type based on its content characteristics.
 */
function slideToBlock(
  slide: ExtractedSlide,
  index: number,
  total: number,
  images: ImageAsset[],
  splitCount: { n: number },
): AssembledBlock | null {
  const hasImage = slide.imageFilenames.length > 0;
  const hasBullets = slide.bullets.length > 0;
  const bodyText = slide.notes || slide.body;
  const fullText = [slide.title, slide.body, slide.notes].join(' ');
  const title = slide.title;

  // Skip empty slides
  if (!title && !slide.body && !slide.notes && slide.bullets.length === 0) return null;

  // Last slide with contact signals -> cta block
  if (index === total - 1 && CONTACT_SIGNALS.test(fullText)) {
    return {
      type: 'cta',
      prefill: {
        'content.heading': title || 'Get in Touch',
        'content.subtext': bodyText.slice(0, 120) || 'We\'d love to hear from you.',
        'content.btnText': 'Contact Us',
        'content.btnLink': '#contact',
      },
      sectionTitle: title,
    };
  }

  // Detect stats: slides with large numbers/percentages
  const statItems = detectSlideStats(fullText);
  if (statItems.length >= 2) {
    const prefill: BlockPrefill = {};
    statItems.slice(0, 4).forEach((s, i) => {
      prefill[`content.stat${i + 1}Num`] = s.value;
      prefill[`content.stat${i + 1}Label`] = s.label;
    });
    return { type: 'stats', prefill, sectionTitle: title };
  }

  // First slide -> hero block
  if (index === 0) {
    const heroImg = hasImage ? findSlideImage(slide, images) : undefined;
    const prefill: BlockPrefill = {
      'content.heading': title,
      'content.subheading': bodyText || slide.bullets.join('. ') || 'Welcome',
      'content.btn1Text': 'Learn More',
      'content.btn1Link': '#about',
      'settings.bgType': heroImg ? 'image' : 'color',
    };
    if (heroImg) prefill['settings.bgImage'] = `assets/${heroImg.filename}`;
    return { type: 'hero', prefill, sectionTitle: '_hero' };
  }

  // Slide with title + bullets -> features block (bullets = feature items)
  if (hasBullets && slide.bullets.length >= 2) {
    const items = slide.bullets.slice(0, 3);
    const prefill: BlockPrefill = {
      'content.sectionTitle': title,
      'content.sectionSub': slide.notes || '',
    };
    items.forEach((item, i) => {
      const n = i + 1;
      prefill[`content.card${n}Icon`] = ['\u26A1', '\uD83C\uDFAF', '\u2728', '\uD83D\uDD12', '\uD83D\uDCCA', '\uD83D\uDE80'][i] ?? '\u26A1';
      prefill[`content.card${n}Title`] = item;
      prefill[`content.card${n}Desc`] = '';
    });
    prefill['content.columns'] = Math.min(items.length, 3);
    return { type: 'features', prefill, sectionTitle: title };
  }

  // Slide with image + text -> split block (alternate sides)
  if (hasImage) {
    const img = findSlideImage(slide, images);
    if (img) {
      const imageRight = splitCount.n % 2 === 0;
      splitCount.n++;
      return {
        type: 'split',
        prefill: {
          'content.heading': title,
          'content.body': bodyText || slide.bullets.join('\n'),
          'content.imageUrl': `assets/${img.filename}`,
          'content.imageAlt': title,
          'content.showBtn': false,
          'settings.side': imageRight ? 'right' : 'left',
        },
        sectionTitle: title,
      };
    }
  }

  // Default: text block
  return {
    type: 'text',
    prefill: {
      'content.heading': title,
      'content.body': bodyText || slide.bullets.join('\n') || slide.body,
    },
    sectionTitle: title,
  };
}

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Directly convert PPTX slides into blocks, bypassing the text-based analysis.
 * Each slide maps to one block based on its content characteristics.
 */
export function assembleBlocksFromSlides(
  extractedSlides: ExtractedSlide[],
  images: ImageAsset[],
): { blocks: AssembledBlock[]; pageTitle: string } {
  const blocks: AssembledBlock[] = [];
  const total = extractedSlides.length;
  const splitCount = { n: 0 };

  // Derive page title from first slide
  const pageTitle = extractedSlides[0]?.title || 'Presentation';
  const plainTitle = stripMd(pageTitle);

  // nav
  blocks.push({
    type: 'nav',
    prefill: {
      'content.logo': plainTitle,
      'content.links': [
        { text: 'Home', href: '/' },
        { text: 'About', href: '#about' },
        { text: 'Contact', href: '#contact' },
      ] as NavLink[],
    },
  });

  // Convert each slide to a block
  for (let i = 0; i < total; i++) {
    const block = slideToBlock(extractedSlides[i], i, total, images, splitCount);
    if (block) blocks.push(block);
  }

  // Ensure there's a CTA if none was emitted from last slide
  const hasCta = blocks.some(b => b.type === 'cta');
  if (!hasCta) {
    blocks.push({
      type: 'cta',
      prefill: {
        'content.heading': 'Ready to Get Started?',
        'content.subtext': 'We\'d love to hear from you.',
        'content.btnText': 'Contact Us',
        'content.btnLink': '#contact',
      },
    });
  }

  // footer
  blocks.push({
    type: 'footer',
    prefill: {
      'content.logo': plainTitle,
      'content.tagline': '',
      'content.copyright': `\u00A9 ${new Date().getFullYear()} ${plainTitle}`,
      'content.links': [
        { text: 'Home', href: '/' },
        { text: 'About', href: '#about' },
      ] as NavLink[],
    },
  });

  return { blocks, pageTitle };
}
