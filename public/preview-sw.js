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
      break;
    case 'WB_CACHE_FILE':
      if (data.path && data.content != null) fileStore.set(data.path, data.content);
      break;
    case 'WB_INVALIDATE':
      fileStore.delete(data.path);
      break;
    case 'WB_CLEAR':
      fileStore.clear();
      cfg = null;
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

async function handlePreviewRequest(pathname) {
  let filePath = pathname.slice(SCOPE.length);
  if (!filePath || filePath.endsWith('/')) filePath += 'index.html';

  // 1. In-memory cache (populated from openTabs before renderCanvas is called)
  if (fileStore.has(filePath)) {
    return respond(filePath, fileStore.get(filePath));
  }

  // 2. Fetch from GitHub API
  if (!cfg) {
    // No config yet — return a self-reloading placeholder so the iframe
    // retries once the main page sends WB_CONFIG.
    // Use a 5-second refresh instead of 1 to avoid a tight reload loop
    // if WB_CONFIG delivery is delayed.
    return new Response(
      `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="5"></head>
       <body style="background:#0f172a;display:flex;align-items:center;justify-content:center;
         height:100vh;font-family:system-ui;color:#64748b">
         <span>Loading repository assets…</span>
       </body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  try {
    const apiUrl =
      `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/` +
      `${encodeURIComponent(filePath)}?ref=${cfg.branch}`;

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
           <b>${res.status}</b> — could not load <code>${filePath}</code>
         </body></html>`,
        { status: res.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }

    const json = await res.json();
    const content = atob(json.content.replace(/\s/g, ''));
    fileStore.set(filePath, content); // cache for subsequent requests
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
      woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
      mp4:  'video/mp4', webm: 'video/webm',
      txt:  'text/plain', md: 'text/plain',
      xml:  'application/xml',
    }[ext] ?? 'application/octet-stream'
  );
}
