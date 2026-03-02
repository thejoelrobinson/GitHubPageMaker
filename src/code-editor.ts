import * as monaco from 'monaco-editor';
import { state, visual } from './state';
import { ghFetch, encodeBase64, decodeBase64, encodeRepoPath } from './github';
import { notify } from './ui/notifications';
import { setStatusSync, updateStatusLang, updateSaveButton } from './ui/status';
import { detectLanguage, escapeHtml, escapeAttr, fileIconSvg, cacheTreeShas } from './utils';
import { markUnsaved, debounceAutoSave } from './draft';
import { cacheFileInSW } from './preview-sw-client';
import type { Tab } from './types';

// ── Previewable file detection ────────────────────────────────────────
const PREVIEW_IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','svg','webp','ico','avif','bmp']);
const PREVIEW_VIDEO_EXTS = new Set(['mp4','webm','ogv','mov']);
const PREVIEW_AUDIO_EXTS = new Set(['mp3','wav','ogg','flac','m4a']);

/** Returns 'image', 'video', 'audio', or null */
export function isPreviewable(path: string): 'image' | 'video' | 'audio' | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (PREVIEW_IMAGE_EXTS.has(ext)) return 'image';
  if (PREVIEW_VIDEO_EXTS.has(ext)) return 'video';
  if (PREVIEW_AUDIO_EXTS.has(ext)) return 'audio';
  return null;
}

const PREVIEW_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon',
  avif: 'image/avif', bmp: 'image/bmp',
  mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4',
};

/** Track blob URLs so we can revoke old ones and avoid leaks. */
const _previewBlobUrls = new Map<string, string>();

/** Dedup in-flight blob loads — prevents concurrent loads for the same path
 *  from revoking each other's blob URLs mid-load. */
const _previewLoading = new Map<string, Promise<string>>();

/**
 * Load a binary file from IDB cache or GitHub API and return a blob: URL
 * suitable for <img>/<video>/<audio> src in the main page.
 * Deduplicates concurrent calls for the same path.
 */
export async function loadPreviewBlobUrl(path: string): Promise<string> {
  const inflight = _previewLoading.get(path);
  if (inflight) return inflight;

  const promise = _loadPreviewBlobUrlInner(path).finally(() => {
    _previewLoading.delete(path);
  });
  _previewLoading.set(path, promise);
  return promise;
}

async function _loadPreviewBlobUrlInner(path: string): Promise<string> {
  // Revoke previous blob URL for this path
  const prev = _previewBlobUrls.get(path);
  if (prev) URL.revokeObjectURL(prev);

  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const mime = PREVIEW_MIME[ext] ?? 'application/octet-stream';

  // 0. Local import with base64 content already in memory — no fetch needed
  const localTab = state.openTabs.find(t => t.path === path && t.isBinary && t.isLocalImport);
  if (localTab) {
    const bytes = Uint8Array.from(atob(localTab.content), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    _previewBlobUrls.set(path, url);
    return url;
  }

  // 1. Try IndexedDB cache (background sync likely already cached it)
  try {
    const { getCachedFile } = await import('./repo-cache');
    const cached = await getCachedFile(state.owner, state.repo, state.branch, path);
    if (cached?.content != null) {
      // Text files (SVG, etc.) are stored as UTF-8 strings — use TextEncoder
      // to preserve multi-byte characters. Binary files were decoded with
      // atob() and are safe for charCodeAt-based conversion.
      const bytes = cached.isText
        ? new TextEncoder().encode(cached.content)
        : Uint8Array.from(cached.content, c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      _previewBlobUrls.set(path, url);
      return url;
    }
  } catch { /* IDB unavailable */ }

  // 2. Fetch raw binary from GitHub API
  const res = await fetch(
    `https://api.github.com/repos/${state.owner}/${state.repo}/contents/${encodeRepoPath(path)}?ref=${state.branch}`,
    { headers: { Authorization: `Bearer ${state.token}`, Accept: 'application/vnd.github.raw+json' } },
  );
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  const url = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: mime }));
  _previewBlobUrls.set(path, url);
  return url;
}

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

/** Cancel all pending debounced SW cache writes.
 *  Call before mode switches (where we immediately re-cache all tabs)
 *  or branch switches (where we wipe the entire SW cache). */
