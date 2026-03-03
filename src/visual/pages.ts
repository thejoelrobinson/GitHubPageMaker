import { visual, state } from '../state';
import { preCacheLinkedAssets } from './asset-cache';
import { newBlock } from './blocks';
import { renderCanvas, deselectBlock, updateVisualSaveBtn } from './canvas';
import { renderProperties } from './properties';
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
  if (visual.pages.length <= 1) { notify('Cannot delete the last page', 'warning'); return; }
  if (!confirm('Delete this page? This cannot be undone.')) return;
  visual.pages = visual.pages.filter(p => p.id !== id);
  if (visual.activePage?.id === id) {
    switchPage(visual.pages[0].id);
  }
  visual.dirty = true;
  updateVisualSaveBtn();
  renderPageList();
}

export function switchPage(id: string): void {
  deselectBlock();
  const page = visual.pages.find(p => p.id === id);
  if (!page) return;
  visual.activePage = page;
  visual.selectedBlockId = null;

  // Lazy-load the HTML for this page if it has no blocks and no code tab yet.
  // Handles pages beyond the first 5 preloaded by initFromExistingRepo().
  const needsLoad =
    page.blocks.length === 0 &&
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
        if (visual.activePage?.id === id) renderCanvas();
      })
      .catch(() => { /* file may not exist yet — canvas shows empty state */ });
  }

  renderPageList();
  renderCanvas();
  renderSectionList();
  renderProperties();
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

export function renderPageList(): void {
  const container = document.getElementById('vis-page-list') as HTMLElement;
  if (!container) return;

  container.innerHTML = visual.pages.map(p => `
    <div class="pl-item ${p.id === visual.activePage?.id ? 'active' : ''}" data-page-id="${p.id}" onclick="window._switchPage('${p.id}')">
      <span class="pl-icon">${p.isHome ? '🏠' : '📄'}</span>
      <span class="pl-title">${escapeHtml(p.title)}</span>
      ${p.dirty ? '<span class="pl-dirty" title="Unsaved changes">●</span>' : ''}
      <div class="pl-actions">
        <button onclick="event.stopPropagation();window._renamePage('${p.id}')" title="Rename" class="pp-icon-btn">
          <svg viewBox="0 0 16 16" fill="currentColor" width="11"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Z"/></svg>
        </button>
        ${!p.isHome ? `<button onclick="event.stopPropagation();window._deletePage('${p.id}')" title="Delete" class="pp-icon-btn danger">
          <svg viewBox="0 0 16 16" fill="currentColor" width="11"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.559a.75.75 0 1 0-1.492.142l.94 9.48A1.75 1.75 0 0 0 5.688 17.5h4.624a1.75 1.75 0 0 0 1.744-1.319l.94-9.48a.75.75 0 0 0-1.492-.142l-.94 9.48a.25.25 0 0 1-.249.188H5.688a.25.25 0 0 1-.249-.188l-.943-9.479Z"/></svg>
        </button>` : ''}
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
    // Design mode: populate from live DOM sections sent by the iframe
    import('./canvas').then(({ getDmSections, getDmSelected }) => {
      const sections = getDmSections();
      const selected = getDmSelected();
      if (!sections.length) {
        container.innerHTML = '<div class="sl-empty">Loading sections…</div>';
        return;
      }
      const trashSvg = `<svg viewBox="0 0 16 16" fill="currentColor" width="11"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.559a.75.75 0 1 0-1.492.142l.94 9.48A1.75 1.75 0 0 0 5.688 17.5h4.624a1.75 1.75 0 0 0 1.744-1.319l.94-9.48a.75.75 0 0 0-1.492-.142l-.94 9.48a.25.25 0 0 1-.249.188H5.688a.25.25 0 0 1-.249-.188l-.943-9.479Z"/></svg>`;
      container.innerHTML = sections.map((sec, i) => {
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
  updateVisualSaveBtn();
  notify(`Page "${title}" created`, 'success');
}

// ── Nav link helpers (called from index.ts exposeNavLinkGlobals) ──────

export function handleAddNavLink(blockId: string): void {
  const block = visual.activePage?.blocks.find(b => b.id === blockId);
  if (!block) return;
  (block.content.links as NavLink[]).push({ text: 'New Link', href: '#' });
  visual.dirty = true;
  if (visual.activePage) visual.activePage.dirty = true;
  updateVisualSaveBtn();
  import('./canvas').then(({ rerenderBlock: rb }) => rb(blockId));
  renderProperties();
}

export function handleRemoveNavLink(blockId: string, idx: number): void {
  const block = visual.activePage?.blocks.find(b => b.id === blockId);
  if (!block) return;
  (block.content.links as NavLink[]).splice(idx, 1);
  visual.dirty = true;
  if (visual.activePage) visual.activePage.dirty = true;
  updateVisualSaveBtn();
  import('./canvas').then(({ rerenderBlock: rb }) => rb(blockId));
  renderProperties();
}
