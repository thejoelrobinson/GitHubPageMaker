import * as monaco from 'monaco-editor';
import { state } from './state';
import { ghFetch, encodeBase64, decodeBase64 } from './github';
import { notify } from './ui/notifications';
import { setStatusSync, updateStatusLang, updateSaveButton } from './ui/status';
import { detectLanguage, escapeHtml, escapeAttr, fileIconSvg, cacheTreeShas } from './utils';
import { markUnsaved, debounceAutoSave } from './draft';
import { cacheFileInSW } from './preview-sw-client';
import type { Tab } from './types';

// ── Monaco setup ──────────────────────────────────────────────────────
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let suppressChange = false;

// Per-path debounced SW cache updates.
// Using a Map so typing in file A never cancels the pending update for file B.
const _swCacheTimers = new Map<string, ReturnType<typeof setTimeout>>();
function debouncedCacheSW(path: string, content: string): void {
  const prev = _swCacheTimers.get(path);
  if (prev !== undefined) clearTimeout(prev);
  _swCacheTimers.set(path, setTimeout(() => {
    _swCacheTimers.delete(path);
    cacheFileInSW(path, content);
  }, 500));
}
const treeOpenDirs = new Set<string>();

export function initMonaco(): void {
  editor = monaco.editor.create(document.getElementById('editor') as HTMLElement, {
    value: '',
    language: 'html',
    theme: 'vs-dark',
    fontSize: 14,
    fontFamily: "'Cascadia Code','Fira Code','Consolas','SF Mono',monospace",
    fontLigatures: true,
    lineHeight: 22,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    tabSize: 2,
    insertSpaces: true,
    automaticLayout: true,
    padding: { top: 8 },
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    renderLineHighlight: 'all',
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    suggest: { insertMode: 'replace' },
    quickSuggestions: { strings: true },
    'semanticHighlighting.enabled': true,
  });

  editor.onDidChangeModelContent(() => {
    if (suppressChange) return;
    if (!state.activeTab) return;
    const tab = state.openTabs.find(t => t.path === state.activeTab);
    if (tab && !tab.dirty) {
      tab.dirty = true;
      renderTabs();
      updateSaveButton(state.openTabs);
    }
    const activeTab = state.openTabs.find(t => t.path === state.activeTab);
    if (activeTab) {
      activeTab.content = editor!.getValue();
      // Keep the SW preview cache current so switching to Visual shows
      // the latest code immediately (eliminates the cache race condition).
      debouncedCacheSW(activeTab.path, activeTab.content);
    }
    // Update draft indicator — Monaco doesn't fire DOM `input` events
    markUnsaved();
    debounceAutoSave();
  });

  editor.onDidChangeCursorPosition(e => {
    const pos = document.getElementById('status-pos');
    if (pos) pos.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
  });

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    if (state.connected) openCommitModal();
  });
}

// ── Open a generated file from visual mode ────────────────────────────

export function openGeneratedFile(path: string, content: string): void {
  const existing = state.openTabs.find(t => t.path === path);
  if (existing) {
    // Only flag dirty if the generated HTML actually differs from what's already in the tab.
    // This avoids spurious dirty markers on Code→Visual→Code round-trips with no changes.
    if (existing.content !== content) {
      existing.content = content;
      existing.dirty = true;
    }
    activateTab(path);
  } else {
    const tab: Tab = { path, content, sha: state.fileShas[path] ?? '', dirty: true, language: detectLanguage(path) };
    state.openTabs.push(tab);
    activateTab(path);
  }
  updateSaveButton(state.openTabs);
}

// ── File tree ─────────────────────────────────────────────────────────

