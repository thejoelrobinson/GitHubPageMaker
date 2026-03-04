import type { Block, Page } from '../types';
import { visual, state } from '../state';
import { pushUndo, undo, redo, canUndo, canRedo, getUndoLabel, getRedoLabel, clearHistory } from './undo';
import { notify } from '../ui/notifications';

// ── Design-mode inspector types + state ───────────────────────────────
export interface DomSection {
  index: number; tag: string; id: string; classes: string; label: string; selector: string;
}
export interface BreadcrumbItem { tag: string; label: string; selector: string; }
export interface SelectedElement {
  selector: string; tagName: string; id: string; classes: string;
  inlineStyle: string; styles: Record<string, string>; sectionIndex: number;
  breadcrumb: BreadcrumbItem[];
}
let dmSections: DomSection[] = [];
let dmSelected: SelectedElement | null = null;
export const getDmSections = (): DomSection[] => dmSections;
export const getDmSelected = (): SelectedElement | null => dmSelected;

let inspectModeActive = false;
let interactModeActive = false;
/** Last [data-field] element clicked in the iframe — used to re-focus before sending commands. */
let _richFocusedField: HTMLElement | null = null;
/** Saved selection Range from the iframe — restored before sending commands so execCommand has a selection. */
let _richSelectionRange: Range | null = null;
export const getInspectMode  = (): boolean => inspectModeActive;
export const getInteractMode = (): boolean => interactModeActive;

export function setInspectMode(active: boolean): void {
  inspectModeActive = active;
  // Always send — the iframe script guards against inspect overlays in interact mode internally
  getIframe()?.contentWindow?.postMessage({ type: 'wb:setInspectMode', active }, '*');
}

export function setInteractMode(active: boolean): void {
  interactModeActive = active;
  getIframe()?.contentWindow?.postMessage({ type: 'wb:setInteractMode', active }, '*');
  getIframe()?.contentDocument?.body?.classList.toggle('wb-interact', active);
  // Preview button shows active when in preview mode
  document.getElementById('tool-edit')?.classList.toggle('active', active);
  if (!active) {
    getIframe()?.contentWindow?.postMessage({ type: 'wb:setInspectMode', active: inspectModeActive }, '*');
  }
  // Hide rich toolbar when entering preview/interact mode
  if (active) {
    document.getElementById('wb-rich-toolbar')?.classList.remove('wb-rt-show');
    _richFocusedField = null;
    _richSelectionRange = null;
  }
}
import { renderBlock, BLOCK_DEFS } from './blocks';
import { generateEditingPageHTML, generatePageHTML, injectEditingLayer, WB_STYLE_ID, WB_SCRIPT_ID, WB_BASE_ID } from './export';

/**
 * Remove editing-layer artifacts from HTML before storing in the code tab.
 * These elements are injected by the builder and must never appear in the
 * user's code editor or in published output.
 */
function stripEditingArtifacts(html: string): string {
  const IDS = [WB_STYLE_ID, WB_SCRIPT_ID, 'wb-toolbar', WB_BASE_ID, 'wb-elem-toolbar', 'wb-ctx-menu', 'wb-css-live'];
  let result = html;
  for (const id of IDS) {
    // Remove the element and all its content by matching the opening tag's id
    result = result
      .replace(new RegExp(`<style[^>]+id="${id}"[^>]*>[\\s\\S]*?</style>`, 'gi'), '')
      .replace(new RegExp(`<script[^>]+id="${id}"[^>]*>[\\s\\S]*?</script>`, 'gi'), '')
      .replace(new RegExp(`<div[^>]+id="${id}"[^>]*>[\\s\\S]*?</div>`, 'gi'), '')
      .replace(new RegExp(`<base[^>]+id="${id}"[^>]*>`, 'gi'), '');
  }
  return result;
}
import { coordinator } from './visual-coordinator';
import { isPreviewSWReady, cacheFileInSW } from '../preview-sw-client';
import { debounceAutoSave } from '../draft';

// ── Iframe helper ──────────────────────────────────────────────────────
function getIframe(): HTMLIFrameElement | null {
  return document.getElementById('vis-iframe') as HTMLIFrameElement | null;
}

// ── CSS undo restore handler ────────────────────────────────────────
export function setCssContentFromUndo(_content: string): void { _onCssRestore?.(_content); }
let _onCssRestore: ((content: string) => void) | null = null;
export function registerCssRestoreHandler(fn: (content: string) => void): void { _onCssRestore = fn; }

// ── Page rendering ─────────────────────────────────────────────────────
//
// Strategy (in priority order):
//
//  A) Service Worker available (the default when running via npm run dev
//     or any HTTPS deployment): set iframe.src = /preview/{path}
//     The SW serves each asset with the correct Content-Type, exactly
//     like a local development server.  CSS, JS, images, fonts all
//     load natively — no inlining required.
//
//  B) SW not available (file:// or unsupported browser): fall back to
//     srcdoc with the editing layer injected.  CSS may not load (known
//     limitation), but text editing still works.

let _lastRenderedPageId: string | null = null;
let _htmlUndoTimer: ReturnType<typeof setTimeout> | null = null;

export function renderCanvas(afterLoad?: () => void): void {
  const iframe = getIframe();
  if (!iframe) return;

  dmSections = [];
  dmSelected = null;
  // Clear stale toolbar state — the iframe will reload with new DOM
  document.getElementById('wb-rich-toolbar')?.classList.remove('wb-rt-show');
  _richFocusedField = null;
  _richSelectionRange = null;

  const page = visual.activePage;

  // Clear undo history when the active page changes
  if (page?.id !== _lastRenderedPageId) {
    // Cancel any pending HTML undo snapshot from the previous page
    if (_htmlUndoTimer) { clearTimeout(_htmlUndoTimer); _htmlUndoTimer = null; }
    clearHistory();
    _lastRenderedPageId = page?.id ?? null;
  }
  updateUndoBtnStates();

  if (!page) {
    iframe.onload = null;
    iframe.removeAttribute('src');
    iframe.srcdoc = !state.connected ? buildNotConnectedPlaceholder() : buildNoPagePlaceholder();
    return;
  }

  if (page.blocks.length === 0) {
    renderRawPage(iframe, page.path, afterLoad);
  } else {
    // Block pages: exit Preview (interact) mode on re-render, but keep Edit state
    if (interactModeActive) setInteractMode(false);
    renderBlockPage(iframe, page, afterLoad);
  }
}

// ── Raw HTML page (existing site) ─────────────────────────────────────

function renderRawPage(iframe: HTMLIFrameElement, pagePath: string, afterLoad?: () => void): void {
  // Push ALL open code tabs to the SW immediately — not debounced.
  // This ensures the visual preview reflects every code edit the user made,
  // including CSS/JS files that aren't the main HTML tab.
  // Example: user edits style.css in Code mode, switches to Visual →
  //   without this, the debounced cache update may not have fired yet,
  //   so SW would serve the old CSS from GitHub instead of their edits.
  for (const tab of state.openTabs) {
    cacheFileInSW(tab.path, tab.content);
  }

  // The primary tab for this page (used for banner logic and fallback)
  const codeTab = state.openTabs.find(t => t.path === pagePath);

  // For rawHtml pages (AI-generated, not yet on GitHub): cacheFileInSW is a
  // postMessage and is processed asynchronously. Setting iframe.src immediately
  // after would race the SW fetch — the SW would find the file missing and return
  // the "Loading repository assets…" placeholder forever.
  // Fix: bypass the SW entirely and render via srcdoc; keep the cache warm for
  // when the user switches to Code mode.
  const rawHtml = visual.activePage?.path === pagePath ? (visual.activePage.rawHtml ?? '') : '';
  if (rawHtml && !codeTab) {
    cacheFileInSW(pagePath, rawHtml);
    renderRawPageFallback(iframe, pagePath, rawHtml);
    return;
  }

  if (isPreviewSWReady() && state.connected) {
    // SERVICE WORKER PATH — the SW serves every asset with correct MIME types.
    // Requires a GitHub connection: the SW fetches on-demand from the GitHub API.
    // When not connected there are no credentials so the SW would return the
    // "Loading repository assets…" placeholder — use srcdoc fallback instead.
    showCodeEditBanner(!!codeTab); // show banner when code edits are active
    const previewUrl = `/preview/${pagePath}?_wb=${Date.now()}`;
    iframe.removeAttribute('srcdoc');
    iframe.onload = () => {
      injectEditingLayerIntoSW(iframe);
      afterLoad?.();
    };
    iframe.src = previewUrl;
  } else {
    // FALLBACK — SW not available; render via srcdoc using code-tab content.
    renderRawPageFallback(iframe, pagePath, codeTab?.content ?? '');
  }
}

