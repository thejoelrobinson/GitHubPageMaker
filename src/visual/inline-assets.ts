/**
 * inline-assets.ts
 *
 * Fixes the "CSS not rendering" problem in the iframe canvas.
 *
 * ROOT CAUSE
 * ----------
 * `srcdoc` iframes have a null origin, so relative URLs (href="styles.css")
 * resolve to nowhere. We add a <base> tag pointing to raw.githubusercontent.com
 * to fix image paths, BUT raw.githubusercontent.com serves every file as
 * Content-Type: text/plain with X-Content-Type-Options: nosniff. Browsers
 * hard-block stylesheets with the wrong MIME type, so CSS is silently ignored
 * and the page renders as unstyled HTML — "looks like a Word document".
 *
 * THE FIX
 * -------
 * Before displaying HTML in the canvas, find every relative
 * <link rel="stylesheet"> and <@import> URL, fetch the CSS content via the
 * GitHub API (which always returns correct base64-encoded content regardless
 * of MIME type), and replace the external references with inline <style> blocks.
 * The <base> tag is kept for images and other binary assets (browsers accept
 * those regardless of Content-Type).
 */

// ── Path utilities ────────────────────────────────────────────────────

/**
 * Resolve a relative href against a directory path.
 * Both inputs use forward slashes. The result never starts with "/".
 *
 * resolveRelativePath('blog/', 'styles.css')       → 'blog/styles.css'
 * resolveRelativePath('blog/', '../shared/base.css') → 'shared/base.css'
 * resolveRelativePath('',      './assets/app.css')  → 'assets/app.css'
 */
export function resolveRelativePath(dir: string, href: string): string {
  // Strip leading ./
  const h = href.startsWith('./') ? href.slice(2) : href;

  if (!h.startsWith('../')) {
    return dir + h;
  }

  // Handle one or more ../ segments
  const stack = dir.split('/').filter(Boolean);
  const parts = h.split('/');
  for (const part of parts) {
    if (part === '..') { stack.pop(); }
    else if (part !== '.') { stack.push(part); }
  }
  return stack.join('/');
}

/**
 * Return the directory portion of a file path, with a trailing slash.
 * E.g. 'blog/post.html' → 'blog/';  'index.html' → ''
 */
export function dirOf(filePath: string): string {
  return filePath.includes('/')
    ? filePath.split('/').slice(0, -1).join('/') + '/'
    : '';
}

// ── CSS link extraction ───────────────────────────────────────────────

export interface LinkedStylesheet {
  /** The full matched <link ...> tag text */
  tag: string;
  /** The raw href value from the attribute */
  href: string;
  /** True if this is a relative URL that we can fetch from the repo */
  isRelative: boolean;
  /** Resolved repo-relative path (only set when isRelative = true) */
  repoPath?: string;
}

/**
 * Find all <link rel="stylesheet"> tags in an HTML string and classify them.
 */
