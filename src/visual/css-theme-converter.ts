/**
 * css-theme-converter.ts
 *
 * Algorithmically converts arbitrary CSS into the website builder's
 * CSS custom property system.  Extracts dominant colors / fonts / radius,
 * rewrites every hardcoded color value to var(--name, fallback), and
 * generates a :root {} block — making any imported page instantly
 * compatible with the Look system.
 *
 * Pure functions only — no DOM, no module state, no side effects.
 */

// ── Public types ──────────────────────────────────────────────────────────

export interface OriginalLook {
  /** Standard theme variable names → original extracted values */
  vars: Record<string, string>;
}

export interface ConversionStats {
  colorsReplaced:  number;
  uniqueColors:    number;
  fontsFound:      number;
  radiusFound:     boolean;
}

export interface ConversionResult {
  /** Rewritten CSS — all hardcoded colors become var(--name, fallback) */
  convertedCss:  string;
  /** Snapshot of original colors for the "Original" Look entry */
  originalLook:  OriginalLook;
  stats:         ConversionStats;
}

// ── Color math ────────────────────────────────────────────────────────────

type RGB = [number, number, number];
type HSL = [number, number, number];

function hexToRgb(hex: string): RGB | null {
  const h = hex.replace('#', '').toLowerCase();
  if (h.length === 3) {
    return [
      parseInt(h[0]! + h[0]!, 16),
      parseInt(h[1]! + h[1]!, 16),
      parseInt(h[2]! + h[2]!, 16),
    ];
  }
  if (h.length >= 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return null;
}

function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d   = max - min;
  const s   = d / (l > 0.5 ? 2 - max - min : max + min);
  let h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6
        : max === g ? ((b - r) / d + 2) / 6
        :             ((r - g) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)))
      .toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Normalise any hex color to lowercase #rrggbb */
function normHex(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex.toLowerCase();
  return '#' + rgb.map(n => n.toString(16).padStart(2, '0')).join('');
}

function hexToHsl(hex: string): HSL {
  const rgb = hexToRgb(hex);
  if (!rgb) return [0, 0, 50];
  return rgbToHsl(...rgb);
}

/** Perceptual distance between two colors in HSL space */
function colorDist(a: string, b: string): number {
  const [h1, s1, l1] = hexToHsl(a);
  const [h2, s2, l2] = hexToHsl(b);
  const dh = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2)) / 3;
  return Math.sqrt(dh ** 2 + (s1 - s2) ** 2 + (l1 - l2) ** 2);
}

function shiftL(hex: string, delta: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, Math.min(100, l + delta)));
}

// ── Named color lookup ────────────────────────────────────────────────────

const NAMED: Record<string, string> = {
  white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000',
  blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
  pink: '#ffc0cb', gray: '#808080', grey: '#808080', silver: '#c0c0c0',
  navy: '#000080', teal: '#008080', cyan: '#00ffff', magenta: '#ff00ff',
  lime: '#00ff00', maroon: '#800000', olive: '#808000', aqua: '#00ffff',
  transparent: 'skip', currentcolor: 'skip', inherit: 'skip',
};

// ── Color extraction ──────────────────────────────────────────────────────

interface ColorUsage {
  count:       number;
  bgCount:     number;  // used in background-color / fill / background shorthand
  textCount:   number;  // used in color / stroke
  borderCount: number;  // used in border* / outline* / box-shadow
  bodyCtx:     boolean; // found on body / :root / html
  headingCtx:  boolean; // found on h1-h6
  linkCtx:     boolean; // found on a / button / .btn
}

const isBgProp     = (p: string) => /^(background(-color)?|fill)$/.test(p);
const isTextProp   = (p: string) => /^(color|stroke|caret-color)$/.test(p);
const isBorderProp = (p: string) => /^(border(-[a-z]+)?-color|outline(-color)?|box-shadow|text-shadow)$/.test(p);
const isBodySel    = (s: string) => /\b(body|:root|html)\b/.test(s);
const isHeadingSel = (s: string) => /\bh[1-6]\b/.test(s);
const isLinkSel    = (s: string) => /\b(a|button)\b|\.btn\b/.test(s);

/** Strip comments, keeping positions intact by replacing with spaces */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));
}

