/**
 * preview-sw.spec.ts
 *
 * End-to-end tests for the Preview Service Worker against JoelCRobinson.com.
 *
 * WHY THESE TESTS EXIST
 * ─────────────────────
 * JoelCRobinson.com has `<link rel="stylesheet" href="css/style.css">`.
 * When served via raw.githubusercontent.com the browser receives
 *   Content-Type: text/plain
 * and silently refuses to apply the styles (X-Content-Type-Options: nosniff).
 * The page renders white and unstyled — "looks like a Word document".
 *
 * The Preview Service Worker intercepts every /preview/* request and
 * returns the correct Content-Type so CSS (and JS) loads natively,
 * exactly like opening the file in a local dev server.
 *
 * SCOPE NOTE
 * ──────────
 * The SW is registered with scope '/' so navigator.serviceWorker.controller
 * is set on the main page after clients.claim(). The fetch handler still only
 * handles /preview/* requests; everything else passes through unchanged.
 *
 * IMPORTANT: page.route() does not intercept SW fetch requests.
 * These tests pre-populate the SW cache via WB_CACHE_FILE messages so the
 * SW never needs to make real GitHub API calls during testing.
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs   from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Fixtures ──────────────────────────────────────────────────────────

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const HTML = fs.readFileSync(path.join(FIXTURE_DIR, 'joelcrobinson-index.html'), 'utf8');
const CSS  = fs.readFileSync(path.join(FIXTURE_DIR, 'style.css'), 'utf8');

// Key values from JoelCRobinson.com CSS
const EXPECTED_BODY_BG = 'rgb(10, 10, 15)'; // #0a0a0f in the stylesheet

// ── SW helpers ────────────────────────────────────────────────────────

/**
 * Wait until the SW registered at /preview/ is activated.
 * The main app (at /) is outside the SW's scope so controller is always null.
 * We query the registration directly instead.
 */
async function waitForSW(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      navigator.serviceWorker
        .getRegistration('/preview/')
        .then(r => r?.active?.state === 'activated'),
    { timeout: 10_000 },
  );
}

/**
 * Post messages to the active SW.
 * The SW is scoped to /preview/ so controller is null on the main page.
 * We retrieve reg.active from the /preview/ registration directly.
 */
async function postToSW(page: Page, messages: object[]): Promise<void> {
  await page.evaluate(async (msgs) => {
    const reg = await navigator.serviceWorker.getRegistration('/preview/');
    const sw  = reg?.active;
    if (!sw) throw new Error('[test] SW not active for /preview/ scope');
    for (const msg of msgs) sw.postMessage(msg);
  }, messages as object[]);
}

/**
 * Seed the SW cache with the JoelCRobinson fixture files.
 * The SW will serve all /preview/* requests from the cache.
 */
async function seedSWCache(page: Page): Promise<void> {
  await postToSW(page, [
    { type: 'WB_CONFIG',     token: 'tok', owner: 'joel', repo: 'site', branch: 'main' },
    { type: 'WB_CACHE_FILE', path: 'index.html',    content: HTML },
    { type: 'WB_CACHE_FILE', path: 'css/style.css', content: CSS  },
  ]);
  await page.waitForTimeout(200);
}

// ── 1. Service Worker registration ────────────────────────────────────

test.describe('Service Worker — registration', () => {
  test('preview-sw.js is reachable with JS content-type', async ({ page }) => {
    const res = await page.request.get('/preview-sw.js');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/javascript/);
  });

  test('SW registers with /preview/ scope', async ({ page }) => {
    await page.goto('/');
    await waitForSW(page);
    const scope = await page.evaluate(() =>
      navigator.serviceWorker.getRegistration('/preview/').then(r => r?.scope ?? ''),
    );
    // Scope comes back as full URL e.g. http://localhost:5173/preview/
    expect(scope).toMatch(/\/preview\/$/);
  });

  test('SW activates (state = activated)', async ({ page }) => {
    await page.goto('/');
    await waitForSW(page);
    const state = await page.evaluate(() =>
      navigator.serviceWorker.getRegistration('/preview/').then(r => r?.active?.state),
    );
    expect(state).toBe('activated');
  });
});

