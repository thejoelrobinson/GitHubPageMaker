/**
 * asset-cache.ts
 *
 * Pre-populates the Service Worker cache with all assets a page needs before
 * the iframe loads, so the SW never has to fetch on-demand and there's no
 * race between WB_CONFIG delivery and the first CSS/image request.
 *
 * Lives in its own module to avoid circular imports between
 * visual/index.ts ↔ visual/pages.ts.
 */

import { state } from '../state';
import { readFile } from '../github';
import { cacheFileInSW } from '../preview-sw-client';
import { extractLinkedStylesheets, extractLinkedScripts, dirOf } from './inline-assets';

// ── Configuration ──────────────────────────────────────────────────────

/** Hard cap: never issue more than this many GitHub API calls per page load. */
const MAX_ASSETS_PER_PAGE = 80;

/** Max concurrent GitHub API calls (avoids secondary rate-limit triggers). */
const MAX_CONCURRENT = 8;

// ── Semaphore ──────────────────────────────────────────────────────────

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
      const p = run(task).then(() => { active.splice(active.indexOf(p), 1); });
      active.push(p);
    }
    if (active.length) await Promise.race(active);
  }
  return results;
}

// ── Asset extension whitelist ──────────────────────────────────────────
// Images and videos are served via raw.githubusercontent.com (no MIME issue).
// Only text assets (CSS, JS) need to be in the SW cache with correct headers.
// We do cache images too — the SW can serve them with the right content-type.

const CACHEABLE_EXTS = new Set([
  // Styles and scripts (MIME-type critical)
  'css', 'js', 'mjs',
  // Fonts (often referenced by CSS @font-face)
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  // Images (SW serves with correct type even though raw.gh serves text/plain)
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'avif',
  // Data
  'json',
]);

function isCacheable(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return CACHEABLE_EXTS.has(ext);
}

// ── Main function ──────────────────────────────────────────────────────

/**
 * Fetch and SW-cache every CSS, JS, font, and image asset linked from an
 * HTML file.  Also caches all cacheable assets that live in the same
 * directory as the page — images, fonts, etc. referenced by CSS.
 *
 * Stays within MAX_ASSETS_PER_PAGE and MAX_CONCURRENT to avoid hitting
 * GitHub's secondary rate limits.
 */
export async function preCacheLinkedAssets(
  pagePath: string,
  htmlContent: string,
): Promise<void> {
  const dir = dirOf(pagePath);

  // 1. Explicitly linked CSS and JS (highest priority — parse from HTML)
  const explicitCSS = extractLinkedStylesheets(htmlContent, pagePath)
    .filter(l => l.isRelative && l.repoPath)
    .map(l => l.repoPath!);

  const explicitJS = extractLinkedScripts(htmlContent, pagePath)
    .filter(s => s.isRelative && s.repoPath)
    .map(s => s.repoPath!);

  // 2. All cacheable assets in the same directory tree as the page
  //    (covers CSS background-image, @font-face, etc.)
  const sameDir = state.tree
    .filter(f => {
      if (!isCacheable(f.path)) return false;
      const fDir = dirOf(f.path);
      // Same dir, parent dir, or shared top-level asset folders
      return fDir === dir || fDir === '' ||
        (dir && fDir.startsWith(dir)) ||
        SHARED_ASSET_DIRS.has(fDir.split('/')[0]);
    })
    .map(f => f.path);

  // Merge, deduplicate, respect the cap
  const toCache = [...new Set([...explicitCSS, ...explicitJS, ...sameDir])]
    .filter(isCacheable)
    .slice(0, MAX_ASSETS_PER_PAGE);

  if (!toCache.length) return;

  // Fetch & cache with concurrency control
  const tasks = toCache.map(assetPath => async () => {
    // Already have content in an open tab — just warm the SW
    const existing = state.openTabs.find(t => t.path === assetPath);
    if (existing) { cacheFileInSW(assetPath, existing.content); return; }

    const file = await readFile(assetPath);
    cacheFileInSW(assetPath, file.content);
    state.fileShas[assetPath] = file.sha;
  });

  await withConcurrencyLimit(tasks, MAX_CONCURRENT);
}

/** Top-level directory names that commonly hold shared assets. */
const SHARED_ASSET_DIRS = new Set([
  'css', 'styles', 'style',
  'js', 'scripts', 'script',
  'assets', 'static', 'public',
  'images', 'img', 'photos',
  'fonts', 'font',
  'icons', 'icon',
  'media',
]);

/**
 * Cache ALL cacheable files in the repo tree — images, CSS, JS, fonts.
 * Called once after the initial connection to ensure the SW can serve every
 * asset the project needs, not just the ones on the first page.
 * Runs in the background and respects the concurrency limit.
 */
export async function cacheEntireRepoTree(): Promise<void> {
  const allAssets = state.tree
    .filter(f => f.type === 'blob' && isCacheable(f.path))
    .map(f => f.path);

  if (!allAssets.length) return;

  const tasks = allAssets.map(assetPath => async () => {
    const existing = state.openTabs.find(t => t.path === assetPath);
    if (existing) { cacheFileInSW(assetPath, existing.content); return; }
    if (state.fileShas[assetPath]) return; // already fetched this session

    try {
      const file = await readFile(assetPath);
      cacheFileInSW(assetPath, file.content);
      state.fileShas[assetPath] = file.sha;
    } catch { /* skip files that fail — SW falls back to on-demand */ }
  });

  await withConcurrencyLimit(tasks, MAX_CONCURRENT);
}
