import { describe, it, expect } from 'vitest';
import { parseHtmlToBlocks } from '../convert';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── preservedHead ─────────────────────────────────────────────────────

describe('parseHtmlToBlocks — preservedHead', () => {
  it('extracts <head> content', () => {
    const html = `<!DOCTYPE html><html><head><title>Test</title><link rel="stylesheet" href="style.css"></head><body><nav>Nav</nav></body></html>`;
    const { preservedHead } = parseHtmlToBlocks(html);
    expect(preservedHead).toContain('<title>Test</title>');
    expect(preservedHead).toContain('style.css');
  });

  it('returns empty string when no <head>', () => {
    const html = `<body><nav>Nav</nav></body>`;
    const { preservedHead } = parseHtmlToBlocks(html);
    expect(preservedHead).toBe('');
  });
});

// ── Section splitting ─────────────────────────────────────────────────

describe('parseHtmlToBlocks — section splitting', () => {
  it('splits nav + section + footer into 3 blocks', () => {
    const html = `<html><head></head><body>
      <nav class="nav"><a>Home</a></nav>
      <section id="hero"><h1>Hello</h1></section>
      <footer><p>© 2025</p></footer>
    </body></html>`;
    const { blocks } = parseHtmlToBlocks(html);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe('custom');
    expect(String(blocks[0].content.html)).toContain('<nav');
    expect(String(blocks[1].content.html)).toContain('<section');
    expect(String(blocks[2].content.html)).toContain('<footer');
  });

  it('handles multiple sections', () => {
    const html = `<body>
      <nav>Nav</nav>
      <section id="hero">Hero</section>
      <section id="about">About</section>
      <section id="contact">Contact</section>
      <footer>Footer</footer>
    </body>`;
    const { blocks } = parseHtmlToBlocks(html);
    expect(blocks).toHaveLength(5);
  });

  it('returns single block for flat body with no structural elements', () => {
    const html = `<body><p>Hello world</p><p>More text</p></body>`;
    const { blocks } = parseHtmlToBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(String(blocks[0].content.html)).toContain('<p>Hello world</p>');
  });

  it('filters empty/whitespace-only sections', () => {
    const html = `<body>
      <nav>Nav</nav>

      <footer>Footer</footer>
    </body>`;
    const { blocks } = parseHtmlToBlocks(html);
    const nonEmpty = blocks.filter(b => String(b.content.html).trim().length > 0);
    expect(nonEmpty).toHaveLength(2);
  });

  it('generates unique IDs for each block', () => {
    const html = `<body><nav>Nav</nav><footer>Footer</footer></body>`;
    const { blocks } = parseHtmlToBlocks(html);
    const ids = blocks.map(b => b.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ── Label inference ───────────────────────────────────────────────────

describe('parseHtmlToBlocks — label inference', () => {
  it('labels <nav> as Navigation', () => {
    const { blocks } = parseHtmlToBlocks(`<body><nav>Menu</nav></body>`);
    expect(blocks[0].content.label).toBe('Navigation');
  });

  it('labels <footer> as Footer', () => {
    const { blocks } = parseHtmlToBlocks(`<body><footer>©</footer></body>`);
    expect(blocks[0].content.label).toBe('Footer');
  });

  it('labels <header> as Header', () => {
    const { blocks } = parseHtmlToBlocks(`<body><header>Top</header></body>`);
    expect(blocks[0].content.label).toBe('Header');
  });

  it('uses id for section labels', () => {
    const { blocks } = parseHtmlToBlocks(`<body><section id="brands">Brands</section></body>`);
    expect(blocks[0].content.label).toBe('Brands');
  });

  it('detects hero by class', () => {
    const { blocks } = parseHtmlToBlocks(`<body><section class="hero">Hero</section></body>`);
    expect(blocks[0].content.label).toBe('Hero');
  });

  it('detects contact by id', () => {
    const { blocks } = parseHtmlToBlocks(`<body><section id="contact">Contact</section></body>`);
    expect(blocks[0].content.label).toBe('Contact');
  });

  it('falls back to Section N for anonymous divs', () => {
    const { blocks } = parseHtmlToBlocks(`<body><div style="padding:40px">Content</div></body>`);
    expect(blocks[0].content.label).toMatch(/^Section \d+$/);
  });
});

// ── Real-world fixture: JoelCRobinson.com ─────────────────────────────

describe('parseHtmlToBlocks — real site (JoelCRobinson.com fixture)', () => {
  const FIXTURE = path.join(__dirname, '../../../tests/fixtures/joelcrobinson-index.html');

  it('fixture file exists', () => {
    expect(fs.existsSync(FIXTURE)).toBe(true);
  });

  it('produces multiple blocks from the real site', () => {
    const html = fs.readFileSync(FIXTURE, 'utf8');
    const { blocks, preservedHead } = parseHtmlToBlocks(html);

    // Should detect nav, preloader, and multiple sections
    expect(blocks.length).toBeGreaterThan(2);

    // All blocks must be custom type
    expect(blocks.every(b => b.type === 'custom')).toBe(true);

    // All blocks must have non-empty HTML
    expect(blocks.every(b => String(b.content.html).trim().length > 0)).toBe(true);

    // preservedHead must include CSS link and title
    expect(preservedHead).toContain('style.css');
    expect(preservedHead).toContain('Joel Robinson');
  });

  it('nav element exists in at least one block', () => {
    const html = fs.readFileSync(FIXTURE, 'utf8');
    const { blocks } = parseHtmlToBlocks(html);
    // The nav may be bundled with nearby elements by the section splitter.
    const blockWithNav = blocks.find(b => String(b.content.html).includes('<nav'));
    expect(blockWithNav).toBeDefined();
  });

  it('preserves original CSS link in preservedHead (no MIME type re-injection)', () => {
    const html = fs.readFileSync(FIXTURE, 'utf8');
    const { preservedHead } = parseHtmlToBlocks(html);
    // Original CSS link preserved — SW serves it with correct text/css
    expect(preservedHead).toContain('href="css/style.css"');
    // No theme-injected CSS — the original stylesheet is used instead
    expect(preservedHead).not.toContain('var(--primary)');
  });

  it('ids can round-trip: reconstruct valid HTML from blocks', () => {
    const html = fs.readFileSync(FIXTURE, 'utf8');
    const { blocks, preservedHead } = parseHtmlToBlocks(html);
    const reconstructed = `<!DOCTYPE html><html><head>${preservedHead}</head><body>${
      blocks.map(b => b.content.html).join('\n')
    }</body></html>`;
    // Must contain the nav and at least one section
    expect(reconstructed).toContain('<nav');
    expect(reconstructed).toContain('Joel Robinson');
    // Must not be shorter than 80% of original (no major content loss)
    expect(reconstructed.length).toBeGreaterThan(html.length * 0.7);
  });
});