function extractColorUsages(css: string): Map<string, ColorUsage> {
  const usages = new Map<string, ColorUsage>();
  const clean  = stripComments(css);

  // Stack-based rule walker — handles @media / @supports / any nesting depth.
  // We track open braces; only "leaf" blocks (no nested {}) are CSS declarations.
  const selectorStack: string[] = [];
  let selectorStart = 0;
  let i = 0;

  const processBlock = (selector: string, body: string) => {
    const isBody = isBodySel(selector);
    const isHead = isHeadingSel(selector);
    const isLink = isLinkSel(selector);

    const declRe = /([\w-]+)\s*:\s*([^;]+)/g;
    let dm;
    while ((dm = declRe.exec(body)) !== null) {
      const prop  = dm[1].toLowerCase().trim();
      const value = dm[2].trim();
      if (/var\s*\(|gradient/.test(value)) continue;

      const isBg  = isBgProp(prop);
      const isTxt = isTextProp(prop);
      const isBrd = isBorderProp(prop);

      const addColor = (hex: string) => {
        const u = usages.get(hex) ?? {
          count: 0, bgCount: 0, textCount: 0, borderCount: 0,
          bodyCtx: false, headingCtx: false, linkCtx: false,
        };
        u.count++;
        if (isBg)  u.bgCount++;
        if (isTxt) u.textCount++;
        if (isBrd) u.borderCount++;
        if (isBody && (isBg || isTxt)) u.bodyCtx = true;
        if (isHead && isTxt) u.headingCtx = true;
        if (isLink && (isTxt || isBg)) u.linkCtx = true;
        usages.set(hex, u);
      };

      const hexRe = /#([0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)\b/g;
      let hm;
      while ((hm = hexRe.exec(value)) !== null) addColor(normHex('#' + hm[1]));

      const rgbRe = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g;
      let rm;
      while ((rm = rgbRe.exec(value)) !== null) {
        const hex = '#' + [+rm[1]!, +rm[2]!, +rm[3]!]
          .map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('');
        addColor(hex);
      }

      for (const t of value.toLowerCase().split(/[\s,()]/)) {
        const r = NAMED[t];
        if (r && r !== 'skip') addColor(r);
      }
    }
  };

  while (i < clean.length) {
    const ch = clean[i];
    if (ch === '{') {
      selectorStack.push(clean.slice(selectorStart, i).trim());
      selectorStart = i + 1;
    } else if (ch === '}') {
      if (selectorStack.length > 0) {
        const selector = selectorStack[selectorStack.length - 1]!;
        const body = clean.slice(selectorStart, i);
        // Leaf block = no nested braces → actual CSS declarations
        if (!body.includes('{')) processBlock(selector, body);
        selectorStack.pop();
        selectorStart = i + 1;
      }
    }
    i++;
  }

  return usages;
}

// ── Clustering ────────────────────────────────────────────────────────────

/** Returns Map<hex, clusterRepresentative> */
function clusterColors(usages: Map<string, ColorUsage>, threshold = 14): Map<string, string> {
  const reps: string[] = [];
  const mapping = new Map<string, string>();
  for (const hex of usages.keys()) {
    let found = false;
    for (const rep of reps) {
      if (colorDist(hex, rep) < threshold) {
        mapping.set(hex, rep);
        found = true;
        break;
      }
    }
    if (!found) { reps.push(hex); mapping.set(hex, hex); }
  }
  return mapping;
}

// ── Role assignment ───────────────────────────────────────────────────────

interface ClusterInfo {
  hex:  string;
  h: number; s: number; l: number;
  count: number; bgCount: number; textCount: number; borderCount: number;
  bodyCtx: boolean; headingCtx: boolean; linkCtx: boolean;
}

function buildClusterMap(
  clusterMap: Map<string, string>,
  usages: Map<string, ColorUsage>,
): Map<string, ClusterInfo> {
  const result = new Map<string, ClusterInfo>();
  for (const [hex, rep] of clusterMap) {
    const u = usages.get(hex)!;
    const [h, s, l] = hexToHsl(rep);
    const existing = result.get(rep);
    if (existing) {
      existing.count       += u.count;
      existing.bgCount     += u.bgCount;
      existing.textCount   += u.textCount;
      existing.borderCount += u.borderCount;
      if (u.bodyCtx)    existing.bodyCtx    = true;
      if (u.headingCtx) existing.headingCtx = true;
      if (u.linkCtx)    existing.linkCtx    = true;
    } else {
      result.set(rep, { hex: rep, h, s, l, ...u });
    }
  }
  return result;
}

interface RoleResult {
  primary: string; accent: string;
  bg: string; bgAlt: string;
  text: string; textMuted: string;
}

function assignRoles(clusters: Map<string, ClusterInfo>): RoleResult {
  const items = [...clusters.values()];
  const used  = new Set<string>();

  function pick(score: (c: ClusterInfo) => number, fallback: string): string {
    const eligible = items
      .filter(c => !used.has(c.hex))
      .map(c => ({ ...c, score: score(c) }))
      .filter(c => c.score > -999)
      .sort((a, b) => b.score - a.score);
    const winner = eligible[0]?.hex ?? null;
    if (winner) used.add(winner);
    return winner ?? fallback;
  }

  // ── bg: lightest, especially if used on body background ──────────────
  const bg = pick(
    c => c.l > 80
      ? c.l + (c.bgCount * 8) + (c.bodyCtx && c.bgCount > 0 ? 50 : 0) - c.s
      : -999,
    '#ffffff',
  );

  // ── bgAlt: second-lightest, low saturation ────────────────────────────
  const bgAlt = pick(
    c => c.l > 65 && c.s < 30
      ? c.l + c.bgCount * 4
      : -999,
    shiftL(bg, -8),
  );

  // ── text: darkest, high text-context score ────────────────────────────
  const text = pick(
    c => c.l < 35
      ? (100 - c.l) * 2 + c.textCount * 8 + (c.bodyCtx && c.textCount > 0 ? 40 : 0)
      : -999,
    '#1e293b',
  );

  // ── textMuted: medium-dark, low saturation ────────────────────────────
  const textMuted = pick(
    c => c.l >= 30 && c.l <= 60 && c.s < 25
      ? (60 - c.l) + c.textCount * 4
      : -999,
    shiftL(text, 28),
  );

  // ── primary: most saturated brand color, link/button context wins ─────
  const primary = pick(
    c => c.s > 20 && c.l > 20 && c.l < 75
      ? c.s * 2 + c.count + (c.linkCtx ? 30 : 0)
      : -999,
    '#6366f1',
  );

  // ── accent: second saturated color (for CTAs, borders) ───────────────
  const accent = pick(
    c => c.s > 15 && c.l > 20 && c.l < 80
      ? c.s + c.count + (c.borderCount * 2)
      : -999,
    primary,
  );

  return { bg, bgAlt, text, textMuted, primary, accent };
}

// ── Font extraction ───────────────────────────────────────────────────────

const GENERIC_FONTS = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'inherit', 'initial', 'unset', 'revert',
  '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto',
  'helvetica neue', 'arial',
]);