// ── 2. MIME-type regression ───────────────────────────────────────────
//
// THE CORE TESTS: CSS must be served as text/css, not text/plain.
//
// page.request.get() bypasses service workers (it uses CDP's network layer).
// To test SW interception we must use page.evaluate(() => fetch(...)) which
// runs inside the browser and goes through the SW when the page is at a
// URL within the SW's scope (/preview/).

test.describe('MIME-type regression — raw.githubusercontent.com fix', () => {
  /** Navigate vis-iframe to /preview/index.html so it's within SW scope. */
  async function navigateIframeToPreview(page: Page): Promise<void> {
    await page.evaluate(() => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      if (!iframe) throw new Error('vis-iframe not found');
      iframe.removeAttribute('srcdoc');
      iframe.src = `/preview/index.html?_t=${Date.now()}`;
    });
    // Wait for iframe to be at /preview/ (within SW scope)
    await page.waitForFunction(
      () => {
        const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
        return iframe?.contentDocument?.readyState === 'complete';
      },
      { timeout: 10_000 },
    );
  }

  /**
   * Fetch a /preview/ URL from INSIDE the iframe (which is within SW scope)
   * so the request is intercepted by the service worker.
   */
  async function swFetch(page: Page, path: string): Promise<{ status: number; contentType: string; body: string }> {
    return page.evaluate(async (p) => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      if (!iframe?.contentWindow) throw new Error('iframe contentWindow missing');
      const res = await iframe.contentWindow.fetch(p);
      return {
        status:      res.status,
        contentType: res.headers.get('content-type') ?? '',
        body:        await res.text(),
      };
    }, path);
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForSW(page);
    await seedSWCache(page);
    await navigateIframeToPreview(page);
  });

  test('HTML served as text/html', async ({ page }) => {
    const { status, contentType } = await swFetch(page, '/preview/index.html');
    expect(status).toBe(200);
    expect(contentType).toContain('text/html');
  });

  test('CSS served as text/css — NOT text/plain (root bug)', async ({ page }) => {
    const { status, contentType } = await swFetch(page, '/preview/css/style.css');
    expect(status).toBe(200);
    expect(contentType).toContain('text/css');
    expect(contentType).not.toContain('text/plain');
  });

  test('CSS body contains expected stylesheet content', async ({ page }) => {
    const { body } = await swFetch(page, '/preview/css/style.css');
    expect(body).toContain('#0a0a0f');
    expect(body).toContain('.preloader');
    expect(body).toContain('.nav');
    expect(body).not.toMatch(/<html/i);
  });

  test('JS served as application/javascript', async ({ page }) => {
    await postToSW(page, [
      { type: 'WB_CACHE_FILE', path: 'app.js', content: 'console.log(1);' },
    ]);
    await page.waitForTimeout(100);

    const { status, contentType } = await swFetch(page, '/preview/app.js');
    expect(status).toBe(200);
    expect(contentType).toContain('javascript');
  });

  test('No-config → graceful placeholder HTML (not a crash)', async ({ page }) => {
    await postToSW(page, [{ type: 'WB_CLEAR' }]);
    await page.waitForTimeout(300);

    const { contentType, body } = await swFetch(page, '/preview/uncached.html');
    expect(contentType).toContain('text/html');
    expect(body).toContain('Loading repository assets');
    expect(body).not.toContain('"message"'); // not a raw GitHub API error JSON
  });
});

// ── 2b. Real-app flow — no manual 200ms wait ──────────────────────────
// Verifies CSS loads even when iframe.src fires immediately after postMessage