export function renderTree(): void {
  const container = document.getElementById('file-tree') as HTMLElement;
  if (!state.tree.length) {
    container.innerHTML = '<div class="tree-loading" id="tree-placeholder">Connect a GitHub repository to start editing.</div>';
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

type TreeNode = { type: 'file' | 'dir'; name: string; path: string; children?: TreeNode[] };

function renderNodes(container: HTMLElement, nodes: TreeNode[], depth: number, dirs: Map<string, { type: 'file'; name: string; path: string }[]>): void {
  nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  nodes.forEach(node => {
    const el = document.createElement('div');
    el.className = 'tree-item' + (state.activeTab === node.path ? ' selected' : '');
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
        const children = dirs.get(node.path) ?? [];
        renderNodes(container, children, depth + 1, dirs);
      }
    } else {
      el.innerHTML = `${fileIconSvg(node.name)}<span class="tree-item-name">${escapeHtml(node.name)}</span>`;
      el.onclick = () => openFile(node.path);
      container.appendChild(el);
    }
  });
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

// ── Open file ─────────────────────────────────────────────────────────

export async function openFile(path: string): Promise<void> {
  const existing = state.openTabs.find(t => t.path === path);
  if (existing) { activateTab(path); return; }

  setStatusSync('Loading...');
  try {
    const data = await ghFetch<{ content: string; sha: string }>(
      `/repos/${state.owner}/${state.repo}/contents/${encodeURIComponent(path)}?ref=${state.branch}`
    );
    const content = decodeBase64(data.content);
    const tab: Tab = { path, content, sha: data.sha, dirty: false, language: detectLanguage(path) };
    state.openTabs.push(tab);
    state.fileShas[path] = data.sha;
    activateTab(path);
    setStatusSync('Synced');
  } catch (e) {
    notify('Failed to open ' + path + ': ' + (e as Error).message, 'error');
    setStatusSync('Error');
  }
}

export function activateTab(path: string): void {
  state.activeTab = path;
  const tab = state.openTabs.find(t => t.path === path);
  if (!tab || !editor) return;

  suppressChange = true;
  let model = monaco.editor.getModels().find(m => m.uri.path === '/' + path);
  if (!model) {
    // First time opening this file — create a fresh model seeded with tab.content.
    model = monaco.editor.createModel(
      tab.content,
      tab.language,
      monaco.Uri.parse('inmemory://model/' + path)
    );
  } else {
    // Model already exists but may be stale: syncCodeTab / openGeneratedFile may
    // have updated tab.content since the model was last set.  Always sync the
    // model value so the editor shows what tab.content actually contains.
    if (model.getValue() !== tab.content) {
      model.setValue(tab.content);
    }
  }
  editor.setModel(model);
  suppressChange = false;

  const editorEl    = document.getElementById('editor') as HTMLElement;
  const welcomeEl   = document.getElementById('welcome') as HTMLElement;
  const breadcrumb  = document.getElementById('breadcrumb') as HTMLElement;
  editorEl.style.display   = 'block';
  welcomeEl.style.display  = 'none';
  breadcrumb.style.display = 'flex';

  updateBreadcrumb(path);
  updateStatusLang(tab.language);
  renderTabs();
  renderTree();
  updateSaveButton(state.openTabs);
}

function updateBreadcrumb(path: string): void {
  const bc = document.getElementById('breadcrumb') as HTMLElement;
  const parts = path.split('/');
  bc.innerHTML = parts.map((p, i) => {
    const isLast = i === parts.length - 1;
    return isLast
      ? `<span style="color:var(--text-primary)">${escapeHtml(p)}</span>`
      : `<span>${escapeHtml(p)}</span><span class="sep"> › </span>`;
  }).join('');
}

// ── Tabs ──────────────────────────────────────────────────────────────

export function renderTabs(): void {
  const bar = document.getElementById('tab-bar') as HTMLElement;
  bar.innerHTML = '';
  state.openTabs.forEach(tab => {
    const name = tab.path.split('/').pop() ?? tab.path;
    const div = document.createElement('div');
    div.className = 'tab' + (tab.path === state.activeTab ? ' active' : '') + (tab.dirty ? ' dirty' : '');
    div.innerHTML = `${fileIconSvg(name)}<span class="tab-name">${escapeHtml(name)}</span><span class="tab-dot"></span><button class="tab-close" title="Close"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg></button>`;
    div.onclick = () => activateTab(tab.path);
    div.querySelector('.tab-close')!.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab.path); });
    bar.appendChild(div);
  });
}

export function closeTab(path: string): void {
  const tab = state.openTabs.find(t => t.path === path);
  if (tab?.dirty && !confirm(`"${path.split('/').pop()}" has unsaved changes. Close anyway?`)) return;
  state.openTabs = state.openTabs.filter(t => t.path !== path);
  const model = monaco.editor.getModels().find(m => m.uri.path === '/' + path);
  model?.dispose();
  if (state.activeTab === path) {
    const last = state.openTabs[state.openTabs.length - 1];
    if (last) { activateTab(last.path); }
    else {
      state.activeTab = null;
      const edEl = document.getElementById('editor') as HTMLElement;
      const welEl = document.getElementById('welcome') as HTMLElement;
      const bcEl = document.getElementById('breadcrumb') as HTMLElement;
      edEl.style.display   = 'none';
      welEl.style.display  = 'flex';
      bcEl.style.display   = 'none';
    }
  }
  renderTabs();
  renderTree();
  updateSaveButton(state.openTabs);
}

// ── Commit / Push ─────────────────────────────────────────────────────

export function openCommitModal(): void {
  const dirty = state.openTabs.filter(t => t.dirty);
  if (!dirty.length) { notify('No unsaved changes to commit', 'warning'); return; }
  const list = document.getElementById('changed-files-list') as HTMLElement;
  list.innerHTML = dirty.map(t => `<div class="changed-file"><span class="cf-status">M</span><span class="cf-path">${escapeHtml(t.path)}</span></div>`).join('');
  (document.getElementById('commit-message') as HTMLInputElement).value = 'Update website content';
  document.getElementById('commit-modal')?.classList.remove('hidden');
}