function injectEditingLayerIntoSW(iframe: HTMLIFrameElement): void {
  // The SW serves the raw HTML; inject the editing layer into the live
  // contentDocument (same-origin: both main page and iframe are on localhost).
  // IMPORTANT: imports are sequential — CSS → toolbar → script — so that
  // the script can find the toolbar in the DOM when it initialises.
  const iDoc = iframe.contentDocument;
  if (!iDoc) return;

  // Always re-apply mode state after the iframe loads — the initial postMessages
  // sent in enterVisualMode() fire before the iframe is loaded, so they are lost.
  // Use a short timeout so the iframe script's message listener is registered first.
  const reapplyInspect  = inspectModeActive;
  const reapplyInteract = interactModeActive;
  setTimeout(() => {
    if (iframe.contentDocument !== iDoc) return;
    if (reapplyInteract) {
      iframe.contentWindow?.postMessage({ type: 'wb:setInteractMode', active: true }, '*');
    } else if (reapplyInspect) {
      iframe.contentWindow?.postMessage({ type: 'wb:setInspectMode', active: true }, '*');
    }
  }, 50);

  if (iDoc.getElementById(WB_SCRIPT_ID)) return; // already injected — CSS/toolbar/script already present

  import('./export').then(({ EDITING_CSS, EDITING_TOOLBAR_HTML, EDITING_SCRIPT, WB_STYLE_ID: styleId, WB_SCRIPT_ID: scriptId }) => {
    // Bail out if the iframe navigated away while we were importing
    if (iframe.contentDocument !== iDoc) return;

    // 1. Editing CSS
    if (!iDoc.getElementById(styleId)) {
      const style = iDoc.createElement('style');
      style.id = styleId;
      style.textContent = EDITING_CSS;
      iDoc.head.appendChild(style);
    }

    // 2. Toolbar HTML — must be in DOM before the script runs.
    // Insert ALL sibling elements from EDITING_TOOLBAR_HTML (wb-toolbar + wb-rich-toolbar).
    if (!iDoc.getElementById('wb-toolbar')) {
      const tmp = iDoc.createElement('div');
      tmp.innerHTML = EDITING_TOOLBAR_HTML;
      const frag = iDoc.createDocumentFragment();
      while (tmp.firstChild) frag.appendChild(tmp.firstChild);
      iDoc.body.insertBefore(frag, iDoc.body.firstChild);
    }

    // 3. Editing script — runs last so toolbar is guaranteed to be present
    const rawJs = EDITING_SCRIPT
      .replace(/^\s*<script[^>]*>/i, '')
      .replace(/<\/script>\s*$/i, '');
    const script = iDoc.createElement('script');
    script.id = scriptId;
    script.textContent = rawJs;
    iDoc.body.appendChild(script);

    // Mode state is re-applied by the setTimeout above (outside the early-return
    // guard) so it runs whether the script was pre-embedded or just injected.
  });
}

function renderRawPageFallback(
  iframe: HTMLIFrameElement,
  pagePath: string,
  rawHtml: string,
): void {
  if (!rawHtml) {
    // Only fetch from GitHub if the file actually exists in the repo tree.
    // Brand-new pages (not yet pushed) would 404 or trigger the SW's
    // "Loading repository assets…" loop — show an empty-canvas placeholder instead.
    const existsInRepo = state.connected && state.tree.some(f => f.path === pagePath);
    if (!existsInRepo) {
      iframe.removeAttribute('src');
      iframe.srcdoc = `<!DOCTYPE html><html><body style="background:#141416;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#606070;flex-direction:column;gap:12px;text-align:center;padding:40px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg><span style="font-size:13px">Empty page — add a section to get started</span></body></html>`;
      iframe.onload = null;
      return;
    }
    iframe.removeAttribute('src');
    iframe.srcdoc = LOADING_HTML;
    iframe.onload = null;
    // Trigger async load
    import('../github')
      .then(({ readFile }) => readFile(pagePath))
      .then(file => {
        state.openTabs.push({
          path: pagePath, content: file.content,
          sha: file.sha, dirty: false, language: 'html',
        });
        state.fileShas[pagePath] = file.sha;
        if (visual.activePage?.path === pagePath) renderCanvas();
      })
      .catch(() => {
        iframe.srcdoc = `<!DOCTYPE html><html><body style="background:#f8fafc;font-family:system-ui;padding:40px;color:#64748b">Could not load ${pagePath}</body></html>`;
      });
    return;
  }
  iframe.removeAttribute('src');
  iframe.srcdoc = injectEditingLayer(rawHtml, pagePath);
  iframe.onload = () => {
    if (inspectModeActive) {
      iframe.contentWindow?.postMessage({ type: 'wb:setInspectMode', active: true }, '*');
    }
    if (visual.selectedBlockId) {
      iframe.contentWindow?.postMessage({ type: 'wb:select', id: visual.selectedBlockId }, '*');
    }
  };
}

// ── Block-based page ───────────────────────────────────────────────────

function renderBlockPage(iframe: HTMLIFrameElement, page: Page, afterLoad?: () => void): void {
  // If a code tab exists for this page (user visited Code mode), check whether
  // it contains manual edits that differ from what the blocks would generate.
  // • No manual edits  → syncCodeTab kept it identical → use block render (full controls)
  // • Manual edits exist → show code-tab content so the user can see their changes;
  //   design-mode editing is still available via the injected editing script.
  const codeTab = state.openTabs.find(t => t.path === page.path);

  if (codeTab) {
    // Compare the code tab against what the blocks would generate (export HTML,
    // no editing wrappers).  If they differ the user made manual code edits.
    const cleanBlockHtml = generatePageHTML(page, visual.theme, visual.siteName, visual.siteDesc);
    if (codeTab.content !== cleanBlockHtml) {
      // Show the user's code edits in design-mode with a revert banner.
      showCodeEditBanner(true);
      iframe.onload = () => { afterLoad?.(); };
      iframe.removeAttribute('src');
      iframe.srcdoc = injectEditingLayer(codeTab.content, page.path);
      return;
    }
  }

  // No manual code edits — render with block controls.
  showCodeEditBanner(false);

  const editingHtml = generateEditingPageHTML(page, visual.theme, visual.siteName, visual.siteDesc);

  const onLoad = (): void => {
    // Run afterLoad first so it can update selectedBlockId (e.g. selectBlock(newId))
    // before we send wb:select to the iframe.
    afterLoad?.();
    if (visual.selectedBlockId) {
      iframe.contentWindow?.postMessage({ type: 'wb:select', id: visual.selectedBlockId }, '*');
    }
    // Re-apply mode state — the initial setInspectMode/setInteractMode calls in
    // enterVisualMode() fire before the iframe is loaded, so their postMessages
    // are lost.  Re-send here so the iframe's inspectMode/interactMode variables
    // and wb-inspect/wb-interact body classes are consistent with parent state.
    if (interactModeActive) {
      iframe.contentWindow?.postMessage({ type: 'wb:setInteractMode', active: true }, '*');
    } else if (inspectModeActive) {
      iframe.contentWindow?.postMessage({ type: 'wb:setInspectMode', active: true }, '*');
    }
    // Safety-net: activate [data-field] elements directly from the parent (same-origin
    // DOM access). This guarantees contentEditable is set even if the embedded
    // activateFields() in the iframe script has a timing or compatibility issue.
    const iDoc = iframe.contentDocument;
    if (!interactModeActive && iDoc) {
      // Safety-net: ensure contentEditable is set (the iframe's activateFields may fire
      // first, but this guarantees the state is correct even on timing edge-cases).
      // Rendered HTML (bold/italic) is intentionally kept as-is so users see formatted text.
      iDoc.querySelectorAll<HTMLElement>('[data-field]').forEach(f => {
        if (f.contentEditable !== 'true') {
          f.contentEditable = 'true';
          if (!f.hasAttribute('tabindex')) f.setAttribute('tabindex', '0');
        }
      });

      // Direct parent-side click handler for block selection.
      iDoc.addEventListener('mousedown', (e: MouseEvent) => {
        if (interactModeActive) return;
        const target = e.target as Element | null;
        if (target?.closest('.wb-controls, .wb-add')) return;
        const block = target?.closest('[data-block-id]');
        if (block) selectBlock(block.getAttribute('data-block-id')!);
      });

      // ── Rich toolbar: triggered directly from the parent via same-origin DOM ──
      // This bypasses the entire postMessage chain so it works regardless of
      // whether the embedded editing script is running or cached correctly.
      iDoc.addEventListener('click', (e: MouseEvent) => {
        if (interactModeActive) return;
        const field = (e.target as Element).closest('[data-field]') as HTMLElement | null;
        if (!field) return;
        _richFocusedField = field;
        const ifr = getIframe();
        if (!ifr) return;
        // Defer: let the iframe's own click handler finish caret placement first,
        // then read the real selection state and position the toolbar.
        setTimeout(() => {
          if (interactModeActive) return;
          const ifrRect = ifr.getBoundingClientRect();
          const fRect   = field.getBoundingClientRect();
          const ifrWin  = iDoc.defaultView as Window;
          const sel     = ifrWin.getSelection();
          // Save the current range (even if collapsed — restores cursor position)
          _richSelectionRange = sel && sel.rangeCount > 0
            ? sel.getRangeAt(0).cloneRange()
            : null;
          positionRichToolbar(
            ifrRect.left + fRect.left,
            ifrRect.top  + fRect.top,
            fRect.width,
            0,
          );
          refreshRichToolbarState();
        }, 0);
      });

      iDoc.addEventListener('selectionchange', () => {
        if (interactModeActive) return;
        const ifrWin = iDoc.defaultView as Window;
        const sel    = ifrWin.getSelection();
        if (!sel) return;
        // Always update saved range (cursor or selection)
        _richSelectionRange = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
        if (sel.isCollapsed || !sel.rangeCount) return;
        const anchor = sel.anchorNode;
        const node   = anchor?.nodeType === 1 ? anchor as Element : (anchor?.parentNode as Element | null);
        if (!node?.closest?.('[data-field]')) return;
        const ifr = getIframe();
        if (!ifr) return;
        const ifrRect = ifr.getBoundingClientRect();
        const rng     = sel.getRangeAt(0).getBoundingClientRect();
        if (rng.width || rng.height) {
          positionRichToolbar(
            ifrRect.left + rng.left,
            ifrRect.top  + rng.top,
            rng.width,
            rng.height,
          );
          refreshRichToolbarState();
        }
      });
    }
  };

  if (isPreviewSWReady()) {
    // SERVICE WORKER PATH — same as raw HTML pages.
    // Push the generated HTML into the SW cache so the iframe loads it at a
    // real URL (/preview/{path}). Relative asset refs (assets/photo.jpg) then
    // resolve to /preview/assets/photo.jpg, which the SW intercepts and serves
    // from its cache or fetches on-demand from GitHub. This is the only path
    // that gives a true WYSIWYG preview — what the SW serves IS what's published.
    cacheFileInSW(page.path, editingHtml);
    iframe.onload = onLoad;
    iframe.removeAttribute('srcdoc');
    iframe.src = `/preview/${page.path}?_wb=${Date.now()}`;
  } else {
    // FALLBACK — SW not available (file:// or unsupported browser).
    // srcdoc iframes have a null origin so relative URLs don't resolve.
    // Swap the relative <base> for the GitHub raw URL so images still load.
    import('./local-asset-registry').then(({ substituteLocalAssets }) => {
      const depth = page.path.split('/').length - 1;
      const relBase = depth > 0 ? '../'.repeat(depth) : './';
      const pageDir = page.path.includes('/')
        ? page.path.split('/').slice(0, -1).join('/') + '/'
        : '';
      const rawBase = state.owner && state.repo && state.branch
        ? `https://raw.githubusercontent.com/${state.owner}/${state.repo}/${state.branch}/${pageDir}`
        : relBase;
      const srcdocHtml = substituteLocalAssets(
        editingHtml.replace(`<base href="${relBase}">`, `<base href="${rawBase}">`),
      );
      iframe.onload = onLoad;
      iframe.removeAttribute('src');
      iframe.srcdoc = srcdocHtml;
    });
  }
}

