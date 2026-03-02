/**
 * repo-cache.ts
 *
 * Persistent IndexedDB cache for cloned repo files.  Three-tier caching:
 *   1. SW fileStore Map (hot, in-memory)
 *   2. IndexedDB         (warm, persistent across sessions)
 *   3. GitHub API        (cold, network)
 *
 * On connect the sync orchestrator diffs the tree SHAs against cached SHAs
 * and only downloads new/changed files.
 */

import { readFileRaw } from './github';

// ── Types ─────────────────────────────────────────────────────────────

export interface CachedFile {
  id: string;       // "${owner}/${repo}/${branch}/${path}"
  owner: string;
  repo: string;
  branch: string;
  path: string;
  sha: string;
  content: string;  // decoded string (text via TextDecoder, binary via atob)
  isText: boolean;
  cachedAt: number;
}

export interface SyncProgress {
  phase: 'comparing' | 'downloading' | 'cleaning' | 'done';
  total: number;
  completed: number;
  currentFile?: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

export interface SyncResult {
  added: number;
  updated: number;
  deleted: number;
  skipped: number;
}

// ── IndexedDB helpers ─────────────────────────────────────────────────

const DB_NAME = 'wb-repo-cache';
const DB_VERSION = 1;
const STORE_NAME = 'files';

let _dbPromise: Promise<IDBDatabase> | null = null;

export function openCache(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    // indexedDB may be undefined or throw in private-browsing / sandboxed contexts
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      _dbPromise = null;
      reject(e);
      return;
    }

    // Abort if the browser never calls onsuccess/onerror (e.g., storage quota dialogs)
    const timeout = setTimeout(() => {
      _dbPromise = null;
      reject(new Error('IndexedDB open timed out'));
    }, 10_000);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('byRepo', ['owner', 'repo', 'branch'], { unique: false });
      }
    };
    req.onsuccess = () => { clearTimeout(timeout); resolve(req.result); };
    req.onerror = () => { clearTimeout(timeout); _dbPromise = null; reject(req.error); };
  });
  return _dbPromise;
}

export function cacheKey(owner: string, repo: string, branch: string, path: string): string {
  return `${owner}/${repo}/${branch}/${path}`;
}

