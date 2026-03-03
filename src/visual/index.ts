import {
  visual, state, toVisualProjectState, applyVisualProjectState, saveLastMode,
  loadLocalDraft, clearLocalDraft,
} from '../state';
import { ghFetch, writeFile, decodeBase64, readFile, encodeRepoPath } from '../github';
import { pageUid, detectLanguage } from '../utils';
import { cacheFileInSW, invalidateSWFile } from '../preview-sw-client';
import { preCacheLinkedAssets, cacheEntireRepoTree } from './asset-cache';
import { parseHtmlToBlocks } from './convert';
import { setDraftIndicator, debounceAutoSave } from '../draft';
import type { Page } from '../types';
import { generatePageHTML } from './export';
import { openGeneratedFile, activateTab, flushSWCacheTimers } from '../code-editor';
import {
  renderCanvas, initCanvasEvents, renderSectionPicker,
  exposeCanvasGlobals, updateVisualSaveBtn, applyThemeToCanvas,
  exposeNavLinkGlobals, selectBlock, setInspectMode, setInteractMode, initCanvasDragDrop,
} from './canvas';
import { initSidebarCssPanel } from './properties';
import { renderProperties } from './properties';
import { initTemplateGallery, initPreviewButton, initMobilePreview, stopMobilePreview, showSetupWizard } from './templates';
import { initAssetWizard } from './asset-wizard';
import {
  renderPageList, createDefaultPage, switchPage,
  openAddPageModal, confirmAddPage,
} from './pages';
import { notify } from '../ui/notifications';

// ── One-time setup guard ──────────────────────────────────────────────
// Globals, event listeners, and section picker are registered exactly once
// per browser session regardless of how many times the user toggles modes.
let visualInitialised = false;

// ── Enter visual mode ─────────────────────────────────────────────────

export async function enterVisualMode(): Promise<void> {
  // ── One-time setup ──
  if (!visualInitialised) {
    // Set the guard BEFORE running init so a thrown error doesn't leave the
    // flag false — that would cause duplicate event listeners on retry.
    visualInitialised = true;
    try {
      exposeCanvasGlobals();
      exposePageAndNavGlobals();
      initCanvasEvents();   // registers the window.message listener once
      initCanvasDragDrop(); // overlay-based drag-and-drop for block canvas
      renderSectionPicker();
      initDeviceButtons();
      initToolModeButtons();
      initCssActivityButton();
      initUndoKeyboard();
      initElementsActivityButton();
      // Render the block picker embedded in the pages panel (targets #elements-panel-body)
      import('./canvas').then(({ renderElementsPanel }) => renderElementsPanel());
      initTemplateGallery();
      initAssetWizard();
      initPreviewButton();
      initMobilePreview();
    } catch (e) {
      notify('Visual editor init error: ' + (e as Error).message, 'warning');
      console.error('[visual] Init failed:', e);
    }
  }

  // ── Show visual UI ──
  document.getElementById('code-area')!.classList.add('hidden');
  document.getElementById('vis-area')!.classList.remove('hidden');
  // Hide activity bar (code-mode concept) — show visual tools in mode-action-bar instead
  (document.getElementById('activity-bar') as HTMLElement).style.display = 'none';
  (document.getElementById('vis-mode-tools') as HTMLElement).style.display = 'flex';
  (document.getElementById('code-mode-tools') as HTMLElement).style.display = 'none';
  // Show persistent sidebar footer (Pages/Files/CSS tabs)
  (document.getElementById('vis-sidebar-footer') as HTMLElement).style.display = 'flex';
  // Show pages panel — the primary visual editor view (no activity bar click needed)
  switchSidebarPanel('pages');

  document.getElementById('mode-code-btn')?.classList.remove('active');
  document.getElementById('mode-vis-btn')?.classList.add('active');
  // Default to Edit mode when entering visual mode
  setInteractMode(false);
  setInspectMode(true);

  document.getElementById('vis-action-group')!.style.display  =
    state.connected ? 'flex' : 'none';
  // Status bar: hide code-specific items in visual mode
  document.querySelectorAll('.status-code-only').forEach(el => el.classList.add('hidden'));

  visual.active = true;
  visual.mode   = 'visual';
  saveLastMode('visual');

  // Flush pending debounced SW cache writes so stale content from
  // in-flight timers doesn't overwrite the fresh content we're about
  // to push below.
  flushSWCacheTimers();

  // Immediately push ALL open code tabs to the SW cache so the visual
  // preview reflects every code edit (CSS, JS, HTML) the user made —
  // not just the HTML file and not the debounced SW update from typing.
  for (const tab of state.openTabs) {
    cacheFileInSW(tab.path, tab.content);
  }

  // ── Load pages ──
  if (state.connected && !visual.pages.length) {
    // First entry after connecting — fetch from repo
    await loadVisualState();
  }
  // If not connected: leave pages empty; canvas shows the "connect first" placeholder

  renderPageList();

  // Try to show the page that corresponds to the file open in Code mode.
  // Falls back to the previously active page, then the first page.
  const targetPage =
    (state.activeTab
      ? visual.pages.find(p => p.path === state.activeTab)
      : null) ??
    visual.activePage ??
    visual.pages[0] ??
    null;

  if (targetPage) {
    switchPage(targetPage.id);
  } else {
    renderCanvas();
  }
  renderProperties();
  applyThemeToCanvas();
}

