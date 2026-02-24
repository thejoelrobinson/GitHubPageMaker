import type { Block, Page } from '../types';
import { visual, state } from '../state';

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
export const getInspectMode = (): boolean => inspectModeActive;
export function setInspectMode(active: boolean): void {
  inspectModeActive = active;
  getIframe()?.contentWindow?.postMessage({ type: 'wb:setInspectMode', active }, '*');
  // Update toolbar button states
  document.getElementById('tool-edit')?.classList.toggle('active', !active);
  document.getElementById('tool-inspect')?.classList.toggle('active', active);
}
import { renderBlock, BLOCK_DEFS } from './blocks';
import { generateEditingPageHTML, generatePageHTML, injectEditingLayer, WB_STYLE_ID, WB_SCRIPT_ID, WB_BASE_ID } from './export';

/**
 * Remove editing-layer artifacts from HTML before storing in the code tab.
 * These elements are injected by the builder and must never appear in the
 * user's code editor or in published output.
 */
function stripEditingArtifacts(html: string): string {
  const IDS = [WB_STYLE_ID, WB_SCRIPT_ID, 'wb-toolbar', WB_BASE_ID];
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
import { renderProperties } from './properties';
import { renderSectionList } from './pages';
import { isPreviewSWReady, cacheFileInSW } from '../preview-sw-client';
import { debounceAutoSave } from '../draft';

// ── Iframe helper ──────────────────────────────────────────────────────
function getIframe(): HTMLIFrameElement | null {
  return document.getElementById('vis-iframe') as HTMLIFrameElement | null;
}

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

export function renderCanvas(afterLoad?: () => void): void {
  const iframe = getIframe();
  if (!iframe) return;

  dmSections = [];
  dmSelected = null;

  const page = visual.activePage;

  if (!page) {
    // No page — show a placeholder. Set onload=null BEFORE srcdoc.
    iframe.onload = null;
    iframe.removeAttribute('src');
    iframe.srcdoc = !state.connected
      ? buildNotConnectedPlaceholder()
      : `<!DOCTYPE html><html><body style="background:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#94a3b8"><p>No page selected</p></body></html>`;
    return;
  }

  if (page.blocks.length === 0) {
    renderRawPage(iframe, page.path, afterLoad);
  } else {
    // Block pages don't support inspect mode — reset silently
    if (inspectModeActive) setInspectMode(false);
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

  if (isPreviewSWReady()) {
    // SERVICE WORKER PATH — the SW serves every asset with correct MIME types.
    // The debounced cache update in code-editor.ts keeps the SW in sync as the
    // user types, so by the time they switch modes the cache is already current.
    showCodeEditBanner(!!codeTab); // show banner when code edits are active
    const previewUrl = `/preview/${pagePath}?_wb=${Date.now()}`;
    iframe.removeAttribute('srcdoc');
    iframe.onload = () => {
      injectEditingLayerIntoSW(iframe);
      afterLoad?.();
    };
    iframe.src = previewUrl;
  } else {
    // FALLBACK — SW not available; render via srcdoc with CSS inlining
    renderRawPageFallback(iframe, pagePath, codeTab?.content ?? '');
  }
}

function injectEditingLayerIntoSW(iframe: HTMLIFrameElement): void {
  // The SW serves the raw HTML; inject the editing layer into the live
  // contentDocument (same-origin: both main page and iframe are on localhost).
  // IMPORTANT: imports are sequential — CSS → toolbar → script — so that
  // the script can find the toolbar in the DOM when it initialises.
  const iDoc = iframe.contentDocument;
  if (!iDoc || iDoc.getElementById(WB_SCRIPT_ID)) return; // already injected

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

    // 2. Toolbar HTML — must be in DOM before the script runs
    if (!iDoc.getElementById('wb-toolbar')) {
      const tmp = iDoc.createElement('div');
      tmp.innerHTML = EDITING_TOOLBAR_HTML;
      const toolbar = tmp.firstElementChild;
      if (toolbar) iDoc.body.insertBefore(toolbar, iDoc.body.firstChild);
    }

    // 3. Editing script — runs last so toolbar is guaranteed to be present
    const rawJs = EDITING_SCRIPT
      .replace(/^\s*<script[^>]*>/i, '')
      .replace(/<\/script>\s*$/i, '');
    const script = iDoc.createElement('script');
    script.id = scriptId;
    script.textContent = rawJs;
    iDoc.body.appendChild(script);

    // 4. Re-apply inspect mode if it was active before the page reloaded
    if (inspectModeActive) {
      setTimeout(() => {
        if (iframe.contentDocument === iDoc) {
          iframe.contentWindow?.postMessage({ type: 'wb:setInspectMode', active: true }, '*');
        }
      }, 50);
    }
  });
}

