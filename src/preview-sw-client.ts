/**
 * preview-sw-client.ts
 *
 * Handles service worker registration, configuration, and cache population.
 * The SW acts as a local dev server: every /preview/* request is served
 * with the correct Content-Type, bypassing raw.githubusercontent.com's
 * broken MIME types.
 */
import type { AppState } from './types';

let _sw: ServiceWorker | null = null;
let _ready = false;
let _controllerListenerAdded = false;

// ── Registration ──────────────────────────────────────────────────────

export async function registerPreviewSW(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[preview-sw] Not supported — CSS may not load in preview');
    return false;
  }

  try {
    // Scope '/preview/' — the SW only controls pages/iframes at /preview/*.
    // The main app at '/' is NOT in this scope, so navigator.serviceWorker.controller
    // is always null on the main page. We work around this by always posting to
    // reg.active directly (see post() below).
    const reg = await navigator.serviceWorker.register('/preview-sw.js', {
      scope: '/preview/',
    });

    // Determine which SW to track and wait for
    const sw = reg.installing ?? reg.waiting ?? reg.active;

    if (sw && sw.state !== 'activated') {
      await new Promise<void>((resolve) => {
        sw.addEventListener('statechange', function handler() {
          if (sw.state === 'activated') {
            sw.removeEventListener('statechange', handler);
            resolve();
          }
        });
      });
    }

    // After activation, reg.active is the live SW
    _sw    = reg.active;
    _ready = true;

    // Keep _sw in sync if the SW updates in the background.
    // Guard: only add this listener once per page lifecycle.
    if (!_controllerListenerAdded) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        _sw = navigator.serviceWorker.controller;
      });
      _controllerListenerAdded = true;
    }

    return true;
  } catch (err) {
    console.warn('[preview-sw] Registration failed:', err);
    return false;
  }
}

export function isPreviewSWReady(): boolean {
  return _ready;
}

// ── Messaging ─────────────────────────────────────────────────────────

/**
 * Send a message to the active SW.
 * After clients.claim() in the SW's activate event, controller is set
 * immediately.  We fall back to the _sw reference for the brief window
 * before claim() propagates.
 */
function post(msg: object): void {
  // The SW is scoped to /preview/ so navigator.serviceWorker.controller is
  // always null on the main page. Use the stored _sw reference (reg.active)
  // set during registerPreviewSW(). Fall back to a fresh getRegistration()
  // lookup to handle the edge case where _sw was set before activation.
  const target = _sw ?? navigator.serviceWorker.controller;
  if (target) {
    target.postMessage(msg);
  } else {
    // SW still activating — retry after it becomes ready
    navigator.serviceWorker
      .getRegistration('/preview/')
      .then(reg => reg?.active?.postMessage(msg));
  }
}

// ── Public API ────────────────────────────────────────────────────────

/** Send repo credentials so the SW can fetch assets on-demand. */
export function configurePreviewSW(state: AppState): void {
  post({
    type:   'WB_CONFIG',
    token:  state.token,
    owner:  state.owner,
    repo:   state.repo,
    branch: state.branch,
  });
}

/** Pre-populate the SW cache with a file already fetched via the GitHub API. */
export function cacheFileInSW(path: string, content: string): void {
  post({ type: 'WB_CACHE_FILE', path, content });
}

/** Remove a cached file (e.g. after a push, so the iframe re-fetches). */
export function invalidateSWFile(path: string): void {
  post({ type: 'WB_INVALIDATE', path });
}

/** Wipe the entire SW cache (branch switch, repo change). */
export function clearSWCache(): void {
  post({ type: 'WB_CLEAR' });
}

/**
 * Ping the SW and resolve with whether it has repo config.
 * Used by tests to assert the SW is live before making requests.
 */
export function pingPreviewSW(): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => resolve(e.data.ready === true);
    setTimeout(() => resolve(false), 2000); // timeout
    const target = navigator.serviceWorker.controller ?? _sw;
    target?.postMessage({ type: 'WB_PING' }, [channel.port2]);
  });
}
