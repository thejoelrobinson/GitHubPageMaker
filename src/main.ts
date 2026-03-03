import './monaco-env'; // Must be first — sets MonacoEnvironment before any monaco import
import './styles.css';
import { state, visual, saveConfig, loadConfig, saveLastMode, loadLastMode, clearLocalDraft } from './state';
import {
  registerPreviewSW, configurePreviewSW, clearSWCache,
} from './preview-sw-client';
import { performLocalSave } from './draft';
import { revertToBlocks } from './visual/canvas';
import { switchSidebarPanel } from './visual/index';
import { fetchTree, fetchBranches, getAuthenticatedUser, createRepo } from './github';
import { resetAssetCache } from './visual/asset-cache';
import { notify } from './ui/notifications';
import { setStatusSync } from './ui/status';
import {
  initMonaco, renderTree, refreshTree,
  collapseAll, openCommitModal, pushChanges, searchFiles, pullRepo,
  flushSWCacheTimers,
} from './code-editor';
import {
  enterVisualMode, enterCodeMode,
  openVisualCommitModal, pushVisualChanges,
} from './visual/index';
import { openAddPageModal, confirmAddPage, showAddPageForm } from './visual/pages';
import { closeSectionPicker } from './visual/canvas';
import { escapeHtml, cacheTreeShas, debounce } from './utils';
import {
  syncRepoToCache, showSyncProgress, updateSyncProgress,
  hideSyncProgress, cancelSync, getSyncSignal,
} from './repo-cache';

// ── Repo sync (background) ────────────────────────────────────────────

function runBackgroundSync(): void {
  showSyncProgress();
  syncRepoToCache(
    state.owner, state.repo, state.branch,
    state.tree,
    updateSyncProgress,
    getSyncSignal(),
  ).then(stats => {
    hideSyncProgress();
    const changed = stats.added + stats.updated;
    if (changed > 0) notify(`Synced ${changed} file${changed === 1 ? '' : 's'} to local cache`, 'info');
  }).catch(err => {
    hideSyncProgress();
    if ((err as Error).name !== 'AbortError') {
      console.warn('[repo-cache] Sync failed:', err);
    }
  });
}

// ── Connection ────────────────────────────────────────────────────────

let connecting = false;