// ── Enter code mode ───────────────────────────────────────────────────

export function enterCodeMode(): void {
  stopMobilePreview(); // Clear mobile preview interval — it runs continuously and wastes resources in code mode

  // Open the active page in the code editor.
  //
  // Rule: if the page has blocks, ALWAYS regenerate from the current block +
  // theme state — regardless of dirty flags.  Theme changes, text edits, and
  // property tweaks don't always set page.dirty, so relying on that flag
  // caused the code editor to show stale HTML after visual edits.
  // openGeneratedFile() does a content-diff internally and only marks dirty
  // if something actually changed, so unnecessary regenerations are cheap.
  //
  // For raw-HTML pages (no blocks) we preserve whatever the user typed in
  // the code editor.
  if (visual.activePage && state.connected) {
    const page = visual.activePage;

    if (page.blocks.length > 0) {
      // Block-based page → always generate fresh HTML (synchronous, no async delay)
      const html = generatePageHTML(page, visual.theme, visual.siteName, visual.siteDesc);
      openGeneratedFile(page.path, html);
    } else {
      // Raw HTML page — activate existing tab (preserves manual code edits)
      const existingTab = state.openTabs.find(t => t.path === page.path);
      if (existingTab) activateTab(page.path);
    }
  }

  document.getElementById('code-area')!.classList.remove('hidden');
  document.getElementById('vis-area')!.classList.add('hidden');
  // Show activity bar (code-mode) and hide visual tools + sidebar footer
  (document.getElementById('activity-bar') as HTMLElement).style.display = '';
  (document.getElementById('vis-mode-tools') as HTMLElement).style.display = 'none';
  (document.getElementById('vis-sidebar-footer') as HTMLElement).style.display = 'none';
  if (state.connected) {
    (document.getElementById('code-mode-tools') as HTMLElement).style.display = 'flex';
    (document.getElementById('code-action-group') as HTMLElement).style.display = 'flex';
  }
  switchSidebarPanel('explorer');

  document.getElementById('mode-code-btn')?.classList.add('active');
  document.getElementById('mode-vis-btn')?.classList.remove('active');
  document.getElementById('vis-action-group')!.style.display = 'none';
  // Status bar: show code-specific items in code mode
  document.querySelectorAll('.status-code-only').forEach(el => el.classList.remove('hidden'));

  visual.active = false;
  visual.mode   = 'code';
  saveLastMode('code');
}

// ── Load state from .wb/state.json ────────────────────────────────────

/**
 * True when the repo has at least one hand-authored HTML file.
 * Used to decide whether the visual state (blocks) or the raw HTML should
 * take precedence when loading.
 */
function repoHasRealHtml(): boolean {
  return state.tree.some(
    f => f.type === 'blob' && f.path.endsWith('.html') && !f.path.startsWith('.'),
  );
}

/**
 * True when the given pages were built with the visual editor
 * (i.e. at least one page has actual blocks in it).
 * A pages list of zero-block entries is just a mirror of raw HTML files —
 * those should never override the repo's actual content.
 */