export function flushSWCacheTimers(): void {
  for (const timer of _swCacheTimers.values()) clearTimeout(timer);
  _swCacheTimers.clear();
}

const treeOpenDirs = new Set<string>();

// ── Sidebar file preview ──────────────────────────────────────────────
let _sidebarPreviewPath: string | null = null;

const FILE_TYPE_LABELS: Record<string, string> = {
  html: 'HTML Document', css: 'CSS Stylesheet', js: 'JavaScript',
  ts: 'TypeScript', json: 'JSON', md: 'Markdown', svg: 'SVG Image',
  png: 'PNG Image', jpg: 'JPEG Image', jpeg: 'JPEG Image', gif: 'GIF Image',
  webp: 'WebP Image', ico: 'Icon', avif: 'AVIF Image', bmp: 'Bitmap Image',
  mp4: 'MP4 Video', webm: 'WebM Video', ogv: 'Ogg Video', mov: 'QuickTime Video',
  mp3: 'MP3 Audio', wav: 'WAV Audio', ogg: 'Ogg Audio', flac: 'FLAC Audio',
  m4a: 'M4A Audio', txt: 'Text File', xml: 'XML Document', yaml: 'YAML',
  yml: 'YAML', toml: 'TOML', sh: 'Shell Script', py: 'Python',
};

export function showSidebarPreview(path: string): void {
  _sidebarPreviewPath = path;
  const panel = document.getElementById('sidebar-preview')!;
  const nameEl = document.getElementById('sidebar-preview-name')!;
  const contentEl = document.getElementById('sidebar-preview-content')!;

  panel.classList.remove('hidden');
  const fileName = path.split('/').pop() ?? path;
  nameEl.textContent = fileName;

  // Highlight in tree
  document.querySelectorAll<HTMLElement>('.tree-item.previewing').forEach(el => el.classList.remove('previewing'));
  document.querySelector<HTMLElement>(`.tree-item[data-path="${CSS.escape(path)}"]`)?.classList.add('previewing');

  const previewType = isPreviewable(path);
  if (previewType) {
    contentEl.innerHTML = '<span style="font-size:11px;color:var(--text-dim)">Loading\u2026</span>';
    loadPreviewBlobUrl(path).then(blobUrl => {
      if (_sidebarPreviewPath !== path) return;
      if (previewType === 'image') {
        contentEl.innerHTML = `<img src="${blobUrl}" alt="${escapeAttr(fileName)}">`;
      } else if (previewType === 'video') {
        contentEl.innerHTML = `<video src="${blobUrl}" controls></video>`;
      } else {
        contentEl.innerHTML = `<audio src="${blobUrl}" controls></audio>`;
      }
      // Make sidebar preview image/video draggable onto the canvas
      if (previewType === 'image' || previewType === 'video') {
        const mediaEl = contentEl.querySelector('img, video') as HTMLElement | null;
        if (mediaEl) {
          (mediaEl as HTMLImageElement | HTMLVideoElement).draggable = true;
          mediaEl.addEventListener('dragstart', (ev) => {
            (ev as DragEvent).dataTransfer!.setData('application/x-wb-asset', JSON.stringify({ path, type: previewType }));
            (ev as DragEvent).dataTransfer!.effectAllowed = 'copy';
          });
        }
      }
    }).catch(() => {
      if (_sidebarPreviewPath !== path) return;
      contentEl.innerHTML = `<span style="font-size:11px;color:var(--red)">Failed to load</span>`;
    });
  } else {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const label = FILE_TYPE_LABELS[ext] ?? (ext ? ext.toUpperCase() + ' File' : 'File');
    contentEl.innerHTML = `<div class="sp-file-info">${fileIconSvg(fileName)}<span>${escapeHtml(fileName)}</span><span class="sp-file-type">${escapeHtml(label)}</span></div>`;
  }
}

export function hideSidebarPreview(): void {
  document.getElementById('sidebar-preview')!.classList.add('hidden');
  document.querySelectorAll<HTMLElement>('.tree-item.previewing').forEach(el => el.classList.remove('previewing'));
  _sidebarPreviewPath = null;
}