export async function pushChanges(): Promise<void> {
  const message = (document.getElementById('commit-message') as HTMLInputElement).value.trim();
  if (!message) { notify('Please enter a commit message', 'warning'); return; }

  const dirty = state.openTabs.filter(t => t.dirty);
  const btn = document.getElementById('push-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Pushing...';
  setStatusSync('Pushing...');

  let pushed = 0;
  try {
    for (const tab of dirty) {
      try {
        const content = encodeBase64(tab.content);
        interface PushBody { message: string; content: string; branch: string; sha?: string; }
        const body: PushBody & object = {
          message: dirty.length === 1 ? message : `${message} (${tab.path.split('/').pop()})`,
          content,
          branch: state.branch,
        };
        if (tab.sha) body.sha = tab.sha;
        const res = await ghFetch<{ content: { sha: string } }>(
          `/repos/${state.owner}/${state.repo}/contents/${encodeURIComponent(tab.path)}`,
          { method: 'PUT', body }
        );
        tab.sha = (res.content as { sha: string }).sha;
        state.fileShas[tab.path] = tab.sha;
        tab.dirty = false;
        pushed++;
      } catch (e) {
        notify(`Failed to push ${tab.path}: ` + (e as Error).message, 'error');
      }
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Push to GitHub';
  }

  if (pushed > 0) {
    document.getElementById('commit-modal')?.classList.add('hidden');
    renderTabs();
    updateSaveButton(state.openTabs);
    notify(`Pushed ${pushed} file${pushed > 1 ? 's' : ''} — GitHub Pages is rebuilding`, 'success');
    setStatusSync('Pushed ✓');
  } else {
    setStatusSync('No changes');
  }
}

// ── Search ────────────────────────────────────────────────────────────

export function searchFiles(query: string): void {
  const container = document.getElementById('search-results') as HTMLElement;
  if (!query || query.length < 2) { container.innerHTML = ''; return; }
  if (!state.connected) { container.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">Connect a repo first</div>'; return; }

  const q = query.toLowerCase();
  const allMatches = state.tree.filter(f => f.path.toLowerCase().includes(q));
  const matches = allMatches.slice(0, 30);
  if (!matches.length) { container.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">No files match</div>'; return; }

  container.innerHTML = matches.map(f => {
    const parts = f.path.split('/');
    const name = parts.pop()!;
    const dir = parts.join('/');
    return `<div class="tree-item" style="height:auto;padding:5px 8px;flex-direction:column;align-items:flex-start;gap:1px;border-radius:3px;margin:1px 0" data-path="${escapeAttr(f.path)}">
      <div style="display:flex;align-items:center;gap:4px">${fileIconSvg(name)}<span style="color:var(--text-primary)">${escapeHtml(name)}</span></div>
      ${dir ? `<span style="color:var(--text-dim);font-size:11px;padding-left:20px">${escapeHtml(dir)}</span>` : ''}
    </div>`;
  }).join('');

  if (allMatches.length > 30) {
    container.innerHTML += `<div style="padding:6px 8px;font-size:11px;color:var(--text-dim)">…and ${allMatches.length - 30} more — type more characters to narrow</div>`;
  }

  container.querySelectorAll<HTMLElement>('[data-path]').forEach(el => {
    el.onclick = () => openFile(el.dataset.path!);
  });
}

// ── Pull ──────────────────────────────────────────────────────────────

export async function pullRepo(): Promise<void> {
  if (!state.connected) return;
  setStatusSync('Pulling...');
  try {
    const { fetchTree } = await import('./github');
    const { entries: treeEntries, truncated: treeT } = await fetchTree();
    state.tree = treeEntries.filter(f => f.type === 'blob');
    if (treeT) notify('File tree is incomplete — repo exceeds GitHub\'s limit. Some files may not appear.', 'warning');
    cacheTreeShas(state.tree, state.fileShas);
    renderTree();

    for (const tab of state.openTabs) {
      try {
        const data = await ghFetch<{ content: string; sha: string }>(
          `/repos/${state.owner}/${state.repo}/contents/${encodeURIComponent(tab.path)}?ref=${state.branch}`
        );
        tab.content = decodeBase64(data.content);
        tab.sha     = data.sha;
        tab.dirty   = false;
        state.fileShas[tab.path] = data.sha;
        if (tab.path === state.activeTab && editor) {
          suppressChange = true;
          editor.setValue(tab.content);
          suppressChange = false;
        }
      } catch (e) {
        // File may have been deleted or renamed — skip silently
        if (!(e as Error).message?.includes('404')) {
          console.warn(`Could not reload ${tab.path}:`, e);
        }
      }
    }

    renderTabs();
    updateSaveButton(state.openTabs);
    setStatusSync('Synced');
    notify('Pulled latest changes', 'success');
  } catch (e) {
    notify('Pull failed: ' + (e as Error).message, 'error');
    setStatusSync('Error');
  }
}
