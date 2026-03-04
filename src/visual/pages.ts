import { visual, state, markVisualDirty } from '../state';
import { preCacheLinkedAssets } from './asset-cache';
import { newBlock } from './blocks';
import { coordinator } from './visual-coordinator';
import { notify } from '../ui/notifications';
import { BLOCK_DEFS } from './blocks';
import { pageUid, titleToPath, escapeHtml } from '../utils';
import type { Page, NavLink } from '../types';

// ── Page management ────────────────────────────────────────────────────

export function createDefaultPage(): Page {
  const id = pageUid();
  const theme = visual.theme;
  return {
    id,
    path: 'index.html',
    title: 'Home',
    isHome: true,
    description: '',
    dirty: true,
    blocks: [
      newBlock('nav',      theme),
      newBlock('hero',     theme),
      newBlock('features', theme),
      newBlock('cta',      theme),
      newBlock('footer',   theme),
    ],
  };
}

export function addPage(title: string, path: string): Page {
  const id = pageUid();
  const theme = visual.theme;
  const page: Page = {
    id,
    path,
    title,
    isHome: false,
    description: '',
    dirty: true,
    blocks: [
      newBlock('nav',    theme),
      newBlock('hero',   theme),
      newBlock('footer', theme),
    ],
  };
  visual.pages.push(page);
  visual.dirty = true;
  renderPageList();
  return page;
}

/** Create a page with NO default blocks — used by the asset wizard so it can
 *  populate the page entirely from generated/extracted block data. */
export function addEmptyPage(title: string, path: string): Page {
  const id = pageUid();
  const page: Page = {
    id,
    path,
    title,
    isHome: false,
    description: '',
    dirty: true,
    blocks: [],
  };
  visual.pages.push(page);
  visual.dirty = true;
  renderPageList();
  return page;
}

export function deletePage(id: string): void {
  const page = visual.pages.find(p => p.id === id);
  if (!page) return;
  const isLast = visual.pages.length === 1;
  const msg = isLast
    ? `Delete "${page.title}"? This is your last page — the site will be empty until you add a new one.`
    : `Delete "${page.title}"? This cannot be undone.`;
  if (!confirm(msg)) return;
  const wasHome = page.isHome;
  visual.pages = visual.pages.filter(p => p.id !== id);
  if (visual.pages.length === 0) {
    visual.activePage = null;
    visual.selectedBlockId = null;
  } else {
    if (wasHome) visual.pages[0].isHome = true;
    if (visual.activePage?.id === id) switchPage(visual.pages[0].id);
  }
  markVisualDirty();
  coordinator.updateVisualSaveBtn?.();
  coordinator.renderCanvas?.();
  renderPageList();
  coordinator.renderSectionList?.();
}

export function switchPage(id: string): void {
  coordinator.deselectBlock?.();
  const page = visual.pages.find(p => p.id === id);
  if (!page) return;
  visual.activePage = page;
  visual.selectedBlockId = null;

  // Lazy-load the HTML for this page if it has no blocks and no code tab yet.
  // Handles pages beyond the first 5 preloaded by initFromExistingRepo().
  // Skip for rawHtml pages (AI-generated) — they haven't been pushed to GitHub yet.
  const needsLoad =
    page.blocks.length === 0 &&
    !page.rawHtml &&
    state.connected &&
    !state.openTabs.find(t => t.path === page.path);

  if (needsLoad) {
    import('../github')
      .then(({ readFile }) => readFile(page.path))
      .then(async file => {
        if (!state.openTabs.find(t => t.path === page.path)) {
          state.openTabs.push({
            path: page.path, content: file.content,
            sha: file.sha, dirty: false, language: 'html',
          });
          state.fileShas[page.path] = file.sha;
        }
        // Pre-cache linked CSS/JS/images BEFORE setting iframe.src so the SW
        // has them ready when the browser requests subresources.
        await preCacheLinkedAssets(page.path, file.content).catch(err =>
          console.warn('[asset-cache] Pre-cache failed for', page.path, err),
        );
        // Re-cache the page HTML itself (for code-mode edits made since load)
        import('../preview-sw-client').then(({ cacheFileInSW }) =>
          cacheFileInSW(page.path, file.content),
        );
        if (visual.activePage?.id === id) coordinator.renderCanvas?.();
      })
      .catch(() => { /* file may not exist yet — canvas shows empty state */ });
  }

  renderPageList();
  coordinator.renderCanvas?.();
  renderSectionList();
  coordinator.renderProperties?.();
  // Update section list header to show which page sections belong to
  const sectionPageLabel = document.getElementById('vis-section-page-label');
  if (sectionPageLabel) sectionPageLabel.textContent = page.title;
}

