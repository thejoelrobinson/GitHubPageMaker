/**
 * preview-sw.js  —  Website Builder Preview Service Worker
 *
 * Acts as a local development server for the GitHub repo being edited.
 * Intercepts all /preview/* requests, serves files from the in-memory
 * cache (pre-populated from openTabs) or fetches on-demand from the
 * GitHub Contents API with the correct Content-Type header.
 */

const SCOPE = '/preview/';

/** @type {Map<string, string>} path → decoded string content */
const fileStore = new Map();

/** @type {{ token: string, owner: string, repo: string, branch: string } | null} */
let cfg = null;

// ── IndexedDB cache tier ─────────────────────────────────────────────

/** @type {IDBDatabase | null} */
let idb = null;

function openIDB() {
  return new Promise((resolve, reject) => {
    if (idb) { resolve(idb); return; }
    const req = indexedDB.open('wb-repo-cache', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) {
        const store = db.createObjectStore('files', { keyPath: 'id' });
        store.createIndex('byRepo', ['owner', 'repo', 'branch'], { unique: false });
      }
    };
    req.onsuccess = () => { idb = req.result; resolve(idb); };
    req.onerror = () => reject(req.error);
  });
}

// ── IDB helpers ────────────────────────────────────────────────────────

/** Fire-and-forget write: open IDB then run fn(db), swallowing errors. */
function idbWrite(fn) {
  openIDB().then(fn).catch(() => {});
}

/** Resolve-on-completion readonly get by raw key; resolves null on any error. */
async function idbGet(key) {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const req = db.transaction('files', 'readonly').objectStore('files').get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror  = () => resolve(null);
    });
  } catch { return null; }
}

async function getFromIDB(filePath) {
  if (!cfg) return null;
  return idbGet(`${cfg.owner}/${cfg.repo}/${cfg.branch}/${filePath}`);
}

function storeInIDB(filePath, content, isTextAsset) {
  if (!cfg) return;
  const id = `${cfg.owner}/${cfg.repo}/${cfg.branch}/${filePath}`;
  idbWrite(db => db.transaction('files', 'readwrite').objectStore('files').put(
    { id, owner: cfg.owner, repo: cfg.repo, branch: cfg.branch,
      path: filePath, sha: '', content, isText: isTextAsset, cachedAt: Date.now() },
  ));
}

// ── Persisted config (survives SW restart) ────────────────────────────

const CFG_IDB_KEY = '__wb_config__';

function persistConfig(cfgObj) {
  idbWrite(db => db.transaction('files', 'readwrite').objectStore('files').put(
    { id: CFG_IDB_KEY, token: cfgObj.token, owner: cfgObj.owner, repo: cfgObj.repo, branch: cfgObj.branch },
  ));
}

function clearPersistedConfig() {
  idbWrite(db => db.transaction('files', 'readwrite').objectStore('files').delete(CFG_IDB_KEY));
}

async function restoreConfigFromIDB() {
  const row = await idbGet(CFG_IDB_KEY);
  return row && row.token
    ? { token: row.token, owner: row.owner, repo: row.repo, branch: row.branch }
    : null;
}

// ── Lifecycle ─────────────────────────────────────────────────────────

// Take over immediately — don't wait for old tabs to close.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

// Claim all open clients so the main page is controlled without a reload.
// This is critical: without it navigator.serviceWorker.controller is null
// on first page load and WB_CONFIG messages are silently dropped.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Message handler ───────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  const { type, ...data } = event.data ?? {};
  switch (type) {
    case 'WB_CONFIG':
      cfg = { token: data.token, owner: data.owner, repo: data.repo, branch: data.branch };
      // Don't clear fileStore here — openTabs content may already be cached
      persistConfig(cfg); // survive SW restart
      break;
    case 'WB_CACHE_FILE':
      if (data.path && data.content != null) {
        fileStore.set(data.path, data.content);
        // Uncomment to debug cache population:
        // console.log(`[preview-sw] cached ${data.path} (${data.content.length} bytes)`);
      }
      break;
    case 'WB_INVALIDATE':
      fileStore.delete(data.path);
      break;
    case 'WB_CLEAR':
      fileStore.clear();
      cfg = null;
      clearPersistedConfig();
      idb = null; // Force re-open on next use (new branch will have different keys)
      break;
    // Respond to ping so the client can confirm the SW is alive and configured
    case 'WB_PING':
      // Respond on the MessageChannel port if provided, otherwise fall back
      // to event.source (handles both port-based and direct postMessage callers).
      if (event.ports && event.ports.length > 0) {
        event.ports[0].postMessage({ type: 'WB_PONG', ready: !!cfg });
      } else {
        event.source?.postMessage({ type: 'WB_PONG', ready: !!cfg });
      }
      break;
  }
});