export function extractLinkedStylesheets(
  html: string,
  pagePath: string,
): LinkedStylesheet[] {
  const dir = dirOf(pagePath);
  const results: LinkedStylesheet[] = [];

  // Match <link ... rel="stylesheet" ...> in any attribute order.
  // We allow rel='stylesheet' (single quotes) or rel=stylesheet (unquoted).
  const tagRe = /<link\b[^>]*>/gi;
  for (const match of html.matchAll(tagRe)) {
    const tag = match[0];

    // Must have rel="stylesheet" (or rel='stylesheet')
    if (!/\brel=["']stylesheet["']/i.test(tag)) continue;

    // Extract href value
    const hrefMatch = /\bhref=["']([^"']+)["']/i.exec(tag);
    if (!hrefMatch) continue;

    const href = hrefMatch[1].trim();
    const isAbsolute = /^(https?:)?\/\/|^data:/i.test(href);
    results.push({
      tag,
      href,
      isRelative: !isAbsolute,
      repoPath: isAbsolute ? undefined : resolveRelativePath(dir, href),
    });
  }

  return results;
}

// ── CSS @import extraction from inline <style> blocks ────────────────

export interface CssImport {
  /** The full @import rule text (e.g. `@import url("base.css");`) */
  rule: string;
  /** The resolved repo path */
  repoPath: string;
}

/**
 * Find @import url("relative-path") rules inside <style> blocks.
 * Handles @import url(...), @import "...", @import '...'
 */
export function extractCssImports(html: string, pagePath: string): CssImport[] {
  const dir = dirOf(pagePath);
  const results: CssImport[] = [];

  // Extract content of all <style> blocks
  const styleBlockRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  for (const styleMatch of html.matchAll(styleBlockRe)) {
    const cssContent = styleMatch[1];

    // @import "path", @import 'path', @import url("path"), @import url('path')
    const importRe = /@import\s+(?:url\s*\(\s*["']?|["'])([^"')]+)["']?\s*\)?[^;]*;/gi;
    for (const importMatch of cssContent.matchAll(importRe)) {
      const href = importMatch[1].trim();
      if (/^(https?:)?\/\//i.test(href)) continue; // skip absolute
      results.push({
        rule: importMatch[0],
        repoPath: resolveRelativePath(dir, href),
      });
    }
  }

  return results;
}

// ── Script tag extraction ─────────────────────────────────────────

export interface LinkedScript {
  tag: string;
  src: string;
  isRelative: boolean;
  repoPath?: string;
}

/**
 * Find all relative <script src="..."> tags.
 * Skips inline scripts (no src), absolute URLs, and module specifiers.
 */
export function extractLinkedScripts(html: string, pagePath: string): LinkedScript[] {
  const dir = dirOf(pagePath);
  const results: LinkedScript[] = [];

  const tagRe = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(tagRe)) {
    const tag  = match[0];
    const src  = match[1].trim();
    const isAbsolute = /^(https?:)?\/\/|^data:/i.test(src);
    results.push({
      tag,
      src,
      isRelative: !isAbsolute,
      repoPath: isAbsolute ? undefined : resolveRelativePath(dir, src),
    });
  }
  return results;
}

// ── HTML transformation ───────────────────────────────────────────────

/**
 * Replace a <link rel="stylesheet"> tag with an inline <style> block.
 */
export function substituteLinkedStylesheet(
  html: string,
  original: LinkedStylesheet,
  cssContent: string,
): string {
  return html.replace(original.tag, `<style>\n${cssContent}\n</style>`);
}

/**
 * Replace a CSS @import rule inside a <style> block with the inlined content.
 * We wrap the imported CSS in a comment to aid debugging.
 */
export function substituteCssImport(
  html: string,
  cssImport: CssImport,
  cssContent: string,
): string {
  const replacement =
    `/* inlined: ${cssImport.repoPath} */\n${cssContent}\n/* end inlined */`;
  return html.replace(cssImport.rule, replacement);
}

// ── Image URL extraction ──────────────────────────────────────────────

/**
 * Extract all relative image/media URLs from an HTML string:
 * <img src>, <img srcset>, <video src>, <source src/srcset>,
 * and CSS url() references inside <style> blocks.
 * Returns deduplicated repo-relative paths.
 */
export function extractImageUrls(html: string, pagePath: string): string[] {
  const dir = dirOf(pagePath);
  const paths = new Set<string>();

  const add = (href: string) => {
    if (!href || /^(https?:)?\/\/|^data:|^#/i.test(href)) return;
    paths.add(resolveRelativePath(dir, href.trim()));
  };

  // <img src="...">
  for (const m of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) add(m[1]);

  // <img srcset="url 1x, url 2x">  /  <source srcset="...">
  for (const m of html.matchAll(/\bsrcset=["']([^"']+)["']/gi)) {
    for (const entry of m[1].split(',')) add(entry.trim().split(/\s+/)[0] ?? '');
  }

  // <video src>, <source src>, <audio src>
  for (const m of html.matchAll(/<(?:video|audio|source)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) add(m[1]);

  // CSS url() inside <style> blocks (catches background-image, @font-face, etc.)
  for (const styleM of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const urlM of styleM[1].matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(urlM[1]);
  }

  return [...paths];
}

// ── Fetch interface (injected so tests can mock it) ───────────────────

export type FetchFileFn = (path: string) => Promise<string>;

/**
 * Replace a <script src="..."> tag with an inline <script> block.
 * Preserves any type/defer/async attributes (minus src).
 */
export function substituteLinkedScript(
  html: string,
  original: LinkedScript,
  jsContent: string,
): string {
  // Build an inline script tag, copying any extra attributes except src
  const attribs = original.tag
    .replace(/<script\b/i, '')
    .replace(/>/i, '')
    .replace(/\bsrc=["'][^"']*["']/i, '')
    .trim();
  const inlineTag = `<script ${attribs}>\n${jsContent}\n</script>`;
  return html.replace(original.tag, inlineTag);
}

// ── Main inlining function ────────────────────────────────────────────

export interface InlineResult {
  html: string;
  inlinedCount: number;
  failedPaths: string[];
}

/**
 * Inline all relative CSS into the HTML string.
 *
 * @param html      Raw HTML from the repo
 * @param pagePath  Repo-relative path of this HTML file (e.g. "blog/post.html")
 * @param fetchFile Function that returns CSS content for a repo path.
 *                  Pass `(path) => readFile(path).then(f => f.content)` in production.
 */
/**
 * Inline all relative CSS and JavaScript into the HTML string.
 * CSS and JS served from raw.githubusercontent.com are blocked by browsers
 * because that server sends them as `Content-Type: text/plain` with
 * `X-Content-Type-Options: nosniff`. Inlining bypasses the MIME-type check.
 *
 * Binary assets (images, fonts) are NOT inlined — the <base> tag in the
 * HTML handles those; browsers accept binary assets regardless of MIME type.
 */
export async function inlineRelativeCss(
  html: string,
  pagePath: string,
  fetchFile: FetchFileFn,
): Promise<InlineResult> {
  const failedPaths: string[] = [];
  let inlinedCount = 0;

  // ── 1. Inline <link rel="stylesheet"> tags ──────────────────────
  // Use index-based iteration — never .indexOf() on PromiseSettledResult, which
  // is O(n) and can return a wrong index if two results happen to be identical.
  const links = extractLinkedStylesheets(html, pagePath).filter(l => l.isRelative);
  const linkResults = await Promise.allSettled(
    links.map(link => fetchFile(link.repoPath!).then(css => ({ link, css }))),
  );
  for (let i = 0; i < linkResults.length; i++) {
    const result = linkResults[i];
    if (result.status === 'fulfilled') {
      html = substituteLinkedStylesheet(html, result.value.link, result.value.css);
      inlinedCount++;
    } else {
      failedPaths.push(links[i]?.repoPath ?? '?');
    }
  }

  // ── 2. Inline @import inside <style> blocks ──────────────────────
  const imports = extractCssImports(html, pagePath);
  const importResults = await Promise.allSettled(
    imports.map(imp => fetchFile(imp.repoPath).then(css => ({ imp, css }))),
  );
  for (let i = 0; i < importResults.length; i++) {
    const result = importResults[i];
    if (result.status === 'fulfilled') {
      html = substituteCssImport(html, result.value.imp, result.value.css);
      inlinedCount++;
    } else {
      failedPaths.push(imports[i]?.repoPath ?? '?');
    }
  }

  // ── 3. Inline relative <script src="..."> tags ───────────────────
  const scripts = extractLinkedScripts(html, pagePath).filter(s => s.isRelative);
  const scriptResults = await Promise.allSettled(
    scripts.map(s => fetchFile(s.repoPath!).then(js => ({ s, js }))),
  );
  for (let i = 0; i < scriptResults.length; i++) {
    const result = scriptResults[i];
    if (result.status === 'fulfilled') {
      html = substituteLinkedScript(html, result.value.s, result.value.js);
      inlinedCount++;
    } else {
      failedPaths.push(scripts[i]?.repoPath ?? '?');
    }
  }

  return { html, inlinedCount, failedPaths };
}
