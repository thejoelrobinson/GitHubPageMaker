/**
 * Asset-to-page wizard.
 * Orchestrates: file staging → document extraction → content analysis →
 * block assembly → asset upload → page creation.
 * No API keys required — fully algorithmic.
 */

import { state, visual } from '../state';
import { uploadFile } from '../github';
import { notify } from '../ui/notifications';
import { titleToPath, escapeHtml, shortNavLabel } from '../utils';
import { pdfExtract, pptxExtract, docxExtract } from './doc-extract';
import type { ExtractedTable, ExtractedSlide } from './doc-extract';
import type { ImageAsset, AssembledBlock, BlockPrefill } from './content-extract';
import { registerLocalAsset } from './local-asset-registry';
import { cacheFileInSW, isPreviewSWReady } from '../preview-sw-client';
import { analyzeContent, assembleBlocks } from './content-extract';
import { validateHeadings } from './llm-validator';
import { validateHeadingsInBrowser, isBrowserLLMReady, DEFAULT_BROWSER_MODEL,
         polishAssembledBlocksInBrowser,
         generatePremiumPageBrowserLLM } from './browser-llm';
import { isGeminiReady, getGeminiConfig, validateHeadingsCloud, polishAssembledBlocks, generateFullPageHTML } from './cloud-llm';
import { assembleBlocksFromSlides } from './slide-blocks';
import { addEmptyPage, switchPage } from './pages';
import { renderTabs } from '../code-editor';
import { addBlockAfter, renderCanvas } from './canvas';
import { renderSectionList, renderPageList } from './pages';
import { openSettings } from '../modal';
import type { NavLink } from '../types';

// ── State ─────────────────────────────────────────────────────────────────────

let _stagedFiles: File[] = [];

// ── Public API ────────────────────────────────────────────────────────────────

export function updateAiChip(): void {
  const label = document.getElementById('wizard-ai-chip-label');
  const icon  = document.getElementById('wizard-ai-chip-icon');
  if (!label || !icon) return;
  if (isGeminiReady()) {
    label.textContent = 'AI on — Gemini';
    icon.style.color = 'var(--accent)';
  } else if (state.browserLLMEnabled && isBrowserLLMReady()) {
    const modelShort = (state.browserLLMModel || DEFAULT_BROWSER_MODEL).split('/').pop() ?? 'AI';
    label.textContent = `AI on — ${modelShort}`;
    icon.style.color = 'var(--accent)';
  } else if (state.browserLLMEnabled) {
    label.textContent = 'AI downloading…';
    icon.style.color = 'var(--text-dim)';
  } else if (state.ollamaEnabled) {
    label.textContent = 'AI on — Ollama';
    icon.style.color = 'var(--accent)';
  } else {
    label.textContent = 'AI off';
    icon.style.color = '';
  }
}

export function openAssetWizard(targetPageId?: string): void {
  _stagedFiles = [];
  updateAiChip();
  showStep('upload');
  renderFileList();
  populateTargetPageSelect();
  // Pre-select a specific page when opened from a per-page redesign context
  if (targetPageId) {
    const sel = document.getElementById('wizard-target-page') as HTMLSelectElement | null;
    if (sel) sel.value = targetPageId;
  }
  document.getElementById('asset-wizard-modal')?.classList.remove('hidden');
}

function populateTargetPageSelect(): void {
  const sel = document.getElementById('wizard-target-page') as HTMLSelectElement | null;
  if (!sel) return;
  sel.innerHTML = '<option value="">— Create new page —</option>' +
    visual.pages.map(p =>
      `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title)}${p.isHome ? ' (Home)' : ''}</option>`,
    ).join('');
}

export function closeAssetWizard(): void {
  document.getElementById('asset-wizard-modal')?.classList.add('hidden');
  _stagedFiles = [];
}

// ── Step navigation ───────────────────────────────────────────────────────────

function showStep(step: 'upload' | 'processing' | 'done'): void {
  ['upload', 'processing', 'done'].forEach(s => {
    const el = document.getElementById(`wizard-step-${s}`);
    if (el) el.style.display = s === step ? 'block' : 'none';
  });
  const modal = document.querySelector('.wizard-modal');
  if (step === 'processing') {
    clearProcessingUI();
    // Two-frame delay so the modal is visible before widening — lets the CSS transition play
    requestAnimationFrame(() => requestAnimationFrame(() => modal?.classList.add('wizard-modal--wide')));
  } else {
    modal?.classList.remove('wizard-modal--wide');
  }
}

// ── File staging ──────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif',
]);

const ACCEPTED_EXTS = /\.(pdf|pptx?|docx?|txt|md|jpe?g|png|gif|webp|svg|avif)$/i;

function isAccepted(file: File): boolean {
  return ACCEPTED_TYPES.has(file.type) || ACCEPTED_EXTS.test(file.name);
}

function fileIcon(file: File): string {
  const name = file.name.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|svg|avif)$/i.test(name)) return '🖼';
  if (name.endsWith('.pdf')) return '📄';
  if (/\.pptx?$/i.test(name)) return '📊';
  if (/\.docx?$/i.test(name)) return '📝';
  return '📃';
}

function formatBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

function dedupeName(name: string): string {
  // Avoid duplicate filenames in the staged list
  const existing = _stagedFiles.map(f => f.name);
  if (!existing.includes(name)) return name;
  const [base, ext] = name.includes('.')
    ? [name.slice(0, name.lastIndexOf('.')), name.slice(name.lastIndexOf('.'))]
    : [name, ''];
  let i = 2;
  while (existing.includes(`${base}-${i}${ext}`)) i++;
  return `${base}-${i}${ext}`;
}

