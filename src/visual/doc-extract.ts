/**
 * Client-side document content extraction.
 * Loads pdfjs-dist and JSZip from CDN on first use (cached by browser).
 * No API keys or server required.
 */

// ── CDN loaders ──────────────────────────────────────────────────────────────

const JSZIP_CDN = 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js';
const PDFJS_CDN = 'https://unpkg.com/pdfjs-dist@4.4.168/legacy/build/pdf.min.mjs';
const PDF_WORKER = 'https://unpkg.com/pdfjs-dist@4.4.168/legacy/build/pdf.worker.min.mjs';

let _jszipLoaded = false;
let _pdfjsLoaded = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

async function loadJsZip(): Promise<AnyRecord> {
  if (_jszipLoaded) return (window as unknown as AnyRecord)['JSZip'] as AnyRecord;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSZIP_CDN;
    s.onload = () => { _jszipLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('Failed to load JSZip'));
    document.head.appendChild(s);
  });
  return (window as unknown as AnyRecord)['JSZip'] as AnyRecord;
}

async function loadPdfjs(): Promise<AnyRecord> {
  if (_pdfjsLoaded) return (window as unknown as AnyRecord)['pdfjsLib'] as AnyRecord;
  // pdfjs-dist 4.x is an ES module — use dynamic import
  const mod = await import(/* @vite-ignore */ PDFJS_CDN) as Record<string, unknown>;
  const lib = (mod['default'] ?? mod) as AnyRecord;
  if (lib['GlobalWorkerOptions']) lib['GlobalWorkerOptions']['workerSrc'] = PDF_WORKER;
  _pdfjsLoaded = true;
  return lib;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface PdfResult {
  pages: Array<{ text: string; pageImageDataUrl?: string }>;
  /** true if the document was too large and was truncated */
  truncated: boolean;
}

/** Per-slide structured data for direct slide→block mapping. */
export interface ExtractedSlide {
  title: string;
  bullets: string[];
  body: string;
  notes: string;
  /** Filenames of images referenced by this slide (from ppt/media/) */
  imageFilenames: string[];
}

export interface PptxResult {
  slides: Array<{ title: string; body: string }>;
  images: Array<{ filename: string; base64: string; mediaType: string }>;
  /** Rich per-slide data for direct slide→block conversion */
  extractedSlides: ExtractedSlide[];
}

export interface ExtractedTable {
  rows: string[][];
  hasHeader: boolean;
}

export interface DocxResult {
  text: string;
  images: Array<{ filename: string; base64: string; mediaType: string }>;
  tables?: ExtractedTable[];
}

// ── PDF extraction ────────────────────────────────────────────────────────────

const MAX_PDF_PAGES = 40;

export async function pdfExtract(file: File): Promise<PdfResult> {
  const lib = await loadPdfjs();
  const getDocument = lib['getDocument'] as (src: { data: ArrayBuffer }) => { promise: Promise<unknown> };

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise as {
    numPages: number;
    getPage(n: number): Promise<{
      getTextContent(): Promise<{ items: Array<{ str: string }> }>;
      getViewport(opts: { scale: number }): { width: number; height: number };
      render(ctx: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
    }>;
  };

  const pageCount = pdf.numPages;
  const limit = Math.min(pageCount, MAX_PDF_PAGES);
  const pages: PdfResult['pages'] = [];

  for (let i = 1; i <= limit; i++) {
    const page = await pdf.getPage(i);

    // Extract text
    const textContent = await page.getTextContent();
    const text = textContent.items.map(it => it.str).join(' ').trim();

    // Render up to first 10 pages as images
    let pageImageDataUrl: string | undefined;
    if (i <= 10) {
      try {
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement('canvas');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        pageImageDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      } catch {
        // ignore render errors
      }
    }

    pages.push({ text, pageImageDataUrl });
  }

  return { pages, truncated: pageCount > MAX_PDF_PAGES };
}

// ── PPTX extraction ───────────────────────────────────────────────────────────

export async function pptxExtract(file: File): Promise<PptxResult> {
  const JSZip = await loadJsZip();
  // JSZip is dynamically loaded — use any-typed call
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zip = await (JSZip as any).loadAsync(await file.arrayBuffer()) as {
    files: Record<string, { async(type: 'text'): Promise<string>; async(type: 'base64'): Promise<string>; name: string }>;
  };

  const slides: PptxResult['slides'] = [];
  const extractedSlides: ExtractedSlide[] = [];
  const images: PptxResult['images'] = [];

  // Sort slide XML files numerically
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
      const nb = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
      return na - nb;
    });

  // Extract embedded images from ppt/media/* (needed for per-slide mapping)
  const mediaFiles = Object.keys(zip.files).filter(name =>
    /^ppt\/media\//i.test(name) && /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(name),
  );
  const mediaTypeMap: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
  };
  for (const mediaName of mediaFiles) {
    const ext = mediaName.split('.').pop()?.toLowerCase() ?? 'png';
    const mediaType = mediaTypeMap[ext] ?? 'image/png';
    const base64 = await zip.files[mediaName].async('base64');
    const filename = mediaName.split('/').pop() ?? mediaName;
    images.push({ filename, base64, mediaType });
  }

  for (let si = 0; si < slideFiles.length; si++) {
    const slideName = slideFiles[si];
    const xml = await zip.files[slideName].async('text');
    const doc = new DOMParser().parseFromString(xml, 'text/xml');

    // Find title shape: <p:sp> containing <p:ph type="title"> or <p:ph type="ctrTitle">
    let title = '';
    let body = '';
    const bullets: string[] = [];
    const bodyParts: string[] = [];
    const shapes = Array.from(doc.querySelectorAll('sp'));
    for (const sp of shapes) {
      const ph = sp.querySelector('ph');
      const phType = ph?.getAttribute('type') ?? '';
      const isTitle = phType === 'title' || phType === 'ctrTitle' || phType === 'subTitle';

      if (isTitle) {
        const texts = Array.from(sp.querySelectorAll('t')).map(t => t.textContent ?? '').join(' ').trim();
        if (texts && !title) title = texts;
      } else {
        // Parse each paragraph in this shape separately to detect bullets
        const paras = Array.from(sp.querySelectorAll('p'));
        for (const p of paras) {
          const pText = Array.from(p.querySelectorAll('t')).map(t => t.textContent ?? '').join('').trim();
          if (!pText) continue;

          // Detect bullet: pPr with buChar, buAutoNum, buNone=false, or indentation with lvl > 0
          const pPr = p.querySelector('pPr');
          const hasBuChar = !!pPr?.querySelector('buChar');
          const hasBuAutoNum = !!pPr?.querySelector('buAutoNum');
          const lvl = parseInt(pPr?.getAttribute('lvl') ?? '0', 10);
          const isBullet = hasBuChar || hasBuAutoNum || lvl > 0;

          if (isBullet) {
            bullets.push(pText);
          } else {
            bodyParts.push(pText);
          }
        }
      }
    }

    body = [...bodyParts, ...bullets].join('\n');

    // Speaker notes: ppt/notesSlides/notesSlide{N}.xml
    const slideNum = slideName.match(/\d+/)?.[0] ?? '';
    let notes = '';
    const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
    if (zip.files[notesPath]) {
      try {
        const notesXml = await zip.files[notesPath].async('text');
        const notesDoc = new DOMParser().parseFromString(notesXml, 'text/xml');
        // Notes body is in <p:sp> with <p:ph type="body"> (index 1)
        const noteShapes = Array.from(notesDoc.querySelectorAll('sp'));
        for (const sp of noteShapes) {
          const ph = sp.querySelector('ph');
          const phType = ph?.getAttribute('type') ?? '';
          if (phType === 'body') {
            const texts = Array.from(sp.querySelectorAll('t')).map(t => t.textContent ?? '').join(' ').trim();
            if (texts) notes = texts;
            break;
          }
        }
      } catch { /* notes file may not parse */ }
    }

    // Per-slide image references: parse relationship file to find media targets
    const slideImageFilenames: string[] = [];
    const relsPath = slideName.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
    if (zip.files[relsPath]) {
      try {
        const relsXml = await zip.files[relsPath].async('text');
        const relsDoc = new DOMParser().parseFromString(relsXml, 'text/xml');
        const rels = Array.from(relsDoc.querySelectorAll('Relationship'));
        for (const rel of rels) {
          const target = rel.getAttribute('Target') ?? '';
          // Targets are relative like "../media/image1.png"
          if (/\/media\//.test(target) && /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(target)) {
            const fn = target.split('/').pop() ?? '';
            if (fn) slideImageFilenames.push(fn);
          }
        }
      } catch { /* rels file may not parse */ }
    }

    slides.push({ title: title || `Slide ${slides.length + 1}`, body });
    extractedSlides.push({
      title: title || `Slide ${extractedSlides.length + 1}`,
      bullets,
      body: bodyParts.join('\n'),
      notes,
      imageFilenames: slideImageFilenames,
    });
  }

  return { slides, images, extractedSlides };
}

