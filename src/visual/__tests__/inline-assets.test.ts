import { describe, it, expect, vi } from 'vitest';
import {
  resolveRelativePath,
  dirOf,
  extractLinkedStylesheets,
  extractCssImports,
  extractLinkedScripts,
  substituteLinkedStylesheet,
  substituteCssImport,
  substituteLinkedScript,
  inlineRelativeCss,
  type FetchFileFn,
  type LinkedStylesheet,
} from '../inline-assets';

// ── resolveRelativePath ───────────────────────────────────────────────

describe('resolveRelativePath', () => {
  it('resolves a simple relative path from repo root', () => {
    expect(resolveRelativePath('', 'styles.css')).toBe('styles.css');
  });

  it('resolves a path from a subdirectory', () => {
    expect(resolveRelativePath('blog/', 'styles.css')).toBe('blog/styles.css');
  });

  it('strips leading ./', () => {
    expect(resolveRelativePath('', './assets/app.css')).toBe('assets/app.css');
    expect(resolveRelativePath('blog/', './css/post.css')).toBe('blog/css/post.css');
  });

  it('resolves ../ up one directory', () => {
    expect(resolveRelativePath('blog/', '../shared/base.css')).toBe('shared/base.css');
  });

  it('resolves multiple ../ segments', () => {
    expect(resolveRelativePath('a/b/c/', '../../styles.css')).toBe('a/styles.css');
  });

  it('resolves ../ that goes to root', () => {
    expect(resolveRelativePath('blog/', '../styles.css')).toBe('styles.css');
  });

  it('does not produce leading slash', () => {
    expect(resolveRelativePath('', 'css/main.css')).not.toMatch(/^\//);
  });
});

// ── dirOf ─────────────────────────────────────────────────────────────

describe('dirOf', () => {
  it('returns empty string for root-level files', () => {
    expect(dirOf('index.html')).toBe('');
    expect(dirOf('about.html')).toBe('');
  });

  it('returns directory with trailing slash for nested files', () => {
    expect(dirOf('blog/post.html')).toBe('blog/');
    expect(dirOf('a/b/c/page.html')).toBe('a/b/c/');
  });
});

// ── extractLinkedStylesheets ──────────────────────────────────────────

describe('extractLinkedStylesheets', () => {
  it('finds a basic <link rel="stylesheet">', () => {
    const html = `<head><link rel="stylesheet" href="styles.css"></head>`;
    const links = extractLinkedStylesheets(html, 'index.html');
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('styles.css');
    expect(links[0].isRelative).toBe(true);
    expect(links[0].repoPath).toBe('styles.css');
  });

  it('handles single-quoted href', () => {
    const html = `<link rel='stylesheet' href='main.css'>`;
    const links = extractLinkedStylesheets(html, 'index.html');
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('main.css');
  });

  it('handles attributes in different order', () => {
    const html = `<link href="theme.css" rel="stylesheet" type="text/css">`;
    const links = extractLinkedStylesheets(html, 'index.html');
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('theme.css');
  });

  it('marks absolute URLs as non-relative', () => {
    const html = `<link rel="stylesheet" href="https://cdn.example.com/reset.css">`;
    const links = extractLinkedStylesheets(html, 'index.html');
    expect(links).toHaveLength(1);
    expect(links[0].isRelative).toBe(false);
    expect(links[0].repoPath).toBeUndefined();
  });

  it('marks protocol-relative URLs as non-relative', () => {
    const html = `<link rel="stylesheet" href="//fonts.googleapis.com/css2?family=Inter">`;
    const links = extractLinkedStylesheets(html, 'index.html');
    expect(links[0].isRelative).toBe(false);
  });

  it('resolves paths relative to the HTML file directory', () => {
    const html = `<link rel="stylesheet" href="../shared/base.css">`;
    const links = extractLinkedStylesheets(html, 'blog/post.html');
    expect(links[0].repoPath).toBe('shared/base.css');
  });

  it('resolves ./relative paths', () => {
    const html = `<link rel="stylesheet" href="./css/style.css">`;
    const links = extractLinkedStylesheets(html, 'index.html');
    expect(links[0].repoPath).toBe('css/style.css');
  });

  it('finds multiple stylesheets', () => {
    const html = `
      <link rel="stylesheet" href="reset.css">
      <link rel="stylesheet" href="https://cdn.example.com/lib.css">
      <link rel="stylesheet" href="main.css">
    `;
    const links = extractLinkedStylesheets(html, 'index.html');
    expect(links).toHaveLength(3);
    expect(links.filter(l => l.isRelative)).toHaveLength(2);
  });

  it('ignores <link> tags that are not stylesheets', () => {
    const html = `
      <link rel="icon" href="favicon.ico">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="stylesheet" href="style.css">
    `;
    const links = extractLinkedStylesheets(html, 'index.html');
    expect(links).toHaveLength(1);
  });

  it('returns empty array when no stylesheets exist', () => {
    const html = `<html><body><p>Hello</p></body></html>`;
    expect(extractLinkedStylesheets(html, 'index.html')).toHaveLength(0);
  });
});

// ── extractCssImports ─────────────────────────────────────────────────

describe('extractCssImports', () => {
  it('finds @import url("...") inside <style> blocks', () => {
    const html = `<style>@import url("base.css");</style>`;
    const imports = extractCssImports(html, 'index.html');
    expect(imports).toHaveLength(1);
    expect(imports[0].repoPath).toBe('base.css');
  });

  it('finds @import "..." (without url())', () => {
    const html = `<style>@import "theme.css";</style>`;
    const imports = extractCssImports(html, 'index.html');
    expect(imports).toHaveLength(1);
    expect(imports[0].repoPath).toBe('theme.css');
  });

  it("finds @import '...' with single quotes", () => {
    const html = `<style>@import url('fonts.css');</style>`;
    const imports = extractCssImports(html, 'index.html');
    expect(imports).toHaveLength(1);
    expect(imports[0].repoPath).toBe('fonts.css');
  });

  it('skips absolute @import URLs', () => {
    const html = `<style>@import url("https://fonts.googleapis.com/css2?family=Inter");</style>`;
    const imports = extractCssImports(html, 'index.html');
    expect(imports).toHaveLength(0);
  });

  it('resolves paths relative to HTML file', () => {
    const html = `<style>@import "../shared/base.css";</style>`;
    const imports = extractCssImports(html, 'blog/post.html');
    expect(imports[0].repoPath).toBe('shared/base.css');
  });

  it('returns empty array for HTML with no style blocks', () => {
    const html = `<html><head><link rel="stylesheet" href="a.css"></head></html>`;
    expect(extractCssImports(html, 'index.html')).toHaveLength(0);
  });
});

// ── substituteLinkedStylesheet ────────────────────────────────────────

describe('substituteLinkedStylesheet', () => {
  it('replaces a <link> tag with a <style> block', () => {
    const html = `<head><link rel="stylesheet" href="styles.css"></head>`;
    const link: LinkedStylesheet = {
      tag: '<link rel="stylesheet" href="styles.css">',
      href: 'styles.css',
      isRelative: true,
      repoPath: 'styles.css',
    };
    const result = substituteLinkedStylesheet(html, link, 'body { color: red; }');
    expect(result).toContain('<style>');
    expect(result).toContain('body { color: red; }');
    expect(result).toContain('</style>');
    expect(result).not.toContain('<link');
  });

  it('preserves surrounding HTML', () => {
    const html = `<head><title>Test</title><link rel="stylesheet" href="a.css"><meta></head>`;
    const link: LinkedStylesheet = {
      tag: '<link rel="stylesheet" href="a.css">',
      href: 'a.css',
      isRelative: true,
      repoPath: 'a.css',
    };
    const result = substituteLinkedStylesheet(html, link, '.a{}');
    expect(result).toContain('<title>Test</title>');
    expect(result).toContain('<meta>');
  });
});

// ── substituteCssImport ───────────────────────────────────────────────

describe('substituteCssImport', () => {
  it('replaces @import rule with inlined CSS content', () => {
    const html = `<style>@import "base.css"; body { margin: 0; }</style>`;
    const result = substituteCssImport(
      html,
      { rule: '@import "base.css";', repoPath: 'base.css' },
      '.base { color: blue; }',
    );
    expect(result).toContain('.base { color: blue; }');
    expect(result).not.toContain('@import "base.css";');
    expect(result).toContain('body { margin: 0; }'); // other rules preserved
  });
});

// ── extractLinkedScripts ──────────────────────────────────────────

describe('extractLinkedScripts', () => {
  it('finds a basic <script src="..."> tag', () => {
    const html = `<body><script src="app.js"></script></body>`;
    const scripts = extractLinkedScripts(html, 'index.html');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe('app.js');
    expect(scripts[0].isRelative).toBe(true);
    expect(scripts[0].repoPath).toBe('app.js');
  });

  it('marks absolute script URLs as non-relative', () => {
    const html = `<script src="https://cdn.jsdelivr.net/npm/vue@3"></script>`;
    const scripts = extractLinkedScripts(html, 'index.html');
    expect(scripts[0].isRelative).toBe(false);
  });

  it('resolves subdirectory script paths', () => {
    const html = `<script src="../js/main.js"></script>`;
    const scripts = extractLinkedScripts(html, 'blog/post.html');
    expect(scripts[0].repoPath).toBe('js/main.js');
  });

  it('ignores inline scripts without src', () => {
    const html = `<script>console.log("hi");</script>`;
    expect(extractLinkedScripts(html, 'index.html')).toHaveLength(0);
  });
});

// ── substituteLinkedScript ────────────────────────────────────────

describe('substituteLinkedScript', () => {
  it('replaces a <script src> with an inline script', () => {
    const html = `<body><script src="app.js"></script></body>`;
    const script = { tag: '<script src="app.js"></script>', src: 'app.js', isRelative: true, repoPath: 'app.js' };
    const result = substituteLinkedScript(html, script, 'console.log(1)');
    expect(result).toContain('console.log(1)');
    expect(result).not.toContain('src="app.js"');
  });

  it('preserves defer attribute', () => {
    const html = `<script src="app.js" defer></script>`;
    const script = { tag: '<script src="app.js" defer></script>', src: 'app.js', isRelative: true, repoPath: 'app.js' };
    const result = substituteLinkedScript(html, script, 'var x=1');
    expect(result).toContain('defer');
  });
});

// ── inlineRelativeCss (integration) ──────────────────────────────────

describe('inlineRelativeCss', () => {
  const makeHtml = (extraHead = '', body = '<p>Hello</p>') =>
    `<!DOCTYPE html><html><head>${extraHead}</head><body>${body}</body></html>`;

  it('inlines a single relative stylesheet', async () => {
    const html = makeHtml('<link rel="stylesheet" href="style.css">');
    const fetch: FetchFileFn = async () => 'body { color: red; }';

    const { html: result, inlinedCount } = await inlineRelativeCss(html, 'index.html', fetch);

    expect(inlinedCount).toBe(1);
    expect(result).toContain('<style>');
    expect(result).toContain('body { color: red; }');
    expect(result).not.toContain('href="style.css"');
  });

  it('inlines multiple stylesheets', async () => {
    const html = makeHtml(
      '<link rel="stylesheet" href="reset.css"><link rel="stylesheet" href="main.css">',
    );
    const fetch: FetchFileFn = async (path) =>
      path === 'reset.css' ? '* { margin: 0 }' : '.main { color: blue }';

    const { html: result, inlinedCount } = await inlineRelativeCss(html, 'index.html', fetch);

    expect(inlinedCount).toBe(2);
    expect(result).toContain('* { margin: 0 }');
    expect(result).toContain('.main { color: blue }');
  });

  it('skips absolute stylesheet URLs', async () => {
    const html = makeHtml('<link rel="stylesheet" href="https://cdn.example.com/lib.css">');
    const fetch = vi.fn<FetchFileFn>(async () => '');

    const { inlinedCount } = await inlineRelativeCss(html, 'index.html', fetch);

    expect(inlinedCount).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records failed paths when fetch throws', async () => {
    const html = makeHtml('<link rel="stylesheet" href="missing.css">');
    const fetch: FetchFileFn = async () => { throw new Error('404'); };

    const { html: result, failedPaths, inlinedCount } = await inlineRelativeCss(
      html, 'index.html', fetch,
    );

    expect(inlinedCount).toBe(0);
    expect(failedPaths).toContain('missing.css');
    // Original <link> tag should remain intact (not removed on failure)
    expect(result).toContain('href="missing.css"');
  });

  it('still inlines successful sheets when others fail', async () => {
    const html = makeHtml(
      '<link rel="stylesheet" href="ok.css"><link rel="stylesheet" href="fail.css">',
    );
    const fetch: FetchFileFn = async (path) => {
      if (path === 'fail.css') throw new Error('404');
      return '.ok { display: block }';
    };

    const { html: result, inlinedCount, failedPaths } = await inlineRelativeCss(
      html, 'index.html', fetch,
    );

    expect(inlinedCount).toBe(1);
    expect(failedPaths).toContain('fail.css');
    expect(result).toContain('.ok { display: block }');
  });

  it('resolves paths relative to the HTML file directory', async () => {
    const html = makeHtml('<link rel="stylesheet" href="../shared/base.css">');
    const fetch = vi.fn<FetchFileFn>(async () => '.base{}');

    await inlineRelativeCss(html, 'blog/post.html', fetch);

    expect(fetch).toHaveBeenCalledWith('shared/base.css');
  });

  it('handles ./relative paths', async () => {
    const html = makeHtml('<link rel="stylesheet" href="./css/style.css">');
    const fetch = vi.fn<FetchFileFn>(async () => '.s{}');

    await inlineRelativeCss(html, 'index.html', fetch);

    expect(fetch).toHaveBeenCalledWith('css/style.css');
  });

  it('inlines @import rules in <style> blocks', async () => {
    const html = makeHtml('<style>@import "base.css"; h1 { font-size: 2em; }</style>');
    const fetch: FetchFileFn = async () => 'body { font-family: sans-serif; }';

    const { html: result, inlinedCount } = await inlineRelativeCss(html, 'index.html', fetch);

    expect(inlinedCount).toBe(1);
    expect(result).toContain('body { font-family: sans-serif; }');
    expect(result).toContain('h1 { font-size: 2em; }'); // original CSS preserved
    expect(result).not.toContain('@import "base.css"');
  });

  it('returns original HTML unchanged when there are no relative stylesheets', async () => {
    const html = makeHtml('', '<h1>No CSS here</h1>');
    const fetch = vi.fn<FetchFileFn>(async () => '');

    const { html: result, inlinedCount } = await inlineRelativeCss(html, 'index.html', fetch);

    expect(inlinedCount).toBe(0);
    expect(result).toBe(html);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('inlines relative <script src> tags', async () => {
    const html = makeHtml('', '<p>Hello</p><script src="app.js"></script>');
    const fetch: FetchFileFn = async () => 'console.log("app");';
    const { html: result, inlinedCount } = await inlineRelativeCss(html, 'index.html', fetch);
    expect(inlinedCount).toBe(1);
    expect(result).toContain('console.log("app");');
    expect(result).not.toContain('src="app.js"');
  });

  it('does not duplicate inlining if called twice with same HTML', async () => {
    const html = makeHtml('<link rel="stylesheet" href="style.css">');
    const fetch: FetchFileFn = async () => '.a{}';

    const { html: once } = await inlineRelativeCss(html, 'index.html', fetch);
    // already inlined — no <link> to find
    const { inlinedCount: second } = await inlineRelativeCss(once, 'index.html', fetch);

    expect(second).toBe(0);
  });
});