// ── Code-edit banner ───────────────────────────────────────────────────
// Shows when Visual is rendering a code-edited version of the page so the
// user knows they can revert to the block-generated / GitHub version.

function showCodeEditBanner(show: boolean): void {
  const banner = document.getElementById('vis-code-edit-banner');
  if (banner) banner.style.display = show ? 'flex' : 'none';
}

/**
 * Sync the code tab for the active page from the current block + theme state.
 * Called explicitly from onThemeChange so theme updates propagate to the
 * code tab (syncCodeTab is only called implicitly via block mutations).
 */
export function syncActivePageCodeTab(): void {
  if (visual.activePage) syncCodeTab(visual.activePage.path);
}

/** Drop the code tab and reload the canvas from the block model (or GitHub). */
export function revertToBlocks(): void {
  const page = visual.activePage;
  if (!page) return;
  dropCodeTab(page.path);
  showCodeEditBanner(false);
  renderCanvas();
}

// syncIframeHeight was removed.
// The iframe height is now controlled entirely by CSS (calc(100vh - 130px)),
// so the site scrolls inside the frame like a real browser window.
// DO NOT add iframe.style.height back — it breaks scrolling.

const LOADING_HTML = `<!DOCTYPE html><html><body style="background:#141416;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#606070;gap:12px;flex-direction:column"><div style="width:24px;height:24px;border:2px solid rgba(255,255,255,.08);border-top-color:#0078d4;border-radius:50%;animation:spin .8s linear infinite"></div><span style="font-size:13px">Loading…</span><style>@keyframes spin{to{transform:rotate(360deg)}}</style></body></html>`;

function buildNotConnectedPlaceholder(): string {
  return `<!DOCTYPE html><html><body style="background:#0f172a;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#64748b;gap:16px;text-align:center;padding:40px"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"/></svg><p style="font-size:15px;font-weight:500;color:#475569">Connect a repository to start designing</p></body></html>`;
}

function buildNoPagePlaceholder(): string {
  return `<!DOCTYPE html><html><head><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f172a;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:system-ui,-apple-system,sans-serif;color:#94a3b8}
h2{font-size:18px;font-weight:600;color:#e2e8f0;margin-bottom:6px}
p{font-size:13px;color:#64748b;margin-bottom:32px}
.cards{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;max-width:560px}
.card{position:relative;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:22px 18px 18px;width:160px;cursor:pointer;text-align:center;transition:border-color .15s,background .15s;display:flex;flex-direction:column;align-items:center;gap:10px}
.card:hover{background:#263548;border-color:#0078d4}
.card svg{color:#94a3b8;transition:color .15s}
.card:hover svg{color:#0078d4}
.card .name{font-size:13px;font-weight:600;color:#e2e8f0}
.card .desc{font-size:11px;color:#64748b;line-height:1.4}
.badge{position:absolute;top:-8px;right:10px;background:#0078d4;color:#fff;font-size:9px;font-weight:700;letter-spacing:.06em;padding:2px 6px;border-radius:4px}
</style></head><body>
<h2>No pages yet</h2>
<p>Add your first page to start building</p>
<div class="cards">
  <button class="card" onclick="window.parent._showAddPageForm()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
    <div class="name">Blank page</div>
    <div class="desc">Start empty, add blocks manually</div>
  </button>
  <button class="card" onclick="window.parent._showTemplateGallery()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"/></svg>
    <div class="name">From template</div>
    <div class="desc">Pick a pre-built design</div>
  </button>
  <button class="card" onclick="window.parent._openAssetWizard()">
    <div class="badge">AUTO</div>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path stroke-linecap="round" stroke-linejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15M9 12l3 3m0 0 3-3m-3 3V2.25"/></svg>
    <div class="name">From assets</div>
    <div class="desc">Upload files, auto-build page</div>
  </button>
</div>
</body></html>`;
}

// ── Block re-render (settings panel changes) ───────────────────────────

export function rerenderBlock(blockId: string): void {
  const page = visual.activePage;
  if (!page) return;
  const block = page.blocks.find(b => b.id === blockId);
  if (!block) return;

  const iframe = getIframe();
  const iDoc = iframe?.contentDocument;
  const inner = iDoc?.querySelector(`[data-block-id="${blockId}"] .wb-inner`);
  if (inner) {
    inner.innerHTML = renderBlock(block, visual.theme, true);
    // Re-activate contenteditable on the new [data-field] elements.
    // activateFields() in the iframe only runs on initial page load; after
    // innerHTML is replaced here we must re-enable editing ourselves.
    if (!interactModeActive) {
      iDoc?.querySelectorAll<HTMLElement>('[data-field]').forEach(f => {
        if (f.contentEditable !== 'true') {
          let h = f.innerHTML;
          h = h.replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**');
          h = h.replace(/<em>([\s\S]*?)<\/em>/gi, '*$1*');
          f.innerHTML = h;
          f.contentEditable = 'true';
        }
      });
    }
    dropCodeTab(page.path);
    return;
  }
  dropCodeTab(page.path);
  renderCanvas();
}

// ── Theme ──────────────────────────────────────────────────────────────

export function applyThemeToCanvas(): void {
  // Load Google Fonts preview in parent document
  const fontId = 'vc-gfonts';
  let link = document.getElementById(fontId) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id  = fontId;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  const t = visual.theme;
  const fonts = new Set([t.headingFont, t.bodyFont]);
  link.href = `https://fonts.googleapis.com/css2?${[...fonts].map(f => `family=${encodeURIComponent(f)}:wght@400;600;700;800`).join('&')}&display=swap`;
  renderCanvas();
}

// ── Selection ──────────────────────────────────────────────────────────

export function selectBlock(id: string): void {
  visual.selectedBlockId = id;
  getIframe()?.contentWindow?.postMessage({ type: 'wb:select', id }, '*');
  coordinator.renderProperties?.();
  document.querySelectorAll('.sl-item').forEach(el => {
    (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.blockId === id);
  });
}

export function deselectBlock(): void {
  visual.selectedBlockId = null;
  getIframe()?.contentWindow?.postMessage({ type: 'wb:deselect' }, '*');
  coordinator.renderProperties?.();
  document.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
}

// ── Block mutations ────────────────────────────────────────────────────

export function addBlockAfter(afterId: string | null, type: string, prefill?: Record<string, string>): void {
  if (!visual.activePage) return;
  const page = visual.activePage;

  // Guard: raw-HTML page (no visual blocks, but HTML exists in the code tab).
  // Auto-convert the existing HTML to visual blocks first so the content is
  // preserved as sections. Without this, syncCodeTab would overwrite the
  // original HTML with single-block generated HTML, wiping the user's page.
  if (page.blocks.length === 0) {
    const rawTabIdx = state.openTabs.findIndex(t => t.path === page.path && !!t.content.trim());
    if (rawTabIdx !== -1) {
      const rawTab = state.openTabs[rawTabIdx];
      import('./convert').then(({ parseHtmlToBlocks }) => {
        const { blocks: converted, preservedHead } = parseHtmlToBlocks(rawTab.content);
        if (converted.length > 0) {
          page.blocks = converted;
          page.preservedHead = preservedHead;
        }
        // Remove the raw code tab so renderBlockPage renders from blocks, not HTML
        state.openTabs.splice(rawTabIdx, 1);
        // Re-call now that the page is in block mode (or empty if no sections found)
        addBlockAfter(afterId, type, prefill);
      });
      return;
    }
  }

  import('./blocks').then(({ newBlock: nb }) => {
    const block = nb(type, visual.theme);
    if (prefill) {
      for (const [key, value] of Object.entries(prefill)) {
        const [bag, field] = key.split('.');
        if (bag === 'content') block.content[field] = value;
        else if (bag === 'settings') block.settings[field] = value;
      }
    }
    const blocks = page.blocks;
    if (afterId === null) {
      blocks.push(block);
    } else {
      const idx = blocks.findIndex(b => b.id === afterId);
      // Guard: findIndex returns -1 if the id isn't found; fallback to appending.
      if (idx === -1) { blocks.push(block); } else { blocks.splice(idx + 1, 0, block); }
    }
    dropCodeTab(page.path);
    markDirty();
    // Pass selectBlock as a callback so it runs inside the onload handler,
    // which is set BEFORE src/srcdoc — no race condition.
    renderCanvas(() => selectBlock(block.id));
    coordinator.renderSectionList?.();
  });
}