export function renamePage(id: string): void {
  const page = visual.pages.find(p => p.id === id);
  if (!page) return;
  const newTitle = prompt('Rename page:', page.title);
  if (!newTitle?.trim()) return;
  const oldTitle = page.title;
  page.title = newTitle.trim();
  if (!page.isHome) {
    // Only auto-regenerate the path if it still matches the old auto-generated path.
    // If the user previously set a custom path, leave it untouched.
    if (page.path === titleToPath(oldTitle, false)) {
      page.path = titleToPath(page.title, false);
    }
  }
  visual.dirty = true;
  renderPageList();
  renderSectionList();
  const sectionPageLabel = document.getElementById('vis-section-page-label');
  if (sectionPageLabel && visual.activePage?.id === id) sectionPageLabel.textContent = page.title;
}

// ── Render page list ──────────────────────────────────────────────────

// SVG icons shared across page action strip
const ICON_BLANK    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>`;
const ICON_TEMPLATE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"/></svg>`;
const ICON_ASSETS   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15M9 12l3 3m0 0 3-3m-3 3V2.25"/></svg>`;

/** Renders the 3-card strip into #vis-page-actions (separate from the scrollable list). */
function renderPageActions(): void {
  const strip = document.getElementById('vis-page-actions');
  if (!strip) return;
  const activePage = visual.activePage;
  const assetTarget = activePage ? `'${activePage.id}'` : '';
  const templateTitle  = activePage ? `Apply template to "${escapeHtml(activePage.title)}"` : 'Pick a template';
  const assetsTitle    = activePage ? `Rebuild "${escapeHtml(activePage.title)}" from assets` : 'Build page from files';
  strip.innerHTML = `
    <div class="page-method-picker page-method-picker--sm">
      <button class="pmp-card" onclick="window._showAddPageForm()" title="Create a new blank page">
        <div class="pmp-icon">${ICON_BLANK}</div>
        <div class="pmp-name">Blank</div>
      </button>
      <button class="pmp-card" onclick="window._showTemplateGallery()" title="${templateTitle}">
        <div class="pmp-icon">${ICON_TEMPLATE}</div>
        <div class="pmp-name">Template</div>
      </button>
      <button class="pmp-card pmp-card--ai" onclick="window._openAssetWizard(${assetTarget})" title="${assetsTitle}">
        <div class="pmp-badge">AUTO</div>
        <div class="pmp-icon">${ICON_ASSETS}</div>
        <div class="pmp-name">Assets</div>
      </button>
    </div>`;
}

