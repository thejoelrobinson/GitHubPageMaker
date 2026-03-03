import { state, visual, saveConfig } from './state';
import { fetchTree } from './github';
import { renderTree, flushSWCacheTimers } from './code-editor';
import { clearSWCache } from './preview-sw-client';
import { resetAssetCache } from './visual/asset-cache';
import { enterVisualMode } from './visual/index';
import { notify } from './ui/notifications';
import { escapeHtml, cacheTreeShas } from './utils';
import { openModal, closeModal } from './modal';
import { runBackgroundSync, updateRepoLabel } from './connection';

// ── Branch management ──────────────────────────────────────────────────

export function openBranchPicker(): void {
  if (!state.connected) return;
  renderBranchList(state.branches);
  (document.getElementById('branch-search') as HTMLInputElement).value = '';
  openModal('branch-modal');
}

export function renderBranchList(branches: string[]): void {
  const list = document.getElementById('branch-list') as HTMLElement;
  list.innerHTML = branches.map(b => `
    <div class="tree-item ${b === state.branch ? 'selected' : ''}"
         style="padding:6px 12px;height:auto;border-radius:4px;margin:2px 0"
         data-branch="${escapeHtml(b)}">
      <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"
           style="margin-right:6px;flex-shrink:0">
        <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Z"/>
      </svg>
      ${escapeHtml(b)}
      ${b === state.branch
        ? `<svg viewBox="0 0 16 16" fill="#4ec9b0" width="12" height="12" style="margin-left:auto">
             <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>
           </svg>`
        : ''}
    </div>`).join('') ||
    '<div style="padding:12px;color:var(--text-secondary);font-size:12px">No branches found</div>';

  list.querySelectorAll<HTMLElement>('[data-branch]').forEach(el => {
    el.onclick = () => switchBranch(el.dataset.branch!);
  });
}

let switchingBranch = false;

export async function switchBranch(branch: string): Promise<void> {
  if (branch === state.branch) { closeModal('branch-modal'); return; }
  if (switchingBranch) return;
  if (state.openTabs.some(t => t.dirty) && !confirm('You have unsaved changes. Switch branch anyway?')) return;

  switchingBranch = true;
  state.branch    = branch;
  state.openTabs  = [];
  state.activeTab = null;
  state.fileShas  = {};
  flushSWCacheTimers(); // cancel pending debounced writes before wiping the cache
  clearSWCache();    // wipe cached files from the previous branch
  resetAssetCache(); // reset the content-fetched tracker so cacheEntireRepoTree re-fetches

  const { default: monaco } = await import('monaco-editor');
  monaco.editor.getModels().forEach(m => m.dispose());

  (document.getElementById('editor')!     as HTMLElement).style.display = 'none';
  (document.getElementById('welcome')!    as HTMLElement).style.display = 'flex';
  (document.getElementById('breadcrumb')! as HTMLElement).style.display = 'none';

  closeModal('branch-modal');
  updateRepoLabel();
  saveConfig();

  try {
    const { entries: treeEntries, truncated: treeT } = await fetchTree();
    state.tree = treeEntries.filter(f => f.type === 'blob');
    if (treeT) notify('File tree is incomplete — repo exceeds GitHub\'s limit. Some files may not appear.', 'warning');
    cacheTreeShas(state.tree, state.fileShas);
    renderTree();
    notify(`Switched to "${branch}"`, 'success');

    // Sync new branch files to cache
    runBackgroundSync();

    // Reload visual state for the new branch if in visual mode
    if (visual.mode === 'visual') {
      visual.pages      = [];
      visual.activePage = null;
      await enterVisualMode();
    }
  } catch (e) {
    notify('Failed to load branch: ' + (e as Error).message, 'error');
  } finally {
    switchingBranch = false;
  }
}