export function deleteBlock(id: string): void {
  if (!visual.activePage) return;
  if (!confirm('Delete this section?')) return;
  const _beforeDelete = JSON.stringify(visual.activePage.blocks);
  visual.activePage.blocks = visual.activePage.blocks.filter(b => b.id !== id);
  pushUndo({ type: 'blocks', pageId: visual.activePage.id, data: _beforeDelete, redoData: JSON.stringify(visual.activePage.blocks), label: 'Delete section' });
  if (visual.selectedBlockId === id) {
    visual.selectedBlockId = null;
    coordinator.renderProperties?.();
  }
  dropCodeTab(visual.activePage.path);
  markDirty();
  renderCanvas();
  coordinator.renderSectionList?.();
  updateUndoBtnStates();
}

export function moveBlock(id: string, dir: -1 | 1): void {
  if (!visual.activePage) return;
  const blocks = visual.activePage.blocks;
  const idx = blocks.findIndex(b => b.id === id);
  const target = idx + dir;
  if (target < 0 || target >= blocks.length) return;
  const _beforeMove = JSON.stringify(blocks);
  [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
  pushUndo({ type: 'blocks', pageId: visual.activePage.id, data: _beforeMove, redoData: JSON.stringify(blocks), label: 'Move section' });
  dropCodeTab(visual.activePage.path);
  markDirty();
  renderCanvas(() => selectBlock(id));
  coordinator.renderSectionList?.();
  updateUndoBtnStates();
}

export function duplicateBlock(id: string): void {
  if (!visual.activePage) return;
  const blocks = visual.activePage.blocks;
  const idx = blocks.findIndex(b => b.id === id);
  if (idx === -1) return;
  const _beforeDupe = JSON.stringify(blocks);
  const _dupePageId = visual.activePage.id;
  import('../utils').then(({ uid }) => {
    const src = blocks[idx];
    const dupe: Block = { ...src, id: uid(), content: { ...src.content }, settings: { ...src.settings } };
    blocks.splice(idx + 1, 0, dupe);
    pushUndo({ type: 'blocks', pageId: _dupePageId, data: _beforeDupe, redoData: JSON.stringify(blocks), label: 'Duplicate section' });
    dropCodeTab(visual.activePage!.path); // keep code tab in sync
    markDirty();
    renderCanvas(() => selectBlock(dupe.id));
    coordinator.renderSectionList?.();
    updateUndoBtnStates();
  });
}

// ── Block setting updates ──────────────────────────────────────────────

export function updateBlockValue(
  blockId: string,
  key: string,
  value: string | boolean | number,
): void {
  if (!visual.activePage) return;
  const block = visual.activePage.blocks.find(b => b.id === blockId);
  if (!block) return;

  // Only push undo if the value actually changed
  const parts = key.split('.');
  if (parts.length === 2) {
    const bag = parts[0] === 'content' ? block.content : block.settings;
    if (bag[parts[1]] !== value) {
      const _beforeEdit = JSON.stringify(visual.activePage.blocks);
      bag[parts[1]] = value;
      pushUndo({ type: 'blocks', pageId: visual.activePage.id, data: _beforeEdit, redoData: JSON.stringify(visual.activePage.blocks), label: 'Edit block' });
    } else {
      bag[parts[1]] = value;
    }
  }

  markDirty();
  rerenderBlock(blockId);
  updateUndoBtnStates();

  if (key.startsWith('content.links') || key.startsWith('content.col')) {
    coordinator.renderProperties?.();
  }
}

function markDirty(): void {
  visual.dirty = true;
  if (visual.activePage) visual.activePage.dirty = true;
  updateVisualSaveBtn();
  debounceAutoSave(); // schedule a localStorage save
}

/**
 * When a block edit happens, SYNC the code tab with the freshly generated
 * HTML rather than dropping it.  This keeps the Code editor in sync so
 * the user can switch back to Code mode and see (or further edit) the
 * latest state.  If no code tab exists yet, we don't create one — blocks
 * will render directly when the user hasn't visited Code mode.
 *
 * On wb:htmlChange (design-mode edits), we keep the raw HTML as-is
 * and the code tab is updated there; that path still calls this function
 * which is a no-op if the tab content hasn't changed.
 */
function dropCodeTab(path: string): void {
  syncCodeTab(path);
}

function syncCodeTab(path: string): void {
  const existing = state.openTabs.find(t => t.path === path);
  if (!existing) return; // no code tab → blocks render directly, nothing to sync

  const page = visual.activePage;
  if (!page || page.path !== path) return;

  // Regenerate clean export HTML from the current block state
  const newHtml = generatePageHTML(page, visual.theme, visual.siteName, visual.siteDesc);
  if (existing.content !== newHtml) {
    existing.content = newHtml;
    existing.dirty   = true;
    // Keep the SW cache up-to-date so the iframe preview reflects the change
    cacheFileInSW(path, newHtml);
  }
}

// ── Save button ────────────────────────────────────────────────────────

export function updateVisualSaveBtn(): void {
  const btn = document.getElementById('action-push-btn') as HTMLButtonElement | null;
  const dirty = visual.dirty || visual.pages.some(p => p.dirty);
  btn?.classList.toggle('has-changes', dirty);
}

// ── postMessage listener ───────────────────────────────────────────────
let _msgHandler: ((e: MessageEvent) => void) | null = null;

/** Show and position the rich toolbar in the parent window.
 *  x/y are the left/top of the selection or field in parent-window coords.
 *  w/h are the width/height of the selection (0 for a simple cursor click). */
export function positionRichToolbar(x: number, y: number, w: number, _h: number): void {
  const tb = document.getElementById('wb-rich-toolbar');
  if (!tb) return;
  tb.style.visibility = 'hidden';
  tb.classList.add('wb-rt-show');
  const tbW = tb.offsetWidth || 240;
  tb.style.visibility = '';
  const cx   = x + w / 2;
  const top  = Math.max(4, y - 44);
  const left = Math.max(tbW / 2 + 4, Math.min(window.innerWidth - tbW / 2 - 4, cx));
  tb.style.left = left + 'px';
  tb.style.top  = top  + 'px';
}

function initRichToolbar(): void {
  const tb = document.getElementById('wb-rich-toolbar');
  if (!tb || tb.dataset.wbRtInit) return;
  tb.dataset.wbRtInit = '1';

  // Re-focus the saved iframe field AND restore the saved selection Range,
  // then send the command.  Clicking a parent toolbar button steals focus
  // from the iframe and clears the selection; both must be restored so that
  // execCommand / applySpanStyle have a live selection to act on.
  const refocusAndSend = (msg: Record<string, unknown>) => {
    const iframeWin = getIframe()?.contentWindow;
    if (!iframeWin) return;
    if (_richFocusedField) {
      _richFocusedField.focus();
      if (_richSelectionRange) {
        try {
          const sel = iframeWin.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(_richSelectionRange.cloneRange());
          }
        } catch { /* ignore — addRange may throw on detached ranges */ }
      }
    }
    iframeWin.postMessage(msg, '*');
  };

  // B / I / U / S
  tb.addEventListener('mousedown', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.matches('input, select')) e.preventDefault();
    const btn = target.closest('[data-rtcmd]') as HTMLElement | null;
    if (btn) refocusAndSend({ type: 'wb:richCmd', cmd: btn.dataset.rtcmd });
  });

  // Color swatch → open native color picker
  const swatch = document.getElementById('wbr-color-swatch') as HTMLButtonElement | null;
  const colorInput = document.getElementById('wbr-color-input') as HTMLInputElement | null;
  swatch?.addEventListener('mousedown', e => e.preventDefault());
  swatch?.addEventListener('click', e => { e.preventDefault(); colorInput?.click(); });
  colorInput?.addEventListener('input', () => {
    if (!colorInput.value) return;
    refocusAndSend({ type: 'wb:richCmd', cmd: 'foreColor', value: colorInput.value });
    if (swatch) swatch.style.background = colorInput.value;
  });

  // Font family
  const fontSel = document.getElementById('wbr-font-select') as HTMLSelectElement | null;
  fontSel?.addEventListener('change', () => {
    if (fontSel.value) refocusAndSend({ type: 'wb:richCmd', cmd: 'fontFamily', value: fontSel.value });
    fontSel.value = '';
  });

  // Font size
  const sizeSel = document.getElementById('wbr-size-select') as HTMLSelectElement | null;
  sizeSel?.addEventListener('change', () => {
    if (sizeSel.value) refocusAndSend({ type: 'wb:richCmd', cmd: 'fontSize', value: sizeSel.value });
    sizeSel.value = '';
  });

  // Clear formatting
  const clearBtn = document.getElementById('wbr-clear');
  clearBtn?.addEventListener('mousedown', e => {
    e.preventDefault();
    refocusAndSend({ type: 'wb:richCmd', cmd: 'removeFormat' });
  });

  // Hide when clicking anywhere outside the iframe or toolbar
  document.addEventListener('mousedown', (e: MouseEvent) => {
    const target = e.target as Element;
    if (tb.contains(target)) return;
    const ifr = getIframe();
    if (ifr && (ifr.contains(target) || ifr === target)) return;
    tb.classList.remove('wb-rt-show');
    _richFocusedField = null;
    _richSelectionRange = null;
  });
}