function pagesHaveBlocks(pages: Partial<Page>[]): boolean {
  return pages.some(p => (p.blocks?.length ?? 0) > 0);
}

export async function loadVisualState(): Promise<void> {
  // ── 1. Check for a local draft ────────────────────────────────────
  //
  // Only restore a draft when it contains real visual-editor blocks.
  // If all pages are zero-block (= HTML-only mirror created by initFromExistingRepo),
  // ignore the draft and reload fresh from the repo so the user always sees
  // their actual site, not a cached placeholder.
  const draft = loadLocalDraft();
  const draftHasBlocks = draft && pagesHaveBlocks(draft.visualState.pages ?? []);

  if (draft && draftHasBlocks) {
    applyVisualProjectState(draft.visualState);
    if (!visual.pages.length) visual.pages = [createDefaultPage()];

    // Restore dirty code tabs (unsaved code edits from last session).
    const knownPaths = new Set([
      ...state.tree.map(f => f.path),
      ...visual.pages.map(p => p.path),
    ]);
    for (const saved of draft.dirtyTabs) {
      if (!knownPaths.has(saved.path)) continue;
      if (!state.openTabs.find(t => t.path === saved.path)) {
        state.openTabs.push({
          path: saved.path, content: saved.content,
          sha: saved.sha, dirty: true, language: detectLanguage(saved.path),
        });
        cacheFileInSW(saved.path, saved.content);
      }
    }

    notify('Draft restored', 'info');
    setDraftIndicator('unsaved');
    return;
  }

  // ── 2. Try GitHub state (.wb/state.json) ──────────────────────────
  //
  // Only use the GitHub visual state when it contains real blocks.
  // If the repo also has raw HTML files and the saved state has no blocks
  // (e.g. left over from a previous test run with the default template),
  // fall through to initFromExistingRepo() so the user sees their real site.
  const path = '.wb/state.json';
  try {
    const data = await ghFetch<{ content: string; sha: string }>(
      `/repos/${state.owner}/${state.repo}/contents/${encodeRepoPath(path)}?ref=${state.branch}`,
    );
    const json = JSON.parse(decodeBase64(data.content));
    const savedHasBlocks = pagesHaveBlocks(json.pages ?? []);

    if (savedHasBlocks || !repoHasRealHtml()) {
      // Real block-based site, or no HTML to fall back to → use saved state
      applyVisualProjectState(json);
      if (!visual.pages.length) visual.pages = [createDefaultPage()];
      notify('Site loaded', 'success');
      return;
    }

    // The saved state has no blocks but the repo has real HTML files.
    // This happens when the user previously published a default template.
    // Ignore it and show their actual site instead.
  } catch (e) {
    const err = e as Error;
    if (/404|Not Found/i.test(err.message)) {
      await initFromExistingRepo();
    } else {
      notify('Could not load site data: ' + err.message, 'warning');
      visual.pages = [createDefaultPage()];
    }
  }
}

/**
 * No .wb/state.json found. Scan the repo tree for HTML files and create
 * visual pages backed by their actual content, so the user sees their real
 * site instead of a blank template. If the repo has no HTML files at all,
 * fall back to the default starter page.
 */