function stageFiles(files: FileList | File[]): void {
  const arr = Array.from(files);
  const skipped: string[] = [];
  for (const f of arr) {
    if (!isAccepted(f)) { skipped.push(f.name); continue; }
    if (f.size > 100 * 1024 * 1024) { notify(`${f.name} is too large (max 100 MB)`, 'warning'); continue; }
    // Deduplicate names in the staged list
    const existingIdx = _stagedFiles.findIndex(x => x.name === f.name);
    if (existingIdx !== -1) _stagedFiles.splice(existingIdx, 1);
    _stagedFiles.push(f);
  }
  if (skipped.length) notify(`${skipped.length} unsupported file(s) skipped`, 'info');
  renderFileList();
  updateBuildBtn();
}

function renderFileList(): void {
  const list = document.getElementById('wizard-file-list');
  if (!list) return;

  if (_stagedFiles.length === 0) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = _stagedFiles.map((f, i) => `
    <div class="wfl-item" data-idx="${i}">
      <span class="wfl-icon">${fileIcon(f)}</span>
      <span class="wfl-name">${escapeHtml(f.name)}</span>
      <span class="wfl-size">${formatBytes(f.size)}</span>
      <button class="wfl-remove pp-icon-btn" data-idx="${i}" title="Remove">
        <svg viewBox="0 0 16 16" fill="currentColor" width="10"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
      </button>
    </div>
  `).join('');

  list.querySelectorAll<HTMLButtonElement>('.wfl-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      _stagedFiles.splice(idx, 1);
      renderFileList();
      updateBuildBtn();
    });
  });
}

function updateBuildBtn(): void {
  const btn = document.getElementById('wizard-build-btn') as HTMLButtonElement | null;
  if (btn) btn.disabled = _stagedFiles.length === 0;
}

// ── Progress steps ────────────────────────────────────────────────────────────

// STEPS is rebuilt at the start of each runGeneration so the AI step only
// appears (and only gets a ✓) when Ollama is actually enabled.
let STEPS: string[] = [];

// ── Current-file indicator ────────────────────────────────────────────────────

/** Show which file is actively being read or extracted (steps 0–1). */
function setCurrentFile(file: File | null, msg = ''): void {
  const card = document.getElementById('wiz-doc-card');
  if (!card) return;
  if (!file) {
    card.classList.remove('wiz-doc-card--active');
    return;
  }
  card.style.display = 'flex';
  card.classList.add('wiz-doc-card--active');
  const emojiEl = document.getElementById('wiz-doc-emoji');
  const nameEl  = document.getElementById('wiz-doc-name');
  const msgEl   = document.getElementById('wiz-doc-msg');
  if (emojiEl) emojiEl.textContent = fileIcon(file);
  if (nameEl)  nameEl.textContent  = file.name;
  if (msgEl)   msgEl.textContent   = msg;
}

// ── Per-file upload progress ──────────────────────────────────────────────────

/** A single log-line element that gets updated in-place during the upload loop. */
let _uploadStatusEl: HTMLElement | null = null;