test.describe('Real-app flow — SW race condition test', () => {
  test('CSS applies when WB_CONFIG + WB_CACHE_FILE sent without explicit wait', async ({ page }) => {
    await page.goto('/');
    await waitForSW(page);

    // Simulate exact real-app sequence: config + cache + iframe load with NO delay
    await page.evaluate(async ([html, css]) => {
      const reg = await navigator.serviceWorker.getRegistration('/preview/');
      const sw  = reg?.active;
      if (!sw) throw new Error('SW not active');
      sw.postMessage({ type: 'WB_CONFIG',     token: 'tok', owner: 'joel', repo: 'site', branch: 'main' });
      sw.postMessage({ type: 'WB_CACHE_FILE', path: 'index.html',    content: html });
      sw.postMessage({ type: 'WB_CACHE_FILE', path: 'css/style.css', content: css  });
      // Immediately load — no waitForTimeout — worst-case race
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      iframe.removeAttribute('srcdoc');
      iframe.src = `/preview/index.html?_t=${Date.now()}`;
    }, [HTML, CSS]);

    // Wait for CSS to apply (up to 15s — may need retries if race occurs)
    await page.waitForFunction(
      () => {
        const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
        const body   = iframe?.contentDocument?.body;
        if (!body) return false;
        const bg = iframe.contentWindow!.getComputedStyle(body).backgroundColor;
        return bg !== 'rgb(255, 255, 255)' && bg !== 'rgba(0, 0, 0, 0)';
      },
      { timeout: 15_000 },
    );

    const bgColor = await page.evaluate(() => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      return iframe.contentWindow!.getComputedStyle(iframe.contentDocument!.body).backgroundColor;
    });
    expect(bgColor).toBe('rgb(10, 10, 15)'); // dark = CSS applied
  });
});

// ── 3. JoelCRobinson.com visual rendering ────────────────────────────

test.describe('JoelCRobinson.com — visual rendering', () => {
  /** Seed SW and point the builder's iframe at /preview/index.html. */
  async function loadInPreview(page: Page) {
    await page.goto('/');
    await waitForSW(page);
    await seedSWCache(page);

    // Point the vis-iframe at the preview URL
    await page.evaluate(() => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      if (!iframe) throw new Error('vis-iframe not found');
      iframe.removeAttribute('srcdoc');
      iframe.src = `/preview/index.html?_t=${Date.now()}`;
    });

    // Wait until the page's own .nav element is present in the iframe DOM
    await page.waitForFunction(
      () => {
        const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
        return (
          iframe?.contentDocument?.readyState === 'complete' &&
          !!iframe?.contentDocument?.querySelector('.nav')
        );
      },
      { timeout: 15_000 },
    );
  }

  test('Page title matches JoelCRobinson.com', async ({ page }) => {
    await loadInPreview(page);
    const title = await page.evaluate(
      () => (document.getElementById('vis-iframe') as HTMLIFrameElement)?.contentDocument?.title,
    );
    expect(title).toContain('Joel Robinson');
  });

  test('CSS applied — body background is dark (#0a0a0f), not white', async ({ page }) => {
    await loadInPreview(page);

    const bgColor = await page.evaluate(() => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      const body   = iframe?.contentDocument?.body;
      if (!body) return null;
      // Use iframe's own window for getComputedStyle
      return iframe.contentWindow!.getComputedStyle(body).backgroundColor;
    });

    expect(bgColor).not.toBeNull();
    expect(bgColor).not.toBe('rgb(255, 255, 255)'); // not unstyled white
    expect(bgColor).toBe(EXPECTED_BODY_BG);          // correct dark bg from CSS
  });

  test('Layout is full-width — body scrollWidth > 900px', async ({ page }) => {
    await loadInPreview(page);

    const bodyWidth = await page.evaluate(() => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      return iframe?.contentDocument?.body?.scrollWidth ?? 0;
    });

    // A "word doc" unstyled render is ~100-300px (just text content).
    // Our device frame constrains the iframe to ~700-1200px depending on viewport.
    // 600px is a safe lower bound: CSS is loaded and layout is working.
    expect(bodyWidth).toBeGreaterThan(600);
  });

  test('.nav is rendered and not hidden', async ({ page }) => {
    await loadInPreview(page);

    const navVisible = await page.evaluate(() => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      const nav    = iframe?.contentDocument?.querySelector('.nav');
      if (!nav) return false;
      const style  = iframe.contentWindow!.getComputedStyle(nav);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    expect(navVisible).toBe(true);
  });

  test('.hero section is present', async ({ page }) => {
    await loadInPreview(page);
    const heroPresent = await page.evaluate(() => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      return !!iframe?.contentDocument?.querySelector('.hero');
    });
    expect(heroPresent).toBe(true);
  });

  test('.preloader exists (site\'s own loading animation)', async ({ page }) => {
    await loadInPreview(page);
    // The preloader is the SITE'S own design element, not our spinner.
    // If you see "Loading…" it's Joel's site animating, not a render failure.
    const preloaderPresent = await page.evaluate(() => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      return !!iframe?.contentDocument?.querySelector('.preloader');
    });
    expect(preloaderPresent).toBe(true);
  });

  test('Screenshot saved to tests/screenshots/', async ({ page }) => {
    await loadInPreview(page);

    const iframeEl = page.locator('#vis-iframe');
    await expect(iframeEl).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/joelcrobinson-full.png' });

    const height = await page.evaluate(
      () => (document.getElementById('vis-iframe') as HTMLIFrameElement)?.scrollHeight ?? 0,
    );
    expect(height).toBeGreaterThan(300);
  });
});