async function initFromExistingRepo(): Promise<void> {
  const htmlFiles = state.tree
    .filter(f =>
      f.type === 'blob' &&
      f.path.endsWith('.html') &&
      !f.path.startsWith('.') &&
      !f.path.includes('node_modules'),
    )
    .sort((a, b) => {
      // index.html always first, then shallower paths, then alphabetical
      if (a.path === 'index.html') return -1;
      if (b.path === 'index.html') return 1;
      const depthDiff = a.path.split('/').length - b.path.split('/').length;
      return depthDiff !== 0 ? depthDiff : a.path.localeCompare(b.path);
    });

  if (htmlFiles.length === 0) {
    // Truly empty repo — give the user a blank starter page, then offer templates
    visual.pages = [createDefaultPage()];
    visual.dirty = true;
    // Show setup wizard so first-timers can pick a template instead of starting blank
    setTimeout(() => { if (visual.active) showSetupWizard(); }, 800);
    return;
  }

  // Create a visual Page entry for every HTML file in the repo.
  // Pages start with no blocks; the canvas shows the actual HTML via openTabs.
  visual.pages = htmlFiles.slice(0, 30).map(f => {
    const withoutExt = f.path.replace(/\.html$/, '');
    const slug = withoutExt.split('/').pop() ?? '';
    const title = slug === '' || slug === 'index'
      ? 'Home'
      : slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return {
      id:          pageUid(),
      path:        f.path,
      title,
      isHome:      f.path === 'index.html',
      description: '',
      dirty:       false,
      blocks:      [],   // no blocks yet — canvas renders from the HTML file
    };
  });

  // Eagerly fetch the first 5 HTML files AND their linked CSS/JS assets.
  // Pre-populating the SW cache eliminates the race condition where the iframe
  // requests css/style.css before WB_CONFIG has been processed — everything
  // the page needs is already in the SW fileStore before the iframe loads.
  const toPreload = visual.pages.slice(0, 5);
  await Promise.allSettled(
    toPreload.map(async page => {
      if (state.openTabs.find(t => t.path === page.path)) return;
      try {
        const file = await readFile(page.path);
        state.openTabs.push({
          path:     page.path,
          content:  file.content,
          sha:      file.sha,
          dirty:    false,
          language: 'html',
        });
        state.fileShas[page.path] = file.sha;
        cacheFileInSW(page.path, file.content);

        // Pre-cache all linked CSS and JS so the page renders fully styled
        // without waiting for on-demand SW fetches.
        await preCacheLinkedAssets(page.path, file.content);
      } catch { /* skip */ }
    }),
  );

  notify(
    `${htmlFiles.length} HTML file${htmlFiles.length !== 1 ? 's' : ''} found — ` +
    `viewing existing content. Add sections to start visual editing.`,
    'info',
  );

  // Background: cache ALL cacheable repo assets (images, fonts, etc.) so the
  // SW can serve them on-demand without any GitHub API race condition.
  // This runs after the first pages are loaded so it doesn't block rendering.
  cacheEntireRepoTree().catch(err =>
    console.warn('[asset-cache] Background repo tree cache failed:', err),
  );
}

// preCacheLinkedAssets is now in ./asset-cache (imported above) to avoid
// the circular import with visual/pages.ts.
// Re-export it so external callers (e.g. pages.ts) can import from one place.
export { preCacheLinkedAssets };

// ── Convert raw HTML page → visual blocks ─────────────────────────────

/**
 * Parse the current page's HTML into `custom` blocks — one per top-level
 * structural element (nav, header, section, footer, etc.).
 *
 * The page's original <head> content is preserved in `page.preservedHead`
 * so CSS links, favicon, meta tags, etc. survive the conversion and are
 * re-emitted at publish time instead of being replaced by the theme CSS.
 */
export async function convertCurrentPageToBlocks(): Promise<void> {
  const page = visual.activePage;
  if (!page) return;

  if (page.blocks.length > 0) {
    const ok = confirm(
      `"${page.title}" already has ${page.blocks.length} visual block(s). ` +
      `Converting will replace them with sections from the raw HTML. Continue?`,
    );
    if (!ok) return;
  }

  // Get the HTML — from the open code tab or fetch from GitHub
  let html = state.openTabs.find(t => t.path === page.path)?.content ?? '';
  if (!html && state.connected) {
    try {
      const file = await readFile(page.path);
      html = file.content;
      state.openTabs.push({ path: page.path, content: html, sha: file.sha, dirty: false, language: detectLanguage(page.path) });
      state.fileShas[page.path] = file.sha;
    } catch (e) {
      notify('Could not load HTML: ' + (e as Error).message, 'error');
      return;
    }
  }

  if (!html.trim()) { notify('Page HTML is empty', 'warning'); return; }

  const { blocks, preservedHead } = parseHtmlToBlocks(html);

  if (!blocks.length) {
    notify('No sections detected — try editing the HTML first', 'warning');
    return;
  }

  // Apply the conversion
  page.blocks        = blocks;
  page.preservedHead = preservedHead;
  page.dirty         = true;
  visual.dirty       = true;

  import('./canvas').then(({ updateVisualSaveBtn, renderCanvas, syncActivePageCodeTab }) => {
    updateVisualSaveBtn();
    renderCanvas();
    syncActivePageCodeTab();
  });
  import('./pages').then(({ renderSectionList }) => renderSectionList());
  import('./properties').then(({ renderProperties }) => renderProperties());

  notify(`Converted to ${blocks.length} visual sections — click any section to edit`, 'success');
}