async function connectRepo(): Promise<void> {
  if (connecting) return;

  const token  = (document.getElementById('input-token')  as HTMLInputElement).value.trim();
  const owner  = (document.getElementById('input-owner')  as HTMLInputElement).value.trim();
  const repo   = (document.getElementById('input-repo')   as HTMLInputElement).value.trim();
  const branch = (document.getElementById('input-branch') as HTMLInputElement).value.trim() || 'main';

  if (!token || !owner || !repo) { notify('Please fill in all fields', 'warning'); return; }

  const btn = document.getElementById('connect-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Connecting...';
  connecting = true;

  // Clear stale asset state before connecting to a potentially different repo
  clearSWCache();
  resetAssetCache();
  state.token = token; state.owner = owner; state.repo = repo; state.branch = branch;
  state.fileShas = {};

  try {
    const { entries: treeEntries, truncated: treeT } = await fetchTree();
    state.tree = treeEntries.filter(f => f.type === 'blob');
    if (treeT) notify('File tree is incomplete — repo exceeds GitHub\'s limit. Some files may not appear.', 'warning');
    cacheTreeShas(state.tree, state.fileShas);
    state.connected = true;
    saveConfig();

    closeModal('settings-modal');
    hideWelcomeOverlay();
    showConnectedUI();
    notify(`Connected to ${owner}/${repo}`, 'success');

    // Clone/sync repo files to IndexedDB (non-blocking background task)
    runBackgroundSync();

    // Reset visual state so enterVisualMode triggers a fresh load from repo
    visual.pages       = [];
    visual.activePage  = null;

    // Always enter visual mode after a fresh connection
    await enterVisualMode();

  } catch (e) {
    const msg = (e as Error).message;
    const hint = /401|Bad credentials/i.test(msg)
      ? 'Invalid token — check your PAT has repo scope.'
      : /404|Not Found/i.test(msg)
        ? 'Repository not found — check owner and repo name.'
        : msg;
    notify('Connection failed: ' + hint, 'error');
    setStatusSync('Connection failed');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Connect';
    connecting = false;
  }
}

// ── Create new repo + connect ─────────────────────────────────────────

let creating = false;

async function createAndConnectRepo(): Promise<void> {
  if (creating) return;

  const token  = (document.getElementById('input-token')    as HTMLInputElement).value.trim();
  const name   = (document.getElementById('input-new-repo') as HTMLInputElement).value.trim();
  const desc   = (document.getElementById('input-new-desc') as HTMLInputElement).value.trim();
  const priv   = (document.getElementById('input-new-private') as HTMLInputElement).checked;

  if (!token) { notify('Enter your Personal Access Token', 'warning'); return; }
  if (!name)  { notify('Enter a repository name', 'warning'); return; }
  if (!/^[\w.-]+$/.test(name)) { notify('Repo name can only use letters, numbers, - _ .', 'warning'); return; }

  const btn = document.getElementById('create-repo-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating…';
  creating = true;

  state.token = token;

  try {
    const { login } = await getAuthenticatedUser();
    const { defaultBranch } = await createRepo(name, desc, priv);

    // Pre-fill the connect form so connectRepo() picks up the right values
    (document.getElementById('input-owner')  as HTMLInputElement).value = login;
    (document.getElementById('input-repo')   as HTMLInputElement).value = name;
    (document.getElementById('input-branch') as HTMLInputElement).value = defaultBranch;

    notify(`Repository "${login}/${name}" created! Connecting…`, 'success');
    await connectRepo();
  } catch (e) {
    const msg = (e as Error).message;
    const hint = /422/.test(msg)
      ? `"${name}" already exists or the name is invalid.`
      : /401|Bad credentials/i.test(msg)
        ? 'Invalid token — check your PAT has repo scope.'
        : msg;
    notify('Create failed: ' + hint, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Create &amp; Connect';
    creating = false;
  }
}

async function loadBranches(): Promise<void> {
  try {
    state.branches = await fetchBranches();
  } catch (e) {
    console.warn('Failed to load branches:', e);
  }
}

// ── Welcome overlay ───────────────────────────────────────────────────

function showWelcomeOverlay(opts?: { staleRepo?: string }): void {
  const overlay = document.getElementById('welcome-overlay')!;
  overlay.classList.remove('hidden');
  const hint     = document.getElementById('overlay-reconnect-hint')!;
  const repoSpan = document.getElementById('overlay-stale-repo')!;
  if (opts?.staleRepo) {
    repoSpan.textContent = opts.staleRepo;
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }
}

function hideWelcomeOverlay(): void {
  document.getElementById('welcome-overlay')?.classList.add('hidden');
}

// ── Connected UI helpers ──────────────────────────────────────────────

function showConnectedUI(): void {
  updateRepoLabel();
  renderTree();
  (document.getElementById('branch-badge')   as HTMLElement).style.display = 'flex';
  (document.getElementById('act-logout')     as HTMLElement).style.display = 'flex';
  (document.getElementById('vis-logout-btn') as HTMLElement | null)?.style.setProperty('display', 'flex');
  setStatusSync(`Connected to ${state.owner}/${state.repo}`);
  loadBranches();
  // Give the service worker the repo credentials so it can fetch assets on demand
  configurePreviewSW(state);
}

// ── Logout / disconnect ───────────────────────────────────────────────

function openLogoutModal(): void {
  if (!state.connected) return;
  const hasDirty = state.openTabs.some(t => t.dirty) ||
                   visual.dirty ||
                   visual.pages.some(p => p.dirty);
  (document.getElementById('logout-unsaved-warning') as HTMLElement).style.display = hasDirty ? 'block' : 'none';
  (document.getElementById('logout-repo-name') as HTMLElement).textContent = `${state.owner}/${state.repo}`;
  openModal('logout-modal');
}

function logout(): void {
  closeModal('logout-modal');

  // Cancel any in-flight background work
  cancelSync();
  flushSWCacheTimers();

  // Wipe all local caches and stored credentials
  clearSWCache();
  clearLocalDraft();
  resetAssetCache();

  // Reset app state
  state.token     = '';
  state.owner     = '';
  state.repo      = '';
  state.branch    = 'main';
  state.connected = false;
  state.tree      = [];
  state.openTabs  = [];
  state.activeTab = null;
  state.fileShas  = {};
  state.branches  = [];

  // Reset visual editor state
  visual.pages           = [];
  visual.activePage      = null;
  visual.selectedBlockId = null;
  visual.dirty           = false;
  visual.active          = false;
  visual.mode            = 'visual';

  // Persist cleared credentials so the app doesn't auto-connect on reload
  saveConfig();

  // Reset UI chrome
  (document.getElementById('repo-label')     as HTMLElement).textContent = 'Connect Repository';
  (document.getElementById('branch-badge')   as HTMLElement).style.display = 'none';
  (document.getElementById('act-logout')     as HTMLElement).style.display = 'none';
  (document.getElementById('vis-logout-btn') as HTMLElement | null)?.style.setProperty('display', 'none');
  // Restore activity bar (was hidden in visual mode) and reset toolbar groups
  (document.getElementById('activity-bar')        as HTMLElement).style.display = '';
  (document.getElementById('vis-mode-tools')      as HTMLElement).style.display = 'none';
  (document.getElementById('code-mode-tools')     as HTMLElement).style.display = 'none';
  (document.getElementById('vis-sidebar-footer')  as HTMLElement).style.display = 'none';
  document.getElementById('vis-area')?.classList.add('hidden');
  document.getElementById('code-area')?.classList.remove('hidden');

  setStatusSync('Disconnected');
  showWelcomeOverlay();
  notify('Disconnected — local data cleared', 'info');

  // Dispose Monaco models asynchronously — not critical for logout, just cleanup
  import('monaco-editor').then(({ default: monaco }) => {
    monaco.editor.getModels().forEach(m => m.dispose());
  }).catch(() => { /* ignore — models will be replaced on next connect */ });
}

function updateRepoLabel(): void {
  (document.getElementById('repo-label')       as HTMLElement).textContent = `${state.owner}/${state.repo}`;
  (document.getElementById('branch-label')     as HTMLElement).textContent = state.branch;
  (document.getElementById('status-branch-name') as HTMLElement).textContent = state.branch;
}

// ── Branch management ─────────────────────────────────────────────────

function openBranchPicker(): void {
  if (!state.connected) return;
  renderBranchList(state.branches);
  (document.getElementById('branch-search') as HTMLInputElement).value = '';
  openModal('branch-modal');
}

function renderBranchList(branches: string[]): void {
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

async function switchBranch(branch: string): Promise<void> {
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

// ── Modal helpers ─────────────────────────────────────────────────────

function openModal(id: string): void  { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id: string): void { document.getElementById(id)?.classList.add('hidden'); }

function switchModalTab(tab: 'connect' | 'create'): void {
  const isConnect = tab === 'connect';
  (document.getElementById('modal-connect-section') as HTMLElement).style.display = isConnect ? 'block' : 'none';
  (document.getElementById('modal-create-section')  as HTMLElement).style.display = isConnect ? 'none'  : 'block';
  document.getElementById('tab-connect')?.classList.toggle('active', isConnect);
  document.getElementById('tab-create')?.classList.toggle('active', !isConnect);
}

function openSettings(tab: 'connect' | 'create' = 'connect'): void {
  (document.getElementById('input-token')  as HTMLInputElement).value = state.token;
  (document.getElementById('input-owner')  as HTMLInputElement).value = state.owner;
  (document.getElementById('input-repo')   as HTMLInputElement).value = state.repo;
  (document.getElementById('input-branch') as HTMLInputElement).value = state.branch;
  switchModalTab(tab);
  openModal('settings-modal');
}

// ── Panel switching — delegates to the shared switchSidebarPanel ──────

function togglePanel(name: string): void {
  switchSidebarPanel(name as 'pages' | 'explorer' | 'search');
}

// ── Init ──────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  initMonaco();
  bindEventListeners();

  const cfg = loadConfig();
  if (cfg) {
    state.token  = cfg.token;
    state.owner  = cfg.owner;
    state.repo   = cfg.repo;
    state.branch = cfg.branch;
    try {
      const { entries: treeEntries, truncated: treeT } = await fetchTree();
      state.tree = treeEntries.filter(f => f.type === 'blob');
      if (treeT) notify('File tree is incomplete — repo exceeds GitHub\'s limit. Some files may not appear.', 'warning');
      cacheTreeShas(state.tree, state.fileShas);
      state.connected = true;
      showConnectedUI();
      hideWelcomeOverlay();

      // Background sync — only downloads files whose SHA changed since last session
      runBackgroundSync();

      const lastMode = loadLastMode();
      if (lastMode === 'code') {
        enterCodeMode();
      } else {
        await enterVisualMode();
      }
    } catch (e) {
      console.warn('Auto-connect failed:', e);
      showWelcomeOverlay({ staleRepo: `${cfg.owner}/${cfg.repo}` });
    }
  } else {
    showWelcomeOverlay();
  }
}

// ── Event listeners ───────────────────────────────────────────────────

function bindEventListeners(): void {
  // Settings
  document.getElementById('connect-btn')?.addEventListener('click', connectRepo);
  document.getElementById('create-repo-btn')?.addEventListener('click', createAndConnectRepo);
  document.getElementById('tab-connect')?.addEventListener('click', () => switchModalTab('connect'));
  document.getElementById('tab-create')?.addEventListener('click', () => switchModalTab('create'));
  document.getElementById('repo-select')?.addEventListener('click', () => openSettings());
  document.getElementById('overlay-connect-btn')?.addEventListener('click', () => openSettings('connect'));
  document.getElementById('overlay-create-btn')?.addEventListener('click', () => openSettings('create'));
  // welcome-connect-btn removed — welcome screen no longer has a connect button

  // Mode toggle — async because enterVisualMode may fetch from GitHub
  document.getElementById('mode-vis-btn')?.addEventListener('click', async () => {
    if (visual.mode !== 'visual') {
      await enterVisualMode();
      saveLastMode('visual');
    }
  });
  document.getElementById('mode-code-btn')?.addEventListener('click', () => {
    if (visual.mode !== 'code') {
      enterCodeMode();
      saveLastMode('code');
    }
  });

  // markUnsaved for code mode is wired in code-editor.ts via onDidChangeModelContent

  // Titlebar action buttons
  document.getElementById('pull-btn')?.addEventListener('click', pullRepo);
  document.getElementById('save-btn')?.addEventListener('click', openCommitModal);
  document.getElementById('code-save-btn')?.addEventListener('click', performLocalSave);
  document.getElementById('vis-save-btn')?.addEventListener('click', performLocalSave);
  document.getElementById('vis-publish-btn')?.addEventListener('click', openVisualCommitModal);
  document.getElementById('branch-badge')?.addEventListener('click', openBranchPicker);
  document.getElementById('status-branch')?.addEventListener('click', openBranchPicker);

  // Push/commit confirm
  document.getElementById('push-btn')?.addEventListener('click', pushChanges);
  document.getElementById('vis-push-btn')?.addEventListener('click', pushVisualChanges);
  document.getElementById('commit-message')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') pushChanges();
  });
  document.getElementById('vis-commit-msg')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') pushVisualChanges();
  });

  // File tree
  document.getElementById('btn-refresh-tree')?.addEventListener('click', refreshTree);
  document.getElementById('btn-collapse-tree')?.addEventListener('click', collapseAll);

  // Activity bar (code mode only)
  document.getElementById('act-explorer')?.addEventListener('click', () => togglePanel('explorer'));
  document.getElementById('act-search')?.addEventListener('click',   () => togglePanel('search'));
  document.getElementById('act-settings')?.addEventListener('click', () => openSettings());
  document.getElementById('act-logout')?.addEventListener('click', openLogoutModal);
  document.getElementById('confirm-logout-btn')?.addEventListener('click', logout);
  // Visual sidebar footer buttons (visual mode only — mirror the activity bar functions)
  document.getElementById('vis-settings-btn')?.addEventListener('click', () => openSettings());
  document.getElementById('vis-logout-btn')?.addEventListener('click', openLogoutModal);
  document.getElementById('vis-pages-tab')?.addEventListener('click', () => switchSidebarPanel('pages'));
  document.getElementById('vis-files-tab')?.addEventListener('click', () => switchSidebarPanel('explorer'));

  // Search — debounced
  const debouncedSearch = debounce((q: unknown) => searchFiles(q as string), 200);
  document.getElementById('search-input')?.addEventListener('input', e => {
    debouncedSearch((e.target as HTMLInputElement).value);
  });

  // Branch filter
  document.getElementById('branch-search')?.addEventListener('input', e => {
    const q = (e.target as HTMLInputElement).value.toLowerCase();
    renderBranchList(state.branches.filter(b => b.toLowerCase().includes(q)));
  });

  // Visual editor section/page management
  document.getElementById('vis-add-section-btn')?.addEventListener('click', () => {
    import('./visual/canvas').then(({ openSectionPicker }) => openSectionPicker(null));
  });
  document.getElementById('vis-add-page-btn')?.addEventListener('click', openAddPageModal);
  document.getElementById('btn-confirm-add-page')?.addEventListener('click', confirmAddPage);
  document.getElementById('btn-cancel-add-page')?.addEventListener('click', () => closeModal('add-page-modal'));
  document.getElementById('btn-add-page-blank')?.addEventListener('click', showAddPageForm);
  document.getElementById('btn-add-page-template')?.addEventListener('click', () => {
    closeModal('add-page-modal');
    import('./visual/index').then(({ switchSidebarPanel: _ }) => {});
    import('./visual/templates').then(({ showTemplateGallery }) => showTemplateGallery());
  });
  document.getElementById('btn-add-page-assets')?.addEventListener('click', () => {
    closeModal('add-page-modal');
    import('./visual/asset-wizard').then(({ openAssetWizard }) => openAssetWizard());
  });
  document.getElementById('btn-close-picker')?.addEventListener('click', closeSectionPicker);
  document.getElementById('btn-revert-to-blocks')?.addEventListener('click', () => {
    if (confirm('Discard all manual HTML edits to this page and restore the visual block editor?\n\nThis cannot be undone.')) {
      revertToBlocks();
    }
  });

  // File import
  document.getElementById('btn-import-files')?.addEventListener('click', () => {
    import('./file-import').then(m => m.openImportDialog());
  });
  document.getElementById('file-import-input')?.addEventListener('change', () => {
    import('./file-import').then(m => m.onFilesSelected());
  });
  document.getElementById('btn-confirm-import')?.addEventListener('click', () => {
    import('./file-import').then(m => m.confirmImport());
  });

  // Sync progress cancel
  document.getElementById('sync-progress-cancel')?.addEventListener('click', cancelSync);

  // Modal backdrops + data-modal-close buttons — single delegated listener
  document.addEventListener('click', e => {
    const target = e.target as HTMLElement;

    if (target.classList.contains('modal-backdrop')) {
      target.classList.add('hidden');
      return;
    }

    const closeBtn = target.closest('[data-modal-close]') as HTMLElement | null;
    if (closeBtn) {
      closeBtn.closest('.modal-backdrop')?.classList.add('hidden');
    }
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(el =>
        el.classList.add('hidden'),
      );
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      e.preventDefault();
      if (visual.mode === 'code') {
        togglePanel('search');
        setTimeout(() => (document.getElementById('search-input') as HTMLInputElement)?.focus(), 50);
      }
    }
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────
// Register the preview service worker first so it's active before the
// visual canvas tries to load any pages through /preview/*.
registerPreviewSW().then(() => init());
