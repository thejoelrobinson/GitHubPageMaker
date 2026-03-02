/**
 * Asset-to-page wizard.
 * Orchestrates: file staging → document extraction → content analysis →
 * block assembly → asset upload → page creation.
 * No API keys required — fully algorithmic.
 */

import { state, visual } from '../state';
import { uploadFile } from '../github';
import { notify } from '../ui/notifications';
import { titleToPath } from '../utils';
import { pdfExtract, pptxExtract, docxExtract } from './doc-extract';
import type { ImageAsset } from './content-extract';
import { registerLocalAsset } from './local-asset-registry';
import { cacheFileInSW, isPreviewSWReady } from '../preview-sw-client';
import { analyzeContent, assembleBlocks } from './content-extract';
import { addEmptyPage, switchPage } from './pages';
import { addBlockAfter, renderCanvas } from './canvas';
import { renderSectionList, renderPageList } from './pages';

// ── State ─────────────────────────────────────────────────────────────────────

let _stagedFiles: File[] = [];

// ── Public API ────────────────────────────────────────────────────────────────

export function openAssetWizard(): void {
  _stagedFiles = [];
  showStep('upload');
  renderFileList();
  populateTargetPageSelect();
  document.getElementById('asset-wizard-modal')?.classList.remove('hidden');
}

function populateTargetPageSelect(): void {
  const sel = document.getElementById('wizard-target-page') as HTMLSelectElement | null;
  if (!sel) return;
  sel.innerHTML = '<option value="">— Create new page —</option>' +
    visual.pages.map(p =>
      `<option value="${escHtml(p.id)}">${escHtml(p.title)}${p.isHome ? ' (Home)' : ''}</option>`,
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
      <span class="wfl-name">${escHtml(f.name)}</span>
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

const STEPS = [
  'Reading files',
  'Extracting document content',
  'Analysing structure',
  'Uploading assets',
  'Building page',
];

// ── Current-file indicator ────────────────────────────────────────────────────

/** Show which file is actively being read or extracted (steps 0–1). */
function setCurrentFile(file: File | null, msg = ''): void {
  const el = document.getElementById('wizard-current-file');
  if (!el) return;
  if (!file) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'flex';
  el.innerHTML = `<span class="wcf-icon">${fileIcon(file)}</span>
    <span class="wcf-name">${escHtml(file.name)}</span>
    ${msg ? `<span class="wcf-msg">${escHtml(msg)}</span>` : ''}
    <span class="wfu-badge wfu-badge--uploading"><span class="wfu-spinner"></span></span>`;
}

// ── Per-file upload progress ──────────────────────────────────────────────────

function renderFileUploads(imgs: ImageAsset[]): void {
  const el = document.getElementById('wizard-file-uploads');
  if (!el) return;
  if (!imgs.length) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="wfu-list">${
    imgs.map((img, i) =>
      `<div class="wfu-item" id="wfu-item-${i}">
        <span class="wfu-name">${escHtml(img.filename)}</span>
        <span class="wfu-badge wfu-badge--pending">—</span>
      </div>`,
    ).join('')
  }</div>`;
}

function setFileUploadStatus(idx: number, status: 'uploading' | 'done' | 'error'): void {
  const item = document.getElementById(`wfu-item-${idx}`);
  if (!item) return;
  const badge = item.querySelector('.wfu-badge') as HTMLElement | null;
  if (!badge) return;

  item.classList.toggle('wfu-item--active', status === 'uploading');
  const name = item.querySelector('.wfu-name');
  name?.classList.toggle('wfu-name--active', status === 'uploading');

  if (status === 'uploading') {
    badge.className = 'wfu-badge wfu-badge--uploading';
    badge.innerHTML = '<span class="wfu-spinner"></span>uploading';
  } else if (status === 'done') {
    badge.className = 'wfu-badge wfu-badge--done';
    badge.textContent = '✓ done';
  } else {
    badge.className = 'wfu-badge wfu-badge--error';
    badge.textContent = '⚠ skipped';
  }
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
      <span class="wp-label">${escHtml(label)}${i === active && error ? ` — ${escHtml(error)}` : ''}</span>
    </div>`;
  }).join('');
}

// ── Main generation flow ──────────────────────────────────────────────────────