function initSidebarPreview(): void {
  document.getElementById('sidebar-preview-close')!.onclick = () => hideSidebarPreview();
  document.getElementById('sidebar-preview-open')!.onclick = () => {
    if (_sidebarPreviewPath) openFile(_sidebarPreviewPath);
  };
}

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

  initSidebarPreview();
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
          openFile(node.path);
        }
      };
      container.appendChild(el);
    }
  });
}

/** Lightweight selection update — toggles .selected on tree items
 *  without rebuilding the entire tree DOM. */
function updateTreeSelection(): void {
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

// ── Open file ─────────────────────────────────────────────────────────

export async function openFile(path: string): Promise<void> {
  // If in visual mode, switch to code mode so #code-area becomes visible
  if (visual.mode === 'visual') {
    const { enterCodeMode } = await import('./visual/index');
    enterCodeMode();
  }

  const existing = state.openTabs.find(t => t.path === path);
  if (existing) { activateTab(path); return; }

  // Previewable files (images, video, audio) — no content fetch needed
  const previewType = isPreviewable(path);
  if (previewType) {
    const tab: Tab = { path, content: '', sha: state.fileShas[path] ?? '', dirty: false, language: 'preview' };
    state.openTabs.push(tab);
    activateTab(path);
    return;
  }

  setStatusSync('Loading...');
  try {
    let content: string | undefined;
    let sha: string | undefined;

    // Try IndexedDB first (instant, no network)
    try {
      const { getCachedFile } = await import('./repo-cache');
      const cached = await getCachedFile(state.owner, state.repo, state.branch, path);
      if (cached && cached.sha === state.fileShas[path]) {
        content = cached.content;
        sha = cached.sha;
      }
    } catch { /* IDB unavailable — fall through to API */ }

    if (!content) {
      const data = await ghFetch<{ content: string; sha: string }>(
        `/repos/${state.owner}/${state.repo}/contents/${encodeRepoPath(path)}?ref=${state.branch}`
      );
      content = decodeBase64(data.content);
      sha = data.sha;
    }

    const tab: Tab = { path, content, sha: sha!, dirty: false, language: detectLanguage(path) };
    state.openTabs.push(tab);
    state.fileShas[path] = sha!;
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
  if (!tab) return;

  const editorEl   = document.getElementById('editor') as HTMLElement;
  const welcomeEl  = document.getElementById('welcome') as HTMLElement;
  const breadcrumb = document.getElementById('breadcrumb') as HTMLElement;
  const previewEl  = document.getElementById('file-preview') as HTMLElement;

  const previewType = isPreviewable(path);
  if (previewType) {
    // Show preview panel, hide Monaco
    editorEl.style.display   = 'none';
    welcomeEl.style.display  = 'none';
    previewEl.style.display  = 'flex';
    breadcrumb.style.display = 'flex';

    const fileName = path.split('/').pop() ?? path;
    const contentEl = document.getElementById('preview-content') as HTMLElement;

    // Show loading state, then async-load the blob URL
    const mediaTag = previewType === 'image' ? 'img' : previewType === 'video' ? 'video' : 'audio';
    const audioIcon = previewType === 'audio'
      ? '<svg class="preview-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path stroke-linecap="round" stroke-linejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V4.125c0-.621-.504-1.125-1.125-1.125H14.25M3.75 21V18.75c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3.75 21h4.5M3.75 21h-1.5m6-3v3m0 0h1.5"/></svg>'
      : '';
    const controls = mediaTag !== 'img' ? ' controls' : '';

    contentEl.innerHTML = `${audioIcon}<span class="preview-filename">${escapeHtml(fileName)}</span><span class="preview-filename" style="font-size:11px">Loading…</span>`;

    loadPreviewBlobUrl(path).then(blobUrl => {
      // Only update if this path is still the active tab
      if (state.activeTab !== path) return;
      contentEl.innerHTML = `${audioIcon}<${mediaTag} src="${blobUrl}" alt="${escapeAttr(fileName)}"${controls}></${mediaTag}><span class="preview-filename">${escapeHtml(fileName)}</span>`;
    }).catch(() => {
      if (state.activeTab !== path) return;
      contentEl.innerHTML = `<span class="preview-filename" style="color:var(--red)">Failed to load ${escapeHtml(fileName)}</span>`;
    });

    updateBreadcrumb(path);
    updateStatusLang('preview');
    renderTabs();
    updateTreeSelection();
    updateSaveButton(state.openTabs);
    return;
  }

  // Code file — hide preview, show Monaco
  if (!editor) return;
  previewEl.style.display = 'none';

  suppressChange = true;
  let model = monaco.editor.getModels().find(m => m.uri.path === '/' + path);
  if (!model) {
    model = monaco.editor.createModel(
      tab.content,
      tab.language,
      monaco.Uri.parse('inmemory://model/' + path)
    );
  } else {
    if (model.getValue() !== tab.content) {
      model.setValue(tab.content);
    }
  }
  editor.setModel(model);
  suppressChange = false;

  editorEl.style.display   = 'block';
  welcomeEl.style.display  = 'none';
  breadcrumb.style.display = 'flex';

  updateBreadcrumb(path);
  updateStatusLang(tab.language);
  renderTabs();
  updateTreeSelection();
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
  // Only dispose Monaco model for non-preview tabs
  if (!isPreviewable(path)) {
    const model = monaco.editor.getModels().find(m => m.uri.path === '/' + path);
    model?.dispose();
  }
  if (state.activeTab === path) {
    const last = state.openTabs[state.openTabs.length - 1];
    if (last) { activateTab(last.path); }
    else {
      state.activeTab = null;
      const edEl = document.getElementById('editor') as HTMLElement;
      const welEl = document.getElementById('welcome') as HTMLElement;
      const bcEl = document.getElementById('breadcrumb') as HTMLElement;
      const pvEl = document.getElementById('file-preview') as HTMLElement;
      edEl.style.display   = 'none';
      welEl.style.display  = 'flex';
      bcEl.style.display   = 'none';
      pvEl.style.display   = 'none';
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
  list.innerHTML = dirty.map(t => {
    const status = t.isLocalImport ? 'A' : 'M';
    const statusColor = t.isLocalImport ? 'var(--green)' : 'var(--orange)';
    return `<div class="changed-file"><span class="cf-status" style="color:${statusColor}">${status}</span><span class="cf-path">${escapeHtml(t.path)}</span></div>`;
  }).join('');
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
        // Binary files already store raw base64; text files need encoding
        const content = tab.isBinary ? tab.content : encodeBase64(tab.content);
        interface PushBody { message: string; content: string; branch: string; sha?: string; }
        const body: PushBody & object = {
          message: dirty.length === 1 ? message : `${message} (${tab.path.split('/').pop()})`,
          content,
          branch: state.branch,
        };
        if (tab.sha) body.sha = tab.sha;
        const res = await ghFetch<{ content: { sha: string } }>(
          `/repos/${state.owner}/${state.repo}/contents/${encodeRepoPath(tab.path)}`,
          { method: 'PUT', body }
        );
        tab.sha = (res.content as { sha: string }).sha;
        state.fileShas[tab.path] = tab.sha;
        tab.dirty = false;
        tab.isLocalImport = false;
        pushed++;
        // Update IndexedDB cache with fresh content
        const isText = !tab.isBinary;
        import('./repo-cache').then(({ putCachedFile, cacheKey }) => {
          putCachedFile({
            id: cacheKey(state.owner, state.repo, state.branch, tab.path),
            owner: state.owner, repo: state.repo, branch: state.branch,
            path: tab.path, sha: tab.sha, content: tab.content,
            isText, cachedAt: Date.now(),
          });
        }).catch(() => {});
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
          `/repos/${state.owner}/${state.repo}/contents/${encodeRepoPath(tab.path)}?ref=${state.branch}`
        );
        tab.content = decodeBase64(data.content);
        tab.sha     = data.sha;
        tab.dirty   = false;
        state.fileShas[tab.path] = data.sha;
        // Update IndexedDB cache
        import('./repo-cache').then(({ putCachedFile, cacheKey }) => {
          putCachedFile({
            id: cacheKey(state.owner, state.repo, state.branch, tab.path),
            owner: state.owner, repo: state.repo, branch: state.branch,
            path: tab.path, sha: tab.sha, content: tab.content,
            isText: true, cachedAt: Date.now(),
          });
        }).catch(() => {});
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