// ── Device buttons (registered once) ─────────────────────────────────

/**
 * Switch the unified sidebar to show a named panel and mark the matching
 * activity-bar icon as active.  Works in both Visual and Code mode.
 */
export function switchSidebarPanel(name: 'pages' | 'explorer' | 'search' | 'css'): void {
  const panels = ['pages', 'explorer', 'search', 'css'] as const;
  for (const p of panels) {
    const panelEl  = document.getElementById(`panel-${p}`);
    const actIcon  = document.getElementById(`act-${p}`);
    const isActive = p === name;
    if (panelEl)  panelEl.style.display  = isActive ? 'flex'  : 'none';
    if (actIcon)  actIcon.classList.toggle('active', isActive);
    if (isActive && panelEl) { panelEl.style.flexDirection = 'column'; panelEl.style.flex = '1'; }
  }
  // Sync footer tab active states (visual mode only — no-ops if footer is hidden)
  const tabMap: Partial<Record<string, string>> = {
    pages: 'vis-pages-tab', explorer: 'vis-files-tab', css: 'vis-css-btn',
  };
  ['vis-pages-tab', 'vis-files-tab', 'vis-css-btn'].forEach(id =>
    document.getElementById(id)?.classList.remove('active'),
  );
  const activeTab = tabMap[name];
  if (activeTab) document.getElementById(activeTab)?.classList.add('active');
}

function initToolModeButtons(): void {
  document.getElementById('tool-inspect')?.addEventListener('click', () => {
    setInteractMode(false);
    setInspectMode(true);   // Edit = text editable + element hover outlines
  });
  document.getElementById('tool-edit')?.addEventListener('click', () => {
    setInteractMode(true);  // Preview = live page, normal mouse, no outlines
  });
}

function initElementsActivityButton(): void {
  // Elements panel removed from sidebar — blocks added via "+ Add Section" modal
}

function initCssActivityButton(): void {
  document.getElementById('vis-css-btn')?.addEventListener('click', () => {
    const isActive = document.getElementById('panel-css')?.style.display !== 'none';
    if (isActive) {
      switchSidebarPanel('pages');
    } else {
      switchSidebarPanel('css');
      const container = document.getElementById('css-panel-body');
      if (container) void initSidebarCssPanel(container);
    }
  });
}

function initDeviceButtons(): void {
  (['desktop', 'tablet', 'mobile'] as const).forEach(d => {
    document.getElementById(`dev-${d}`)?.addEventListener('click', () => {
      visual.device = d;
      document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(`dev-${d}`)?.classList.add('active');
      const frame = document.getElementById('vis-device-frame')!;
      frame.className = d !== 'desktop' ? d : '';
    });
  });
}

// ── Undo / Redo keyboard + toolbar buttons (registered once) ──────────

function initUndoKeyboard(): void {
  // Keyboard shortcuts
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!visual.active) return; // only in visual mode
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      import('./canvas').then(({ performUndo }) => performUndo());
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      import('./canvas').then(({ performRedo }) => performRedo());
    }
  });

  // Undo/redo buttons are in the HTML (vis-mode-tools in mode-action-bar) — just wire clicks
  document.getElementById('vis-undo-btn')?.addEventListener('click', () => {
    import('./canvas').then(({ performUndo }) => performUndo());
  });
  document.getElementById('vis-redo-btn')?.addEventListener('click', () => {
    import('./canvas').then(({ performRedo }) => performRedo());
  });
}

// ── Page + nav-link globals (registered once) ─────────────────────────

