import { state, visual, saveConfig, clearLocalDraft, resetVisualState } from './state';
import { configurePreviewSW, clearSWCache } from './preview-sw-client';
import { fetchTree, fetchBranches, getAuthenticatedUser, createRepo } from './github';
import { resetAssetCache } from './visual/asset-cache';
import { notify } from './ui/notifications';
import { setStatusSync } from './ui/status';
import { renderTree, flushSWCacheTimers } from './code-editor';
import { enterVisualMode } from './visual/index';
import { openModal, closeModal } from './modal';
import { cacheTreeShas } from './utils';
import { clearPreviewBlobUrls } from './file-preview';
import {
  syncRepoToCache, showSyncProgress, updateSyncProgress,
  hideSyncProgress, cancelSync, getSyncSignal,
} from './repo-cache';

// ── Repo sync (background) ─────────────────────────────────────────────

export function runBackgroundSync(): void {
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

// ── Shared helpers ─────────────────────────────────────────────────────

/** Maps common GitHub error codes to user-readable hints. */
function authHint(msg: string): string {
  if (/401|Bad credentials/i.test(msg)) return 'Invalid token — check your PAT has repo scope.';
  if (/404|Not Found/i.test(msg)) return 'Repository not found — check owner and repo name.';
  return msg;
}

function startBtnLoad(btn: HTMLButtonElement, label: string): void {
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> ${label}`;
}

function stopBtnLoad(btn: HTMLButtonElement, html: string): void {
  btn.disabled = false;
  btn.innerHTML = html;
}

// ── Connection ─────────────────────────────────────────────────────────

let connecting = false;

export async function connectRepo(): Promise<void> {
  if (connecting) return;

  const token  = (document.getElementById('input-token')  as HTMLInputElement).value.trim();
  const owner  = (document.getElementById('input-owner')  as HTMLInputElement).value.trim();
  const repo   = (document.getElementById('input-repo')   as HTMLInputElement).value.trim();
  const branch = (document.getElementById('input-branch') as HTMLInputElement).value.trim() || 'main';

  if (!token || !owner || !repo) { notify('Please fill in all fields', 'warning'); return; }

  const btn = document.getElementById('connect-btn') as HTMLButtonElement;
  startBtnLoad(btn, 'Connecting...');
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
    visual.pages      = [];
    visual.activePage = null;

    // Always enter visual mode after a fresh connection
    await enterVisualMode();

  } catch (e) {
    notify('Connection failed: ' + authHint((e as Error).message), 'error');
    setStatusSync('Connection failed');
  } finally {
    stopBtnLoad(btn, 'Connect');
    connecting = false;
  }
}

// ── Create new repo + connect ──────────────────────────────────────────

let creating = false;

export async function createAndConnectRepo(): Promise<void> {
  if (creating) return;

  const token  = (document.getElementById('input-token')    as HTMLInputElement).value.trim();
  const name   = (document.getElementById('input-new-repo') as HTMLInputElement).value.trim();
  const desc   = (document.getElementById('input-new-desc') as HTMLInputElement).value.trim();
  const priv   = (document.getElementById('input-new-private') as HTMLInputElement).checked;

  if (!token) { notify('Enter your Personal Access Token', 'warning'); return; }
  if (!name)  { notify('Enter a repository name', 'warning'); return; }
  if (!/^[\w.-]+$/.test(name)) { notify('Repo name can only use letters, numbers, - _ .', 'warning'); return; }

  const btn = document.getElementById('create-repo-btn') as HTMLButtonElement;
  startBtnLoad(btn, 'Creating\u2026');
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
    const hint = /422/.test(msg) ? `"${name}" already exists or the name is invalid.` : authHint(msg);
    notify('Create failed: ' + hint, 'error');
  } finally {
    stopBtnLoad(btn, 'Create &amp; Connect');
    creating = false;
  }
}

export async function loadBranches(): Promise<void> {
  try {
    state.branches = await fetchBranches();
  } catch (e) {
    console.warn('Failed to load branches:', e);
  }
}

// ── Welcome overlay ────────────────────────────────────────────────────

export function showWelcomeOverlay(opts?: { staleRepo?: string }): void {
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

export function hideWelcomeOverlay(): void {
  document.getElementById('welcome-overlay')?.classList.add('hidden');
}

// ── Connected UI helpers ───────────────────────────────────────────────

export function showConnectedUI(): void {
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

// ── Start locally (no GitHub required) ────────────────────────────────

/**
 * Enter the visual editor without a GitHub connection.
 * Pages live in localStorage as a draft until the user connects and publishes.
 */
export async function startLocally(mode: 'import' | 'template' | 'blank'): Promise<void> {
  hideWelcomeOverlay();
  await enterVisualMode();

  if (mode === 'import') {
    import('./visual/asset-wizard').then(m => m.openAssetWizard());
  } else if (mode === 'template') {
    import('./visual/templates').then(m => m.showTemplateGallery());
  }
  // 'blank' — default page already created by enterVisualMode; nothing extra needed
}

// ── Logout / disconnect ────────────────────────────────────────────────

export function openLogoutModal(): void {
  // Allow logout from local-only mode too — just confirm if there's unsaved work
  if (!state.connected) {
    if ((visual.dirty || visual.pages.some(p => p.dirty)) &&
        !confirm('You have unsaved local changes. Disconnect and lose them?')) return;
    void import('./visual/index').then(m => m.enterCodeMode?.());
    hideWelcomeOverlay();
    showWelcomeOverlay();
    return;
  }
  const hasDirty = state.openTabs.some(t => t.dirty) ||
                   visual.dirty ||
                   visual.pages.some(p => p.dirty);
  (document.getElementById('logout-unsaved-warning') as HTMLElement).style.display = hasDirty ? 'block' : 'none';
  (document.getElementById('logout-repo-name') as HTMLElement).textContent = `${state.owner}/${state.repo}`;
  openModal('logout-modal');
}

export function logout(): void {
  closeModal('logout-modal');

  // Cancel any in-flight background work
  cancelSync();
  flushSWCacheTimers();

  // Wipe all local caches and stored credentials
  clearSWCache();
  clearLocalDraft();
  resetAssetCache();
  clearPreviewBlobUrls();

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
  resetVisualState();

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

export function updateRepoLabel(): void {
  (document.getElementById('repo-label')       as HTMLElement).textContent = `${state.owner}/${state.repo}`;
  (document.getElementById('branch-label')     as HTMLElement).textContent = state.branch;
  (document.getElementById('status-branch-name') as HTMLElement).textContent = state.branch;
}