// ── DOCX extraction ───────────────────────────────────────────────────────────

export async function docxExtract(file: File): Promise<DocxResult> {
  const JSZip = await loadJsZip();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zip = await (JSZip as any).loadAsync(await file.arrayBuffer()) as {
    files: Record<string, {
      async(type: 'text'): Promise<string>;
      async(type: 'base64'): Promise<string>;
      name: string;
    }>;
  };

  const docXml = await zip.files['word/document.xml']?.async('text');
  if (!docXml) return { text: '', images: [] };

  const doc = new DOMParser().parseFromString(docXml, 'text/xml');

  // ── Helpers ────────────────────────────────────────────────────────────────
  type RunToken = { text: string; bold: boolean; italic: boolean };

  /** Format a run-token array back to markdown text. */
  function fmtRuns(runs: RunToken[]): string {
    return runs.map(r => {
      if (!r.text) return '';
      if (r.bold && r.italic) return `***${r.text}***`;
      if (r.bold) return `**${r.text}**`;
      if (r.italic) return `*${r.text}*`;
      return r.text;
    }).join('').trim();
  }

  function runBoldVal(el: Element | null | undefined, pDefault: boolean): boolean {
    const b = el?.querySelector('b');
    if (!b) return pDefault;
    const v = b.getAttribute('w:val') ?? b.getAttribute('val') ?? '1';
    return v !== '0';
  }

  function runItalicVal(el: Element | null | undefined, pDefault: boolean): boolean {
    const i = el?.querySelector('i');
    if (!i) return pDefault;
    const v = i.getAttribute('w:val') ?? i.getAttribute('val') ?? '1';
    return v !== '0';
  }

  // ── Phase 1: parse every paragraph into output lines ──────────────────────
  // Each paragraph may emit 0, 1, or 2 lines (e.g. a heading line + a body line
  // when the paragraph mixes bold-heading content with non-bold body text).
  interface DocxParaMeta {
    lines: string[];
    isSubtitle: boolean; // entirely italic → section tagline
    hasBreak: boolean;   // page or document-section break follows
  }

  const metas: DocxParaMeta[] = [];

  for (const p of Array.from(doc.querySelectorAll('p'))) {
    const pPr = p.querySelector('pPr');

    // ── Official Word heading / list styles ──────────────────────────────────
    const pStyleEl = pPr?.querySelector('pStyle');
    const styleVal = pStyleEl?.getAttribute('w:val') ?? pStyleEl?.getAttribute('val') ?? '';
    const isH1     = /^(Title|Heading1)$/i.test(styleVal);
    const isH2     = /^(Heading2|Subtitle)$/i.test(styleVal);
    const isH3orH4 = /^(Heading[34])$/i.test(styleVal);
    const isList   = !!pPr?.querySelector('numPr'); // Word bullet / numbered list

    // ── Paragraph-level bold/italic default (inherited by runs) ──────────────
    // pPr/rPr defines formatting for the paragraph mark only, not text runs.
    // We still read it to detect paragraph-level italic for subtitle detection.

    // ── Page / section break detection ───────────────────────────────────────
    const hasBreak =
      !!pPr?.querySelector('sectPr') ||
      Array.from(p.querySelectorAll('br')).some(br =>
        (br.getAttribute('w:type') ?? br.getAttribute('type') ?? '') === 'page',
      );

    // ── Build run-token segments, splitting at soft returns (Shift+Enter) ────
    // Each soft return (<w:br/> without type) creates a new segment boundary.
    const segments: RunToken[][] = [[]];

    for (const run of Array.from(p.querySelectorAll('r'))) {
      const rPr = run.querySelector('rPr');

      // Skip comment reference runs entirely (they add noise)
      const rStyle = rPr?.querySelector('rStyle');
      const rStyleVal = rStyle?.getAttribute('w:val') ?? rStyle?.getAttribute('val') ?? '';
      if (rStyleVal === 'CommentReference') continue;

      // pPr/rPr/b formats the paragraph MARK only, not text runs.
      // Run-level bold/italic must come from the run's own <w:rPr>.
      const bold   = runBoldVal(rPr, false);
      const italic = runItalicVal(rPr, false);

      // Detect soft return inside this run
      const softBreak = Array.from(run.querySelectorAll('br')).some(br => {
        const t = br.getAttribute('w:type') ?? br.getAttribute('type') ?? '';
        return t === '' || t === 'textWrapping';
      });

      const text = Array.from(run.querySelectorAll('t')).map(t => t.textContent ?? '').join('');
      if (text) segments[segments.length - 1].push({ text, bold, italic });
      if (softBreak) segments.push([]);
    }

    const validSegs = segments.filter(s => s.some(r => r.text.trim()));
    if (validSegs.length === 0) {
      metas.push({ lines: [], isSubtitle: false, hasBreak });
      continue;
    }

    // ── Official heading style → straightforward ─────────────────────────────
    if (isH1 || isH2 || isH3orH4) {
      const plain = validSegs.flatMap(s => s).map(r => r.text).join('').trim();
      const prefix = isH1 ? '#' : isH2 ? '##' : '###';
      metas.push({ lines: [`${prefix} ${plain}`], isSubtitle: false, hasBreak });
      continue;
    }

    // ── Word list item → prefix with "- " so detectBulletGroups catches it ───
    if (isList) {
      const plain = validSegs.flatMap(s => s).map(r => r.text).join('').trim();
      metas.push({ lines: [`- ${plain}`], isSubtitle: false, hasBreak });
      continue;
    }

    const allRuns  = validSegs.flatMap(s => s).filter(r => r.text.trim());
    const plainAll = allRuns.map(r => r.text).join('').trim();
    const allBold  = allRuns.length > 0 && allRuns.every(r => r.bold);
    const allItalic = allRuns.length > 0 && allRuns.every(r => r.italic);

    // ── Entirely italic, non-bold, short → section subtitle/tagline ──────────
    if (allItalic && !allBold && plainAll.length < 150 && !/[.,;:]$/.test(plainAll)) {
      metas.push({ lines: [`*${plainAll}*`], isSubtitle: true, hasBreak });
      continue;
    }

    // ── Multiple soft-return segments → treat first bold segment as heading ──
    if (validSegs.length > 1) {
      const lines: string[] = [];
      for (let i = 0; i < validSegs.length; i++) {
        const seg      = validSegs[i];
        const segRuns  = seg.filter(r => r.text.trim());
        const segPlain = segRuns.map(r => r.text).join('').trim();
        if (!segPlain) continue;
        const segAllBold = segRuns.every(r => r.bold);
        if (i === 0 && segAllBold && segPlain.length < 100 && !/[.,;:]$/.test(segPlain)) {
          lines.push(`## ${segPlain}`);
        } else {
          lines.push(fmtRuns(seg));
        }
      }
      metas.push({ lines, isSubtitle: false, hasBreak });
      continue;
    }

    // ── Single segment: detect bold-heading → non-bold-body transition ────────
    // Find where the leading bold run sequence ends.
    const seg = validSegs[0];
    let boldEnd = 0;
    for (let i = 0; i < seg.length; i++) {
      if (!seg[i].text.trim()) continue;
      if (seg[i].bold) boldEnd = i + 1;
      else break;
    }

    if (boldEnd > 0 && boldEnd < seg.length) {
      const boldPlain    = seg.slice(0, boldEnd).map(r => r.text).join('').trim();
      const nonBoldRuns  = seg.slice(boldEnd);
      const nonBoldPlain = nonBoldRuns.map(r => r.text).join('').trim();

      // "Label: description" pattern (bold part ends with colon) →
      // emit as a structured achievement list item so assembleBlocks can
      // turn groups of these into feature cards with title + body.
      if (boldPlain.endsWith(':') && boldPlain.length <= 60 && nonBoldPlain.length > 10) {
        const label = boldPlain.slice(0, -1); // strip trailing colon
        metas.push({ lines: [`§ **${label}** § ${fmtRuns(nonBoldRuns)}`], isSubtitle: false, hasBreak });
        continue;
      }

      // Reject as heading if: too long (>85), ends with punctuation, or looks
      // like inline-bolded stats (contains numbers+% or $+digits).
      const looksLikeStats = /\d+\s*%|\$\d|\d{2,}\s+(year|month|associate|client|visitor)/i.test(boldPlain);
      if (boldPlain.length < 85 && !/[.,;:]$/.test(boldPlain) && nonBoldPlain.length > 20 && !looksLikeStats) {
        metas.push({ lines: [`## ${boldPlain}`, fmtRuns(nonBoldRuns)], isSubtitle: false, hasBreak });
        continue;
      }
    }

    // ── Short all-bold paragraph → standalone heading ─────────────────────────
    if (allBold && plainAll.length < 100 && !/[.,;:]$/.test(plainAll)) {
      metas.push({ lines: [`## ${plainAll}`], isSubtitle: false, hasBreak });
      continue;
    }

    // ── Long all-bold paragraph → plain text ──────────────────────────────────
    // When every run is bold there is nothing to highlight relative to its
    // neighbours; wrapping each run in ** produces **run1****run2** garbage.
    // Emit as plain text — the block context conveys the emphasis.
    if (allBold) {
      metas.push({ lines: [plainAll], isSubtitle: false, hasBreak });
      continue;
    }

    // ── Default: emit with inline bold/italic formatting ─────────────────────
    metas.push({ lines: [fmtRuns(seg)], isSubtitle: false, hasBreak });
  }

  // ── Phase 2: flatten metas → final paragraph array ────────────────────────
  const paragraphs: string[] = [];
  let breakPending = false;

  for (const m of metas) {
    if (m.lines.length === 0) {
      if (m.hasBreak) breakPending = true;
      continue;
    }

    if (breakPending && !m.lines[0].startsWith('#') && !m.isSubtitle) {
      // After a page/section break, promote to a section heading if not already
      const plain = m.lines[0].replace(/\*{1,3}/g, '').trim();
      if (plain.length < 80 && !/[.,;:]$/.test(plain)) {
        paragraphs.push(`## ${plain}`);
        paragraphs.push(...m.lines.slice(1));
      } else {
        const autoHead = plain.split(/\s+/).slice(0, 6).join(' ');
        paragraphs.push(`## ${autoHead}…`);
        paragraphs.push(...m.lines);
      }
      breakPending = false;
    } else {
      paragraphs.push(...m.lines);
      breakPending = false;
    }

    if (m.hasBreak) breakPending = true;
  }

  // ── Phase 3: parse tables (<w:tbl>) ────────────────────────────────────
  const tables: ExtractedTable[] = [];
  for (const tbl of Array.from(doc.querySelectorAll('tbl'))) {
    const rows: string[][] = [];
    let hasHeader = false;

    for (const tr of Array.from(tbl.querySelectorAll('tr'))) {
      // Detect header row via <w:tblHeader/> on first row's properties
      if (rows.length === 0) {
        const trPr = tr.querySelector('trPr');
        if (trPr?.querySelector('tblHeader')) hasHeader = true;
      }

      const cells: string[] = [];
      for (const tc of Array.from(tr.querySelectorAll('tc'))) {
        // Concatenate all <w:t> text within this cell
        const cellText = Array.from(tc.querySelectorAll('t'))
          .map(t => t.textContent ?? '')
          .join(' ')
          .trim();
        cells.push(cellText);
      }
      if (cells.length > 0) rows.push(cells);
    }

    // Skip degenerate tables (0 rows or single-cell)
    if (rows.length < 1 || (rows.length === 1 && rows[0].length <= 1)) continue;

    // Heuristic header detection: if first row is all-caps or all-bold-style text
    // and we didn't already detect via <w:tblHeader>
    if (!hasHeader && rows.length >= 2) {
      const firstRow = rows[0];
      const allUpperOrShort = firstRow.every(cell => {
        const letters = cell.replace(/[^A-Za-z]/g, '');
        return (letters.length >= 2 && cell === cell.toUpperCase()) || cell.length < 3;
      });
      if (allUpperOrShort && firstRow.some(c => c.length >= 2)) hasHeader = true;
    }

    tables.push({ rows, hasHeader });
  }

  // Extract embedded images from word/media/*
  const mediaTypeMap: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
  };
  const images: DocxResult['images'] = [];
  const mediaFiles = Object.keys(zip.files).filter(name =>
    /^word\/media\//i.test(name) && /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(name),
  );
  for (const mediaName of mediaFiles) {
    const ext = mediaName.split('.').pop()?.toLowerCase() ?? 'png';
    const mediaType = mediaTypeMap[ext] ?? 'image/png';
    const base64 = await zip.files[mediaName].async('base64');
    const filename = mediaName.split('/').pop() ?? mediaName;
    images.push({ filename, base64, mediaType });
  }

  return { text: paragraphs.join('\n'), images, tables: tables.length > 0 ? tables : undefined };
}