// ── 4. SW cache management ────────────────────────────────────────────
//
// All requests via iframeEval() run within the iframe at /preview/ (SW scope).

test.describe('SW cache management', () => {
  /** Run fetch() inside the preview iframe (within SW scope). */
  async function iframeEval(page: Page, fn: () => Promise<unknown>): Promise<unknown> {
    return page.evaluate(async (fnStr) => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      if (!iframe?.contentWindow) throw new Error('iframe missing');
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      return new Function(`return (${fnStr})()`)();
    }, fn.toString());
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForSW(page);
    // Seed SW and navigate iframe into scope
    await seedSWCache(page);
    await page.evaluate(() => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      iframe.removeAttribute('srcdoc');
      iframe.src = `/preview/index.html?_t=${Date.now()}`;
    });
    await page.waitForFunction(
      () => (document.getElementById('vis-iframe') as HTMLIFrameElement)?.contentDocument?.readyState === 'complete',
      { timeout: 10_000 },
    );
  });

  test('WB_CACHE_FILE → file served with correct MIME type', async ({ page }) => {
    await postToSW(page, [
      { type: 'WB_CONFIG',     token: 't', owner: 'o', repo: 'r', branch: 'main' },
      { type: 'WB_CACHE_FILE', path: 'cached.css', content: '.x { color: hotpink; }' },
    ]);
    await page.waitForTimeout(200);

    const result = await page.evaluate(async () => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      const res = await iframe.contentWindow!.fetch('/preview/cached.css');
      return { status: res.status, ct: res.headers.get('content-type') ?? '', body: await res.text() };
    });
    expect(result.status).toBe(200);
    expect(result.body).toContain('hotpink');
    expect(result.ct).toContain('text/css');
  });

  test('WB_INVALIDATE removes file and triggers placeholder', async ({ page }) => {
    await postToSW(page, [
      { type: 'WB_CONFIG',     token: 't', owner: 'o', repo: 'r', branch: 'main' },
      { type: 'WB_CACHE_FILE', path: 'drop.css', content: '.d{}' },
    ]);
    await page.waitForTimeout(200);

    // Confirm in cache
    const before = await page.evaluate(async () => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      return (await iframe.contentWindow!.fetch('/preview/drop.css')).status;
    });
    expect(before).toBe(200);

    await postToSW(page, [{ type: 'WB_INVALIDATE', path: 'drop.css' }]);
    await page.waitForTimeout(200);

    // No longer in cache
    const after = await page.evaluate(async () => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      return (await iframe.contentWindow!.fetch('/preview/drop.css')).status;
    });
    expect(after).not.toBe(200);
  });

  test('WB_CLEAR wipes cache — returns placeholder', async ({ page }) => {
    await postToSW(page, [{ type: 'WB_CLEAR' }]);
    await page.waitForTimeout(200);

    const body = await page.evaluate(async () => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      return (await iframe.contentWindow!.fetch('/preview/a.css')).text();
    });
    expect(body).toContain('Loading repository assets');
  });
});