export function renderPageList(): void {
  const container = document.getElementById('vis-page-list') as HTMLElement;
  if (!container) return;

  renderPageActions();

  if (!visual.pages.length) {
    container.innerHTML = `<div class="pl-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" width="28" height="28" style="opacity:.3;margin-bottom:4px"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
      <span style="font-weight:600;color:var(--text-secondary);font-size:12px">No pages yet</span>
      <span style="font-size:11px">Add a page to start building</span>
    </div>`;
    return;
  }

  container.innerHTML = visual.pages.map(p => `
    <div class="pl-item ${p.id === visual.activePage?.id ? 'active' : ''}" data-page-id="${p.id}" onclick="window._switchPage('${p.id}')">
      <span class="pl-icon">${p.isHome ? '🏠' : '📄'}</span>
      <span class="pl-title">${escapeHtml(p.title)}</span>
      ${p.dirty ? '<span class="pl-dirty" title="Unsaved changes">●</span>' : ''}
      <div class="pl-actions">
        <button onclick="event.stopPropagation();window._renamePage('${p.id}')" title="Rename" class="pp-icon-btn">
          <svg viewBox="0 0 16 16" fill="currentColor" width="11"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Z"/></svg>
        </button>
        <button onclick="event.stopPropagation();window._deletePage('${p.id}')" title="Delete" class="pp-icon-btn danger">
          <svg viewBox="0 0 16 16" fill="currentColor" width="11"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.559a.75.75 0 1 0-1.492.142l.94 9.48A1.75 1.75 0 0 0 5.688 17.5h4.624a1.75 1.75 0 0 0 1.744-1.319l.94-9.48a.75.75 0 0 0-1.492-.142l-.94 9.48a.25.25 0 0 1-.249.188H5.688a.25.25 0 0 1-.249-.188l-.943-9.479Z"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

// ── Render section list ───────────────────────────────────────────────

function initSectionListDnD(container: HTMLElement): void {
  // Event delegation: listeners live on the container, not individual items.
  // Guard against re-registering on the same container element every render.
  if (container.dataset.dndInit === '1') return;
  container.dataset.dndInit = '1';

  let dragSel: string | null = null;
  let dropInfo: { sel: string; pos: 'before' | 'after' } | null = null;

  function cleanup(): void {
    container.querySelectorAll('.dm-section-item').forEach(i => {
      i.classList.remove('sl-dragging', 'sl-drop-above', 'sl-drop-below');
    });
    dragSel = null;
    dropInfo = null;
  }

  container.addEventListener('dragstart', (e: Event) => {
    const de = e as DragEvent;
    const item = (de.target as HTMLElement).closest<HTMLElement>('.dm-section-item');
    if (!item) return;
    dragSel = item.dataset.selector ?? null;
    item.classList.add('sl-dragging');
    de.dataTransfer!.effectAllowed = 'move';
  });

  container.addEventListener('dragover', (e: Event) => {
    e.preventDefault();
    const de = e as DragEvent;
    const item = (de.target as HTMLElement).closest<HTMLElement>('.dm-section-item');
    container.querySelectorAll('.dm-section-item').forEach(i => {
      i.classList.remove('sl-drop-above', 'sl-drop-below');
    });
    if (!item || item.dataset.selector === dragSel) return;
    const rect = item.getBoundingClientRect();
    const pos: 'before' | 'after' = de.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    item.classList.add(pos === 'before' ? 'sl-drop-above' : 'sl-drop-below');
    dropInfo = { sel: item.dataset.selector!, pos };
  });

  container.addEventListener('dragleave', (e: Event) => {
    // Only clear if leaving the container entirely
    if (!(container as Node).contains((e as DragEvent).relatedTarget as Node)) {
      container.querySelectorAll('.dm-section-item').forEach(i => {
        i.classList.remove('sl-drop-above', 'sl-drop-below');
      });
      dropInfo = null;
    }
  });

  container.addEventListener('drop', (e: Event) => {
    e.preventDefault();
    if (dragSel && dropInfo && dragSel !== dropInfo.sel) {
      const from = dragSel;
      const to   = dropInfo.sel;
      const pos  = dropInfo.pos;
      import('./canvas').then(({ dmReorderSection }) => dmReorderSection(from, to, pos));
    }
    cleanup();
  });

  container.addEventListener('dragend', cleanup);
}

function getSectionIcon(tag: string): string {
  const icons: Record<string, string> = {
    nav: '🧭', header: '🏠', footer: '🔗', main: '📄',
    section: '▪', aside: '📌', article: '📝', div: '▫', form: '📋',
  };
  return icons[tag] ?? '◻';
}

export function renderSectionList(): void {
  const container = document.getElementById('vis-section-list') as HTMLElement;
  if (!container) return;

  const page = visual.activePage;
  if (!page) { container.innerHTML = '<div class="sl-empty">No page selected</div>'; return; }
  if (!page.blocks.length) {
    // Design mode: always show the convert banner above the section list
    const convertBanner = `<div class="sl-convert-banner">
      <span>Design Mode — raw HTML</span>
      <button onclick="window._convertPageToBlocks()" class="btn-convert-blocks">Convert to editable blocks</button>
    </div>`;

    // Design mode: populate from live DOM sections sent by the iframe
    import('./canvas').then(({ getDmSections, getDmSelected }) => {
      const sections = getDmSections();
      const selected = getDmSelected();
      if (!sections.length) {
        container.innerHTML = convertBanner + '<div class="sl-empty">Loading sections…</div>';
        return;
      }
      const trashSvg = `<svg viewBox="0 0 16 16" fill="currentColor" width="11"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.559a.75.75 0 1 0-1.492.142l.94 9.48A1.75 1.75 0 0 0 5.688 17.5h4.624a1.75 1.75 0 0 0 1.744-1.319l.94-9.48a.75.75 0 0 0-1.492-.142l-.94 9.48a.25.25 0 0 1-.249.188H5.688a.25.25 0 0 1-.249-.188l-.943-9.479Z"/></svg>`;
      container.innerHTML = convertBanner + sections.map((sec, i) => {
        const isActive = selected?.sectionIndex === sec.index;
        const esc = escapeHtml(sec.selector);
        return `<div class="sl-item${isActive ? ' active' : ''} dm-section-item"
                     data-selector="${esc}"
                     data-index="${sec.index}"
                     draggable="true"
                     onclick="window._selectSectionFromList('${esc}')"
                     onmouseenter="window._hoverDmSection('${esc}')"
                     onmouseleave="window._unhoverDmSection()">
          <span class="sl-drag-handle" title="Drag to reorder">⠿</span>
          <span style="flex-shrink:0;font-size:13px">${getSectionIcon(sec.tag)}</span>
          <div style="flex:1;min-width:0">
            <div class="sl-name">${escapeHtml(sec.label)}</div>
            <div style="font-size:10px;color:var(--text-dim);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc}</div>
          </div>
          <div class="sl-dm-controls">
            <button class="pp-icon-btn sl-delete-btn" title="Delete section" onclick="event.stopPropagation();window._deleteDmSection('${esc}')">${trashSvg}</button>
            <button class="pp-icon-btn" ${i === 0 ? 'disabled' : ''} title="Move up" onclick="event.stopPropagation();window._moveDmSection('${esc}','up')">↑</button>
            <button class="pp-icon-btn" ${i === sections.length - 1 ? 'disabled' : ''} title="Move down" onclick="event.stopPropagation();window._moveDmSection('${esc}','down')">↓</button>
          </div>
        </div>`;
      }).join('');
      initSectionListDnD(container);
    });
    return;
  }

  container.innerHTML = page.blocks.map(block => {
    const def = BLOCK_DEFS[block.type];
    const isSelected = block.id === visual.selectedBlockId;
    return `<div class="sl-item ${isSelected ? 'active' : ''}" data-block-id="${block.id}" onclick="window._selectBlockFromList('${block.id}')">
      <svg class="sl-drag" viewBox="0 0 16 16" fill="currentColor" width="12"><circle cx="5" cy="4" r="1.25"/><circle cx="11" cy="4" r="1.25"/><circle cx="5" cy="8" r="1.25"/><circle cx="11" cy="8" r="1.25"/><circle cx="5" cy="12" r="1.25"/><circle cx="11" cy="12" r="1.25"/></svg>
      <span class="sl-name">${def?.name ?? block.type}</span>
    </div>`;
  }).join('');
}

