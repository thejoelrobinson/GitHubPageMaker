import { state, visual } from './state';
import { notify } from './ui/notifications';
import { setStatusSync } from './ui/status';
import { escapeHtml, cacheTreeShas, fileIconSvg } from './utils';
import { isPreviewable, showSidebarPreview } from './file-preview';

// ── File tree ──────────────────────────────────────────────────────────

export const treeOpenDirs = new Set<string>();

type TreeNode = { type: 'file' | 'dir'; name: string; path: string; children?: TreeNode[] };

export function renderTree(): void {
  const container = document.getElementById('file-tree') as HTMLElement;
  if (!state.tree.length) {
    const msg = state.connected
      ? 'Loading…'
      : 'No repository connected. Files you create are saved as local drafts.';
    container.innerHTML = `<div class="tree-loading" id="tree-placeholder">${msg}</div>`;
    return;
  }
  const blobs = state.tree.filter(f => f.type === 'blob');

  // Build dir map
  const dirs = new Map<string, { type: 'file'; name: string; path: string }[]>();
  const roots: { type: 'file' | 'dir'; name: string; path: string; children?: unknown[] }[] = [];

  blobs.forEach(f => {
    const parts = f.path.split('/');
    if (parts.length === 1) {
      roots.push({ type: 'file', name: parts[0], path: f.path });
    } else {
      for (let i = 1; i < parts.length; i++) {
        const dp = parts.slice(0, i).join('/');
        if (!dirs.has(dp)) dirs.set(dp, []);
      }
      const dp = parts.slice(0, -1).join('/');
      dirs.get(dp)!.push({ type: 'file', name: parts[parts.length - 1], path: f.path });
    }
  });

  const rootDirs = new Set<string>();
  blobs.forEach(f => { const p = f.path.split('/'); if (p.length > 1) rootDirs.add(p[0]); });
  rootDirs.forEach(d => roots.push({ type: 'dir', name: d, path: d, children: dirs.get(d) ?? [] }));
  roots.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));

  container.innerHTML = '';
  renderNodes(container, roots as TreeNode[], 0, dirs);
}

function renderNodes(container: HTMLElement, nodes: TreeNode[], depth: number, dirs: Map<string, { type: 'file'; name: string; path: string }[]>): void {
  nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  nodes.forEach(node => {
    const el = document.createElement('div');
    el.className = 'tree-item' + (state.activeTab === node.path ? ' selected' : '');
    el.dataset.path = node.path;
    el.style.paddingLeft = `${depth * 12 + (node.type === 'file' ? 18 : 6)}px`;

    if (node.type === 'dir') {
      const isOpen = treeOpenDirs.has(node.path);
      el.innerHTML = `
        <span class="tree-item-chevron ${isOpen ? 'open' : ''}">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/></svg>
        </span>
        <svg class="tree-item-icon" viewBox="0 0 16 16" fill="${isOpen ? '#dcb67a' : '#c8a96e'}">
          ${isOpen ? '<path d="M.513 1.513A1.75 1.75 0 0 1 1.75 1h3.5c.55 0 1.07.26 1.4.7l.9 1.2a.25.25 0 0 0 .2.1H13.5A1.75 1.75 0 0 1 15.25 4.75v8.5A1.75 1.75 0 0 1 13.5 15h-11A1.75 1.75 0 0 1 .75 13.25V2.75c0-.464.184-.91.513-1.237Z"/>' : '<path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/>'}
        </svg>
        <span class="tree-item-name">${escapeHtml(node.name)}</span>`;
      el.onclick = (e) => {
        e.stopPropagation();
        if (treeOpenDirs.has(node.path)) treeOpenDirs.delete(node.path);
        else treeOpenDirs.add(node.path);
        renderTree();
      };
      container.appendChild(el);
      if (isOpen) {
        const fileChildren = (dirs.get(node.path) ?? []) as TreeNode[];
        // Find subdirectories that are immediate children of this directory
        const subDirs: TreeNode[] = [];
        for (const [dirPath] of dirs) {
          const parent = dirPath.slice(0, dirPath.lastIndexOf('/'));
          if (parent === node.path) {
            subDirs.push({ type: 'dir', name: dirPath.split('/').pop()!, path: dirPath });
          }
        }
        renderNodes(container, [...subDirs, ...fileChildren], depth + 1, dirs);
      }
    } else {
      const isNew = state.openTabs.some(t => t.path === node.path && t.isLocalImport && t.dirty);
      el.innerHTML = `${fileIconSvg(node.name)}<span class="tree-item-name">${escapeHtml(node.name)}</span>${isNew ? '<span class="tree-new-badge">new</span>' : ''}`;
      const mediaType = isPreviewable(node.path);
      if (mediaType === 'image' || mediaType === 'video') {
        el.draggable = true;
        el.addEventListener('dragstart', (ev) => {
          ev.dataTransfer!.setData('application/x-wb-asset', JSON.stringify({ path: node.path, type: mediaType }));
          ev.dataTransfer!.effectAllowed = 'copy';
        });
      }
      el.onclick = () => {
        showSidebarPreview(node.path);
        if (visual.mode !== 'visual') {
          // Dynamic import to avoid static cycle with code-editor.ts
          import('./code-editor').then(({ openFile }) => openFile(node.path));
        }
      };
      container.appendChild(el);
    }
  });
}

/** Lightweight selection update — toggles .selected on tree items
 *  without rebuilding the entire tree DOM. */
export function updateTreeSelection(): void {
  const container = document.getElementById('file-tree');
  if (!container) return;
  container.querySelectorAll<HTMLElement>('.tree-item.selected').forEach(el => el.classList.remove('selected'));
  if (state.activeTab) {
    container.querySelector<HTMLElement>(`.tree-item[data-path="${CSS.escape(state.activeTab)}"]`)?.classList.add('selected');
  }
}

export function collapseAll(): void {
  treeOpenDirs.clear();
  renderTree();
}

export async function refreshTree(): Promise<void> {
  if (!state.connected) return;
  setStatusSync('Refreshing...');
  try {
    const { fetchTree } = await import('./github');
    const { entries: treeEntries, truncated: treeT } = await fetchTree();
    state.tree = treeEntries.filter(f => f.type === 'blob');
    if (treeT) notify('File tree is incomplete — repo exceeds GitHub\'s limit. Some files may not appear.', 'warning');
    cacheTreeShas(state.tree, state.fileShas);
    renderTree();
    notify('File tree refreshed', 'success');
    setStatusSync('Synced');
  } catch (e) { notify('Refresh failed: ' + (e as Error).message, 'error'); }
}