// ── Fetch interceptor ─────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(SCOPE)) return;
  event.respondWith(handlePreviewRequest(url.pathname));
});

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function handlePreviewRequest(pathname) {
  let filePath = pathname.slice(SCOPE.length);
  if (!filePath || filePath.endsWith('/')) filePath += 'index.html';

  // Guard against path traversal (../) and absolute paths.
  // GitHub's API would 404 these anyway, but we reject early and safely.
  if (filePath.includes('..') || filePath.startsWith('/')) {
    return new Response('Invalid path', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  // 1. In-memory cache (populated from openTabs before renderCanvas is called)
  if (fileStore.has(filePath)) {
    return respond(filePath, fileStore.get(filePath));
  }

  // 2. IndexedDB cache (persistent across sessions)
  try {
    const cached = await getFromIDB(filePath);
    if (cached && cached.content != null) {
      fileStore.set(filePath, cached.content); // promote to hot cache
      return respond(filePath, cached.content);
    }
  } catch (e) {
    console.warn('[preview-sw] IDB lookup failed:', e);
  }

  console.log(`[preview-sw] cache miss for ${filePath} — fetching on-demand from GitHub`);

  // 3. Fetch from GitHub API
  if (!cfg) {
    // SW restarted and lost in-memory config — try to restore from IDB first.
    // This avoids the loading placeholder on SW restart (common in all browsers).
    const restored = await restoreConfigFromIDB();
    if (restored) {
      cfg = restored;
    } else {
      // No config anywhere — return a self-reloading placeholder so the iframe
      // retries once the main page sends WB_CONFIG.
      return new Response(
        `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="5"></head>
         <body style="background:#0f172a;display:flex;align-items:center;justify-content:center;
           height:100vh;font-family:system-ui;color:#64748b">
           <span>Loading repository assets…</span>
         </body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
  }

  try {
    // Encode each path segment individually — do NOT encode the '/' separators,
    // or the GitHub API will treat the entire path as a single filename and 404.
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const apiUrl =
      `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/` +
      `${encodedPath}?ref=${cfg.branch}`;

    const res = await fetch(apiUrl, {
      headers: {
        Authorization:          `Bearer ${cfg.token}`,
        Accept:                 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) {
      return new Response(
        `<!DOCTYPE html><html><body style="font-family:system-ui;padding:40px;color:#64748b">
           <b>${res.status}</b> — could not load <code>${escapeHtml(filePath)}</code>
         </body></html>`,
        { status: res.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }

    const json = await res.json();

    // GitHub Contents API returns content:'' (empty) for files > 1 MB,
    // and provides a download_url to fetch the raw bytes instead.
    // Determine if this is a text or binary asset so we use the right decoder.
    // Text files need proper Unicode strings (via TextDecoder) so the Response
    // body is encoded correctly. Binary files (images, fonts) need a binary
    // string where charCodeAt(i) === byte value (via atob directly).
    const fileExt = (filePath.split('.').pop() || '').toLowerCase();
    const TEXT_FILE_EXTS = new Set(['css','js','mjs','cjs','ts','json','xml','html','htm','txt','md','svg','yaml','yml','toml']);
    const isTextAsset = TEXT_FILE_EXTS.has(fileExt);

    let content;
    if (json.content) {
      // Normal path: inline base64 content (files ≤ 1 MB)
      const rawBase64 = json.content.replace(/\s/g, '');
      if (isTextAsset) {
        // Decode to proper Unicode string so Response encodes it correctly as UTF-8
        const bytes = Uint8Array.from(atob(rawBase64), c => c.charCodeAt(0));
        content = new TextDecoder('utf-8').decode(bytes);
      } else {
        // Binary file: binary string where charCodeAt(i) === byte value
        content = atob(rawBase64);
      }
    } else if (json.download_url) {
      // Large file path: fetch raw bytes from the download URL.
      // For private repos the URL includes a short-lived auth token.
      const rawRes = await fetch(json.download_url, {
        headers: { Authorization: `Bearer ${cfg.token}` },
      });
      if (!rawRes.ok) {
        console.warn(`[preview-sw] download_url fetch failed for ${filePath}: ${rawRes.status}`);
        return new Response(`Could not download large file: ${escapeHtml(filePath)}`,
          { status: rawRes.status, headers: { 'Content-Type': 'text/plain' } });
      }
      const buf = await rawRes.arrayBuffer();
      const rawBytes = new Uint8Array(buf);
      if (isTextAsset) {
        content = new TextDecoder('utf-8').decode(rawBytes);
      } else {
        // Binary: convert to binary string so respond() can use charCodeAt
        let binaryStr = '';
        for (let i = 0; i < rawBytes.length; i++) binaryStr += String.fromCharCode(rawBytes[i]);
        content = binaryStr;
      }
    } else {
      // GitHub returned a non-file object (e.g. a directory listing) or
      // an error object (too_large, etc.)
      const msg = json.message || 'GitHub API did not return file content';
      console.warn(`[preview-sw] No content for ${filePath}: ${msg}`);
      return new Response(`Cannot serve: ${escapeHtml(msg)}`,
        { status: 422, headers: { 'Content-Type': 'text/plain' } });
    }
    console.log(`[preview-sw] on-demand loaded ${filePath} (${content.length} bytes)`);
    fileStore.set(filePath, content); // cache for subsequent requests
    storeInIDB(filePath, content, isTextAsset); // persist for future sessions
    return respond(filePath, content);
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function respond(filePath, content) {
  const mime = mimeType(filePath);
  const isText =
    mime.startsWith('text/') ||
    mime.includes('javascript') ||
    mime.includes('json') ||
    mime.includes('svg') ||
    mime.includes('xml');

  if (isText) {
    return new Response(content, { headers: { 'Content-Type': `${mime}; charset=utf-8` } });
  }
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) bytes[i] = content.charCodeAt(i);
  return new Response(bytes, { headers: { 'Content-Type': mime } });
}

function mimeType(path) {
  const ext = (path.split('.').pop() ?? '').toLowerCase();
  return (
    {
      html: 'text/html', htm: 'text/html',
      css:  'text/css',
      js:   'application/javascript', mjs: 'application/javascript',
      json: 'application/json',
      svg:  'image/svg+xml',
      png:  'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif:  'image/gif', webp: 'image/webp', ico: 'image/x-icon',
      avif: 'image/avif', bmp: 'image/bmp',
      woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
      mp4:  'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
      mp3:  'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4',
      pdf:  'application/pdf',
      txt:  'text/plain', md: 'text/plain',
      xml:  'application/xml', map: 'application/json',
    }[ext] ?? 'application/octet-stream'
  );
}