// ── Open add page dialog ──────────────────────────────────────────────

export function openAddPageModal(): void {
  // Show the picker view; hide the blank-page form sub-view
  const picker = document.getElementById('add-page-picker');
  const form   = document.getElementById('add-page-form');
  if (picker) picker.style.display = 'block';
  if (form)   form.style.display   = 'none';
  document.getElementById('add-page-modal')?.classList.remove('hidden');
}

/** Switch add-page modal to the blank-page title/path form. */
export function showAddPageForm(): void {
  const picker = document.getElementById('add-page-picker');
  const form   = document.getElementById('add-page-form');
  if (picker) picker.style.display = 'none';
  if (form)   form.style.display   = 'block';

  const titleInput = document.getElementById('new-page-title') as HTMLInputElement | null;
  const pathInput  = document.getElementById('new-page-path')  as HTMLInputElement | null;
  if (titleInput) { titleInput.value = ''; titleInput.focus(); }
  if (pathInput) pathInput.value = '';

  // oninput assignment avoids listener accumulation across multiple modal opens
  if (titleInput && pathInput) {
    const pi = pathInput;
    titleInput.oninput = (e: Event) => {
      pi.value = titleToPath((e.target as HTMLInputElement).value, false);
    };
  }
}

export function confirmAddPage(): void {
  const title = (document.getElementById('new-page-title') as HTMLInputElement | null)?.value.trim();
  const path  = (document.getElementById('new-page-path')  as HTMLInputElement | null)?.value.trim();
  if (!title || !path) { notify('Please enter a page title and path', 'warning'); return; }

  const page = addPage(title, path);
  document.getElementById('add-page-modal')?.classList.add('hidden');
  switchPage(page.id);
  coordinator.updateVisualSaveBtn?.();
  notify(`Page "${title}" created`, 'success');
}

// ── Nav link helpers (called from index.ts exposeNavLinkGlobals) ──────

export function handleAddNavLink(blockId: string): void {
  const block = visual.activePage?.blocks.find(b => b.id === blockId);
  if (!block) return;
  (block.content.links as NavLink[]).push({ text: 'New Link', href: '#' });
  markVisualDirty();
  coordinator.updateVisualSaveBtn?.();
  import('./canvas').then(({ rerenderBlock: rb }) => rb(blockId));
  coordinator.renderProperties?.();
}

export function handleRemoveNavLink(blockId: string, idx: number): void {
  const block = visual.activePage?.blocks.find(b => b.id === blockId);
  if (!block) return;
  (block.content.links as NavLink[]).splice(idx, 1);
  markVisualDirty();
  coordinator.updateVisualSaveBtn?.();
  import('./canvas').then(({ rerenderBlock: rb }) => rb(blockId));
  coordinator.renderProperties?.();
}