function extractFonts(css: string): { heading: string; body: string } {
  const clean   = stripComments(css);
  const heading: string[] = [];
  const body:    string[] = [];

  const ruleRe = /([^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(clean)) !== null) {
    const selector = m[1].trim();
    const blockStr = m[2];
    const isHead   = isHeadingSel(selector);

    const ffRe = /font-family\s*:\s*([^;]+)/gi;
    let fm;
    while ((fm = ffRe.exec(blockStr)) !== null) {
      const name = fm[1].split(',')[0]!.replace(/['"]/g, '').trim();
      if (!name || GENERIC_FONTS.has(name.toLowerCase())) continue;
      (isHead ? heading : body).push(name);
    }
  }

  const headingFont = heading[0] ?? body[0] ?? 'Inter';
  const bodyFont    = body[0]    ?? headingFont;
  return { heading: headingFont, body: bodyFont };
}

// ── Radius extraction ─────────────────────────────────────────────────────

function extractRadius(css: string): string | null {
  const clean  = stripComments(css);
  const values: number[] = [];
  const pxRe   = /border-radius\s*:\s*([\d.]+)px/g;
  let m;
  while ((m = pxRe.exec(clean)) !== null) {
    const v = parseFloat(m[1]);
    if (v > 0 && v <= 32) values.push(v);
  }
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return String(Math.round(values[Math.floor(values.length / 2)]!));
}

// ── CSS rewriter ──────────────────────────────────────────────────────────

/**
 * Build a map of every cluster member → the CSS variable name for its role.
 * Excludes colors that weren't assigned a role.
 */
function buildVarMap(
  roles: RoleResult,
  clusterMap: Map<string, string>,
): Map<string, string> {
  const roleToVar: Record<string, string> = {
    [roles.bg]:        '--color-bg',
    [roles.bgAlt]:     '--color-bg-alt',
    [roles.text]:      '--color-text',
    [roles.textMuted]: '--color-text-muted',
    [roles.primary]:   '--color-primary',
    [roles.accent]:    '--color-accent',
  };

  const varMap = new Map<string, string>();
  for (const [original, rep] of clusterMap) {
    const varName = roleToVar[rep];
    if (varName) varMap.set(original, varName);
  }
  return varMap;
}

/** Escape a string for use inside a RegExp */
function reEsc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace all occurrences of each color in `varMap` with var(--name, fallback).
 * Handles: #rrggbb, #rgb (shorthand), rgb(r,g,b), rgba(r,g,b,1).
 * Does NOT touch colors already inside var() expressions.
 */
function rewriteColors(css: string, varMap: Map<string, string>): { css: string; replaced: number } {
  // Sort by hex string length desc so #ffffff is tried before #fff
  const entries = [...varMap.entries()].sort((a, b) => b[0].length - a[0].length);
  let result   = css;
  let replaced = 0;

  for (const [hex, varName] of entries) {
    const fallback = hex;
    const h6 = hex.slice(1); // without '#'

    const sub = (pattern: RegExp, display: string): void => {
      result = result.replace(pattern, (match, ...args) => {
        // The second-to-last arg is the offset, last is the full string being searched.
        // This is precise per-occurrence — no indexOf ambiguity with repeated colors.
        const offset: number = args[args.length - 2] as number;
        const str: string    = args[args.length - 1] as string;
        // Check if this occurrence is already inside a var(…) by scanning backward
        const before = str.slice(Math.max(0, offset - 60), offset);
        if (/var\s*\([^)]*$/.test(before)) return match; // already wrapped
        replaced++;
        return `var(${varName}, ${display})`;
      });
    };

    // 6-char hex
    sub(new RegExp(`#${reEsc(h6)}\\b`, 'gi'), fallback);

    // 3-char shorthand (only if all pairs are equal: #aabbcc → #abc)
    if (h6[0] === h6[1] && h6[2] === h6[3] && h6[4] === h6[5]) {
      const short = h6[0]! + h6[2]! + h6[4]!;
      sub(new RegExp(`#${reEsc(short)}\\b`, 'gi'), fallback);
    }

    // rgb/rgba equivalents
    const rgb = hexToRgb(hex);
    if (rgb) {
      const [r, g, b] = rgb;
      sub(new RegExp(`rgb\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*\\)`, 'gi'), fallback);
      sub(new RegExp(`rgba\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*,\\s*1\\s*\\)`, 'gi'), fallback);
    }
  }

  return { css: result, replaced };
}

// ── Root block generation ─────────────────────────────────────────────────

function buildRootBlock(
  roles: RoleResult,
  fonts: { heading: string; body: string },
  radius: string | null,
): string {
  const lines = [
    `:root {`,
    `  --color-primary:    ${roles.primary};`,
    `  --color-accent:     ${roles.accent};`,
    `  --color-bg:         ${roles.bg};`,
    `  --color-bg-alt:     ${roles.bgAlt};`,
    `  --color-text:       ${roles.text};`,
    `  --color-text-muted: ${roles.textMuted};`,
    `  --font-heading:     '${fonts.heading}', sans-serif;`,
    `  --font-body:        '${fonts.body}', sans-serif;`,
    ...(radius ? [`  --radius:           ${radius};`] : []),
    `}`,
  ];
  return lines.join('\n');
}

/** If the CSS already has a :root {} block, inject vars into it; otherwise prepend. */
function injectRootBlock(css: string, rootBlock: string): string {
  const rootMatch = /:root\s*\{/.exec(css);
  if (rootMatch) {
    // Inject variables at the top of the existing :root block
    const insertAt = rootMatch.index + rootMatch[0].length;
    const varLines = rootBlock
      .replace(/^:root\s*\{/, '')
      .replace(/\}$/, '')
      .trim();
    return css.slice(0, insertAt) + '\n' + varLines + '\n' + css.slice(insertAt);
  }
  return rootBlock + '\n\n' + css;
}

// ── Main entry point ──────────────────────────────────────────────────────

export function convertCssToTheme(inputCss: string): ConversionResult {
  // 1. Extract color usages with context
  const usages     = extractColorUsages(inputCss);

  // 2. Cluster similar colors
  const clusterMap = clusterColors(usages);

  // 3. Aggregate stats per cluster representative
  const clusters   = buildClusterMap(clusterMap, usages);

  // 4. Assign semantic roles
  const roles      = assignRoles(clusters);

  // 5. Extract fonts and radius
  const fonts  = extractFonts(inputCss);
  const radius = extractRadius(inputCss);

  // 6. Build the color → var-name map
  const varMap = buildVarMap(roles, clusterMap);

  // 7. Rewrite colors in the CSS
  const { css: rewritten, replaced } = rewriteColors(inputCss, varMap);

  // 8. Generate :root block and inject
  const rootBlock   = buildRootBlock(roles, fonts, radius);
  const convertedCss = injectRootBlock(rewritten, rootBlock);

  // 9. Build "Original" Look vars (original color values → standard var names)
  const originalLook: OriginalLook = {
    vars: {
      '--color-primary':    roles.primary,
      '--color-accent':     roles.accent,
      '--color-bg':         roles.bg,
      '--color-bg-alt':     roles.bgAlt,
      '--color-text':       roles.text,
      '--color-text-muted': roles.textMuted,
      '--font-heading':     `'${fonts.heading}', sans-serif`,
      '--font-body':        `'${fonts.body}', sans-serif`,
      ...(radius ? { '--radius': radius } : {}),
    },
  };

  return {
    convertedCss,
    originalLook,
    stats: {
      colorsReplaced:  replaced,
      uniqueColors:    usages.size,
      fontsFound:      fonts.heading !== 'Inter' || fonts.body !== 'Inter' ? 2 : 0,
      radiusFound:     radius !== null,
    },
  };
}

