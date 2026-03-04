// ── Utility helpers ───────────────────────────────────────────────────

export function escapeHtml(str: unknown): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

/**
 * Escape HTML then render inline markdown (**bold** and *italic*).
 * Collapses adjacent bold markers (****) that arise when document
 * extractors split a single bold run into multiple adjacent spans.
 * Use for long-form body text fields; not for headings or UI strings.
 */
export function renderInlineMarkdown(str: unknown): string {
  return escapeHtml(str)
    .replace(/\*{4}/g, '')                              // **** → merge adjacent bold spans
    .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')  // **bold**
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');          // *italic*
}

/**
 * Render a text field for display in blocks.
 * If content contains HTML formatting tags (stored by the rich text toolbar),
 * pass through with light sanitization. Otherwise, use markdown rendering.
 * Backward-compatible: existing markdown content continues to work.
 */
export function renderTextField(value: unknown): string {
  const str = String(value ?? '');
  if (/<(strong|em|span[\s>]|u\b|del\b|br[\s/])/.test(str)) {
    return str
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/ on\w+="[^"]*"/gi, '');
  }
  return renderInlineMarkdown(str);
}

/** Escape a value for use inside an HTML attribute (handles both quote styles). */
export function escapeAttr(str: unknown): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Collision-resistant ID using crypto.getRandomValues (CSPRNG). */
export function uid(): string {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return 'b' + buf[0].toString(36) + buf[1].toString(36);
}

export function pageUid(): string {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return 'p' + buf[0].toString(36) + buf[1].toString(36);
}

/** Shorten a heading to a concise nav label (≤ 28 chars, first 1–4 words). */
/** Strip markdown syntax (# headings, **bold**, *italic*, dangling *) from a string. */
export function stripMd(s: string): string {
  return s
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/\*+/g, '')
    .trim();
}

export function shortNavLabel(text: string): string {
  const plain = text.trim();
  if (plain.length <= 28) return plain;
  const words = plain.split(/\s+/);
  let out = '';
  for (const w of words.slice(0, 4)) {
    const candidate = out ? `${out} ${w}` : w;
    if (candidate.length > 28) break;
    out = candidate;
  }
  return out || plain.slice(0, 28);
}

/** Slugify a page title into a filename-safe path */
export function titleToPath(title: string, isHome: boolean): string {
  if (isHome) return 'index.html';
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s\-/]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return slug ? `${slug}.html` : 'page.html';
}

/** Map file extension to Monaco language id */
export function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss', sass: 'scss',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
    json: 'json', jsonc: 'json',
    md: 'markdown', mdx: 'markdown',
    yaml: 'yaml', yml: 'yaml',
    xml: 'xml', svg: 'xml',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
    sh: 'shell', bash: 'shell',
    toml: 'ini', txt: 'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

export function fileIconSvg(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const colors: Record<string, string> = {
    html: '#e37933', htm: '#e37933',
    css: '#519aba', scss: '#f55385',
    js: '#cbcb41', mjs: '#cbcb41',
    ts: '#519aba', tsx: '#519aba', jsx: '#cbcb41',
    json: '#cbcb41', md: '#519aba',
    // Images
    svg: '#ffb13b', png: '#a074c4', jpg: '#a074c4', jpeg: '#a074c4',
    gif: '#a074c4', webp: '#a074c4', ico: '#a074c4', bmp: '#a074c4',
    tiff: '#a074c4', avif: '#a074c4',
    // Video
    mp4: '#f97316', mov: '#f97316', webm: '#f97316', avi: '#f97316',
    mkv: '#f97316', m4v: '#f97316', ogv: '#f97316',
    // Audio
    mp3: '#fb923c', wav: '#fb923c', ogg: '#fb923c', flac: '#fb923c', m4a: '#fb923c',
    // Fonts
    woff: '#94a3b8', woff2: '#94a3b8', ttf: '#94a3b8', otf: '#94a3b8', eot: '#94a3b8',
    // Code
    py: '#3572A5', rb: '#cc342d', go: '#00acd7', rs: '#dea584',
    yaml: '#cc3e44', yml: '#cc3e44', sh: '#4caf50',
    // Docs
    pdf: '#ef4444',
  };
  const c = colors[ext] ?? '#888';
  return `<svg class="tree-item-icon" viewBox="0 0 16 16" fill="${c}"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/></svg>`;
}

/**
 * Allow only http/https/relative URLs. Strips javascript:, data:, vbscript: etc.
 * Returns '#' for unsafe URLs.
 */
export function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '#';
  // Allow relative, http, https, mailto, tel
  if (/^(https?:|mailto:|tel:|\/|#|\.)/.test(trimmed)) return trimmed;
  // Block javascript:, data:, vbscript:, and anything else
  return '#';
}

/** Cache-busts repeated calls by updating the sha map from a tree fetch */
export function cacheTreeShas(
  tree: Array<{ path: string; type: string; sha: string }>,
  shas: Record<string, string>,
): void {
  tree.forEach(f => { shas[f.path] = f.sha; });
}

/**
 * Returns a debounced version of fn that only executes after `ms` ms of silence.
 * Call .cancel() on the returned function to clear a pending invocation.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
): T & { cancel(): void } {
  let id: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: unknown[]) => {
    if (id !== null) clearTimeout(id);
    id = setTimeout(() => { id = null; fn(...args); }, ms);
  };
  debounced.cancel = () => { if (id !== null) { clearTimeout(id); id = null; } };
  return debounced as T & { cancel(): void };
}