/** Read formatting state from the iframe and update toolbar indicators.
 *  Called whenever the toolbar is shown or the selection changes. */
function refreshRichToolbarState(): void {
  const tb   = document.getElementById('wb-rich-toolbar');
  const iDoc = getIframe()?.contentDocument;
  if (!tb || !iDoc) return;

  // Bold / italic / underline / strikethrough active states
  (['bold', 'italic', 'underline', 'strikeThrough'] as const).forEach(cmd => {
    try {
      tb.querySelector(`[data-rtcmd="${cmd}"]`)
        ?.classList.toggle('active', iDoc.queryCommandState(cmd));
    } catch { /* queryCommandState may throw in some browsers */ }
  });

  // Current foreground colour → update swatch + hidden input
  try {
    const raw = iDoc.queryCommandValue('foreColor');
    if (raw) {
      const m = raw.match(/\d+/g);
      if (m && m.length >= 3) {
        const hex = '#' + [m[0], m[1], m[2]]
          .map(v => Number(v).toString(16).padStart(2, '0')).join('');
        const sw = document.getElementById('wbr-color-swatch') as HTMLElement | null;
        const ci = document.getElementById('wbr-color-input')  as HTMLInputElement | null;
        if (sw) sw.style.background = hex;
        if (ci) ci.value = hex;
      }
    }
  } catch { /* ignore */ }
}

export function initCanvasEvents(): void {
  if (_msgHandler) window.removeEventListener('message', _msgHandler);
  initRichToolbar();

  _msgHandler = (e: MessageEvent) => {
    const { data } = e;
    if (!data?.type) return;

    switch (data.type as string) {
      case 'wb:select':
        if (!interactModeActive) selectBlock(data.id as string);
        break;
      case 'wb:deselect':
        if (!interactModeActive) deselectBlock();
        break;
      case 'wb:richSel': {
        const tb = document.getElementById('wb-rich-toolbar');
        if (!tb) break;
        if (!data.active) { tb.classList.remove('wb-rt-show'); break; }
        const ifr = getIframe();
        if (!ifr) break;
        const fr = ifr.getBoundingClientRect();
        const rect = data.rect as { top: number; left: number; width: number; height: number };
        positionRichToolbar(fr.left + rect.left, fr.top + rect.top, rect.width, rect.height);
        // Update B/I/U/S active states
        (['bold', 'italic', 'underline', 'strikeThrough'] as const).forEach(cmd => {
          tb.querySelector(`[data-rtcmd="${cmd}"]`)
            ?.classList.toggle('active', !!(data as Record<string, unknown>)[cmd]);
        });
        break;
      }
      case 'wb:textSave': {
        const blockId = data.blockId as string;
        const field   = data.field   as string;
        const value   = data.value   as string;
        const block = visual.activePage?.blocks.find(b => b.id === blockId);
        if (block && field) {
          block.content[field] = value;
          if (visual.activePage) dropCodeTab(visual.activePage.path);
          markDirty();
          coordinator.renderSectionList?.();
        }
        break;
      }
      case 'wb:height':
        // Height is controlled by CSS (calc(100vh - 130px)) — not overridden here.
        break;
      // Design-mode: user edited raw HTML — update the code tab
      // Custom block inline edit saved — update the block's html content
      case 'wb:customHtmlSave': {
        const page = visual.activePage;
        if (!page) break;
        const blockId = data.blockId as string;
        const html    = stripEditingArtifacts(data.html as string);
        const block   = page.blocks.find(b => b.id === blockId);
        if (block && block.type === 'custom') {
          block.content.html = html;
          dropCodeTab(page.path);
          markDirty();
          coordinator.renderProperties?.(); // refresh char count in properties panel
        }
        break;
      }

      case 'wb:domStructure': {
        dmSections = data.sections as DomSection[];
        dmSelected = null;
        coordinator.renderSectionList?.();
        // Only update the properties panel for raw HTML pages (inspect mode).
        // Block pages handle selection via wb:select / afterLoad callbacks;
        // calling renderProperties() here would flash stale block panel content.
        if (!visual.activePage || visual.activePage.blocks.length === 0) {
          coordinator.renderProperties?.();
        }
        break;
      }
      case 'wb:elementSelect': {
        if (interactModeActive) break;
        dmSelected = {
          selector:    data.selector    as string,
          tagName:     data.tagName     as string,
          id:          data.id          as string,
          classes:     data.classes     as string,
          inlineStyle: data.inlineStyle as string,
          styles:      data.styles      as Record<string, string>,
          sectionIndex: data.sectionIndex as number,
          breadcrumb:  (data.breadcrumb  as BreadcrumbItem[]) ?? [],
        };
        coordinator.renderProperties?.();
        coordinator.renderSectionList?.();
        break;
      }
      case 'wb:elementHover': {
        if (interactModeActive) break;
        const hIdx = data.sectionIndex as number;
        document.querySelectorAll<HTMLElement>('.dm-section-item').forEach(item => {
          item.classList.toggle('sl-canvas-hover', Number(item.dataset.index) === hIdx);
        });
        break;
      }
      case 'wb:elementHoverEnd': {
        document.querySelectorAll<HTMLElement>('.dm-section-item').forEach(item => {
          item.classList.remove('sl-canvas-hover');
        });
        break;
      }
      case 'wb:htmlChange': {
        const page = visual.activePage;
        if (!page) break;
        // The iframe editing script already strips wb- elements before sending,
        // but strip again here as a safety net for any path that bypasses it.
        const cleanHtml = stripEditingArtifacts(data.html as string);
        let tab = state.openTabs.find(t => t.path === page.path);
        // Debounce undo pushes for text edits — push at most once per 2s so
        // continuous typing doesn't flood the 50-entry history stack.
        const oldHtml = tab?.content;
        if (oldHtml !== undefined && oldHtml !== cleanHtml) {
          if (!_htmlUndoTimer) {
            // Capture the pre-edit snapshot on the FIRST change in the 2s window
            const snapHtml = oldHtml;
            const snapPageId = page.id;
            _htmlUndoTimer = setTimeout(() => {
              _htmlUndoTimer = null;
              // Guard: only push if user is still on the same page
              if (visual.activePage?.id === snapPageId) {
                const afterTab = state.openTabs.find(t => t.path === page.path);
                pushUndo({ type: 'html', pageId: snapPageId, data: snapHtml, redoData: afterTab?.content, label: 'Edit text' });
                updateUndoBtnStates();
              }
            }, 2000);
          }
        }
        if (tab) {
          tab.content = cleanHtml;
          tab.dirty   = true;
        } else {
          state.openTabs.push({
            path: page.path, content: cleanHtml,
            sha: state.fileShas[page.path] ?? '', dirty: true, language: 'html',
          });
        }
        cacheFileInSW(page.path, cleanHtml);
        markDirty();
        updateUndoBtnStates();
        break;
      }
      case 'wb:contextAction': {
        // Actions from the in-canvas right-click menu and floating toolbar
        const action   = data.action   as string;
        const selector = data.selector as string | undefined;
        switch (action) {
          case 'deleteSection':
            if (selector && confirm('Remove this section from the page?')) {
              dmDeleteSection(selector);
            }
            break;
          case 'inspectPanel':
            // Scroll the left panel to the matching section
            if (selector) {
              dmHighlightSection(selector);
              import('./index').then(({ switchSidebarPanel }) => switchSidebarPanel('pages'));
            }
            break;
          case 'editText':
            // Exit Interact mode so the user can edit
            if (interactModeActive) setInteractMode(false);
            break;
          case 'changeBackground':
            // Open the inspector and focus the background-color control
            if (selector) dmHighlightSection(selector);
            break;
          case 'replaceImage':
            // Trigger the hidden file input for image replacement
            notify('Drag an image onto the canvas to replace it', 'info');
            break;
          case 'copySection':
            notify('Section duplicated', 'success');
            if (selector) {
              getIframe()?.contentWindow?.postMessage(
                { type: 'wb:duplicateSection', selector },
                '*',
              );
            }
            break;
        }
        break;
      }
      case 'wb:blockReorder': {
        // Drag-to-reorder from canvas iframe
        const page = visual.activePage;
        if (!page) break;
        const fromId = data.fromId as string;
        const toId   = data.toId   as string;
        const insertBefore = data.insertBefore as boolean;
        const fromIdx = page.blocks.findIndex(b => b.id === fromId);
        const toIdx   = page.blocks.findIndex(b => b.id === toId);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) break;
        const _before = JSON.stringify(page.blocks);
        const [moved] = page.blocks.splice(fromIdx, 1);
        const newToIdx = page.blocks.findIndex(b => b.id === toId);
        if (newToIdx === -1) { page.blocks.splice(fromIdx, 0, moved); break; } // restore on miss
        page.blocks.splice(insertBefore ? newToIdx : newToIdx + 1, 0, moved);
        pushUndo({ type: 'blocks', pageId: page.id, data: _before, redoData: JSON.stringify(page.blocks), label: 'Reorder section' });
        markDirty();
        renderCanvas(() => selectBlock(fromId));
        coordinator.renderSectionList?.();
        updateUndoBtnStates();
        break;
      }
      case 'wb:imageUpload': {
        const base64 = data.base64 as string;
        const filename = data.filename as string;
        const targetSelector = data.targetSelector as string | null;
        if (!state.connected || !state.owner) break;
        // Use uploadFile (not writeFile) because image data is already raw base64.
        // writeFile() would double-encode it via encodeBase64().
        import('../github').then(async ({ uploadFile }) => {
          try {
            const path = `images/${filename}`;
            await uploadFile(path, base64, `Upload ${filename}`, state.fileShas[path]);
            // Send message to iframe to update the img src
            if (targetSelector) {
              getIframe()?.contentWindow?.postMessage({
                type: 'wb:setImgSrc',
                selector: targetSelector,
                src: `images/${filename}`
              }, '*');
            }
            notify(`Image uploaded: ${filename}`, 'success');
          } catch (e) {
            notify('Upload failed: ' + (e as Error).message, 'error');
          }
        });
        break;
      }
    }
  };

  window.addEventListener('message', _msgHandler);
}