export async function runGeneration(): Promise<void> {
  if (_stagedFiles.length === 0) return;

  showStep('processing');
  let activeStep = 0;
  renderProgressSteps(activeStep);

  const images: ImageAsset[] = [];
  const textSources: string[] = [];

  // Step 0: Reading files
  try {
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
        });
        if (result.truncated) notify(`${file.name}: only first ${result.pages.length} pages processed`, 'info');
      } else if (/\.pptx?$/i.test(lower)) {
        setCurrentFile(file, 'reading slides…');
        const result = await pptxExtract(file);
        // Prefix each slide title with ## so detectSections creates a section
        // per slide rather than merging everything into one unstructured blob.
        textSources.push(...result.slides.map(s => {
          const heading = s.title ? `## ${s.title}` : '';
          return [heading, s.body].filter(Boolean).join('\n');
        }));
        // Add extracted slide images to the image pool
        for (const img of result.images) {
          images.push({ ...img, sizeBytes: img.base64.length * 0.75 });
        }
      } else if (/\.docx?$/i.test(lower)) {
        setCurrentFile(file, 'extracting text…');
        const result = await docxExtract(file);
        if (result.text) textSources.push(result.text);
        for (const img of result.images) {
          images.push({ ...img, sizeBytes: img.base64.length * 0.75 });
        }
      } else if (/\.(txt|md)$/i.test(lower)) {
        setCurrentFile(file, 'reading…');
        const text = await readFileAsText(file);
        textSources.push(text);
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

  // Step 2: Analysing structure
  let blocks;
  let pageTitle = 'New Page';
  try {
    const contentMap = analyzeContent(textSources, images);
    pageTitle = contentMap.pageTitle;
    blocks = assembleBlocks(contentMap);
    activeStep = 3;
    renderProgressSteps(activeStep);
  } catch (e) {
    renderProgressSteps(2, (e as Error).message);
    showRetryButton(); return;
  }

  // Step 3: Uploading assets to GitHub
  const uploadedPaths: string[] = [];
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

        setFileUploadStatus(i, 'uploading');
        try {
          await uploadFile(path, img.base64, `Add asset ${safeName}`, state.fileShas[path]);
          setFileUploadStatus(i, 'done');
          uploadedPaths.push(path);
          // Update the block prefill paths if we renamed the file
          if (safeName !== img.filename) {
            const oldRef  = `assets/${img.filename}`;
            const newRef  = path;
            blocks = blocks.map(b => {
              const pf = { ...b.prefill };
              for (const [k, v] of Object.entries(pf)) {
                if (v === oldRef) pf[k] = newRef;
              }
              return { ...b, prefill: pf };
            });
          }
        } catch {
          setFileUploadStatus(i, 'error');
          // non-fatal: page still builds, image just won't be on GitHub yet
        }
      }
    }
    activeStep = 4;
    renderProgressSteps(activeStep);
  } catch (e) {
    renderProgressSteps(3, (e as Error).message);
    showRetryButton(); return;
  }

  // Step 4: Building page
  try {
    const targetSel = document.getElementById('wizard-target-page') as HTMLSelectElement | null;
    const targetId = targetSel?.value ?? '';

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

    // *** Fix: set activePage before the block loop so addBlockAfter targets
    //     the correct page — not whatever was active before the wizard opened.
    visual.activePage = page;

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

    activeStep = 5;
    renderProgressSteps(activeStep);

    // Show done step
    const doneTitle = document.getElementById('wizard-done-title');
    const doneSummary = document.getElementById('wizard-done-summary');
    if (doneTitle)   doneTitle.textContent = `"${pageTitle}" is ready!`;
    if (doneSummary) doneSummary.textContent =
      `${blocks.length} sections created${uploadedPaths.length ? `, ${uploadedPaths.length} assets uploaded` : ''}.`;

    showStep('done');
  } catch (e) {
    renderProgressSteps(4, (e as Error).message);
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

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      if (e.dataTransfer?.files) stageFiles(e.dataTransfer.files);
    });
  }

  // Browse buttons
  document.getElementById('wizard-btn-browse-files')?.addEventListener('click', () => fileInput?.click());
  document.getElementById('wizard-btn-browse-folder')?.addEventListener('click', () => folderInput?.click());

  // Build button
  document.getElementById('wizard-build-btn')?.addEventListener('click', () => {
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