export async function getCachedFile(
  owner: string, repo: string, branch: string, path: string,
): Promise<CachedFile | null> {
  const db = await openCache();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(cacheKey(owner, repo, branch, path));
    req.onsuccess = () => resolve((req.result as CachedFile) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedShas(
  owner: string, repo: string, branch: string,
): Promise<Map<string, string>> {
  const db = await openCache();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('byRepo');
    const range = IDBKeyRange.only([owner, repo, branch]);
    const map = new Map<string, string>();
    const req = index.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const record = cursor.value as CachedFile;
        map.set(record.path, record.sha);
        cursor.continue();
      } else {
        resolve(map);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function putCachedFile(file: CachedFile): Promise<void> {
  const db = await openCache();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(file);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function putCachedFiles(files: CachedFile[]): Promise<void> {
  if (!files.length) return;
  const db = await openCache();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const f of files) store.put(f);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteCachedFiles(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openCache();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearBranchCache(
  owner: string, repo: string, branch: string,
): Promise<void> {
  const db = await openCache();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const index = tx.objectStore(STORE_NAME).index('byRepo');
    const range = IDBKeyRange.only([owner, repo, branch]);
    const req = index.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Concurrency limiter (matches asset-cache.ts pattern) ──────────────

const MAX_CONCURRENT = 8;

async function withConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  const queue = [...tasks];
  const active: Promise<void>[] = [];

  async function run(task: () => Promise<T>): Promise<void> {
    try {
      results.push({ status: 'fulfilled', value: await task() });
    } catch (reason) {
      results.push({ status: 'rejected', reason });
    }
  }

  while (queue.length || active.length) {
    while (active.length < limit && queue.length) {
      const task = queue.shift()!;
      const p = run(task).then(() => { const i = active.indexOf(p); if (i !== -1) active.splice(i, 1); });
      active.push(p);
    }
    if (active.length) await Promise.race(active);
  }
  return results;
}

// ── Sync orchestrator ─────────────────────────────────────────────────

let _syncAbort: AbortController | null = null;

export async function syncRepoToCache(
  owner: string,
  repo: string,
  branch: string,
  tree: Array<{ path: string; type: string; sha: string }>,
  onProgress?: SyncProgressCallback,
  signal?: AbortSignal,
): Promise<SyncResult> {
  // Phase 1: Compare
  onProgress?.({ phase: 'comparing', total: 0, completed: 0 });

  const blobs = tree.filter(f => f.type === 'blob');
  const treeShas = new Map(blobs.map(f => [f.path, f.sha]));

  let cachedShas: Map<string, string>;
  try {
    cachedShas = await getCachedShas(owner, repo, branch);
  } catch {
    cachedShas = new Map();
  }

  const toDownload: Array<{ path: string; sha: string }> = [];
  let skipped = 0;

  for (const [path, sha] of treeShas) {
    if (cachedShas.get(path) === sha) {
      skipped++;
    } else {
      toDownload.push({ path, sha });
    }
  }

  // Files removed from repo
  const toDelete: string[] = [];
  for (const [path] of cachedShas) {
    if (!treeShas.has(path)) {
      toDelete.push(cacheKey(owner, repo, branch, path));
    }
  }

  // Phase 2: Download
  const total = toDownload.length;
  let completed = 0;
  let added = 0;
  let updated = 0;
  const batch: CachedFile[] = [];
  const BATCH_SIZE = 50;

  const tasks = toDownload.map(({ path, sha }) => async () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    onProgress?.({ phase: 'downloading', total, completed, currentFile: path });

    const raw = await readFileRaw(path);
    const file: CachedFile = {
      id: cacheKey(owner, repo, branch, path),
      owner, repo, branch, path,
      sha,
      content: raw.content,
      isText: raw.isText,
      cachedAt: Date.now(),
    };
    batch.push(file);

    if (cachedShas.has(path)) updated++; else added++;
    completed++;

    // Flush batch periodically
    if (batch.length >= BATCH_SIZE) {
      const toWrite = batch.splice(0);
      try { await putCachedFiles(toWrite); } catch { /* IDB write failed — continue */ }
    }

    onProgress?.({ phase: 'downloading', total, completed, currentFile: path });
  });

  if (tasks.length) {
    await withConcurrencyLimit(tasks, MAX_CONCURRENT);
    // Flush remaining
    if (batch.length) {
      try { await putCachedFiles(batch.splice(0)); } catch { /* ignore */ }
    }
  }

  // Phase 3: Clean deleted files
  if (toDelete.length) {
    onProgress?.({ phase: 'cleaning', total: toDelete.length, completed: 0 });
    try { await deleteCachedFiles(toDelete); } catch { /* ignore */ }
  }

  onProgress?.({ phase: 'done', total, completed: total });

  return { added, updated, deleted: toDelete.length, skipped };
}

// ── Progress UI ───────────────────────────────────────────────────────

export function showSyncProgress(): void {
  const el = document.getElementById('sync-progress');
  if (el) el.style.display = '';
  _syncAbort = new AbortController();
}

export function updateSyncProgress(progress: SyncProgress): void {
  const text = document.getElementById('sync-progress-text');
  const fill = document.getElementById('sync-progress-fill');
  const pct  = document.getElementById('sync-progress-pct');
  if (!text) return;

  if (progress.phase === 'comparing') {
    text.textContent = 'Comparing files…';
  } else if (progress.phase === 'downloading') {
    const short = progress.currentFile
      ? (progress.currentFile.length > 40
        ? '…' + progress.currentFile.slice(-39)
        : progress.currentFile)
      : '';
    text.textContent = `Syncing ${progress.completed}/${progress.total}`;
    if (short) text.textContent += ` — ${short}`;
  } else if (progress.phase === 'cleaning') {
    text.textContent = 'Cleaning removed files…';
  } else {
    text.textContent = 'Sync complete';
  }

  const percent = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;
  if (fill) (fill as HTMLElement).style.width = `${percent}%`;
  if (pct) pct.textContent = `${percent}%`;
}

export function hideSyncProgress(): void {
  const el = document.getElementById('sync-progress');
  if (el) el.style.display = 'none';
  _syncAbort = null;
}

export function cancelSync(): void {
  _syncAbort?.abort();
}

export function getSyncSignal(): AbortSignal | undefined {
  return _syncAbort?.signal;
}