function exposePageAndNavGlobals(): void {
  const w = window as unknown as Record<string, unknown>;

  w._switchPage          = (id: string) => import('./pages').then(m => m.switchPage(id));
  w._renamePage          = (id: string) => import('./pages').then(m => m.renamePage(id));
  w._deletePage          = (id: string) => import('./pages').then(m => m.deletePage(id));
  w._openAddPageModal       = openAddPageModal;
  w._confirmAddPage         = confirmAddPage;
  w._selectBlockFromList    = (id: string) => selectBlock(id);
  w._convertPageToBlocks    = convertCurrentPageToBlocks;
  w._showTemplateGallery    = () => import('./templates').then(m => m.showTemplateGallery());

  exposeNavLinkGlobals(
    (blockId: string) => import('./pages').then(m => m.handleAddNavLink(blockId)),
    (blockId: string, idx: number) => import('./pages').then(m => m.handleRemoveNavLink(blockId, idx)),
  );
}

// ── Push to GitHub ────────────────────────────────────────────────────

export async function pushVisualChanges(): Promise<void> {
  if (!state.connected) { notify('Connect a repository before publishing', 'warning'); return; }

  const commitMsg =
    (document.getElementById('vis-commit-msg') as HTMLInputElement | null)?.value.trim() ||
    'Update website';

  const btn = document.getElementById('vis-push-btn') as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Publishing…'; }

  let pushed = 0;

  try {
    const stateJson   = JSON.stringify(toVisualProjectState(), null, 2);
    const stateKey    = '.wb/state.json';
    const stateResult = await writeFile(stateKey, stateJson, `${commitMsg} [state]`, state.fileShas[stateKey]);
    state.fileShas[stateKey] = stateResult.sha;
    // Update IDB cache for state.json
    import('../repo-cache').then(({ putCachedFile, cacheKey }) => {
      putCachedFile({
        id: cacheKey(state.owner, state.repo, state.branch, stateKey),
        owner: state.owner, repo: state.repo, branch: state.branch,
        path: stateKey, sha: stateResult.sha, content: stateJson,
        isText: true, cachedAt: Date.now(),
      });
    }).catch(() => {});

    const dirtyPages = visual.pages.filter(p => p.dirty !== false);
    for (const page of dirtyPages) {
      const html   = generatePageHTML(page, visual.theme, visual.siteName, visual.siteDesc);
      const result = await writeFile(page.path, html, commitMsg, state.fileShas[page.path]);
      state.fileShas[page.path] = result.sha;
      page.dirty = false;
      invalidateSWFile(page.path); // SW will re-fetch after the next GitHub Pages rebuild
      pushed++;
      // Update IDB cache for the page HTML
      import('../repo-cache').then(({ putCachedFile, cacheKey }) => {
        putCachedFile({
          id: cacheKey(state.owner, state.repo, state.branch, page.path),
          owner: state.owner, repo: state.repo, branch: state.branch,
          path: page.path, sha: result.sha, content: html,
          isText: true, cachedAt: Date.now(),
        });
      }).catch(() => {});
    }

    visual.dirty = false;
    updateVisualSaveBtn();
    renderPageList();
    // Clear the local draft — published state is now on GitHub (the canonical source).
    // On next load the app fetches from GitHub rather than restoring a stale draft.
    debounceAutoSave.cancel();
    clearLocalDraft();
    setDraftIndicator('published');
    document.getElementById('vis-commit-modal')?.classList.add('hidden');
    notify(`Published ${pushed} page${pushed !== 1 ? 's' : ''} — GitHub Pages is rebuilding`, 'success');
  } catch (e) {
    notify('Publish failed: ' + (e as Error).message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Push to GitHub'; }
  }
}

export function openVisualCommitModal(): void {
  if (!state.connected) {
    notify('Connect a repository before publishing', 'warning');
    return;
  }
  const dirty = visual.pages.filter(p => p.dirty !== false);
  if (!dirty.length && !visual.dirty) {
    notify('No changes to publish', 'info');
    return;
  }
  const list = document.getElementById('vis-changed-list') as HTMLElement | null;
  if (list) {
    list.innerHTML = [
      '<div class="changed-file"><span class="cf-status">M</span><span class="cf-path">.wb/state.json</span></div>',
      ...dirty.map((p: Page) => `<div class="changed-file"><span class="cf-status">M</span><span class="cf-path">${p.path}</span></div>`),
    ].join('');
  }
  const msgInput = document.getElementById('vis-commit-msg') as HTMLInputElement | null;
  if (msgInput) msgInput.value = 'Update website';
  document.getElementById('vis-commit-modal')?.classList.remove('hidden');
}