// ── Animation preview ─────────────────────────────────────────────────

/** Trigger the entrance animation on a block inside the editing canvas iframe. */
export function previewBlockAnimation(
  blockId: string,
  animIn: string,
  duration: number,
  delay: number,
  ease: string,
): void {
  getIframe()?.contentWindow?.postMessage(
    { type: 'wb:replayAnim', blockId, animIn, duration, delay, ease },
    '*',
  );
}

// ── Undo / Redo ───────────────────────────────────────────────────────

export function performUndo(): void {
  const snap = undo();
  if (!snap) return;
  _applySnapshot(snap);
  updateUndoBtnStates();
}

export function performRedo(): void {
  const snap = redo();
  if (!snap || !snap.redoData) return; // no redoData = after-state was never captured
  _applySnapshot({ ...snap, data: snap.redoData });
  updateUndoBtnStates();
}

function _applySnapshot(snap: { type: string; pageId: string; data: string }): void {
  const page = visual.pages.find(p => p.id === snap.pageId);
  if (!page) return;
  if (snap.type === 'blocks') {
    page.blocks = JSON.parse(snap.data) as Block[];
    markDirty(); // Restoring state is a change — activate save button
    if (visual.activePage?.id === page.id) {
      dropCodeTab(page.path);
      renderCanvas();
      coordinator.renderSectionList?.();
      coordinator.renderProperties?.();
    }
  } else if (snap.type === 'html') {
    const tab = state.openTabs.find(t => t.path === page.path);
    if (tab) {
      tab.content = snap.data;
      tab.dirty = true;
      if (visual.activePage?.id === page.id) renderCanvas();
    }
  } else if (snap.type === 'css') {
    _onCssRestore?.(snap.data);
  }
}

export function updateUndoBtnStates(): void {
  const undoBtn = document.getElementById('vis-undo-btn') as HTMLButtonElement | null;
  const redoBtn = document.getElementById('vis-redo-btn') as HTMLButtonElement | null;
  if (undoBtn) {
    undoBtn.disabled = !canUndo();
    undoBtn.title = canUndo() ? `Undo: ${getUndoLabel()} (Ctrl+Z)` : 'Nothing to undo';
  }
  if (redoBtn) {
    redoBtn.disabled = !canRedo();
    redoBtn.title = canRedo() ? `Redo: ${getRedoLabel()} (Ctrl+Y)` : 'Nothing to redo';
  }
}

// ── Design-mode inspector senders ─────────────────────────────────────

export function dmSetInlineStyle(selector: string, property: string, value: string): void {
  getIframe()?.contentWindow?.postMessage({ type: 'wb:setInlineStyle', selector, property, value }, '*');
}
export function dmHighlightSection(selector: string): void {
  getIframe()?.contentWindow?.postMessage({ type: 'wb:highlightSection', selector }, '*');
}
export function dmMoveSection(selector: string, direction: 'up' | 'down'): void {
  getIframe()?.contentWindow?.postMessage({ type: 'wb:moveSection', selector, direction }, '*');
}
export function dmHoverSection(selector: string): void {
  getIframe()?.contentWindow?.postMessage({ type: 'wb:hoverSection', selector }, '*');
}
export function dmUnhoverSection(): void {
  getIframe()?.contentWindow?.postMessage({ type: 'wb:unhoverSection' }, '*');
}
export function dmReorderSection(fromSelector: string, toSelector: string, position: 'before' | 'after'): void {
  getIframe()?.contentWindow?.postMessage({ type: 'wb:reorderSection', fromSelector, toSelector, position }, '*');
}
export function dmDeleteSection(selector: string): void {
  getIframe()?.contentWindow?.postMessage({ type: 'wb:deleteSection', selector }, '*');
}
export function dmSetCssLive(css: string): void {
  getIframe()?.contentWindow?.postMessage({ type: 'wb:setCssLive', css }, '*');
}

// ── Section picker ─────────────────────────────────────────────────────

export function openSectionPicker(afterId: string | null): void {
  visual.pendingInsertAfterId = afterId;
  document.getElementById('section-picker-modal')?.classList.remove('hidden');
}

export function closeSectionPicker(): void {
  document.getElementById('section-picker-modal')?.classList.add('hidden');
  visual.pendingInsertAfterId = null;
  visual.pendingMediaDrop = null;
}

export function renderSectionPicker(): void {
  const grid = document.getElementById('picker-grid') as HTMLElement;
  if (!grid) return;

  // Group by category
  const categories: Record<string, Array<[string, typeof BLOCK_DEFS[string]]>> = {
    Structure: [],
    Content: [],
    Marketing: [],
    'Living Design': [],
  };
  for (const [type, def] of Object.entries(BLOCK_DEFS)) {
    (categories[def.category] ??= []).push([type, def]);
  }

  let html = '';
  for (const [cat, items] of Object.entries(categories)) {
    if (!items.length) continue;
    const isLD = cat === 'Living Design';
    html += `<div style="grid-column:1/-1;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${isLD ? '#ffc220' : 'var(--text-secondary)'};padding:${isLD ? '12px' : '8px'} 0 2px;${isLD ? 'border-top:1px solid rgba(255,255,255,.08);margin-top:4px;' : ''}">${cat}</div>`;
    for (const [type, def] of items) {
      html += `<div class="picker-card" onclick="window._pickSection('${type}')">
        <div class="picker-thumb">${def.thumbnail}</div>
        <div class="picker-name">${def.name}</div>
        <div class="picker-cat">${def.category}</div>
      </div>`;
    }
  }
  grid.innerHTML = html;
}

// ── Expose globals ─────────────────────────────────────────────────────

export function exposeCanvasGlobals(): void {
  const w = window as unknown as Record<string, unknown>;
  w._moveBlock      = (id: string, dir: -1 | 1) => moveBlock(id, dir);
  w._duplicateBlock = (id: string) => duplicateBlock(id);
  w._deleteBlock    = (id: string) => deleteBlock(id);
  w._addBlockHere   = (afterId: string | null) => openSectionPicker(afterId);
  w._pickSection    = (type: string) => {
    const pendingDrop = visual.pendingMediaDrop;
    let prefill: Record<string, string> | undefined;
    if (pendingDrop) {
      visual.pendingMediaDrop = null;
      const IMAGE_FIELDS: Record<string, string> = {
        split: 'content.imageUrl', gallery: 'content.img1',
        hero: 'settings.bgImage', testimonial: 'content.avatar',
        image: 'content.imageUrl', video: 'content.poster',
      };
      const field = IMAGE_FIELDS[type];
      if (pendingDrop.source === 'repo' && field && pendingDrop.path) {
        prefill = { [field]: pendingDrop.path };
        if (type === 'hero') prefill['settings.bgType'] = 'image';
      } else if (pendingDrop.source === 'os' && pendingDrop.base64 && pendingDrop.filename && field) {
        const filename = pendingDrop.filename;
        const base64 = pendingDrop.base64;
        const path = `images/${filename}`;
        prefill = { [field]: path };
        if (type === 'hero') prefill['settings.bgType'] = 'image';
        import('../github').then(async ({ uploadFile }) => {
          try {
            await uploadFile(path, base64, `Upload ${filename}`, state.fileShas[path]);
            notify(`Uploaded: ${filename}`, 'success');
          } catch (err) { notify('Upload failed: ' + (err as Error).message, 'error'); }
        });
      }
    }
    addBlockAfter(visual.pendingInsertAfterId, type, prefill);
    closeSectionPicker();
  };
  w._selectSectionFromList = (selector: string) => {
    dmHighlightSection(selector);
    const sec = dmSections.find(s => s.selector === selector);
    if (sec) {
      dmSelected = {
        selector: sec.selector, tagName: sec.tag, id: sec.id,
        classes: sec.classes, inlineStyle: '', styles: {}, sectionIndex: sec.index,
        breadcrumb: [],
      };
      coordinator.renderProperties?.();
      coordinator.renderSectionList?.();
    }
  };
  w._moveDmSection      = (selector: string, direction: 'up' | 'down') => dmMoveSection(selector, direction);
  w._hoverDmSection     = (selector: string) => dmHoverSection(selector);
  w._unhoverDmSection   = () => dmUnhoverSection();
  w._reorderDmSection   = (fromSel: string, toSel: string, pos: 'before' | 'after') => dmReorderSection(fromSel, toSel, pos);
  w._deleteDmSection    = (selector: string) => {
    if (!confirm('Remove this section from the page?')) return;
    dmDeleteSection(selector);
  };
}

