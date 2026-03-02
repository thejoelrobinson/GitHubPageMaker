// ── File import — add local files to the project ─────────────────────

import { state } from './state';
import { isTextPath } from './github';
import { detectLanguage, escapeHtml } from './utils';
import { notify } from './ui/notifications';
import { renderTree, renderTabs, activateTab } from './code-editor';
import { markUnsaved, debounceAutoSave } from './draft';
import { updateSaveButton } from './ui/status';
import type { Tab } from './types';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB — GitHub API limit
const WARN_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

/** Pending files stashed between dialog open and confirm. */
let _pendingFiles: File[] = [];

// ── Public API ───────────────────────────────────────────────────────

/** Open the native file picker. */
export function openImportDialog(): void {
  if (!state.connected) {
    notify('Connect a repository first', 'warning');
    return;
  }
  const input = document.getElementById('file-import-input') as HTMLInputElement;
  input.value = '';              // reset so re-selecting the same file fires change
  input.click();
}

/** Called when the hidden <input type="file"> fires `change`. */
export function onFilesSelected(): void {
  const input = document.getElementById('file-import-input') as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;

  _pendingFiles = Array.from(files);

  // Reject files over 100 MB
  const tooLarge = _pendingFiles.filter(f => f.size > MAX_FILE_SIZE);
  if (tooLarge.length) {
    notify(`${tooLarge.length} file(s) exceed GitHub's 100 MB limit and were removed`, 'warning');
    _pendingFiles = _pendingFiles.filter(f => f.size <= MAX_FILE_SIZE);
  }
  if (_pendingFiles.length === 0) return;

  // Populate modal
  const listEl = document.getElementById('import-file-list')!;
  const warnEl = document.getElementById('import-warnings')!;

  // Check for overwrites and large files
  const warnings: string[] = [];
  const existingPaths = new Set(state.tree.map(t => t.path));
  const targetDir = normalizeDir((document.getElementById('import-target-dir') as HTMLInputElement).value);

  _pendingFiles.forEach(f => {
    const fullPath = targetDir + f.name;
    if (existingPaths.has(fullPath)) {
      warnings.push(`<span style="color:var(--orange)">${escapeHtml(fullPath)}</span> will overwrite an existing file`);
    }
    if (f.size > WARN_FILE_SIZE) {
      warnings.push(`<span style="color:var(--orange)">${escapeHtml(f.name)}</span> is ${formatSize(f.size)} — large files may be slow to push`);
    }
  });

  listEl.innerHTML = _pendingFiles.map(f => {
    const isText = isTextPath(f.name);
    const tag = isText ? 'T' : 'B';
    const tagColor = isText ? 'var(--green)' : 'var(--accent)';
    return `<div class="changed-file"><span class="cf-status" style="color:${tagColor}">${tag}</span><span class="cf-path">${escapeHtml(f.name)}</span><span style="margin-left:auto;font-size:11px;color:var(--text-dim)">${formatSize(f.size)}</span></div>`;
  }).join('');

  warnEl.innerHTML = warnings.length
    ? `<div style="font-size:12px;line-height:1.6;padding:8px 10px;background:rgba(206,145,120,.08);border-radius:4px;border:1px solid rgba(206,145,120,.2)">${warnings.join('<br>')}</div>`
    : '';

  document.getElementById('import-modal')?.classList.remove('hidden');
}

/** Confirm: read files, create tabs + tree entries. */
export async function confirmImport(): Promise<void> {
  if (!_pendingFiles.length) return;

  const targetDir = normalizeDir((document.getElementById('import-target-dir') as HTMLInputElement).value);
  const btn = document.getElementById('btn-confirm-import') as HTMLButtonElement;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Importing…';

  // Deduplicate names within the selection
  const usedNames = new Map<string, number>();

  try {
    for (const file of _pendingFiles) {
      const safeName = deduplicateName(file.name, usedNames);
      const fullPath = targetDir + safeName;
      const isText = isTextPath(safeName);

      const content = await readFileAs(file, isText);

      // Check if we're overwriting an existing file
      const existingSha = state.fileShas[fullPath] ?? '';

      // Remove any existing tab for this path
      const existingIdx = state.openTabs.findIndex(t => t.path === fullPath);
      if (existingIdx !== -1) state.openTabs.splice(existingIdx, 1);

      const tab: Tab = {
        path: fullPath,
        content,
        sha: existingSha,
        dirty: true,
        language: isText ? detectLanguage(fullPath) : 'preview',
        isBinary: !isText,
        isLocalImport: true,
      };
      state.openTabs.push(tab);

      // Add to tree if not already present
      if (!state.tree.some(t => t.path === fullPath)) {
        state.tree.push({ path: fullPath, type: 'blob', sha: '' });
      }
    }

    // Render updates
    renderTree();
    renderTabs();
    updateSaveButton(state.openTabs);
    markUnsaved();
    debounceAutoSave();

    // Activate the first imported file
    const firstPath = targetDir + deduplicateName(_pendingFiles[0].name, new Map());
    const firstTab = state.openTabs.find(t => t.path === firstPath);
    if (firstTab) activateTab(firstTab.path);

    document.getElementById('import-modal')?.classList.add('hidden');
    notify(`Imported ${_pendingFiles.length} file${_pendingFiles.length > 1 ? 's' : ''} — commit & push to save to GitHub`, 'success');
  } catch (e) {
    notify('Import failed: ' + (e as Error).message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Import';
    _pendingFiles = [];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function normalizeDir(dir: string): string {
  let d = dir.trim().replace(/\\/g, '/');
  if (d.startsWith('/')) d = d.slice(1);
  if (d && !d.endsWith('/')) d += '/';
  return d;
}

function deduplicateName(name: string, used: Map<string, number>): string {
  const count = used.get(name) ?? 0;
  used.set(name, count + 1);
  if (count === 0) return name;

  const dot = name.lastIndexOf('.');
  if (dot === -1) return `${name}-${count}`;
  return `${name.slice(0, dot)}-${count}${name.slice(dot)}`;
}

function readFileAs(file: File, isText: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    if (isText) {
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(file);
    } else {
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Strip "data:...;base64," prefix to get raw base64
        const base64 = dataUrl.split(',')[1] ?? '';
        resolve(base64);
      };
      reader.readAsDataURL(file);
    }
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
