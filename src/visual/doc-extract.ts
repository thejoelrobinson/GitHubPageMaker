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

export interface PptxResult {
  slides: Array<{ title: string; body: string }>;
  images: Array<{ filename: string; base64: string; mediaType: string }>;
}

export interface DocxResult {
  text: string;
  images: Array<{ filename: string; base64: string; mediaType: string }>;
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
  const images: PptxResult['images'] = [];

  // Sort slide XML files numerically
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
      const nb = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
      return na - nb;
    });

  for (const slideName of slideFiles) {
    const xml = await zip.files[slideName].async('text');
    const doc = new DOMParser().parseFromString(xml, 'text/xml');

    // Find title shape: <p:sp> containing <p:ph type="title"> or <p:ph type="ctrTitle">
    let title = '';
    let body = '';
    const shapes = Array.from(doc.querySelectorAll('sp'));
    for (const sp of shapes) {
      const ph = sp.querySelector('ph');
      const phType = ph?.getAttribute('type') ?? '';
      const isTitle = phType === 'title' || phType === 'ctrTitle' || phType === 'subTitle';
      const texts = Array.from(sp.querySelectorAll('t')).map(t => t.textContent ?? '').join(' ').trim();
      if (!texts) continue;
      if (isTitle && !title) {
        title = texts;
      } else {
        body += (body ? '\n' : '') + texts;
      }
    }

    slides.push({ title: title || `Slide ${slides.length + 1}`, body });
  }

  // Extract embedded images from ppt/media/*
  const mediaFiles = Object.keys(zip.files).filter(name =>
    /^ppt\/media\//i.test(name) && /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(name),
  );
  for (const mediaName of mediaFiles) {
    const ext = mediaName.split('.').pop()?.toLowerCase() ?? 'png';
    const mediaTypeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
    };
    const mediaType = mediaTypeMap[ext] ?? 'image/png';
    const base64 = await zip.files[mediaName].async('base64');
    const filename = mediaName.split('/').pop() ?? mediaName;
    images.push({ filename, base64, mediaType });
  }

  return { slides, images };
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
    const isH2     = /^(Heading[23]|Subtitle)$/i.test(styleVal);
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
    if (isH1 || isH2) {
      const plain = validSegs.flatMap(s => s).map(r => r.text).join('').trim();
      metas.push({ lines: [isH1 ? `# ${plain}` : `## ${plain}`], isSubtitle: false, hasBreak });
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

  return { text: paragraphs.join('\n'), images };
}