export function exposeNavLinkGlobals(
  addNavLink: (blockId: string) => void,
  removeNavLink: (blockId: string, idx: number) => void,
): void {
  const w = window as unknown as Record<string, unknown>;
  w._addNavLink    = addNavLink;
  w._removeNavLink = removeNavLink;
}

// ── Canvas drag & drop overlay ─────────────────────────────────────────
//
// Dragging from the parent document (tree / sidebar preview) into the
// iframe is unreliable for custom MIME types because srcdoc iframes have
// cross-document dataTransfer restrictions.  Instead we handle ALL media
// drag-and-drop on a transparent overlay div in the parent, and query
// iframe.contentDocument directly for target positions.

let _dragOverlay: HTMLDivElement | null = null;
let _currentDragType: 'block' | 'media' | null = null;
let _blockDropTarget: { afterId: string | null } | null = null;

function ensureDragOverlay(): HTMLDivElement {
  if (_dragOverlay) return _dragOverlay;
  const frame = document.getElementById('vis-device-frame');
  if (!frame) throw new Error('vis-device-frame not found');
  const el = document.createElement('div');
  el.id = 'wb-canvas-drag-overlay';
  el.style.cssText = 'position:absolute;inset:0;z-index:10;pointer-events:none';
  frame.appendChild(el);
  _dragOverlay = el;

  // ── dragover: highlight nearest drop target ───────────────────────
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    if (_currentDragType === 'block') {
      highlightBlockInsertionPoint(e.clientX, e.clientY);
    } else {
      highlightNearestTarget(e.clientX, e.clientY);
    }
  });

  // ── dragleave: clear highlights when cursor leaves canvas ─────────
  el.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || !el.contains(e.relatedTarget as Node)) {
      clearIframeHighlights();
      clearBlockInsertionIndicators();
    }
  });

  // ── drop: process the dropped media or block ──────────────────────
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    if (_currentDragType === 'block') {
      handleBlockDrop(e);
    } else {
      handleCanvasDrop(e);
    }
    deactivateDragOverlay();
  });

  return el;
}

function activateDragOverlay(): void {
  ensureDragOverlay().style.pointerEvents = 'auto';
}

function deactivateDragOverlay(): void {
  if (_dragOverlay) _dragOverlay.style.pointerEvents = 'none';
  clearIframeHighlights();
  clearBlockInsertionIndicators();
  _currentDragType = null;
  _blockDropTarget = null;
}

function clearIframeHighlights(): void {
  const iDoc = getIframe()?.contentDocument;
  if (!iDoc) return;
  iDoc.body?.classList.remove('wb-media-drag-over');
  iDoc.querySelectorAll('.wb-drop-active').forEach(el => el.classList.remove('wb-drop-active'));
}

function highlightNearestTarget(clientX: number, clientY: number): void {
  const iframe = getIframe();
  const iDoc = iframe?.contentDocument;
  if (!iDoc?.body) return;

  const iframeRect = iframe!.getBoundingClientRect();
  const x = clientX - iframeRect.left;
  const y = clientY - iframeRect.top;

  const targets = iDoc.querySelectorAll<HTMLElement>('[data-drop-field]');
  let nearest: HTMLElement | null = null;
  let minDist = Infinity;

  targets.forEach(el => {
    el.classList.remove('wb-drop-active');
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dist = Math.hypot(x - cx, y - cy);
    if (dist < minDist) { minDist = dist; nearest = el; }
  });

  iDoc.body.classList.add('wb-media-drag-over');
  if (nearest && minDist < 400) (nearest as HTMLElement).classList.add('wb-drop-active');
}

function findDropTarget(clientX: number, clientY: number): {
  blockId: string | null; fieldKey: string | null; afterBlockId: string | null;
} {
  const iframe = getIframe();
  const iDoc = iframe?.contentDocument;
  if (!iDoc) return { blockId: null, fieldKey: null, afterBlockId: null };

  const iframeRect = iframe!.getBoundingClientRect();
  const x = clientX - iframeRect.left;
  const y = clientY - iframeRect.top;

  let nearest: Element | null = null;
  let minDist = Infinity;
  let nearestField: string | null = null;
  let nearestBlockId: string | null = null;

  iDoc.querySelectorAll<HTMLElement>('[data-drop-field]').forEach(el => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dist = Math.hypot(x - cx, y - cy);
    if (dist < minDist) {
      minDist = dist; nearest = el;
      nearestField = el.getAttribute('data-drop-field');
      nearestBlockId = el.getAttribute('data-block-id')
        || el.closest('[data-block-id]')?.getAttribute('data-block-id') || null;
    }
  });

  if (nearest && minDist < 400) {
    return { blockId: nearestBlockId, fieldKey: nearestField, afterBlockId: null };
  }

  // No close drop target — find nearest block boundary for insertion
  let afterBlockId: string | null = null;
  iDoc.querySelectorAll<HTMLElement>('[data-block-id]').forEach(bl => {
    const r = bl.getBoundingClientRect();
    if (y > r.top) afterBlockId = bl.getAttribute('data-block-id');
  });
  return { blockId: null, fieldKey: null, afterBlockId };
}

function handleCanvasDrop(e: DragEvent): void {
  const dt = e.dataTransfer;
  if (!dt) return;

  const { blockId, fieldKey, afterBlockId } = findDropTarget(e.clientX, e.clientY);

  // Case 1: Repo asset drag (from tree / sidebar preview)
  if (dt.types.includes('application/x-wb-asset')) {
    try {
      const asset = JSON.parse(dt.getData('application/x-wb-asset')) as { path: string; type: string };
      if (blockId && fieldKey) {
        // Existing block field
        updateBlockValue(blockId, fieldKey, asset.path);
        if (fieldKey === 'settings.bgImage') updateBlockValue(blockId, 'settings.bgType', 'image');
        notify(`Image set from ${asset.path.split('/').pop()}`, 'success');
      } else {
        // Between blocks → open section picker
        visual.pendingMediaDrop = { path: asset.path, source: 'repo' };
        openSectionPicker(afterBlockId);
      }
    } catch { /* malformed data */ }
    return;
  }

  // Case 2: OS file drag
  if (!dt.files?.length) return;
  const file = dt.files[0];
  if (!file || (!file.type.startsWith('image/') && !file.type.startsWith('video/'))) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const base64 = (ev.target!.result as string).split(',')[1];
    if (blockId && fieldKey) {
      // Upload then update existing block field
      const path = `images/${file.name}`;
      import('../github').then(async ({ uploadFile }) => {
        try {
          await uploadFile(path, base64, `Upload ${file.name}`, state.fileShas[path]);
          updateBlockValue(blockId, fieldKey, path);
          if (fieldKey === 'settings.bgImage') updateBlockValue(blockId, 'settings.bgType', 'image');
          notify(`Uploaded & set: ${file.name}`, 'success');
        } catch (err) {
          notify('Upload failed: ' + (err as Error).message, 'error');
        }
      });
    } else {
      // Between blocks → open section picker
      visual.pendingMediaDrop = { path: '', source: 'os', base64, filename: file.name };
      openSectionPicker(afterBlockId);
    }
  };
  reader.readAsDataURL(file);
}

/** Call once to wire up drag detection on the parent document. */
export function initCanvasDragDrop(): void {
  let dragCounter = 0;

  // Detect relevant drags entering the window / starting internally
  document.addEventListener('dragenter', (e) => {
    const types = e.dataTransfer?.types;
    if (!types) return;
    // Detect drag type
    const isBlock = types.includes('application/x-wb-block');
    const isAsset = types.includes('application/x-wb-asset');
    const isFiles = [...types].some(t => t === 'Files');
    if (!isBlock && !isAsset && !isFiles) return;
    // Block drags work even on empty pages; media drags need existing blocks
    if (!visual.activePage) return;
    if (!isBlock && visual.activePage.blocks.length === 0) return;
    _currentDragType = isBlock ? 'block' : 'media';
    dragCounter++;
    activateDragOverlay();
  });

  document.addEventListener('dragleave', (e) => {
    // Only count leaves that exit the document
    if (e.relatedTarget) return;
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) deactivateDragOverlay();
  });

  document.addEventListener('dragend', () => {
    dragCounter = 0;
    deactivateDragOverlay();
  });

  document.addEventListener('drop', () => {
    // Safety: ensure overlay is hidden after any drop (e.g. drop on sidebar)
    dragCounter = 0;
    deactivateDragOverlay();
  });
}

// ── Block insertion indicators ──────────────────────────────────────

function clearBlockInsertionIndicators(): void {
  const iDoc = getIframe()?.contentDocument;
  if (!iDoc) return;
  iDoc.querySelectorAll('.wb-block-drop-before').forEach(el => el.classList.remove('wb-block-drop-before'));
  iDoc.querySelectorAll('.wb-block-drop-after').forEach(el => el.classList.remove('wb-block-drop-after'));
  iDoc.body?.classList.remove('wb-block-drop-empty');
}