function renderFileUploads(imgs: ImageAsset[]): void {
  if (!imgs.length) return;
  const lines = document.getElementById('wiz-log-lines');
  if (!lines) return;
  _uploadStatusEl = document.createElement('div');
  _uploadStatusEl.className = 'wiz-log-line wiz-log-line--hi';
  _uploadStatusEl.textContent = `› Uploading 0 / ${imgs.length} assets…`;
  lines.appendChild(_uploadStatusEl);
  const wrap = lines.parentElement;
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

function setFileUploadStatus(idx: number, status: 'uploading' | 'done' | 'error', filename = '', total = 0): void {
  // Update the overlay on the gallery thumbnail
  const item = document.querySelector<HTMLElement>(`[data-gi-idx="${idx}"]`);
  const ov   = item?.querySelector('.wiz-gi-ov');
  if (ov) {
    ov.className = `wiz-gi-ov wiz-gi-ov--${status}`;
  }
  // Update the shared status line
  if (_uploadStatusEl && total > 0) {
    if (status === 'uploading') {
      _uploadStatusEl.className = 'wiz-log-line wiz-log-line--hi';
      _uploadStatusEl.textContent = `› Uploading ${filename} (${idx + 1} / ${total})…`;
    } else if (status === 'done') {
      _uploadStatusEl.className = 'wiz-log-line wiz-log-line--ok';
      _uploadStatusEl.textContent = `› Uploaded ${idx + 1} / ${total}: ${filename}`;
    } else {
      _uploadStatusEl.className = 'wiz-log-line wiz-log-line--err';
      _uploadStatusEl.textContent = `› Skipped ${filename} (upload failed)`;
    }
    const wrap = _uploadStatusEl.closest('.wiz-log-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }
}

// ── Live-feedback helpers ─────────────────────────────────────────────────────

let _giCount = 0; // gallery item counter, reset per run

function clearProcessingUI(): void {
  const logEl = document.getElementById('wiz-log-lines');
  if (logEl) logEl.innerHTML = '';
  const gallery = document.getElementById('wiz-gallery');
  const items   = document.getElementById('wiz-gallery-items');
  if (gallery) gallery.style.display = 'none';
  if (items)   items.innerHTML = '';
  const card = document.getElementById('wiz-doc-card');
  if (card) { card.style.display = 'none'; card.classList.remove('wiz-doc-card--active'); }
  const sub = document.getElementById('wiz-proc-sub');
  if (sub) sub.textContent = '';
  _uploadStatusEl = null;
  _giCount = 0;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Append a line to the stream log and yield one animation frame so the
 *  browser paints the slide-in animation before the next line is added. */
async function addLogLine(msg: string, cls: 'hi' | 'ok' | 'err' | '' = ''): Promise<void> {
  const lines = document.getElementById('wiz-log-lines');
  if (!lines) return;
  const div = document.createElement('div');
  div.className = `wiz-log-line${cls ? ` wiz-log-line--${cls}` : ''}`;
  div.textContent = `› ${msg}`;
  lines.appendChild(div);
  const wrap = lines.parentElement;
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

function addExtractedImage(base64: string, mediaType: string, name: string): void {
  const gallery = document.getElementById('wiz-gallery');
  const items   = document.getElementById('wiz-gallery-items');
  if (!gallery || !items) return;
  gallery.style.display = '';
  const wrap = document.createElement('div');
  wrap.className = 'wiz-gallery-item';
  wrap.dataset.giIdx = String(_giCount++);
  const img = document.createElement('img');
  img.className = 'wiz-gallery-thumb';
  img.src = `data:${mediaType};base64,${base64}`;
  img.alt = name;
  img.title = name;
  const ov = document.createElement('div');
  ov.className = 'wiz-gi-ov';
  wrap.appendChild(img);
  wrap.appendChild(ov);
  items.appendChild(wrap);
}

// ── Progress steps ────────────────────────────────────────────────────────────

function renderProgressSteps(active: number, error?: string): void {
  const container = document.getElementById('wizard-progress');
  if (!container) return;
  container.innerHTML = STEPS.map((label, i) => {
    let cls = 'wp-step';
    let icon = '○';
    if (i < active)      { cls += ' wp-step--done';  icon = '✓'; }
    else if (i === active) { cls += ' wp-step--active'; icon = error ? '✗' : ''; }
    return `<div class="${cls}" data-idx="${i}">
      <span class="wp-icon">${icon}</span>
      <span class="wp-label">${escapeHtml(label)}${i === active && error ? ` — ${escapeHtml(error)}` : ''}</span>
    </div>`;
  }).join('');
}

// ── Multi-page grouping ──────────────────────────────────────────────────────

/** Minimum content blocks (excluding nav/footer/hero) before we split into pages. */
const MULTI_PAGE_THRESHOLD = 12;

interface PageGroup {
  path: string;
  title: string;
  isHome: boolean;
  blocks: AssembledBlock[];
}

/** Maximum number of pages the flexible grouper will produce (excluding home). */
const MAX_SUBPAGES = 5;

/** Keyword sets for classifying blocks into pages (case-insensitive title match).
 *  Used as a fallback when blocks have no sectionTitle. */
const ABOUT_KEYWORDS = /\b(about|story|history|mission|vision|background|team|people|who we are|our story)\b/i;
const SERVICES_KEYWORDS = /\b(services|products|offerings|solutions|what we do|features|capabilities)\b/i;
const CONTACT_KEYWORDS = /\b(contact|reach|location|get in touch|connect)\b/i;

/**
 * Classify a block into a page category based on its sectionTitle and block type.
 * Used as a fallback when no sectionTitle-driven grouping is available.
 * Returns 'home' | 'about' | 'services' | 'contact'.
 */
function classifyBlockPage(block: AssembledBlock): string {
  const title = (block.sectionTitle ?? '').toLowerCase();

  // Structural blocks are handled separately (nav, footer, hero)
  if (block.type === 'nav' || block.type === 'footer') return '_structural';
  if (block.type === 'hero' || title === '_hero') return 'home';

  // Try keyword matching on sectionTitle
  if (title && ABOUT_KEYWORDS.test(title)) return 'about';
  if (title && SERVICES_KEYWORDS.test(title)) return 'services';
  if (title && CONTACT_KEYWORDS.test(title)) return 'contact';

  // Fall back to block type signals
  if (block.type === 'form') return 'contact';
  if (block.type === 'testimonial' || title === '_testimonial') return 'home';
  if (block.type === 'stats' || title === '_stats') return 'home';
  if (block.type === 'cta' || title === '_cta') return 'home';
  if (block.type === 'gallery' || title === '_gallery') return 'home';

  // Default: uncategorized → home
  return 'home';
}

/**
 * Group assembled blocks into multiple pages when the document is large.
 * If total content blocks (non-structural) are <= MULTI_PAGE_THRESHOLD,
 * returns null to signal single-page behavior.
 *
 * Strategy (in priority order):
 * 1. Flexible section-title driven grouping — each unique sectionTitle
 *    (on non-structural, non-hero blocks) becomes its own page. Consecutive
 *    blocks sharing the same title (or with no title) are grouped together.
 *    Capped at MAX_SUBPAGES sub-pages to avoid explosion.
 * 2. Keyword-based fallback — used when all blocks have empty sectionTitles
 *    (e.g. plain-text documents with no structural headings).
 */
function groupBlocksIntoPages(
  allBlocks: AssembledBlock[],
  pageTitle: string,
): PageGroup[] | null {
  // Count content blocks (everything except nav and footer)
  const contentBlocks = allBlocks.filter(b => b.type !== 'nav' && b.type !== 'footer');
  // Exclude hero from the count since it always goes on home
  const countableBlocks = contentBlocks.filter(b => b.type !== 'hero');

  if (countableBlocks.length <= MULTI_PAGE_THRESHOLD) return null;

  // Extract the nav and footer templates for reuse
  const navBlock = allBlocks.find(b => b.type === 'nav');
  const footerBlock = allBlocks.find(b => b.type === 'footer');

  // ── Strategy 1: Flexible section-title driven grouping ───────────────
  // Candidate blocks: non-structural, non-hero blocks that carry a sectionTitle
  const titledBlocks = countableBlocks.filter(
    b => b.sectionTitle && b.sectionTitle.trim() !== '',
  );
  const uniqueTitles = [...new Set(titledBlocks.map(b => b.sectionTitle!.trim()))];

  if (uniqueTitles.length >= 2) {
    // Determine which blocks belong to "home" — hero + any untitled blocks
    // appearing before the first titled section
    const firstTitledIdx = countableBlocks.findIndex(
      b => b.sectionTitle && b.sectionTitle.trim() !== '',
    );
    const preHomeBocks = firstTitledIdx > 0
      ? countableBlocks.slice(0, firstTitledIdx)
      : [];

    // Hero block always goes on home (it's not in countableBlocks)
    const heroBlock = contentBlocks.find(b => b.type === 'hero');

    // Build subpage groups by grouping consecutive blocks with the same title
    // Cap at MAX_SUBPAGES to avoid explosion
    const subpageTitles = uniqueTitles.slice(0, MAX_SUBPAGES);
    const subpageMap = new Map<string, AssembledBlock[]>();
    for (const title of subpageTitles) subpageMap.set(title, []);
    // Overflow bucket — titled sections beyond the cap fold into the last subpage
    const lastTitle = subpageTitles[subpageTitles.length - 1];

    for (const block of countableBlocks) {
      const t = (block.sectionTitle ?? '').trim();
      if (!t) {
        // Untitled blocks after the first titled section fold into home
        continue;
      }
      if (subpageMap.has(t)) {
        subpageMap.get(t)!.push(block);
      } else {
        // Beyond the cap: fold into the last captured subpage
        subpageMap.get(lastTitle)!.push(block);
      }
    }

    const pages: PageGroup[] = [];

    // Home page
    const homeBlocks: AssembledBlock[] = [];
    if (navBlock) homeBlocks.push(navBlock);
    if (heroBlock) homeBlocks.push(heroBlock);
    homeBlocks.push(...preHomeBocks);
    if (footerBlock) homeBlocks.push(footerBlock);
    pages.push({ path: 'index.html', title: pageTitle, isHome: true, blocks: homeBlocks });

    // Subpages — one per distinct sectionTitle
    for (const [title, sectionBlocks] of subpageMap) {
      if (sectionBlocks.length === 0) continue;
      const subpagePath = titleToPath(title, false);
      const subpageBlocks: AssembledBlock[] = [];
      if (navBlock) subpageBlocks.push({ ...navBlock, prefill: buildSubpageNav(navBlock, pageTitle) });
      subpageBlocks.push(...sectionBlocks);
      if (footerBlock) subpageBlocks.push(footerBlock);
      pages.push({ path: subpagePath, title, isHome: false, blocks: subpageBlocks });
    }

    // Update nav links on every page to reflect all generated pages
    const navLinks: NavLink[] = pages.map(p => ({
      text: p.isHome ? 'Home' : shortNavLabel(p.title),
      href: p.isHome ? '/' : `./${p.path}`,
    }));
    for (const pg of pages) {
      const nav = pg.blocks.find(b => b.type === 'nav');
      if (nav) nav.prefill['content.links'] = navLinks;
    }

    return pages;
  }

  // ── Strategy 2: Keyword-based fallback (no sectionTitles present) ────
  const buckets: Record<string, AssembledBlock[]> = {
    home: [],
    about: [],
    services: [],
    contact: [],
  };

  for (const block of contentBlocks) {
    const category = classifyBlockPage(block);
    if (category === '_structural') continue; // nav/footer handled separately
    if (buckets[category]) {
      buckets[category].push(block);
    } else {
      buckets.home.push(block); // fallback
    }
  }

  // Build page groups — only create a page if it has blocks
  const pages: PageGroup[] = [];

  // Home page always comes first
  const homeBlocks: AssembledBlock[] = [];
  if (navBlock) homeBlocks.push(navBlock);
  homeBlocks.push(...buckets.home);
  if (footerBlock) homeBlocks.push(footerBlock);
  pages.push({
    path: 'index.html',
    title: pageTitle,
    isHome: true,
    blocks: homeBlocks,
  });

  // About page
  if (buckets.about.length > 0) {
    const aboutBlocks: AssembledBlock[] = [];
    if (navBlock) aboutBlocks.push({ ...navBlock, prefill: buildSubpageNav(navBlock, pageTitle) });
    aboutBlocks.push(...buckets.about);
    if (footerBlock) aboutBlocks.push(footerBlock);
    pages.push({
      path: 'about.html',
      title: 'About',
      isHome: false,
      blocks: aboutBlocks,
    });
  }

  // Services page
  if (buckets.services.length > 0) {
    const servicesBlocks: AssembledBlock[] = [];
    if (navBlock) servicesBlocks.push({ ...navBlock, prefill: buildSubpageNav(navBlock, pageTitle) });
    servicesBlocks.push(...buckets.services);
    if (footerBlock) servicesBlocks.push(footerBlock);
    pages.push({
      path: 'services.html',
      title: 'Services',
      isHome: false,
      blocks: servicesBlocks,
    });
  }

  // Contact page — always gets a form block if not already present
  if (buckets.contact.length > 0) {
    const contactBlocks: AssembledBlock[] = [];
    if (navBlock) contactBlocks.push({ ...navBlock, prefill: buildSubpageNav(navBlock, pageTitle) });
    contactBlocks.push(...buckets.contact);
    if (!buckets.contact.some(b => b.type === 'form')) {
      contactBlocks.push({
        type: 'form',
        prefill: { 'content.heading': 'Get in Touch', 'content.subtext': '' },
        sectionTitle: 'Contact',
      });
    }
    if (footerBlock) contactBlocks.push(footerBlock);
    pages.push({
      path: 'contact.html',
      title: 'Contact',
      isHome: false,
      blocks: contactBlocks,
    });
  }

  // Update the nav links to include all generated pages
  const navLinks: NavLink[] = pages.map(p => ({
    text: p.isHome ? 'Home' : shortNavLabel(p.title),
    href: p.isHome ? '/' : `./${p.path}`,
  }));
  for (const pg of pages) {
    const nav = pg.blocks.find(b => b.type === 'nav');
    if (nav) nav.prefill['content.links'] = navLinks;
  }

  return pages;
}

/** Build nav prefill for a sub-page (keeps the same logo, updates links later). */
function buildSubpageNav(navBlock: AssembledBlock, _pageTitle: string): BlockPrefill {
  return { ...navBlock.prefill };
}

// ── Main generation flow ──────────────────────────────────────────────────────

export async function runGeneration(): Promise<void> {
  if (_stagedFiles.length === 0) return;

  showStep('processing');
  await sleep(50); // guarantee the processing screen paints before heavy extraction starts

  const hasGemini = isGeminiReady();
  const hasAI = hasGemini ||
                (state.browserLLMEnabled && isBrowserLLMReady()) ||
                (state.ollamaEnabled && !!state.ollamaEndpoint);
  STEPS = [
    'Reading files',
    'Extracting document content',
    'Analysing structure',
    ...(hasAI ? ['Enhancing with AI'] : []),
    'Uploading assets',
    'Building page',
  ];
  // Step indices shift when the AI step is present
  const S_UPLOAD = hasAI ? 4 : 3;
  const S_BUILD  = hasAI ? 5 : 4;
  const S_DONE   = hasAI ? 6 : 5;

  let activeStep = 0;
  let aiEnhanced = false;
  renderProgressSteps(activeStep);

  const images: ImageAsset[] = [];
  const textSources: string[] = [];
  const tables: ExtractedTable[] = [];
  let pptxSlides: ExtractedSlide[] | null = null;

  // Step 0: Reading files
  try {
    await addLogLine(`Reading ${_stagedFiles.length} file${_stagedFiles.length !== 1 ? 's' : ''}…`);
    for (const file of _stagedFiles) {
      const lower = file.name.toLowerCase();
      if (/\.(jpe?g|png|gif|webp|svg|avif)$/i.test(lower)) {
        setCurrentFile(file, 'reading…');
        const base64 = await readFileAsBase64(file);
        images.push({
          filename:  file.name,
          base64,
          mediaType: file.type || 'image/jpeg',
          sizeBytes: file.size,
        });
        addExtractedImage(base64, file.type || 'image/jpeg', file.name);
      }
    }
    setCurrentFile(null);
    activeStep = 1;
    renderProgressSteps(activeStep);
  } catch (e) {
    setCurrentFile(null);
    renderProgressSteps(0, (e as Error).message);
    showRetryButton(); return;
  }

  // Step 1: Extracting document content
  try {
    await addLogLine('Extracting document content…');
    for (const file of _stagedFiles) {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.pdf')) {
        setCurrentFile(file, 'parsing pages…');
        const result = await pdfExtract(file);
        const pageTexts = result.pages.map(p => p.text).filter(Boolean);
        textSources.push(...pageTexts);
        // Convert rendered page images (data URLs) into the image pool
        result.pages.forEach((p, idx) => {
          if (!p.pageImageDataUrl) return;
          const base64 = p.pageImageDataUrl.split(',')[1] ?? '';
          if (!base64) return;
          images.push({
            filename:  `${file.name.replace(/\.[^.]+$/, '')}-page-${idx + 1}.jpg`,
            base64,
            mediaType: 'image/jpeg',
            sizeBytes: base64.length * 0.75,
          });
          addExtractedImage(base64, 'image/jpeg', `Page ${idx + 1}`);
        });
        await addLogLine(`PDF: ${result.pages.length} page${result.pages.length !== 1 ? 's' : ''} extracted`);
        if (result.truncated) notify(`${file.name}: only first ${result.pages.length} pages processed`, 'info');
      } else if (/\.pptx?$/i.test(lower)) {
        setCurrentFile(file, 'reading slides…');
        const result = await pptxExtract(file);
        // Store structured slide data for direct slide→block mapping
        if (result.extractedSlides && result.extractedSlides.length > 0) {
          pptxSlides = result.extractedSlides;
        }
        // Also push text for backward-compat fallback
        textSources.push(...result.extractedSlides.map(s => {
          const heading  = s.title ? `## ${s.title}` : '';
          const imgLines = s.imageFilenames.map(fn => `[IMAGE:${fn}]`).join('\n');
          return [heading, s.body, imgLines].filter(Boolean).join('\n');
        }));
        // Add extracted slide images to the image pool
        for (const img of result.images) {
          images.push({ ...img, sizeBytes: img.base64.length * 0.75 });
          addExtractedImage(img.base64, img.mediaType, img.filename);
        }
        await addLogLine(`Presentation: ${result.slides.length} slide${result.slides.length !== 1 ? 's' : ''}${result.images.length ? `, ${result.images.length} images` : ''}`);
      } else if (/\.docx?$/i.test(lower)) {
        setCurrentFile(file, 'loading…');
        const result = await docxExtract(file, msg => {
          const el = document.getElementById('wiz-doc-msg');
          if (el) el.textContent = msg;
        });
        if (result.text) textSources.push(result.text);
        for (const img of result.images) {
          images.push({ ...img, sizeBytes: img.base64.length * 0.75 });
          addExtractedImage(img.base64, img.mediaType, img.filename);
        }
        if (result.tables) tables.push(...result.tables);
        await addLogLine(`Document extracted${result.images.length ? ` — ${result.images.length} image${result.images.length !== 1 ? 's' : ''}` : ''}`);
      } else if (/\.(txt|md)$/i.test(lower)) {
        setCurrentFile(file, 'reading…');
        const text = await readFileAsText(file);
        textSources.push(text);
        await addLogLine(`Text file read: ${file.name}`);
      }
    }
    setCurrentFile(null);
    activeStep = 2;
    renderProgressSteps(activeStep);
  } catch (e) {
    setCurrentFile(null);
    renderProgressSteps(1, (e as Error).message);
    showRetryButton(); return;
  }

  // ── Premium HTML path (Gemini only, DOCX/PDF/TXT — not slides) ─────────────
  let premiumHtml: string | null = null;
  let pageTitle = 'New Page';

  // Cache of the first analyzeContent call — reused if premium generation falls through to blocks
  let cachedContentMap: ReturnType<typeof analyzeContent> | null = null;

  if (hasGemini && textSources.length > 0 && !pptxSlides) {
    // Quick title extraction (no AI needed) — cache for potential block-path fallback
    cachedContentMap = analyzeContent(textSources, images, tables.length > 0 ? tables : undefined);
    pageTitle = cachedContentMap.pageTitle;

    activeStep = 3; // "Enhancing with AI" step
    renderProgressSteps(activeStep);
    await addLogLine('Generating premium page with Gemini…', 'hi');

    try {
      const imagePaths = images.map(img => `assets/${img.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
      premiumHtml = await generateFullPageHTML(textSources.join('\n\n'), pageTitle, imagePaths, getGeminiConfig());
      if (premiumHtml) {
        aiEnhanced = true;
        await addLogLine('Premium HTML page generated ✦', 'ok');
      } else {
        await addLogLine('Premium generation unavailable — using standard blocks', 'hi');
      }
    } catch {
      await addLogLine('Premium generation failed — using standard blocks', 'hi');
    }
  }

  // ── Premium HTML path: Browser LLM ───────────────────────────────────────────
  if (!premiumHtml && state.browserLLMEnabled && isBrowserLLMReady()
      && textSources.length > 0 && !pptxSlides) {
    if (!cachedContentMap) {
      cachedContentMap = analyzeContent(textSources, images, tables.length > 0 ? tables : undefined);
      pageTitle = cachedContentMap.pageTitle;
    }
    activeStep = 3;
    renderProgressSteps(activeStep);
    await addLogLine('Generating premium page with browser AI…', 'hi');
    try {
      const imagePaths = images.map(img => `assets/${img.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
      premiumHtml = await generatePremiumPageBrowserLLM(
        cachedContentMap,
        imagePaths,
        (msg) => { addLogLine(msg, 'hi').catch(() => {}); },
      );
      if (premiumHtml) {
        aiEnhanced = true;
        await addLogLine('Premium HTML page generated ✦', 'ok');
      } else {
        await addLogLine('Browser AI generation failed — using standard blocks', 'hi');
      }
    } catch {
      await addLogLine('Browser AI generation failed — using standard blocks', 'hi');
    }
  }

  // Step 2: Analysing structure (skipped when premiumHtml is set)
  let blocks: AssembledBlock[] = [];
  try {
    if (!premiumHtml) await addLogLine('Analysing document structure…');
    if (pptxSlides && pptxSlides.length > 0) {
      // Direct slide-to-block mapping — preserves slide structure
      const result = assembleBlocksFromSlides(pptxSlides, images);
      blocks = result.blocks;
      pageTitle = result.pageTitle;
      await addLogLine(`Slides mapped to ${blocks.length} sections`);
    } else if (!premiumHtml) {
      // Generic text-based analysis path (PDF, DOCX, TXT, etc.)
      // Reuse cached result from the premium-path title extraction if available
      let contentMap = cachedContentMap ?? analyzeContent(textSources, images, tables.length > 0 ? tables : undefined);
      pageTitle = contentMap.pageTitle;
      await addLogLine(`Found ${contentMap.sections.length} section${contentMap.sections.length !== 1 ? 's' : ''} — "${pageTitle}"`);

      if (hasAI) {
        activeStep = 3;
        renderProgressSteps(activeStep);
        const aiLabel = hasGemini ? 'Gemini' : state.browserLLMEnabled ? 'browser AI' : 'Ollama';
        await addLogLine(`Validating headings with ${aiLabel}…`, 'hi');
        try {
          // Priority: Gemini cloud → browser LLM → Ollama
          if (hasGemini) {
            contentMap = await validateHeadingsCloud(contentMap, getGeminiConfig());
          } else if (state.browserLLMEnabled && isBrowserLLMReady()) {
            contentMap = await validateHeadingsInBrowser(contentMap);
          } else if (state.ollamaEnabled && state.ollamaEndpoint) {
            contentMap = await validateHeadings(contentMap, {
              endpoint: state.ollamaEndpoint,
              model:    state.ollamaModel || 'llama3.2:3b',
            });
          }
          aiEnhanced = true;
          await addLogLine('Headings validated', 'ok');
        } catch { /* non-fatal */ }
      }

      await addLogLine('Assembling page blocks…');
      blocks = assembleBlocks(contentMap, visual.theme);

      // Post-assembly cloud AI polish: hero tagline + section subtitles + long heading fixes.
      if (hasGemini) {
        await addLogLine('Polishing content with Gemini…', 'hi');
        try {
          blocks = await polishAssembledBlocks(blocks, pageTitle, getGeminiConfig());
          await addLogLine('Content polished', 'ok');
        } catch { /* non-fatal */ }
      } else if (state.browserLLMEnabled && isBrowserLLMReady()) {
        await addLogLine('Polishing content with browser AI…', 'hi');
        try {
          blocks = await polishAssembledBlocksInBrowser(blocks, pageTitle);
          await addLogLine('Content polished', 'ok');
        } catch { /* non-fatal */ }
      }
      await addLogLine(`${blocks.length} block${blocks.length !== 1 ? 's' : ''} ready`);
    }
    activeStep = S_UPLOAD;
    renderProgressSteps(activeStep);
  } catch (e) {
    renderProgressSteps(2, (e as Error).message);
    showRetryButton(); return;
  }

  // Step 3: Uploading assets to GitHub (or staging locally when not connected)
  const uploadedPaths: string[] = [];
  let stagedCount = 0;
  try {
    if (state.connected) {
      renderFileUploads(images);
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const safeName = dedupeName(img.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `assets/${safeName}`;

        // Make the image available for immediate preview two ways:
        // 1. SW cache — used by the primary /preview/ rendering path
        // 2. Local registry — used by the srcdoc fallback (no-SW environments)
        if (isPreviewSWReady()) cacheFileInSW(path, atob(img.base64));
        registerLocalAsset(path, img.mediaType, img.base64);

        setFileUploadStatus(i, 'uploading', safeName, images.length);
        try {
          await uploadFile(path, img.base64, `Add asset ${safeName}`, state.fileShas[path]);
          setFileUploadStatus(i, 'done', safeName, images.length);
          uploadedPaths.push(path);
          // Update paths if the file was renamed (deduped or sanitised)
          const precomputedPath = `assets/${img.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          if (path !== precomputedPath) {
            // Fix references in premium HTML
            if (premiumHtml) premiumHtml = premiumHtml.split(precomputedPath).join(path);
            // Fix references in standard blocks
            if (blocks.length > 0) {
              const oldRef = precomputedPath;
              blocks = blocks.map(b => {
                const pf = { ...b.prefill };
                for (const [k, v] of Object.entries(pf)) {
                  if (v === oldRef) pf[k] = path;
                }
                return { ...b, prefill: pf };
              });
            }
          }
        } catch {
          setFileUploadStatus(i, 'error', safeName, images.length);
          // non-fatal: page still builds, image just won't be on GitHub yet
        }
      }
    } else {
      // Not connected — stage assets locally for upload on next Publish
      for (const img of images) {
        const safeName = img.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `assets/${safeName}`;
        registerLocalAsset(path, img.mediaType, img.base64);
        if (isPreviewSWReady()) cacheFileInSW(path, atob(img.base64));
        // Deduplicate by path before pushing
        if (!visual.pendingUploads.some(u => u.path === path)) {
          visual.pendingUploads.push({ path, base64: img.base64, mediaType: img.mediaType });
        }
        stagedCount++;
      }
      if (stagedCount) await addLogLine(`${stagedCount} asset${stagedCount !== 1 ? 's' : ''} staged for upload on Publish`);
    }
    activeStep = S_BUILD;
    renderProgressSteps(activeStep);
  } catch (e) {
    renderProgressSteps(S_UPLOAD, (e as Error).message);
    showRetryButton(); return;
  }

  // Step 5: Building page(s)
  await addLogLine('Building page…');
  try {
    const targetSel = document.getElementById('wizard-target-page') as HTMLSelectElement | null;
    const targetId = targetSel?.value ?? '';

    // ── Premium HTML path: create a single page with rawHtml ──────────────
    if (premiumHtml) {
      let page = targetId ? visual.pages.find(p => p.id === targetId) ?? null : null;
      if (page) {
        page.blocks = [];
        delete page.rawHtml;
        page.rawHtml = premiumHtml;
        page.dirty = true;
      } else {
        page = addEmptyPage(pageTitle, titleToPath(pageTitle, false));
        page.rawHtml = premiumHtml;
        page.dirty = true;
      }
      visual.activePage = page;

      // Inject a code tab so the HTML is immediately available in the code editor
      // and the preview SW can serve it without a GitHub round-trip.
      const staleTabIdx = state.openTabs.findIndex(t => t.path === page!.path);
      if (staleTabIdx !== -1) state.openTabs.splice(staleTabIdx, 1);
      state.openTabs.push({ path: page.path, content: premiumHtml, sha: '', dirty: true, language: 'html' });
      if (isPreviewSWReady()) cacheFileInSW(page.path, premiumHtml);
      // Set as the active tab so enterCodeMode opens the right file.
      // Do NOT call activateTab() here — that sets editorEl.style.display='block'
      // which would flash the code editor while we're still in visual mode.
      state.activeTab = page.path;
      renderTabs();

      switchPage(page.id);
      renderCanvas();
      renderSectionList();
      renderPageList();

      activeStep = S_DONE;
      renderProgressSteps(activeStep);
      const doneTitle   = document.getElementById('wizard-done-title');
      const doneSummary = document.getElementById('wizard-done-summary');
      const doneStats   = document.getElementById('wiz-done-stats');
      if (doneTitle)   doneTitle.textContent  = `"${pageTitle}" is ready!`;
      if (doneSummary) doneSummary.textContent = '';
      if (doneStats) {
        const chips = [
          '✦ Premium AI page',
          ...(uploadedPaths.length ? [`${uploadedPaths.length} assets uploaded`] : []),
          ...(stagedCount ? [`${stagedCount} assets staged`] : []),
        ];
        doneStats.innerHTML = chips.map(c => `<span class="wiz-stat-chip">${c}</span>`).join('');
      }
      await addLogLine(`Done — premium HTML page "${pageTitle}"`, 'ok');
      await sleep(500);
      showStep('done');
      return;
    }

    // Try multi-page grouping if no specific target page was selected
    const pageGroups = targetId ? null : groupBlocksIntoPages(blocks, pageTitle);

    if (pageGroups && pageGroups.length > 1) {
      // ── Multi-page generation ──────────────────────────────────────────
      let totalBlocks = 0;
      let firstPage: typeof visual.activePage = null;

      for (const pg of pageGroups) {
        const page = addEmptyPage(pg.title, pg.path);
        if (pg.isHome) page.isHome = true;
        if (!firstPage) firstPage = page;

        // Set activePage so addBlockAfter targets the correct page
        visual.activePage = page;

        // Same stale-tab purge as the single-page path above.
        const staleTabIdx = state.openTabs.findIndex(t => t.path === page.path);
        if (staleTabIdx !== -1) state.openTabs.splice(staleTabIdx, 1);

        let lastId: string | null = null;
        for (const b of pg.blocks) {
          await addBlockAfterAsync(lastId, b.type, b.prefill);
          const lastBlock = page.blocks[page.blocks.length - 1];
          lastId = lastBlock?.id ?? null;
          totalBlocks++;
        }
      }

      // Switch to the home page
      if (firstPage) switchPage(firstPage.id);
      renderCanvas();
      renderSectionList();
      renderPageList();

      activeStep = S_DONE;
      renderProgressSteps(activeStep);

      // Show done step
      const doneTitle   = document.getElementById('wizard-done-title');
      const doneSummary = document.getElementById('wizard-done-summary');
      const doneStats   = document.getElementById('wiz-done-stats');
      if (doneTitle)   doneTitle.textContent   = `${pageGroups.length} pages created!`;
      if (doneSummary) doneSummary.textContent  = '';
      if (doneStats) {
        const chips = [
          `${pageGroups.length} pages`,
          `${totalBlocks} sections`,
          ...(uploadedPaths.length ? [`${uploadedPaths.length} assets uploaded`] : []),
          ...(stagedCount ? [`${stagedCount} assets staged`] : []),
          ...(aiEnhanced ? ['✦ AI enhanced'] : []),
        ];
        doneStats.innerHTML = chips.map(c => `<span class="wiz-stat-chip">${c}</span>`).join('');
      }
      await addLogLine(`Done — ${pageGroups.length} pages, ${totalBlocks} sections`, 'ok');
      await sleep(500);
      showStep('done');
    } else {
      // ── Single-page generation (original behavior) ─────────────────────
      let page = targetId
        ? visual.pages.find(p => p.id === targetId) ?? null
        : null;

      if (page) {
        // Replace existing page's blocks
        page.blocks = [];
        page.dirty = true;
      } else {
        page = addEmptyPage(pageTitle, titleToPath(pageTitle, false));
      }

      // Set activePage before the block loop so addBlockAfter targets
      // the correct page — not whatever was active before the wizard opened.
      visual.activePage = page;

      // Purge any open code tab for this page path. addBlockAfter has a guard
      // that, when page.blocks is empty, checks for an existing raw HTML tab
      // and converts it to blocks first — which would graft the new generated
      // blocks onto the old page content. We're replacing the page wholesale,
      // so the stale tab must be cleared before the first addBlockAfter call.
      const staleTabIdx = state.openTabs.findIndex(t => t.path === page.path);
      if (staleTabIdx !== -1) state.openTabs.splice(staleTabIdx, 1);

      let lastId: string | null = null;
      for (const b of blocks) {
        await addBlockAfterAsync(lastId, b.type, b.prefill);
        const lastBlock = page.blocks[page.blocks.length - 1];
        lastId = lastBlock?.id ?? null;
      }

      switchPage(page.id);
      renderCanvas();
      renderSectionList();
      renderPageList();

      activeStep = S_DONE;
      renderProgressSteps(activeStep);

      // Show done step
      const doneTitle   = document.getElementById('wizard-done-title');
      const doneSummary = document.getElementById('wizard-done-summary');
      const doneStats   = document.getElementById('wiz-done-stats');
      if (doneTitle)   doneTitle.textContent  = `"${pageTitle}" is ready!`;
      if (doneSummary) doneSummary.textContent = '';
      if (doneStats) {
        const chips = [
          `${blocks.length} sections`,
          ...(uploadedPaths.length ? [`${uploadedPaths.length} assets uploaded`] : []),
          ...(stagedCount ? [`${stagedCount} assets staged`] : []),
          ...(aiEnhanced ? ['✦ AI enhanced'] : []),
        ];
        doneStats.innerHTML = chips.map(c => `<span class="wiz-stat-chip">${c}</span>`).join('');
      }
      await addLogLine(`Done — "${pageTitle}", ${blocks.length} sections`, 'ok');
      await sleep(500);
      showStep('done');
    }
  } catch (e) {
    renderProgressSteps(S_BUILD, (e as Error).message);
    showRetryButton(); return;
  }
}

/** Wraps addBlockAfter (which uses dynamic imports internally) in a promise
 *  so we can await it and correctly chain the lastId. */
function addBlockAfterAsync(
  afterId: string | null,
  type: string,
  prefill: Record<string, unknown>,
): Promise<void> {
  return new Promise(resolve => {
    // addBlockAfter calls renderCanvas with a selectBlock callback — we can
    // resolve after a short tick to let the micro-task queue flush.
    addBlockAfter(afterId, type, prefill as Record<string, string>);
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function showRetryButton(): void {
  const retryArea = document.getElementById('wizard-retry');
  if (retryArea) retryArea.style.display = 'flex';
}

// ── File readers ──────────────────────────────────────────────────────────────

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip "data:...;base64," prefix
      resolve(dataUrl.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// ── Init (called once from index.ts or main.ts) ───────────────────────────────

export function initAssetWizard(): void {
  // File input — individual files
  const fileInput = document.getElementById('wizard-file-input') as HTMLInputElement | null;
  fileInput?.addEventListener('change', () => {
    if (fileInput.files) stageFiles(fileInput.files);
    fileInput.value = '';
  });

  // File input — folder
  const folderInput = document.getElementById('wizard-folder-input') as HTMLInputElement | null;
  folderInput?.addEventListener('change', () => {
    if (folderInput.files) stageFiles(folderInput.files);
    folderInput.value = '';
  });

  // Drop zone
  const dropZone = document.getElementById('wizard-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('wizard-drop-zone--over');
    });
    dropZone.addEventListener('dragleave', e => {
      if (!dropZone.contains(e.relatedTarget as Node)) {
        dropZone.classList.remove('wizard-drop-zone--over');
      }
    });
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('wizard-drop-zone--over');
      dropZone.classList.add('wizard-drop-zone--dropped');
      if (e.dataTransfer?.files) stageFiles(e.dataTransfer.files);
      setTimeout(() => dropZone.classList.remove('wizard-drop-zone--dropped'), 600);
    });
  }

  // AI chip — Configure button opens Settings → AI tab
  document.getElementById('wizard-ai-chip-btn')?.addEventListener('click', () => {
    document.getElementById('asset-wizard-modal')?.classList.add('hidden');
    openSettings('ai');
  });

  // Browse buttons
  document.getElementById('wizard-btn-browse-files')?.addEventListener('click', () => fileInput?.click());
  document.getElementById('wizard-btn-browse-folder')?.addEventListener('click', () => folderInput?.click());

  // Build button — disable immediately on click so there's instant feedback
  document.getElementById('wizard-build-btn')?.addEventListener('click', e => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Building…';
    document.getElementById('wizard-retry')!.style.display = 'none';
    void runGeneration();
  });

  // Retry button
  document.getElementById('wizard-retry-btn')?.addEventListener('click', () => {
    document.getElementById('wizard-retry')!.style.display = 'none';
    void runGeneration();
  });

  // Back button (from processing → upload)
  document.getElementById('wizard-back-btn')?.addEventListener('click', () => showStep('upload'));

  // Done → view page
  document.getElementById('wizard-view-btn')?.addEventListener('click', () => closeAssetWizard());

  // Cancel / close
  document.querySelectorAll('[data-wizard-close]').forEach(btn => {
    btn.addEventListener('click', closeAssetWizard);
  });
}