function renderRawPageFallback(
  iframe: HTMLIFrameElement,
  pagePath: string,
  rawHtml: string,
): void {
  if (!rawHtml) {
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
  // Only generate the editing HTML when we actually need it (avoids a
  // redundant generation when the manual-edit branch returns early above).
  showCodeEditBanner(false);
  iframe.onload = () => {
    if (visual.selectedBlockId) {
      iframe.contentWindow?.postMessage({ type: 'wb:select', id: visual.selectedBlockId }, '*');
    }
    afterLoad?.();
  };
  iframe.removeAttribute('src');
  iframe.srcdoc = generateEditingPageHTML(page, visual.theme, visual.siteName, visual.siteDesc);
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

const LOADING_HTML = `<!DOCTYPE html><html><body style="background:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#64748b;gap:12px;flex-direction:column"><div style="width:24px;height:24px;border:2px solid rgba(255,255,255,.1);border-top-color:#6366f1;border-radius:50%;animation:spin .8s linear infinite"></div><span style="font-size:13px">Loading…</span><style>@keyframes spin{to{transform:rotate(360deg)}}</style></body></html>`;

function buildNotConnectedPlaceholder(): string {
  return `<!DOCTYPE html><html><body style="background:#0f172a;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#64748b;gap:16px;text-align:center;padding:40px"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"/></svg><p style="font-size:15px;font-weight:500;color:#475569">Connect a repository to start designing</p></body></html>`;
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
  renderProperties();
  document.querySelectorAll('.sl-item').forEach(el => {
    (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.blockId === id);
  });
}

export function deselectBlock(): void {
  visual.selectedBlockId = null;
  getIframe()?.contentWindow?.postMessage({ type: 'wb:deselect' }, '*');
  renderProperties();
  document.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
}

// ── Block mutations ────────────────────────────────────────────────────

export function addBlockAfter(afterId: string | null, type: string): void {
  if (!visual.activePage) return;
  import('./blocks').then(({ newBlock: nb }) => {
    const block = nb(type, visual.theme);
    const blocks = visual.activePage!.blocks;
    if (afterId === null) {
      blocks.push(block);
    } else {
      const idx = blocks.findIndex(b => b.id === afterId);
      // Guard: findIndex returns -1 if the id isn't found; fallback to appending.
      if (idx === -1) { blocks.push(block); } else { blocks.splice(idx + 1, 0, block); }
    }
    dropCodeTab(visual.activePage!.path);
    markDirty();
    // Pass selectBlock as a callback so it runs inside the onload handler,
    // which is set BEFORE src/srcdoc — no race condition.
    renderCanvas(() => selectBlock(block.id));
    renderSectionList();
  });
}

export function deleteBlock(id: string): void {
  if (!visual.activePage) return;
  if (!confirm('Delete this section?')) return;
  visual.activePage.blocks = visual.activePage.blocks.filter(b => b.id !== id);
  if (visual.selectedBlockId === id) {
    visual.selectedBlockId = null;
    renderProperties();
  }
  dropCodeTab(visual.activePage.path);
  markDirty();
  renderCanvas();
  renderSectionList();
}

export function moveBlock(id: string, dir: -1 | 1): void {
  if (!visual.activePage) return;
  const blocks = visual.activePage.blocks;
  const idx = blocks.findIndex(b => b.id === id);
  const target = idx + dir;
  if (target < 0 || target >= blocks.length) return;
  [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
  dropCodeTab(visual.activePage.path);
  markDirty();
  renderCanvas(() => selectBlock(id));
  renderSectionList();
}

export function duplicateBlock(id: string): void {
  if (!visual.activePage) return;
  const blocks = visual.activePage.blocks;
  const idx = blocks.findIndex(b => b.id === id);
  if (idx === -1) return;
  import('../utils').then(({ uid }) => {
    const src = blocks[idx];
    const dupe: Block = { ...src, id: uid(), content: { ...src.content }, settings: { ...src.settings } };
    blocks.splice(idx + 1, 0, dupe);
    dropCodeTab(visual.activePage!.path); // keep code tab in sync
    markDirty();
    renderCanvas(() => selectBlock(dupe.id));
    renderSectionList();
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

  const parts = key.split('.');
  if (parts.length === 2) {
    const bag = parts[0] === 'content' ? block.content : block.settings;
    bag[parts[1]] = value;
  }

  markDirty();
  rerenderBlock(blockId);

  if (key.startsWith('content.links') || key.startsWith('content.col')) {
    renderProperties();
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
  const btn = document.getElementById('vis-publish-btn') as HTMLButtonElement | null;
  const dirty = visual.dirty || visual.pages.some(p => p.dirty);
  btn?.classList.toggle('has-changes', dirty);
  const badge = document.getElementById('vis-dirty-badge');
  if (badge) {
    const dirtyCount = visual.pages.filter(p => p.dirty).length;
    badge.textContent = dirtyCount > 0 ? String(dirtyCount) : '';
  }
}

// ── postMessage listener ───────────────────────────────────────────────
let _msgHandler: ((e: MessageEvent) => void) | null = null;

export function initCanvasEvents(): void {
  if (_msgHandler) window.removeEventListener('message', _msgHandler);

  _msgHandler = (e: MessageEvent) => {
    const { data } = e;
    if (!data?.type) return;

    switch (data.type as string) {
      case 'wb:select':
        selectBlock(data.id as string);
        break;
      case 'wb:deselect':
        deselectBlock();
        break;
      case 'wb:textSave': {
        const blockId = data.blockId as string;
        const field   = data.field   as string;
        const value   = data.value   as string;
        const block = visual.activePage?.blocks.find(b => b.id === blockId);
        if (block && field) {
          block.content[field] = value;
          if (visual.activePage) dropCodeTab(visual.activePage.path);
          markDirty();
          renderSectionList();
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
          renderProperties(); // refresh char count in properties panel
        }
        break;
      }

      case 'wb:domStructure': {
        dmSections = data.sections as DomSection[];
        dmSelected = null;
        renderSectionList();
        renderProperties();
        break;
      }
      case 'wb:elementSelect': {
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
        renderProperties();
        renderSectionList();
        break;
      }
      case 'wb:elementHover': {
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
        break;
      }
    }
  };

  window.addEventListener('message', _msgHandler);
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
}

export function renderSectionPicker(): void {
  const grid = document.getElementById('picker-grid') as HTMLElement;
  if (!grid) return;
  grid.innerHTML = Object.entries(BLOCK_DEFS).map(([type, def]) => `
    <div class="picker-card" onclick="window._pickSection('${type}')">
      <div class="picker-thumb">${def.thumbnail}</div>
      <div class="picker-name">${def.name}</div>
      <div class="picker-cat">${def.category}</div>
    </div>
  `).join('');
}

// ── Expose globals ─────────────────────────────────────────────────────

export function exposeCanvasGlobals(): void {
  const w = window as unknown as Record<string, unknown>;
  w._moveBlock      = (id: string, dir: -1 | 1) => moveBlock(id, dir);
  w._duplicateBlock = (id: string) => duplicateBlock(id);
  w._deleteBlock    = (id: string) => deleteBlock(id);
  w._addBlockHere   = (afterId: string | null) => openSectionPicker(afterId);
  w._pickSection    = (type: string) => {
    addBlockAfter(visual.pendingInsertAfterId, type);
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
      renderProperties();
      renderSectionList();
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