function highlightBlockInsertionPoint(_clientX: number, clientY: number): void {
  const iframe = getIframe();
  const iDoc = iframe?.contentDocument;
  if (!iDoc?.body) return;

  clearBlockInsertionIndicators();

  const iframeRect = iframe!.getBoundingClientRect();
  const y = clientY - iframeRect.top + (iDoc.documentElement.scrollTop || 0);

  const blocks = Array.from(iDoc.querySelectorAll<HTMLElement>('[data-block-id]'));

  // Empty page
  if (blocks.length === 0) {
    iDoc.body.classList.add('wb-block-drop-empty');
    _blockDropTarget = { afterId: null };
    return;
  }

  // Find closest block boundary
  let bestIdx = -1;
  let bestEdgeIsBefore = false;
  let bestDist = Infinity;

  for (let i = 0; i < blocks.length; i++) {
    const r = blocks[i].getBoundingClientRect();
    const topDist = Math.abs(y - r.top);
    const bottomDist = Math.abs(y - r.bottom);

    if (topDist < bestDist) {
      bestDist = topDist;
      bestIdx = i;
      bestEdgeIsBefore = true;
    }
    if (bottomDist < bestDist) {
      bestDist = bottomDist;
      bestIdx = i;
      bestEdgeIsBefore = false;
    }
  }

  if (bestIdx >= 0) {
    const el = blocks[bestIdx];
    if (bestEdgeIsBefore) {
      el.classList.add('wb-block-drop-before');
      // "before this block" = after the previous block, or null for first
      _blockDropTarget = {
        afterId: bestIdx > 0 ? blocks[bestIdx - 1].getAttribute('data-block-id') : null,
      };
    } else {
      el.classList.add('wb-block-drop-after');
      _blockDropTarget = { afterId: el.getAttribute('data-block-id') };
    }
  }
}

function handleBlockDrop(e: DragEvent): void {
  const dt = e.dataTransfer;
  if (!dt) return;
  const blockType = dt.getData('application/x-wb-block');
  if (!blockType) return;
  clearBlockInsertionIndicators();
  const afterId = _blockDropTarget?.afterId ?? null;
  addBlockAfter(afterId, blockType);
}

// ── Elements panel ──────────────────────────────────────────────────

// Cache BLOCK_DEFS entries once — the registry never changes at runtime.
const _BLOCK_ENTRIES = Object.entries(BLOCK_DEFS);

let _elementsPanelInited = false;
let _elemSearch = '';
let _elemCat    = 'all';
// Cached after first DOM access (stable element, never removed).
let _elemCountEl: HTMLElement | null = null;

export function renderElementsPanel(): void {
  const body = document.getElementById('elements-panel-body');
  if (!body) return;

  if (!_elementsPanelInited) {
    _elementsPanelInited = true;

    // ── Drag ──────────────────────────────────────────────────────
    body.addEventListener('dragstart', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.elem-card');
      if (!card) return;
      const blockType = card.dataset.blockType;
      if (!blockType) return;
      e.dataTransfer!.setData('application/x-wb-block', blockType);
      e.dataTransfer!.effectAllowed = 'copy';
      card.classList.add('elem-card--dragging');
      const ghost = card.cloneNode(true) as HTMLElement;
      ghost.style.cssText = 'width:110px;position:absolute;top:-9999px;opacity:.85;pointer-events:none;border-radius:6px;overflow:hidden;';
      document.body.appendChild(ghost);
      e.dataTransfer!.setDragImage(ghost, 55, 32);
      requestAnimationFrame(() => ghost.remove());
    });

    body.addEventListener('dragend', (e) => {
      (e.target as HTMLElement).closest<HTMLElement>('.elem-card')
        ?.classList.remove('elem-card--dragging');
    });

    // ── Click: collapse header OR add block ───────────────────────
    body.addEventListener('click', (e) => {
      // Category header → toggle collapse
      const hd = (e.target as HTMLElement).closest<HTMLElement>('.elem-cat-hd');
      if (hd) {
        const key  = hd.dataset.cat ?? '';
        const grid = body.querySelector<HTMLElement>(`.elem-grid[data-cat="${CSS.escape(key)}"]`);
        if (grid) {
          const collapsed = grid.style.display === 'none';
          grid.style.display = collapsed ? 'grid' : 'none';
          hd.classList.toggle('elem-cat-hd--collapsed', !collapsed);
        }
        return;
      }
      // Block card → quick-add at end of page
      const card = (e.target as HTMLElement).closest<HTMLElement>('.elem-card');
      if (!card) return;
      const blockType = card.dataset.blockType;
      if (!blockType) return;
      addBlockAfter(null, blockType);
    });

    // ── Search ────────────────────────────────────────────────────
    const searchEl = document.getElementById('elements-search') as HTMLInputElement | null;
    const clearBtn = document.getElementById('elements-search-clear') as HTMLElement | null;
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        _elemSearch = searchEl.value.trim().toLowerCase();
        if (clearBtn) clearBtn.style.display = _elemSearch ? 'flex' : 'none';
        _refreshElems(body);
      });
      searchEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchEl.value = '';
          _elemSearch = '';
          if (clearBtn) clearBtn.style.display = 'none';
          _refreshElems(body);
          searchEl.blur();
        }
      });
      clearBtn?.addEventListener('click', () => {
        searchEl.value = '';
        _elemSearch = '';
        clearBtn.style.display = 'none';
        _refreshElems(body);
        searchEl.focus();
      });
    }

    // ── Category tabs ─────────────────────────────────────────────
    document.querySelectorAll<HTMLElement>('.elem-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.elem-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        _elemCat = tab.dataset.cat ?? 'all';
        const s = document.getElementById('elements-search') as HTMLInputElement | null;
        if (s) s.value = '';
        _elemSearch = '';
        const cb = document.getElementById('elements-search-clear') as HTMLElement | null;
        if (cb) cb.style.display = 'none';
        _refreshElems(body);
      });
    });
  }

  _refreshElems(body);
}

function _refreshElems(body: HTMLElement): void {
  const search = _elemSearch;
  const cat    = _elemCat;

  const entries = _BLOCK_ENTRIES.filter(([, def]) => {
    if (cat !== 'all' && def.category !== cat) return false;
    if (search && !def.name.toLowerCase().includes(search)) return false;
    return true;
  });

  _elemCountEl ??= document.getElementById('elements-count');
  if (_elemCountEl) _elemCountEl.textContent = String(entries.length);

  // ── Empty state ───────────────────────────────────────────────
  if (!entries.length) {
    body.innerHTML = `<div class="elem-empty">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">
        <circle cx="11" cy="11" r="7"/>
        <path d="M16.5 16.5L21 21" stroke-linecap="round"/>
        <path d="M8 11h6M11 8v6" stroke-linecap="round"/>
      </svg>
      <strong>No blocks found</strong>
      <span>Try a different search term.</span>
    </div>`;
    return;
  }

  // ── Search results or single category: flat grid ──────────────
  // Both cases produce an identical structure; only difference is whether
  // data-cat is set (needed for the collapse toggle in the "All" grouped view).
  if (search || cat !== 'all') {
    const attr = cat !== 'all' ? ` data-cat="${cat}"` : '';
    body.innerHTML = `<div class="elem-grid"${attr}>${
      entries.map(([type, def]) => _blockCard(type, def, def.category === 'Living Design')).join('')
    }</div>`;
    return;
  }

  // ── All: grouped with collapsible headers ─────────────────────
  const CAT_ORDER = ['Structure', 'Content', 'Marketing', 'Living Design'] as const;
  const groups: Partial<Record<string, typeof entries>> = {};
  for (const entry of entries) (groups[entry[1].category] ??= []).push(entry);

  let html = '';
  for (const catName of CAT_ORDER) {
    const items = groups[catName];
    if (!items?.length) continue;
    const isLD = catName === 'Living Design';
    html += `<div class="elem-cat-hd${isLD ? ' elem-cat-hd--ld' : ''}" data-cat="${catName}">
      <span class="elem-cat-hd__label">${catName}</span>
      <span class="elem-cat-hd__count">${items.length}</span>
      <svg class="elem-cat-hd__chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="elem-grid" data-cat="${catName}">${
      items.map(([type, def]) => _blockCard(type, def, isLD)).join('')
    }</div>`;
  }
  body.innerHTML = html;
}

function _blockCard(type: string, def: (typeof BLOCK_DEFS)[string], isLD = false): string {
  return `<div class="elem-card${isLD ? ' elem-card--ld' : ''}"
    draggable="true"
    data-block-type="${type}"
    title="${def.name} — click to add, drag to place">
    <div class="elem-thumb">${def.thumbnail}</div>
    <div class="elem-card-footer">
      <span class="elem-name">${def.name}</span>
      ${isLD ? '<span class="elem-ld-badge">LD</span>' : ''}
    </div>
  </div>`;
}

// ── Coordinator registration ───────────────────────────────────────────
// Called once from visual/index.ts init block to populate coordinator slots.

export function registerCanvasCallbacks(): void {
  Object.assign(coordinator, {
    rerenderBlock, applyThemeToCanvas, renderCanvas, updateVisualSaveBtn,
    syncActivePageCodeTab, previewBlockAnimation, dmSetInlineStyle,
    dmHighlightSection, dmSetCssLive, getDmSelected, updateBlockValue, deselectBlock,
  });
}
