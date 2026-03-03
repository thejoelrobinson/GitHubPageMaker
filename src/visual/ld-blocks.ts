/* ============================================================
   Living Design 3.5 — Visual Editor Block Definitions
   Walmart Global Design System
   ============================================================ */

import { escapeHtml, renderInlineMarkdown, sanitizeUrl } from '../utils';
import { editAttr } from './blocks';
import type { BlockDef } from './blocks';
import type { Theme } from '../types';

// ── LD Design Tokens (inline-style values) ────────────────────────────
// These mirror tokens.css but are hardcoded here so render() can produce
// self-contained HTML strings without requiring an external stylesheet.

const LD = {
  // Brand colors (2025 Living Design 3.5)
  navy:         '#001e60',  // Bentonville Blue — primary brand navy
  navyLight:    '#00286b',
  trueBlue:     '#0053e2',  // True Blue — high-impact brand applications
  trueBlueDark: '#0041b5',
  blue:         '#0071ce',  // Interactive blue — UI components (buttons, links)
  blueHover:    '#005aa3',
  blueLight:    '#e5f2fc',
  blueMid:      '#cce5f9',
  everydayBlue: '#4dbdf5',  // Hierarchy / infographic use
  skyBlue:      '#a9ddf7',  // Hierarchy / infographic use
  yellow:       '#ffc220',  // Spark Yellow — accent, urgency, warmth
  white:        '#ffffff',
  textPrimary:  '#1a1a1a',  // Near-black for body copy
  textSec:      '#46464a',
  textTert:     '#72767c',
  textMuted:    '#adb0b5',
  bgAlt:        '#f4f4f4',
  border:       '#d4d7db',
  borderLight:  '#eaebec',
  green:        '#007600',
  greenLight:   '#e3f5e3',
  red:          '#cc0000',
  redLight:     '#fff0f0',
  orange:       '#e07200',
  orangeLight:  '#fff3e0',
  // Typography — Everyday Sans UI for digital, fallback to system sans
  font:         "'Everyday Sans UI','Everyday_Sans_UI','Helvetica Neue',Arial,sans-serif",
  fontLight:    300,  // price callouts
  fontReg:      400,  // body copy
  fontMed:      500,  // headlines, subheads
  fontBold:     700,  // inline headers, CTA labels
  // Brand OS corner radius: longest edge ÷ 15 → ~30px for standard frames
  radius:       '9999px',  // pill buttons
  radiusSm:     '6px',
  radiusMd:     '8px',
  radiusLg:     '12px',
  radiusFrame:  '30px',    // Brand OS Windows/Tiles frame radius
  shadow:       '0 2px 8px rgba(0,0,0,.10),0 4px 16px rgba(0,0,0,.06)',
  shadowLg:     '0 8px 24px rgba(0,0,0,.12),0 16px 40px rgba(0,0,0,.08)',
  shadowTile:   '0 4px 20px rgba(0,0,0,.08)',
} as const;

// ── Color math helpers ────────────────────────────────────────────────

/** Blend a hex color with white. opacity 0 = pure white, 1 = full color. */
function tintHex(hex: string, opacity: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (h.length !== 6) return hex; // fallback for invalid
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const rr = Math.round(r * opacity + 255 * (1 - opacity));
  const gg = Math.round(g * opacity + 255 * (1 - opacity));
  const bb = Math.round(b * opacity + 255 * (1 - opacity));
  return `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
}

/** Returns true if the hex color is perceived as dark (needs white text). */
function isHexDark(hex: string): boolean {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}

// ── Shared helpers ────────────────────────────────────────────────────

/**
 * LD button — matches production careers.walmart.com button specs exactly.
 *   primary      : #0071ce fill, white text, pill, h-10 (40px)
 *   secondary    : white bg, #0071ce border + text, pill, h-10 — ld-button-secondary
 *   outline-white: transparent, white border + text, pill — used on dark backgrounds
 *   ghost        : white bg, navy border + text, pill, h-12 (48px) — used for major CTAs on light bg
 *
 * Hover is handled via onmouseenter/onmouseleave on the element itself.
 */
function ldBtn(text: string, href: string, style: 'primary' | 'secondary' | 'outline-white' | 'ghost', t?: Theme): string {
  // Base: pill shape, bold, no underline, inline-flex centred
  const base = `display:inline-flex;align-items:center;justify-content:center;
                border-radius:${LD.radius};font-family:${LD.font};font-weight:700;
                text-decoration:none;cursor:pointer;transition:background .15s,border-color .15s;
                white-space:nowrap;`;
  const btnColor  = t?.accent ?? LD.blue;
  const cardColor = t?.bg     ?? LD.white;
  const bodyText  = t?.text   ?? LD.textPrimary;
  const variants: Record<string, string> = {
    // h-10 desktop = 40px, px-6, font-size 16px
    primary:
      `${base}height:40px;padding:0 24px;font-size:16px;
       background:${btnColor};color:${cardColor};border:2px solid transparent;`,
    // white bg, 1px border matching text, h-10
    secondary:
      `${base}height:40px;padding:0 24px;font-size:16px;
       background:${cardColor};color:${btnColor};border:1px solid ${btnColor};`,
    // for use on coloured/dark backgrounds
    'outline-white':
      `${base}height:40px;padding:0 24px;font-size:16px;
       background:transparent;color:${LD.white};border:2px solid rgba(255,255,255,.7);`,
    // h-12 = 48px, body text border, used for major CTAs on light bg
    ghost:
      `${base}height:48px;padding:0 24px;font-size:18px;
       background:${cardColor};color:${bodyText};border:2px solid ${bodyText};`,
  };
  const hoverBg: Record<string, string> = {
    primary:        LD.blueHover,
    secondary:      t?.bgAlt ?? '#f0f8ff',
    'outline-white': 'rgba(255,255,255,.12)',
    ghost:          t?.bgAlt ?? '#f4f4f4',
  };
  const hIn  = `this.style.background='${hoverBg[style]}'`;
  const hOut = `this.style.background='${style === 'primary' ? btnColor : style === 'ghost' ? cardColor : style === 'secondary' ? cardColor : 'transparent'}'`;
  return `<a href="${sanitizeUrl(escapeHtml(href))}" style="${variants[style]}" onmouseenter="${hIn}" onmouseleave="${hOut}">${escapeHtml(text)}</a>`;
}

/**
 * Walmart Spark — exact 6-path curved SVG from production careers.walmart.com.
 * ViewBox 0 0 29 32, rendered at requested square size.
 * Use fill="currentColor" by passing color="" to inherit from parent.
 */
export function walmartSparkSvg(size = 28, color: string = LD.yellow): string {
  const fill = color ? `fill="${color}"` : 'fill="currentColor"';
  return `<svg width="${size}" height="${size}" viewBox="0 0 29 32" ${fill} xmlns="http://www.w3.org/2000/svg" aria-label="Walmart Spark">
    <path d="M20.262 14.5793C20.9201 14.4422 26.7405 11.7382 27.2597 11.4342C28.446 10.7398 28.8521 9.20215 28.1672 7.99999C27.4823 6.79784 25.9656 6.38556 24.7799 7.07998C24.2601 7.38398 19.0405 11.1424 18.5944 11.6513C18.083 12.2347 17.9947 13.0689 18.3729 13.7329C18.7511 14.3969 19.5081 14.7366 20.262 14.5793Z"/>
    <path d="M27.2597 20.566C26.74 20.262 20.9196 17.558 20.262 17.4209C19.5081 17.2636 18.7511 17.6028 18.3729 18.2673C17.9947 18.9313 18.083 19.766 18.5944 20.349C19.0405 20.8578 24.2606 24.6162 24.7799 24.9202C25.9661 25.6147 27.4828 25.2024 28.1672 24.0002C28.8521 22.7975 28.4455 21.2599 27.2597 20.566Z"/>
    <path d="M14.5 20.5342C13.7435 20.5342 13.0748 21.0291 12.8323 21.7694C12.6208 22.4158 12.0201 28.8778 12.0201 29.4858C12.0201 30.8741 13.1301 32 14.5 32C15.8698 32 16.9798 30.8746 16.9798 29.4858C16.9798 28.8778 16.3791 22.4153 16.1676 21.7694C15.9251 21.0286 15.2564 20.5342 14.5 20.5342Z"/>
    <path d="M8.738 17.4209C8.08042 17.5579 2.2595 20.262 1.74028 20.566C0.553998 21.2604 0.147875 22.798 0.832813 24.0002C1.51775 25.2029 3.0344 25.6146 4.22015 24.9202C4.7399 24.6162 9.95953 20.8577 10.4056 20.3489C10.917 19.7655 11.0053 18.9313 10.6271 18.2673C10.2489 17.6033 9.49186 17.2635 8.738 17.4209Z"/>
    <path d="M4.2201 7.07998C3.03382 6.38556 1.51717 6.79784 0.832759 7.99999C0.147822 9.20268 0.554471 10.7403 1.74022 11.4342C2.25998 11.7382 8.08037 14.4422 8.73795 14.5793C9.4918 14.7366 10.2488 14.3974 10.6271 13.7329C11.0053 13.0689 10.9169 12.2342 10.4056 11.6513C9.95948 11.1424 4.73985 7.38398 4.2201 7.07998Z"/>
    <path d="M14.5 0C13.1306 0 12.0201 1.12535 12.0201 2.51418C12.0201 3.12219 12.6208 9.5847 12.8323 10.2311C13.0748 10.9719 13.7435 11.4663 14.5 11.4663C15.2564 11.4663 15.9251 10.9714 16.1676 10.2311C16.3791 9.5847 16.9798 3.12272 16.9798 2.51418C16.9798 1.12589 15.8698 0 14.5 0Z"/>
  </svg>`;
}

// ── LD Nav ────────────────────────────────────────────────────────────

export const ldNav: BlockDef = {
  name: 'LD Navigation',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 50" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="50" fill="#001e60"/>
    <circle cx="24" cy="25" r="8" fill="#ffc220"/>
    <text x="38" y="30" font-size="11" font-weight="700" fill="white" font-family="Arial">MySite</text>
    <rect x="130" y="20" width="26" height="7" rx="3" fill="rgba(255,255,255,.35)"/>
    <rect x="162" y="20" width="26" height="7" rx="3" fill="rgba(255,255,255,.35)"/>
    <rect x="194" y="20" width="26" height="7" rx="3" fill="rgba(255,255,255,.35)"/>
    <rect x="230" y="18" width="36" height="11" rx="9" fill="#0071ce"/>
  </svg>`,
  defaultContent: () => ({
    logo: 'MySite',
    link1Text: 'Home',   link1Href: '#',
    link2Text: 'About',  link2Href: '#about',
    link3Text: 'Shop',   link3Href: '#shop',
    ctaText: 'Get Started', ctaHref: '#contact',
    showCta: true,
  }),
  defaultSettings: (theme) => ({
    sticky: true,
    showSpark: true,
    navBg: theme.primary,
  }),
  render(block, theme, editing) {
    const pos = block.settings.sticky ? 'position:sticky;top:0;z-index:100;' : '';
    const links = [
      { t: block.content.link1Text, h: block.content.link1Href, f: 'link1Text' },
      { t: block.content.link2Text, h: block.content.link2Href, f: 'link2Text' },
      { t: block.content.link3Text, h: block.content.link3Href, f: 'link3Text' },
    ];
    return `<nav style="${pos}background:${String(block.settings.navBg)};font-family:${LD.font}">
  <div style="max-width:1200px;margin:0 auto;padding:0 32px;height:68px;display:flex;align-items:center;justify-content:space-between">
    <div style="display:flex;align-items:center;gap:10px">
      ${block.settings.showSpark ? walmartSparkSvg(24) : ''}
      <span${editAttr(block.id, 'logo', editing)} style="font-size:18px;font-weight:700;color:${LD.white};letter-spacing:-.3px">${escapeHtml(block.content.logo)}</span>
    </div>
    <div style="display:flex;gap:24px;align-items:center">
      ${links.map(l => `<a href="${sanitizeUrl(escapeHtml(l.h as string))}"${editAttr(block.id, l.f, editing)} style="color:rgba(255,255,255,.85);text-decoration:none;font-size:14px;font-weight:500">${escapeHtml(l.t)}</a>`).join('')}
      ${block.content.showCta ? ldBtn(block.content.ctaText as string, block.content.ctaHref as string, 'primary', theme) : ''}
    </div>
  </div>
</nav>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Links <small style="font-weight:400;opacity:.7">(click text in preview to edit)</small></label>
        <input type="text" value="${escapeHtml(block.content.link1Href)}" class="pp-input" data-key="content.link1Href" placeholder="Link 1 URL">
        <input type="text" value="${escapeHtml(block.content.link2Href)}" class="pp-input" style="margin-top:4px" data-key="content.link2Href" placeholder="Link 2 URL">
        <input type="text" value="${escapeHtml(block.content.link3Href)}" class="pp-input" style="margin-top:4px" data-key="content.link3Href" placeholder="Link 3 URL">
      </div>
      <div class="pp-group">
        <label class="pp-label">CTA Button</label>
        <input type="text" value="${escapeHtml(block.content.ctaHref)}" class="pp-input" data-key="content.ctaHref" placeholder="Button URL">
        <label class="pp-toggle" style="margin-top:6px"><input type="checkbox" ${block.content.showCta ? 'checked' : ''} data-key="content.showCta"><span>Show CTA button</span></label>
      </div>
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.navBg)}" class="pp-color" data-key="settings.navBg"><span class="pp-color-label">Nav Background</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-toggle"><input type="checkbox" ${block.settings.sticky ? 'checked' : ''} data-key="settings.sticky"><span>Sticky (scroll with page)</span></label>
        <label class="pp-toggle"><input type="checkbox" ${block.settings.showSpark ? 'checked' : ''} data-key="settings.showSpark"><span>Show Walmart Spark icon</span></label>
      </div>`;
  },
};

// ── LD Hero ───────────────────────────────────────────────────────────

export const ldHero: BlockDef = {
  name: 'LD Hero',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="120" fill="#001e60"/>
    <circle cx="250" cy="60" r="90" fill="none" stroke="#0071ce" stroke-width="28" opacity=".25"/>
    <circle cx="260" cy="70" r="55" fill="none" stroke="#0071ce" stroke-width="18" opacity=".2"/>
    <rect x="28" y="30" width="140" height="14" rx="3" fill="white"/>
    <rect x="28" y="52" width="110" height="8" rx="2" fill="rgba(255,255,255,.6)"/>
    <rect x="28" y="72" width="64" height="18" rx="9" fill="#0071ce"/>
    <rect x="100" y="72" width="64" height="18" rx="9" fill="transparent" stroke="rgba(255,255,255,.5)" stroke-width="1.5"/>
  </svg>`,
  defaultContent: () => ({
    heading:    'Savings you can feel.',
    subheading: 'Discover everyday low prices on everything you need — delivered fast.',
    btn1Text: 'Shop Now',     btn1Href: '#',
    btn2Text: 'Learn More',   btn2Href: '#about',
    showBtn2: true,
  }),
  defaultSettings: (theme) => ({
    height: 'large',
    align: 'left',
    bg:     theme.primary,
  }),
  render(block, theme, editing) {
    const heights: Record<string, string> = {
      small: '320px', medium: '460px', large: '580px', full: '100vh',
    };
    const minH    = heights[String(block.settings.height)] ?? '580px';
    const textA   = String(block.settings.align);
    const justify = textA === 'center' ? 'center' : textA === 'right' ? 'flex-end' : 'flex-start';

    return `<section style="background:${String(block.settings.bg)};min-height:${minH};display:flex;align-items:center;font-family:${LD.font};position:relative;overflow:hidden">
  <!-- decorative circles -->
  <div style="position:absolute;right:-120px;top:-80px;width:480px;height:480px;border-radius:50%;border:60px solid ${LD.blue};opacity:.12;pointer-events:none"></div>
  <div style="position:absolute;right:-60px;top:-20px;width:300px;height:300px;border-radius:50%;border:40px solid ${LD.blue};opacity:.1;pointer-events:none"></div>
  <div style="position:relative;z-index:1;max-width:1200px;width:100%;margin:0 auto;padding:80px 40px;text-align:${textA}">
    <div style="max-width:${textA === 'center' ? '720px' : '640px'};${textA === 'center' ? 'margin:0 auto' : ''}">
      <h1${editAttr(block.id, 'heading', editing)} style="font-size:clamp(2.4rem,5vw,3.8rem);font-weight:700;color:${LD.white};line-height:1.15;letter-spacing:-.04em;margin-bottom:20px">${renderInlineMarkdown(block.content.heading)}</h1>
      <p${editAttr(block.id, 'subheading', editing)} style="font-size:clamp(1rem,2vw,1.2rem);color:rgba(255,255,255,.8);line-height:1.6;margin-bottom:36px;max-width:520px;${textA === 'center' ? 'margin-left:auto;margin-right:auto' : ''}">${renderInlineMarkdown(block.content.subheading)}</p>
      <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:${justify}">
        ${ldBtn(block.content.btn1Text as string, block.content.btn1Href as string, 'primary', theme)}
        ${block.content.showBtn2 ? ldBtn(block.content.btn2Text as string, block.content.btn2Href as string, 'outline-white', theme) : ''}
      </div>
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Height</label>
        <select class="pp-select" data-key="settings.height">
          <option value="small"  ${block.settings.height === 'small'  ? 'selected' : ''}>Small (320px)</option>
          <option value="medium" ${block.settings.height === 'medium' ? 'selected' : ''}>Medium (460px)</option>
          <option value="large"  ${block.settings.height === 'large'  ? 'selected' : ''}>Large (580px)</option>
          <option value="full"   ${block.settings.height === 'full'   ? 'selected' : ''}>Full Screen</option>
        </select>
        <label class="pp-label" style="margin-top:8px">Alignment</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.settings.align === 'left'   ? 'active' : ''}" data-val="left"   data-key="settings.align">Left</button>
          <button class="pp-seg-btn ${block.settings.align === 'center' ? 'active' : ''}" data-val="center" data-key="settings.align">Center</button>
          <button class="pp-seg-btn ${block.settings.align === 'right'  ? 'active' : ''}" data-val="right"  data-key="settings.align">Right</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Button URLs</label>
        <input type="text" value="${escapeHtml(block.content.btn1Href)}" class="pp-input" data-key="content.btn1Href" placeholder="Primary button URL">
        <input type="text" value="${escapeHtml(block.content.btn2Href)}" class="pp-input" style="margin-top:4px" data-key="content.btn2Href" placeholder="Secondary button URL">
        <label class="pp-toggle" style="margin-top:6px"><input type="checkbox" ${block.content.showBtn2 ? 'checked' : ''} data-key="content.showBtn2"><span>Show second button</span></label>
      </div>`;
  },
};

// ── LD Features ───────────────────────────────────────────────────────

export const ldFeatures: BlockDef = {
  name: 'LD Features',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="100" fill="#f4f4f4"/>
    <rect x="14" y="18" width="76" height="64" rx="8" fill="white" stroke="#d4d7db" stroke-width="1"/>
    <rect x="102" y="18" width="76" height="64" rx="8" fill="white" stroke="#d4d7db" stroke-width="1"/>
    <rect x="190" y="18" width="76" height="64" rx="8" fill="white" stroke="#d4d7db" stroke-width="1"/>
    <rect x="24" y="28" width="20" height="20" rx="5" fill="#0071ce"/>
    <rect x="24" y="55" width="52" height="5" rx="2" fill="#1a1a1a"/>
    <rect x="24" y="65" width="52" height="4" rx="2" fill="#72767c"/>
    <rect x="112" y="28" width="20" height="20" rx="5" fill="#001e60"/>
    <rect x="112" y="55" width="52" height="5" rx="2" fill="#1a1a1a"/>
    <rect x="112" y="65" width="52" height="4" rx="2" fill="#72767c"/>
    <rect x="200" y="28" width="20" height="20" rx="5" fill="#ffc220"/>
    <rect x="200" y="55" width="52" height="5" rx="2" fill="#1a1a1a"/>
    <rect x="200" y="65" width="52" height="4" rx="2" fill="#72767c"/>
  </svg>`,
  defaultContent: () => ({
    sectionTitle: 'Why Living Design?',
    sectionSub:   'A unified system built for speed, accessibility, and Walmart scale.',
    c1Icon: '🛒', c1Title: 'Shop Anywhere',    c1Desc: 'Seamless experience on every device — phone, tablet, or desktop.',
    c2Icon: '⚡', c2Title: 'Blazing Fast',     c2Desc: 'Performance-first components that load instantly for every customer.',
    c3Icon: '♿', c3Title: 'Accessible',        c3Desc: 'WCAG 2.1 AA compliant out of the box — designed for everyone.',
    columns: 3,
  }),
  defaultSettings: (theme) => ({
    bg:     theme.bgAlt,
    cardBg: theme.bg,
    cardStyle: 'shadow',
  }),
  render(block, theme, editing) {
    const cols   = Math.min(Math.max(Number(block.content.columns) || 3, 1), 3);
    const shadow = block.settings.cardStyle === 'shadow' ? `box-shadow:${LD.shadow};` : '';
    const border = block.settings.cardStyle === 'border' ? `border:1.5px solid ${LD.border};` : '';

    const cards = Array.from({ length: cols }, (_, i) => i + 1);
    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:${LD.font}">
  <div style="max-width:1200px;margin:0 auto">
    <div style="text-align:center;margin-bottom:52px">
      <h2${editAttr(block.id, 'sectionTitle', editing)} style="font-size:clamp(1.7rem,3vw,2.4rem);font-weight:700;color:${theme.text};letter-spacing:-.03em;margin-bottom:12px">${escapeHtml(block.content.sectionTitle)}</h2>
      <p${editAttr(block.id, 'sectionSub', editing)} style="font-size:1.05rem;color:${theme.textMuted};max-width:520px;margin:0 auto;line-height:1.6">${escapeHtml(block.content.sectionSub)}</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:24px">
      ${cards.map(i => `<div style="background:${String(block.settings.cardBg)};border-radius:${LD.radiusLg};padding:32px 28px;${shadow}${border}">
        <div${editAttr(block.id, `c${i}Icon`, editing)} style="font-size:2rem;margin-bottom:16px">${escapeHtml(block.content[`c${i}Icon`] ?? '')}</div>
        <h3${editAttr(block.id, `c${i}Title`, editing)} style="font-size:1.1rem;font-weight:700;color:${theme.text};margin-bottom:10px;letter-spacing:-.02em">${escapeHtml(block.content[`c${i}Title`] ?? '')}</h3>
        <p${editAttr(block.id, `c${i}Desc`, editing)} style="color:${theme.textMuted};line-height:1.65;font-size:.95rem">${escapeHtml(block.content[`c${i}Desc`] ?? '')}</p>
      </div>`).join('')}
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Section Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.cardBg)}" class="pp-color" data-key="settings.cardBg"><span class="pp-color-label">Card Background</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Card Style</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.settings.cardStyle === 'shadow' ? 'active' : ''}" data-val="shadow" data-key="settings.cardStyle">Shadow</button>
          <button class="pp-seg-btn ${block.settings.cardStyle === 'border' ? 'active' : ''}" data-val="border" data-key="settings.cardStyle">Border</button>
          <button class="pp-seg-btn ${block.settings.cardStyle === 'flat' ? 'active' : ''}" data-val="flat" data-key="settings.cardStyle">Flat</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Columns</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.content.columns == 1 ? 'active' : ''}" data-val="1" data-key="content.columns">1</button>
          <button class="pp-seg-btn ${block.content.columns == 2 ? 'active' : ''}" data-val="2" data-key="content.columns">2</button>
          <button class="pp-seg-btn ${block.content.columns == 3 ? 'active' : ''}" data-val="3" data-key="content.columns">3</button>
        </div>
      </div>`;
  },
};

// ── LD Stats ──────────────────────────────────────────────────────────

export const ldStats: BlockDef = {
  name: 'LD Stats',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 80" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="80" fill="#001e60"/>
    <text x="24" y="32" font-size="18" font-weight="700" fill="white" font-family="Arial">4,700+</text>
    <text x="24" y="46" font-size="8" fill="rgba(255,255,255,.6)" font-family="Arial">Stores worldwide</text>
    <line x1="100" y1="16" x2="100" y2="60" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
    <text x="114" y="32" font-size="18" font-weight="700" fill="white" font-family="Arial">230M+</text>
    <text x="114" y="46" font-size="8" fill="rgba(255,255,255,.6)" font-family="Arial">Weekly customers</text>
    <line x1="190" y1="16" x2="190" y2="60" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
    <text x="204" y="32" font-size="18" font-weight="700" fill="#ffc220" font-family="Arial">$611B</text>
    <text x="204" y="46" font-size="8" fill="rgba(255,255,255,.6)" font-family="Arial">Annual revenue</text>
  </svg>`,
  defaultContent: () => ({
    s1Val: '4,700+', s1Label: 'Stores worldwide',
    s2Val: '230M+',  s2Label: 'Weekly customers',
    s3Val: '$611B',  s3Label: 'Annual revenue',
    s4Val: '#1',     s4Label: 'Retailer in the US',
    columns: 4,
  }),
  defaultSettings: (theme) => ({
    bg:          theme.primary,
    valColor:    theme.bg,
    accentColor: theme.accent,
    labelColor:  'rgba(255,255,255,0.65)',
  }),
  render(block, _theme, editing) {
    const cols = Math.min(Math.max(Number(block.content.columns) || 4, 2), 4);
    const stats = Array.from({ length: cols }, (_, i) => i + 1);
    return `<section style="background:${String(block.settings.bg)};padding:64px 40px;font-family:${LD.font}">
  <div style="max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(${cols},1fr);gap:0">
    ${stats.map((i, idx) => `<div style="text-align:center;padding:20px 24px;${idx > 0 ? `border-left:1px solid rgba(255,255,255,.15);` : ''}">
      <div${editAttr(block.id, `s${i}Val`, editing)} style="font-size:clamp(2rem,4vw,3rem);font-weight:700;color:${i === cols ? String(block.settings.accentColor) : String(block.settings.valColor)};line-height:1;letter-spacing:-.04em;margin-bottom:10px">${escapeHtml(block.content[`s${i}Val`] ?? '')}</div>
      <div${editAttr(block.id, `s${i}Label`, editing)} style="font-size:.9rem;color:${String(block.settings.labelColor)};font-weight:500;letter-spacing:.02em">${escapeHtml(block.content[`s${i}Label`] ?? '')}</div>
    </div>`).join('')}
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.valColor)}" class="pp-color" data-key="settings.valColor"><span class="pp-color-label">Number Color</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.accentColor)}" class="pp-color" data-key="settings.accentColor"><span class="pp-color-label">Accent (last stat)</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Columns</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.content.columns == 2 ? 'active' : ''}" data-val="2" data-key="content.columns">2</button>
          <button class="pp-seg-btn ${block.content.columns == 3 ? 'active' : ''}" data-val="3" data-key="content.columns">3</button>
          <button class="pp-seg-btn ${block.content.columns == 4 ? 'active' : ''}" data-val="4" data-key="content.columns">4</button>
        </div>
      </div>`;
  },
};

// ── LD Alert Banner ───────────────────────────────────────────────────

export const ldBanner: BlockDef = {
  name: 'LD Alert Banner',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 50" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="50" fill="#e5f2fc"/>
    <rect x="0" y="0" width="4" height="50" fill="#0071ce"/>
    <circle cx="22" cy="25" r="8" fill="none" stroke="#0071ce" stroke-width="1.5"/>
    <path d="M22 20v6" stroke="#0071ce" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="22" cy="28" r=".8" fill="#0071ce"/>
    <rect x="36" y="19" width="120" height="5" rx="2" fill="#0071ce"/>
    <rect x="36" y="27" width="90" height="4" rx="2" fill="#46464a"/>
  </svg>`,
  defaultContent: () => ({
    title:   'Important update',
    message: "We've made improvements to your experience. Review what changed.",
    actionText: 'Learn more',
    actionHref: '#',
    variant: 'info',
    showAction: true,
  }),
  defaultSettings: (_theme) => ({}),
  render(block, theme, editing) {
    const variant = String(block.content.variant) as 'info' | 'success' | 'warning' | 'error';
    const variantStyles = {
      info:    { bg: LD.blueLight,   bar: LD.blue,   icon: LD.blue,   iconPath: 'M8 7v5M8 13.5v.5', circle: true },
      success: { bg: LD.greenLight,  bar: LD.green,  icon: LD.green,  iconPath: 'M5 9l2.5 2.5L12 6', circle: true },
      warning: { bg: LD.orangeLight, bar: LD.orange, icon: LD.orange, iconPath: 'M8 5v5M8 12.5v.5', circle: false },
      error:   { bg: LD.redLight,    bar: LD.red,    icon: LD.red,    iconPath: 'M5 5l6 6M11 5l-6 6', circle: true },
    };
    const v = variantStyles[variant] ?? variantStyles.info;

    return `<div style="background:${v.bg};border-left:4px solid ${v.bar};padding:18px 28px;font-family:${LD.font};display:flex;align-items:flex-start;gap:14px">
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;margin-top:1px">
    ${v.circle ? `<circle cx="8" cy="8" r="7" stroke="${v.icon}" stroke-width="1.5"/>` : `<path d="M8 1L15 14H1Z" stroke="${v.icon}" stroke-width="1.5" stroke-linejoin="round"/>`}
    <path d="${v.iconPath}" stroke="${v.icon}" stroke-width="1.5" stroke-linecap="round"/>
  </svg>
  <div style="flex:1">
    <p${editAttr(block.id, 'title', editing)} style="font-size:15px;font-weight:700;color:${theme.text};margin:0 0 4px">${escapeHtml(block.content.title)}</p>
    <p${editAttr(block.id, 'message', editing)} style="font-size:14px;color:${theme.textMuted};margin:0;line-height:1.5">${escapeHtml(block.content.message)}</p>
    ${block.content.showAction ? `<a href="${sanitizeUrl(escapeHtml(block.content.actionHref as string))}"${editAttr(block.id, 'actionText', editing)} style="display:inline-block;margin-top:10px;font-size:14px;font-weight:700;color:${v.bar};text-decoration:underline;text-underline-offset:2px">${escapeHtml(block.content.actionText)}</a>` : ''}
  </div>
</div>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Variant</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.content.variant === 'info'    ? 'active' : ''}" data-val="info"    data-key="content.variant">Info</button>
          <button class="pp-seg-btn ${block.content.variant === 'success' ? 'active' : ''}" data-val="success" data-key="content.variant">Success</button>
          <button class="pp-seg-btn ${block.content.variant === 'warning' ? 'active' : ''}" data-val="warning" data-key="content.variant">Warning</button>
          <button class="pp-seg-btn ${block.content.variant === 'error'   ? 'active' : ''}" data-val="error"   data-key="content.variant">Error</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Action Link</label>
        <input type="text" value="${escapeHtml(block.content.actionHref)}" class="pp-input" data-key="content.actionHref" placeholder="https://…">
        <label class="pp-toggle" style="margin-top:6px"><input type="checkbox" ${block.content.showAction ? 'checked' : ''} data-key="content.showAction"><span>Show action link</span></label>
      </div>`;
  },
};

// ── LD CTA ────────────────────────────────────────────────────────────

export const ldCta: BlockDef = {
  name: 'LD Call to Action',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 80" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="ldg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#001e60"/><stop offset="100%" stop-color="#0071ce"/></linearGradient></defs>
    <rect width="280" height="80" fill="url(#ldg)"/>
    <rect x="40" y="18" width="140" height="12" rx="3" fill="white"/>
    <rect x="60" y="36" width="100" height="8" rx="2" fill="rgba(255,255,255,.6)"/>
    <rect x="88" y="54" width="44" height="14" rx="7" fill="#0071ce"/>
    <rect x="140" y="54" width="52" height="14" rx="7" fill="transparent" stroke="rgba(255,255,255,.5)" stroke-width="1.5"/>
  </svg>`,
  defaultContent: () => ({
    heading:    'Ready to get started?',
    subheading: 'Join millions of customers who trust us every day.',
    btn1Text: 'Create Account', btn1Href: '#signup',
    btn2Text: 'Talk to Sales',  btn2Href: '#contact',
    showBtn2: true,
  }),
  defaultSettings: (theme) => ({
    gradientFrom: theme.primary,
    gradientTo:   theme.accent,
    align: 'center',
  }),
  render(block, theme, editing) {
    const textA   = String(block.settings.align);
    const justify = textA === 'center' ? 'center' : textA === 'right' ? 'flex-end' : 'flex-start';
    return `<section style="background:linear-gradient(135deg,${String(block.settings.gradientFrom)} 0%,${String(block.settings.gradientTo)} 100%);padding:80px 40px;font-family:${LD.font};text-align:${textA}">
  <div style="max-width:720px;margin:0 auto">
    <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(1.8rem,4vw,2.8rem);font-weight:700;color:${LD.white};letter-spacing:-.04em;margin-bottom:14px;line-height:1.2">${renderInlineMarkdown(block.content.heading)}</h2>
    <p${editAttr(block.id, 'subheading', editing)} style="font-size:1.1rem;color:rgba(255,255,255,.8);margin-bottom:36px;line-height:1.6">${renderInlineMarkdown(block.content.subheading)}</p>
    <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:${justify}">
      ${ldBtn(block.content.btn1Text as string, block.content.btn1Href as string, 'primary', theme)}
      ${block.content.showBtn2 ? ldBtn(block.content.btn2Text as string, block.content.btn2Href as string, 'outline-white', theme) : ''}
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.gradientFrom)}" class="pp-color" data-key="settings.gradientFrom"><span class="pp-color-label">Gradient From</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.gradientTo)}" class="pp-color" data-key="settings.gradientTo"><span class="pp-color-label">Gradient To</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Alignment</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.settings.align === 'left'   ? 'active' : ''}" data-val="left"   data-key="settings.align">Left</button>
          <button class="pp-seg-btn ${block.settings.align === 'center' ? 'active' : ''}" data-val="center" data-key="settings.align">Center</button>
          <button class="pp-seg-btn ${block.settings.align === 'right'  ? 'active' : ''}" data-val="right"  data-key="settings.align">Right</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Button URLs</label>
        <input type="text" value="${escapeHtml(block.content.btn1Href)}" class="pp-input" data-key="content.btn1Href" placeholder="Primary URL">
        <input type="text" value="${escapeHtml(block.content.btn2Href)}" class="pp-input" style="margin-top:4px" data-key="content.btn2Href" placeholder="Secondary URL">
        <label class="pp-toggle" style="margin-top:6px"><input type="checkbox" ${block.content.showBtn2 ? 'checked' : ''} data-key="content.showBtn2"><span>Show second button</span></label>
      </div>`;
  },
};

// ── LD Form ───────────────────────────────────────────────────────────

export const ldForm: BlockDef = {
  name: 'LD Contact Form',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="120" fill="#f4f4f4"/>
    <rect x="24" y="16" width="100" height="7" rx="2" fill="#1a1a1a"/>
    <rect x="24" y="28" width="70" height="5" rx="2" fill="#72767c"/>
    <rect x="24" y="44" width="100" height="18" rx="6" fill="white" stroke="#d4d7db" stroke-width="1.5"/>
    <rect x="140" y="44" width="116" height="18" rx="6" fill="white" stroke="#d4d7db" stroke-width="1.5"/>
    <rect x="24" y="72" width="232" height="18" rx="6" fill="white" stroke="#d4d7db" stroke-width="1.5"/>
    <rect x="24" y="100" width="80" height="14" rx="7" fill="#0071ce"/>
  </svg>`,
  defaultContent: () => ({
    heading:       'Get in touch',
    subheading:    'We\'d love to hear from you. Fill out the form and we\'ll be in touch shortly.',
    namePlaceholder:    'Full name',
    emailPlaceholder:   'Email address',
    messagePlaceholder: 'Your message',
    submitText: 'Send Message',
    formAction: '#',
  }),
  defaultSettings: (theme) => ({
    bg:      theme.bgAlt,
    cardBg:  theme.bg,
    layout:  'split',
  }),
  render(block, theme, editing) {
    const isSplit = block.settings.layout === 'split';
    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:${LD.font}">
  <div style="max-width:1000px;margin:0 auto;${isSplit ? 'display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:start' : 'max-width:640px'}">
    ${isSplit ? `<div>
      <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(1.7rem,3vw,2.4rem);font-weight:700;color:${theme.text};letter-spacing:-.04em;margin-bottom:14px;line-height:1.2">${renderInlineMarkdown(block.content.heading)}</h2>
      <p${editAttr(block.id, 'subheading', editing)} style="font-size:1.05rem;color:${theme.textMuted};line-height:1.65">${renderInlineMarkdown(block.content.subheading)}</p>
      <div style="margin-top:36px;display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:center;gap:12px;color:${theme.textMuted};font-size:.95rem">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="${LD.blue}" stroke-width="1.5"/><path d="M7 10l2 2 4-4" stroke="${LD.blue}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>Fast response within 24 hours</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;color:${theme.textMuted};font-size:.95rem">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="${LD.blue}" stroke-width="1.5"/><path d="M7 10l2 2 4-4" stroke="${LD.blue}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>Dedicated support team</span>
        </div>
      </div>
    </div>` : `<div style="text-align:center;margin-bottom:40px"><h2${editAttr(block.id, 'heading', editing)} style="font-size:2rem;font-weight:700;color:${theme.text}">${renderInlineMarkdown(block.content.heading)}</h2><p${editAttr(block.id, 'subheading', editing)} style="color:${theme.textMuted};margin-top:8px">${renderInlineMarkdown(block.content.subheading)}</p></div>`}
    <form action="${sanitizeUrl(escapeHtml(block.content.formAction as string))}" method="post"
      style="background:${String(block.settings.cardBg)};border-radius:${LD.radiusLg};padding:36px;box-shadow:${LD.shadow}">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div>
          <label style="display:block;font-size:13px;font-weight:700;color:${theme.text};margin-bottom:6px">Name</label>
          <input type="text" placeholder="${escapeHtml(block.content.namePlaceholder)}" required style="width:100%;height:44px;padding:0 14px;font-size:15px;border:1.5px solid ${LD.border};border-radius:${LD.radiusMd};background:${LD.white};font-family:${LD.font};outline:none">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:700;color:${theme.text};margin-bottom:6px">Email</label>
          <input type="email" placeholder="${escapeHtml(block.content.emailPlaceholder)}" required style="width:100%;height:44px;padding:0 14px;font-size:15px;border:1.5px solid ${LD.border};border-radius:${LD.radiusMd};background:${LD.white};font-family:${LD.font};outline:none">
        </div>
      </div>
      <div style="margin-bottom:20px">
        <label style="display:block;font-size:13px;font-weight:700;color:${theme.text};margin-bottom:6px">Message</label>
        <textarea placeholder="${escapeHtml(block.content.messagePlaceholder)}" rows="5" style="width:100%;padding:12px 14px;font-size:15px;border:1.5px solid ${LD.border};border-radius:${LD.radiusMd};background:${LD.white};font-family:${LD.font};resize:vertical;outline:none;line-height:1.5"></textarea>
      </div>
      <button type="submit" style="${`display:inline-flex;align-items:center;justify-content:center;width:100%;height:48px;border-radius:${LD.radius};background:${LD.blue};color:${LD.white};border:none;font-family:${LD.font};font-size:15px;font-weight:700;cursor:pointer`}"${editAttr(block.id, 'submitText', editing)}>${escapeHtml(block.content.submitText)}</button>
    </form>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Section Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.cardBg)}" class="pp-color" data-key="settings.cardBg"><span class="pp-color-label">Form Card Background</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Layout</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.settings.layout === 'split'    ? 'active' : ''}" data-val="split"    data-key="settings.layout">Split</button>
          <button class="pp-seg-btn ${block.settings.layout === 'centered' ? 'active' : ''}" data-val="centered" data-key="settings.layout">Centered</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Form Action URL</label>
        <input type="text" value="${escapeHtml(block.content.formAction)}" class="pp-input" data-key="content.formAction" placeholder="https://formspree.io/…">
      </div>`;
  },
};

// ── LD Announcement Bar ───────────────────────────────────────────────
// Full-width promo/system bar. True Blue or Spark Yellow variant.

export const ldAnnouncement: BlockDef = {
  name: 'LD Announcement',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 36" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="36" fill="#0053e2"/>
    <rect x="60" y="13" width="120" height="7" rx="3" fill="rgba(255,255,255,.9)"/>
    <rect x="188" y="13" width="36" height="7" rx="3" fill="rgba(255,255,255,.4)"/>
    <circle cx="258" cy="18" r="6" fill="rgba(255,255,255,.2)"/>
    <path d="M255 15l6 6M261 15l-6 6" stroke="white" stroke-width="1.3" stroke-linecap="round"/>
  </svg>`,
  defaultContent: () => ({
    message:    'Free shipping on orders over $35 — Shop now and save.',
    linkText:   'Shop now',
    linkHref:   '#',
    showLink:   true,
    variant:    'blue',
  }),
  defaultSettings: (_theme) => ({
    dismissible: false,
  }),
  render(block, theme, editing) {
    const variant = String(block.content.variant);
    const bg      = variant === 'yellow' ? LD.yellow   : variant === 'navy' ? LD.navy : LD.trueBlue;
    const color   = variant === 'yellow' ? theme.text : LD.white;
    const linkClr = variant === 'yellow' ? LD.navy : 'rgba(255,255,255,.85)';
    return `<div style="background:${bg};padding:10px 32px;font-family:${LD.font};display:flex;align-items:center;justify-content:center;gap:12px;min-height:44px">
  <p${editAttr(block.id, 'message', editing)} style="font-size:14px;font-weight:500;color:${color};margin:0;line-height:1.4;text-align:center">${escapeHtml(block.content.message)}</p>
  ${block.content.showLink ? `<a href="${sanitizeUrl(escapeHtml(block.content.linkHref as string))}"${editAttr(block.id, 'linkText', editing)} style="font-size:13px;font-weight:700;color:${linkClr};text-decoration:underline;text-underline-offset:2px;white-space:nowrap;flex-shrink:0">${escapeHtml(block.content.linkText)}</a>` : ''}
</div>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Variant</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.content.variant === 'blue'   ? 'active' : ''}" data-val="blue"   data-key="content.variant">True Blue</button>
          <button class="pp-seg-btn ${block.content.variant === 'yellow' ? 'active' : ''}" data-val="yellow" data-key="content.variant">Spark Yellow</button>
          <button class="pp-seg-btn ${block.content.variant === 'navy'   ? 'active' : ''}" data-val="navy"   data-key="content.variant">Navy</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Link URL</label>
        <input type="text" value="${escapeHtml(block.content.linkHref)}" class="pp-input" data-key="content.linkHref" placeholder="https://…">
        <label class="pp-toggle" style="margin-top:6px"><input type="checkbox" ${block.content.showLink ? 'checked' : ''} data-key="content.showLink"><span>Show link</span></label>
      </div>`;
  },
};

// ── LD Product Tiles ──────────────────────────────────────────────────
// Brand OS "Tiles" pattern — floating product images on white with
// name, price (Light weight), and pill CTA.

export const ldProductTiles: BlockDef = {
  name: 'LD Product Tiles',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="110" fill="#f4f4f4"/>
    ${[0,1,2,3].map(i => `
      <rect x="${14 + i*66}" y="10" width="58" height="78" rx="8" fill="white" filter="url(#ts)"/>
      <rect x="${25 + i*66}" y="18" width="36" height="36" rx="4" fill="#e8f5fd"/>
      <rect x="${22 + i*66}" y="62" width="42" height="5" rx="2" fill="#1a1a1a"/>
      <rect x="${22 + i*66}" y="71" width="28" height="5" rx="2" fill="#0053e2"/>
      <rect x="${22 + i*66}" y="80" width="36" height="8" rx="9" fill="#0071ce"/>
    `).join('')}
    <defs><filter id="ts"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,.08)"/></filter></defs>
  </svg>`,
  defaultContent: () => ({
    sectionTitle: 'Today\'s top deals',
    p1Name: 'Apple AirPods Pro', p1Price: '$189.00', p1Img: '',  p1Href: '#',
    p2Name: 'Samsung 65" 4K TV',  p2Price: '$498.00', p2Img: '',  p2Href: '#',
    p3Name: 'Instant Pot Duo',    p3Price: '$79.95',  p3Img: '',  p3Href: '#',
    p4Name: 'Ninja Air Fryer',    p4Price: '$99.00',  p4Img: '',  p4Href: '#',
    ctaText:   'Add to cart',
    columns:   4,
    showTitle: true,
  }),
  defaultSettings: (theme) => ({
    bg:     theme.bgAlt,
    cardBg: theme.bg,
  }),
  render(block, theme, editing) {
    const cols  = Math.min(Math.max(Number(block.content.columns) || 4, 2), 4);
    const tiles = Array.from({ length: cols }, (_, i) => i + 1);
    const imgPH = `background:${LD.skyBlue};opacity:.5;`; // placeholder if no image

    return `<section style="background:${String(block.settings.bg)};padding:60px 40px;font-family:${LD.font}">
  <div style="max-width:1200px;margin:0 auto">
    ${block.content.showTitle ? `<h2${editAttr(block.id, 'sectionTitle', editing)} style="font-size:clamp(1.5rem,3vw,2rem);font-weight:${LD.fontBold};color:${theme.text};letter-spacing:-.03em;margin-bottom:28px">${escapeHtml(block.content.sectionTitle)}</h2>` : ''}
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px">
      ${tiles.map(i => {
        const imgUrl = String(block.content[`p${i}Img`] || '');
        const imgStyle = imgUrl
          ? `background:${LD.bgAlt} url('${escapeHtml(imgUrl)}') center/contain no-repeat;`
          : imgPH;
        return `<div style="background:${String(block.settings.cardBg)};border-radius:${LD.radiusFrame};padding:20px;box-shadow:${LD.shadowTile};display:flex;flex-direction:column;gap:12px">
          <div style="width:100%;aspect-ratio:1;border-radius:${LD.radiusMd};${imgStyle}"></div>
          <div style="flex:1">
            <p${editAttr(block.id, `p${i}Name`, editing)} style="font-size:14px;font-weight:${LD.fontMed};color:${theme.text};line-height:1.4;margin-bottom:4px">${escapeHtml(block.content[`p${i}Name`] ?? '')}</p>
            <p${editAttr(block.id, `p${i}Price`, editing)} style="font-size:22px;font-weight:${LD.fontLight};color:${LD.trueBlue};letter-spacing:-.03em;line-height:1">${escapeHtml(block.content[`p${i}Price`] ?? '')}</p>
          </div>
          <a href="${sanitizeUrl(escapeHtml(String(block.content[`p${i}Href`] ?? '#')))}" style="display:flex;align-items:center;justify-content:center;height:40px;border-radius:${LD.radius};background:${LD.blue};color:${LD.white};font-family:${LD.font};font-size:13px;font-weight:${LD.fontBold};text-decoration:none;transition:background .2s">${escapeHtml(block.content.ctaText)}</a>
        </div>`;
      }).join('')}
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Section Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.cardBg)}" class="pp-color" data-key="settings.cardBg"><span class="pp-color-label">Tile Background</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Columns</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.content.columns == 2 ? 'active' : ''}" data-val="2" data-key="content.columns">2</button>
          <button class="pp-seg-btn ${block.content.columns == 3 ? 'active' : ''}" data-val="3" data-key="content.columns">3</button>
          <button class="pp-seg-btn ${block.content.columns == 4 ? 'active' : ''}" data-val="4" data-key="content.columns">4</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Product Images (optional)</label>
        ${[1,2,3,4].map(i => `<input type="text" value="${escapeHtml(block.content[`p${i}Img`])}" class="pp-input" style="margin-top:4px" data-key="content.p${i}Img" placeholder="Product ${i} image URL">`).join('')}
      </div>
      <div class="pp-group">
        <label class="pp-toggle"><input type="checkbox" ${block.content.showTitle ? 'checked' : ''} data-key="content.showTitle"><span>Show section title</span></label>
      </div>`;
  },
};

// ── LD Split (Windows) ────────────────────────────────────────────────
// Brand OS "Windows" pattern — photo in a rounded frame beside text.
// Corner radius follows the formula: longest edge ÷ 15 ≈ 30px.

export const ldSplit: BlockDef = {
  name: 'LD Split',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="110" fill="#ffffff"/>
    <rect x="12" y="12" width="118" height="86" rx="12" fill="#e8f5fd"/>
    <circle cx="60" cy="42" r="16" fill="#a9ddf7"/>
    <path d="M12 68 L50 50 L90 62 L130 52 L130 98 L12 98Z" fill="#4dbdf5" opacity=".4"/>
    <rect x="148" y="20" width="100" height="12" rx="3" fill="#1a1a1a"/>
    <rect x="148" y="38" width="88" height="7" rx="2" fill="#46464a"/>
    <rect x="148" y="50" width="80" height="7" rx="2" fill="#72767c"/>
    <rect x="148" y="64" width="68" height="7" rx="2" fill="#72767c"/>
    <rect x="148" y="80" width="56" height="16" rx="9" fill="#0071ce"/>
  </svg>`,
  defaultContent: () => ({
    heading:    'Built for every customer, every day.',
    body:       'Our team designs with real people in mind — from Bentonville to everywhere. Every pixel serves a purpose.',
    ctaText:    'Learn more',
    ctaHref:    '#',
    showCta:    true,
    imageUrl:   '',
    imageAlt:   'Feature image',
    imgPosition: 'left',
  }),
  defaultSettings: (theme) => ({
    bg: theme.bg,
  }),
  render(block, theme, editing) {
    const imgLeft = block.content.imgPosition !== 'right';
    const imgUrl  = String(block.content.imageUrl || '');
    const imgBg   = imgUrl
      ? `url('${escapeHtml(imgUrl)}') center/cover no-repeat`
      : `linear-gradient(135deg, ${LD.skyBlue} 0%, ${LD.everydayBlue} 100%)`;
    const dropAttr = editing ? ` data-drop-field="content.imageUrl" data-block-id="${block.id}"` : '';

    const imgCol = `<div${dropAttr} style="border-radius:${LD.radiusFrame};overflow:hidden;aspect-ratio:4/3;background:${imgBg};flex:1;min-width:0"></div>`;
    const textCol = `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:16px">
      <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(1.7rem,3.5vw,2.6rem);font-weight:${LD.fontBold};color:${theme.text};letter-spacing:-.04em;line-height:1.2">${renderInlineMarkdown(block.content.heading)}</h2>
      <p${editAttr(block.id, 'body', editing)} style="font-size:1.05rem;color:${theme.textMuted};line-height:1.7">${renderInlineMarkdown(block.content.body)}</p>
      ${block.content.showCta ? ldBtn(block.content.ctaText as string, block.content.ctaHref as string, 'primary', theme) : ''}
    </div>`;

    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:${LD.font}">
  <div style="max-width:1100px;margin:0 auto;display:flex;gap:60px;align-items:center">
    ${imgLeft ? imgCol + textCol : textCol + imgCol}
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Image URL</label>
        <input type="text" value="${escapeHtml(block.content.imageUrl)}" class="pp-input" data-key="content.imageUrl" placeholder="https://…">
        <label class="pp-label" style="margin-top:8px">Image Position</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.content.imgPosition !== 'right' ? 'active' : ''}" data-val="left"  data-key="content.imgPosition">Image Left</button>
          <button class="pp-seg-btn ${block.content.imgPosition === 'right' ? 'active' : ''}" data-val="right" data-key="content.imgPosition">Image Right</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">CTA URL</label>
        <input type="text" value="${escapeHtml(block.content.ctaHref)}" class="pp-input" data-key="content.ctaHref" placeholder="https://…">
        <label class="pp-toggle" style="margin-top:6px"><input type="checkbox" ${block.content.showCta ? 'checked' : ''} data-key="content.showCta"><span>Show CTA button</span></label>
      </div>`;
  },
};

// Hoisted pricing check icons — referenced inside ldPricing.render() per-row,
// so must be module-level constants to avoid re-evaluating the template on every call.
const PRICING_CHECK_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;margin-top:1px"><circle cx="8" cy="8" r="7" fill="${LD.blue}" opacity=".15"/><path d="M5 8l2 2 4-4" stroke="${LD.blue}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const PRICING_CHECK_ICON_INV = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;margin-top:1px"><circle cx="8" cy="8" r="7" fill="rgba(255,255,255,.2)"/><path d="M5 8l2 2 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ── LD Pricing ────────────────────────────────────────────────────────
// Pricing tiers. Price numbers use Light (300) weight per LD typography
// guidelines for price callouts. Highlighted tier uses True Blue.

export const ldPricing: BlockDef = {
  name: 'LD Pricing',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="120" fill="#f4f4f4"/>
    <rect x="10" y="14" width="80" height="92" rx="8" fill="white" stroke="#d4d7db" stroke-width="1"/>
    <rect x="100" y="8" width="80" height="104" rx="8" fill="#0053e2"/>
    <rect x="190" y="14" width="80" height="92" rx="8" fill="white" stroke="#d4d7db" stroke-width="1"/>
    <rect x="18" y="28" width="48" height="6" rx="2" fill="#72767c"/>
    <text x="18" y="56" font-size="18" font-weight="300" fill="#0053e2" font-family="Arial">$9</text>
    <text x="108" y="30" font-size="8" font-weight="600" fill="rgba(255,255,255,.8)" font-family="Arial">POPULAR</text>
    <text x="108" y="50" font-size="18" font-weight="300" fill="white" font-family="Arial">$19</text>
    <rect x="198" y="28" width="48" height="6" rx="2" fill="#72767c"/>
    <text x="198" y="56" font-size="18" font-weight="300" fill="#0053e2" font-family="Arial">$49</text>
  </svg>`,
  defaultContent: () => ({
    sectionTitle: 'Simple, transparent pricing',
    sectionSub:   'No hidden fees. Cancel any time.',
    t1Name: 'Starter',  t1Price: '$9',  t1Period: '/mo', t1Desc: 'For individuals', t1Cta: 'Get started', t1Href: '#',
    t1f1: 'Up to 5 projects', t1f2: '10GB storage', t1f3: 'Basic analytics', t1f4: 'Email support',
    t2Name: 'Plus',     t2Price: '$19', t2Period: '/mo', t2Desc: 'Most popular',    t2Cta: 'Start free trial', t2Href: '#',
    t2f1: 'Unlimited projects', t2f2: '100GB storage', t2f3: 'Advanced analytics', t2f4: 'Priority support',
    t3Name: 'Business', t3Price: '$49', t3Period: '/mo', t3Desc: 'For teams',       t3Cta: 'Contact sales', t3Href: '#',
    t3f1: 'Unlimited everything', t3f2: '1TB storage', t3f3: 'Custom analytics', t3f4: '24/7 dedicated support',
    featuredTier: 2,
  }),
  defaultSettings: (theme) => ({
    bg: theme.bgAlt,
  }),
  render(block, theme, editing) {
    const featured = Number(block.content.featuredTier) || 2;
    const tiers = [1, 2, 3];
    const checkIcon    = PRICING_CHECK_ICON;
    const checkIconInv = PRICING_CHECK_ICON_INV;

    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:${LD.font}">
  <div style="max-width:1100px;margin:0 auto">
    <div style="text-align:center;margin-bottom:52px">
      <h2${editAttr(block.id, 'sectionTitle', editing)} style="font-size:clamp(1.7rem,3vw,2.4rem);font-weight:${LD.fontBold};color:${theme.text};letter-spacing:-.03em;margin-bottom:12px">${escapeHtml(block.content.sectionTitle)}</h2>
      <p${editAttr(block.id, 'sectionSub', editing)} style="font-size:1.05rem;color:${theme.textMuted}">${escapeHtml(block.content.sectionSub)}</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;align-items:start">
      ${tiers.map(i => {
        const isFeatured = i === featured;
        const bg      = isFeatured ? LD.trueBlue : LD.white;
        const color   = isFeatured ? LD.white    : LD.textPrimary;
        const muted   = isFeatured ? 'rgba(255,255,255,.75)' : LD.textSec;
        const priceC  = isFeatured ? LD.white    : LD.trueBlue;
        const border  = isFeatured ? 'none' : `1.5px solid ${LD.border}`;
        const shadow  = isFeatured ? LD.shadowLg : LD.shadowTile;
        const features = [1,2,3,4].map(f => {
          const val = String(block.content[`t${i}f${f}`] || '');
          if (!val) return '';
          return `<div style="display:flex;gap:10px;font-size:14px;color:${muted};line-height:1.4">${isFeatured ? checkIconInv : checkIcon}<span>${escapeHtml(val)}</span></div>`;
        }).join('');
        return `<div style="background:${bg};border:${border};border-radius:${LD.radiusLg};padding:36px 28px;box-shadow:${shadow};${isFeatured ? 'transform:scale(1.03);' : ''}">
          ${isFeatured ? `<div style="display:inline-block;font-size:10px;font-weight:${LD.fontBold};letter-spacing:.08em;text-transform:uppercase;background:${LD.yellow};color:${LD.navy};padding:3px 10px;border-radius:${LD.radius};margin-bottom:14px">${escapeHtml(block.content[`t${i}Desc`] ?? '')}</div>` : `<p style="font-size:13px;color:${muted};margin-bottom:14px">${escapeHtml(block.content[`t${i}Desc`] ?? '')}</p>`}
          <h3${editAttr(block.id, `t${i}Name`, editing)} style="font-size:1.1rem;font-weight:${LD.fontBold};color:${color};margin-bottom:16px">${escapeHtml(block.content[`t${i}Name`] ?? '')}</h3>
          <div style="display:flex;align-items:baseline;gap:2px;margin-bottom:24px">
            <span${editAttr(block.id, `t${i}Price`, editing)} style="font-size:clamp(2.2rem,4vw,3rem);font-weight:${LD.fontLight};color:${priceC};letter-spacing:-.04em;line-height:1">${escapeHtml(block.content[`t${i}Price`] ?? '')}</span>
            <span style="font-size:14px;color:${muted}">${escapeHtml(block.content[`t${i}Period`] ?? '')}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px">${features}</div>
          ${ldBtn(block.content[`t${i}Cta`] as string, block.content[`t${i}Href`] as string, isFeatured ? 'secondary' : 'primary', theme)}
        </div>`;
      }).join('')}
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Section Background</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Featured Tier</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.content.featuredTier == 1 ? 'active' : ''}" data-val="1" data-key="content.featuredTier">Tier 1</button>
          <button class="pp-seg-btn ${block.content.featuredTier == 2 ? 'active' : ''}" data-val="2" data-key="content.featuredTier">Tier 2</button>
          <button class="pp-seg-btn ${block.content.featuredTier == 3 ? 'active' : ''}" data-val="3" data-key="content.featuredTier">Tier 3</button>
        </div>
      </div>`;
  },
};

// ── LD Testimonial ────────────────────────────────────────────────────
// Customer review block. Supports 1-3 testimonials side-by-side or
// a single featured quote with large type.

export const ldTestimonial: BlockDef = {
  name: 'LD Testimonial',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="100" fill="#f4f4f4"/>
    <text x="20" y="36" font-size="40" fill="#0053e2" opacity=".18" font-family="Georgia">"</text>
    <rect x="20" y="40" width="200" height="7" rx="3" fill="#1a1a1a"/>
    <rect x="20" y="53" width="160" height="7" rx="3" fill="#46464a"/>
    <rect x="20" y="66" width="120" height="7" rx="3" fill="#72767c"/>
    <circle cx="24" cy="86" r="8" fill="#d4d7db"/>
    <rect x="38" y="81" width="60" height="5" rx="2" fill="#1a1a1a"/>
    <rect x="38" y="89" width="45" height="4" rx="2" fill="#72767c"/>
    <rect x="220" y="81" width="48" height="8" rx="2" fill="#ffc220" opacity=".8"/>
  </svg>`,
  defaultContent: () => ({
    layout:  'single',  // 'single' | 'grid'
    q1:      "Walmart's app redesign made it so easy to find exactly what I need. The new experience is night and day.",
    q1Name:  'Maria G.',
    q1Role:  'Walmart+ Member',
    q1Stars: 5,
    q2:      'The checkout flow is seamless. I saved $40 last week alone just from the deals section.',
    q2Name:  'James T.',
    q2Role:  'Regular Shopper',
    q2Stars: 5,
    q3:      'Great prices and fast delivery. The Living Design update makes the whole experience feel premium.',
    q3Name:  'Priya K.',
    q3Role:  'Online Customer',
    q3Stars: 5,
  }),
  defaultSettings: (theme) => ({
    bg:       theme.bgAlt,
    accentBg: theme.bg,
  }),
  render(block, theme, editing) {
    const isGrid = block.content.layout === 'grid';
    const stars  = (n: number) => Array.from({ length: 5 }, (_, i) =>
      `<svg width="14" height="14" viewBox="0 0 14 14" fill="${i < n ? LD.yellow : LD.border}">
        <path d="M7 1l1.5 3.5L12 5l-2.5 2.5.5 3.5L7 9.5l-3 1.5.5-3.5L2 5l3.5-.5z"/>
      </svg>`
    ).join('');

    const card = (q: string, name: string, role: string, starsN: number, idx: number) => `
      <div style="background:${String(block.settings.accentBg)};border-radius:${LD.radiusFrame};padding:${isGrid ? '28px' : '40px 36px'};box-shadow:${LD.shadow};position:relative">
        <div style="font-size:${isGrid ? '52px' : '72px'};line-height:.8;color:${LD.trueBlue};opacity:.15;font-family:Georgia,serif;position:absolute;top:${isGrid ? '16px' : '20px'};left:${isGrid ? '20px' : '28px'}">"</div>
        <p${editAttr(block.id, `q${idx+1}`, editing)} style="font-size:${isGrid ? '1rem' : '1.3rem'};font-weight:${LD.fontMed};color:${theme.text};line-height:1.65;margin-bottom:24px;padding-top:${isGrid ? '16px' : '20px'}">${escapeHtml(q)}</p>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,${LD.everydayBlue},${LD.blue});flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:${LD.fontBold};color:white">${escapeHtml(name).charAt(0)}</div>
            <div>
              <p${editAttr(block.id, `q${idx+1}Name`, editing)} style="font-size:14px;font-weight:${LD.fontBold};color:${theme.text};margin:0">${escapeHtml(name)}</p>
              <p${editAttr(block.id, `q${idx+1}Role`, editing)} style="font-size:12px;color:${LD.textTert};margin:2px 0 0">${escapeHtml(role)}</p>
            </div>
          </div>
          <div style="display:flex;gap:2px">${stars(starsN)}</div>
        </div>
      </div>`;

    const q1Card = card(
      String(block.content.q1), String(block.content.q1Name),
      String(block.content.q1Role), Number(block.content.q1Stars), 0,
    );

    if (!isGrid) {
      return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:${LD.font}">
  <div style="max-width:760px;margin:0 auto">${q1Card}</div>
</section>`;
    }

    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:${LD.font}">
  <div style="max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:20px">
    ${[0,1,2].map(i => card(
      String(block.content[`q${i+1}`]),
      String(block.content[`q${i+1}Name`]),
      String(block.content[`q${i+1}Role`]),
      Number(block.content[`q${i+1}Stars`]) || 5,
      i,
    )).join('')}
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Layout</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.content.layout === 'single' ? 'active' : ''}" data-val="single" data-key="content.layout">Single Quote</button>
          <button class="pp-seg-btn ${block.content.layout === 'grid'   ? 'active' : ''}" data-val="grid"   data-key="content.layout">3-Column Grid</button>
        </div>
      </div>
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Section Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.accentBg)}" class="pp-color" data-key="settings.accentBg"><span class="pp-color-label">Card Background</span></div>
      </div>`;
  },
};

// ── LD Footer ─────────────────────────────────────────────────────────
// Bentonville Blue footer with Spark logo, 4-column link groups,
// legal copy, and social icons.

export const ldFooter: BlockDef = {
  name: 'LD Footer',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 80" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="80" fill="#001e60"/>
    <circle cx="20" cy="22" r="8" fill="#ffc220"/>
    <rect x="34" y="17" width="36" height="7" rx="2" fill="rgba(255,255,255,.8)"/>
    <rect x="14" y="37" width="42" height="4" rx="2" fill="rgba(255,255,255,.25)"/>
    <rect x="14" y="44" width="36" height="4" rx="2" fill="rgba(255,255,255,.25)"/>
    <rect x="14" y="51" width="40" height="4" rx="2" fill="rgba(255,255,255,.25)"/>
    <rect x="72" y="37" width="36" height="4" rx="2" fill="rgba(255,255,255,.25)"/>
    <rect x="72" y="44" width="42" height="4" rx="2" fill="rgba(255,255,255,.25)"/>
    <rect x="72" y="51" width="28" height="4" rx="2" fill="rgba(255,255,255,.25)"/>
    <rect x="130" y="37" width="40" height="4" rx="2" fill="rgba(255,255,255,.25)"/>
    <rect x="130" y="44" width="32" height="4" rx="2" fill="rgba(255,255,255,.25)"/>
    <rect x="130" y="51" width="44" height="4" rx="2" fill="rgba(255,255,255,.25)"/>
    <rect x="188" y="37" width="38" height="4" rx="2" fill="rgba(255,255,255,.25)"/>
    <rect x="188" y="44" width="44" height="4" rx="2" fill="rgba(255,255,255,.25)"/>
    <rect x="14" y="66" width="120" height="4" rx="2" fill="rgba(255,255,255,.2)"/>
  </svg>`,
  defaultContent: () => ({
    brand:   'MySite',
    tagline: 'Save money. Live better.',
    col1Head: 'Company',   col1L1: 'About Us',   col1H1: '#', col1L2: 'Careers',     col1H2: '#', col1L3: 'Press',         col1H3: '#',
    col2Head: 'Products',  col2L1: 'Shop All',   col2H1: '#', col2L2: 'Deals',        col2H2: '#', col2L3: 'Walmart+',      col2H3: '#',
    col3Head: 'Support',   col3L1: 'Help Center', col3H1: '#', col3L2: 'Returns',     col3H2: '#', col3L3: 'Track Order',    col3H3: '#',
    col4Head: 'Legal',     col4L1: 'Privacy',    col4H1: '#', col4L2: 'Terms of Use', col4H2: '#', col4L3: 'Accessibility',  col4H3: '#',
    copyright: `© ${new Date().getFullYear()} Walmart Inc. All rights reserved.`,
    showSocial: true,
    showSpark:  true,
  }),
  defaultSettings: (theme) => ({
    bg:          theme.primary,
    accentColor: theme.accent,
  }),
  render(block, _theme, editing) {
    const bg     = String(block.settings.bg);
    const accent = String(block.settings.accentColor);
    const cols   = [1,2,3,4];

    const socialIcons = [
      { label: 'Twitter/X', path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L2.25 2.25h6.773l4.26 5.634zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
      { label: 'Facebook', path: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
      { label: 'Instagram', path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z' },
    ];

    return `<footer style="background:${bg};padding:52px 40px 28px;font-family:${LD.font}">
  <div style="max-width:1200px;margin:0 auto">
    <!-- Brand row -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:40px">
      ${block.content.showSpark ? walmartSparkSvg(28, accent) : ''}
      <span${editAttr(block.id, 'brand', editing)} style="font-size:20px;font-weight:${LD.fontBold};color:${LD.white}">${escapeHtml(block.content.brand)}</span>
      <span style="color:rgba(255,255,255,.35);margin:0 4px">·</span>
      <span${editAttr(block.id, 'tagline', editing)} style="font-size:14px;color:rgba(255,255,255,.55)">${renderInlineMarkdown(block.content.tagline)}</span>
    </div>
    <!-- Link columns -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:32px;margin-bottom:40px">
      ${cols.map(c => `<div>
        <p${editAttr(block.id, `col${c}Head`, editing)} style="font-size:12px;font-weight:${LD.fontBold};text-transform:uppercase;letter-spacing:.08em;color:${accent};margin-bottom:14px">${escapeHtml(block.content[`col${c}Head`] ?? '')}</p>
        ${[1,2,3].map(l => `<a href="${sanitizeUrl(escapeHtml(String(block.content[`col${c}H${l}`] ?? '#')))}" style="display:block;font-size:14px;color:rgba(255,255,255,.65);text-decoration:none;margin-bottom:10px;transition:color .15s">${escapeHtml(block.content[`col${c}L${l}`] ?? '')}</a>`).join('')}
      </div>`).join('')}
    </div>
    <!-- Bottom row: copyright + social -->
    <div style="border-top:1px solid rgba(255,255,255,.12);padding-top:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <p${editAttr(block.id, 'copyright', editing)} style="font-size:12px;color:rgba(255,255,255,.4)">${escapeHtml(block.content.copyright)}</p>
      ${block.content.showSocial ? `<div style="display:flex;gap:14px">
        ${socialIcons.map(s => `<a href="#" aria-label="${s.label}" style="color:rgba(255,255,255,.45);display:flex;transition:color .15s">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="${s.path}"/></svg>
        </a>`).join('')}
      </div>` : ''}
    </div>
  </div>
</footer>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.accentColor)}" class="pp-color" data-key="settings.accentColor"><span class="pp-color-label">Accent (headings)</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-toggle"><input type="checkbox" ${block.content.showSpark ? 'checked' : ''} data-key="content.showSpark"><span>Show Walmart Spark</span></label>
        <label class="pp-toggle"><input type="checkbox" ${block.content.showSocial ? 'checked' : ''} data-key="content.showSocial"><span>Show social icons</span></label>
      </div>`;
  },
};

// ── LD Waterfall Nav ──────────────────────────────────────────────────
// Five overlapping colour strips that expand on hover.
// Direct port of MvkWaterfallMenuHorizontal from careers.walmart.com.
// Colors: #e1f3f8 → #a9ddf7 → #0053e2 → #002e99 → #001e60
// mr-[-56px] overlap + flex:1 → flex:1.25 on hover via onmouseenter.

export const ldWaterfallNav: BlockDef = {
  name: 'LD Waterfall Nav',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 56" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="56" fill="#f4f4f4"/>
    <rect x="0"   y="8" width="76" height="40" rx="9"  fill="#e1f3f8"/>
    <rect x="44"  y="8" width="76" height="40" rx="9"  fill="#a9ddf7"/>
    <rect x="88"  y="8" width="76" height="40" rx="9"  fill="#0053e2"/>
    <rect x="132" y="8" width="76" height="40" rx="9"  fill="#002e99"/>
    <rect x="176" y="8" width="96" height="40" rx="9"  fill="#001e60"/>
    <text x="8"   y="40" font-size="7.5" fill="#001e60" font-family="Arial" font-weight="300">Stores &amp; Clubs</text>
    <text x="52"  y="40" font-size="7.5" fill="#001e60" font-family="Arial" font-weight="300">Supply Chain</text>
    <text x="96"  y="40" font-size="7.5" fill="white"   font-family="Arial" font-weight="300">Healthcare</text>
    <text x="140" y="40" font-size="7.5" fill="white"   font-family="Arial" font-weight="300">Technology</text>
    <text x="184" y="40" font-size="7.5" fill="white"   font-family="Arial" font-weight="300">Corporate</text>
  </svg>`,
  defaultContent: () => ({
    tab1Label: 'Stores & Clubs',          tab1Href: '#',
    tab2Label: 'Supply Chain',            tab2Href: '#',
    tab3Label: 'Healthcare',              tab3Href: '#',
    tab4Label: 'Technology',              tab4Href: '#',
    tab5Label: 'Corporate',               tab5Href: '#',
  }),
  defaultSettings: (theme) => ({
    bg:     theme.bgAlt,
    height: '156',
  }),
  render(block, theme, editing) {
    const wfId = `ld-wf-${block.id.replace(/[^a-z0-9]/gi, '')}`;
    const h    = `${String(block.settings.height)}px`;
    const arrowSvg = `<svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink:0"><path d="m8.369 14.338 5.5-6a.5.5 0 0 0 0-.676l-5.5-6-.738.676L12.363 7.5H1v1h11.363l-4.732 5.162z"/></svg>`;
    // Mathematically derive 5 strip colors from theme.primary (lightest → full)
    const p = theme.primary;
    const tints = [tintHex(p, 0.12), tintHex(p, 0.35), tintHex(p, 0.62), tintHex(p, 0.82), p];
    const strips = tints.map((bg, i) => ({
      n: i + 1,
      bg,
      color: isHexDark(bg) ? LD.white : theme.primary,
      z: 5 - i,
      pl: i === 0 ? '24px' : '56px',
    }));
    const stripsHtml = strips.map((s, i) => {
      const label   = String(block.content[`tab${s.n}Label`] ?? '');
      const href    = sanitizeUrl(String(block.content[`tab${s.n}Href`] ?? '#'));
      const overlap = i < strips.length - 1 ? 'margin-right:-56px;' : '';
      const hIn  = `Array.from(document.getElementById('${wfId}').querySelectorAll('.ldwf-s')).forEach(function(a){a.style.flex='1'});this.style.flex='1.25'`;
      const hOut = `this.style.flex='1'`;
      return `<a href="${href}" class="ldwf-s"
        style="flex:1;height:${h};background:${s.bg};color:${s.color};
               border-radius:30px;position:relative;z-index:${s.z};${overlap}
               padding:20px 24px;padding-left:${s.pl};
               display:flex;align-items:flex-end;justify-content:space-between;gap:8px;
               font-size:clamp(0.9rem,1.4vw,1.25rem);font-weight:300;
               text-decoration:none;overflow:hidden;
               transition:flex 0.45s ease;font-family:${LD.font}"
        ${editing ? '' : `onmouseenter="${hIn}" onmouseleave="${hOut}"`}>
        <span${editAttr(block.id, `tab${s.n}Label`, editing)} style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${escapeHtml(label)}</span>
        ${arrowSvg}
      </a>`;
    }).join('');
    return `<section style="background:${String(block.settings.bg)};padding:40px;font-family:${LD.font}">
  <div id="${wfId}" style="max-width:1200px;margin:0 auto;display:flex;overflow:hidden">${stripsHtml}</div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Strip Height (px)</label>
        <input type="number" value="${Number(block.settings.height)}" min="80" max="240" class="pp-input" data-key="settings.height">
      </div>
      <div class="pp-group">
        <label class="pp-label">Strip Links</label>
        <input type="text" value="${escapeHtml(String(block.content.tab1Href))}" class="pp-input" data-key="content.tab1Href" placeholder="Strip 1 URL">
        <input type="text" value="${escapeHtml(String(block.content.tab2Href))}" class="pp-input" style="margin-top:4px" data-key="content.tab2Href" placeholder="Strip 2 URL">
        <input type="text" value="${escapeHtml(String(block.content.tab3Href))}" class="pp-input" style="margin-top:4px" data-key="content.tab3Href" placeholder="Strip 3 URL">
        <input type="text" value="${escapeHtml(String(block.content.tab4Href))}" class="pp-input" style="margin-top:4px" data-key="content.tab4Href" placeholder="Strip 4 URL">
        <input type="text" value="${escapeHtml(String(block.content.tab5Href))}" class="pp-input" style="margin-top:4px" data-key="content.tab5Href" placeholder="Strip 5 URL">
      </div>
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <p class="pp-hint" style="font-size:11px;color:#72767c;margin-top:4px">Strip colors auto-derive from the Looks primary color.</p>
      </div>`;
  },
};

// ── LD Hero Search ─────────────────────────────────────────────────────
// True Blue (#0053e2) full-width hero with font-thin 6rem heading and an
// oversized pill search bar with backdrop-blur.
// Direct port of the movingTextSearch / staticTextSearch hero component.

export const ldHeroSearch: BlockDef = {
  name: 'LD Hero Search',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="110" fill="#0053e2"/>
    <rect x="32" y="14" width="200" height="20" rx="3" fill="rgba(255,255,255,.9)"/>
    <rect x="32" y="40" width="160" height="14" rx="3" fill="rgba(255,255,255,.65)"/>
    <rect x="32" y="70" width="216" height="26" rx="13" fill="rgba(0,0,0,.22)"/>
    <circle cx="238" cy="83" r="11" fill="rgba(0,0,0,.2)"/>
    <path d="M234 79a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm-6 4a6 6 0 1 1 10.47 3.954l2.03 2.03-1.06 1.06-2.03-2.03A6 6 0 0 1 228 83z" fill="rgba(255,255,255,.8)"/>
  </svg>`,
  defaultContent: () => ({
    line1:       'Cashiers wanted.',
    placeholder: 'Search by team, department, or keyword',
  }),
  defaultSettings: (theme) => ({
    bg:       theme.accent,
    paddingX: '17',
  }),
  render(block, _theme, editing) {
    const bg  = String(block.settings.bg);
    const px  = `${String(block.settings.paddingX)}%`;
    const sid = `ld-hs-${block.id.replace(/[^a-z0-9]/gi, '')}`;
    return `<section style="background:${bg};padding:64px ${px};font-family:${LD.font}">
  <style>#${sid}::placeholder{color:rgba(255,255,255,.75);font-weight:300;font-family:${LD.font}}</style>
  <h2${editAttr(block.id, 'line1', editing)} style="font-size:clamp(2.4rem,6.5vw,6rem);font-weight:300;color:${LD.white};line-height:1.1;margin-bottom:0">${escapeHtml(String(block.content.line1 ?? ''))}</h2>
  <h2 style="font-size:clamp(2.4rem,6.5vw,6rem);font-weight:300;color:${LD.white};line-height:1.1;margin-bottom:48px">Next move, yours.</h2>
  <div style="position:relative;display:flex;align-items:center">
    <input id="${sid}" type="text"
      placeholder="${escapeHtml(String(block.content.placeholder ?? ''))}"
      style="width:100%;height:80px;border-radius:9999px;
             background:rgba(0,0,0,.18);backdrop-filter:blur(32px);
             border:none;outline:none;
             padding:0 96px 0 40px;
             font-size:clamp(1rem,2.5vw,1.75rem);font-weight:300;
             color:white;font-family:${LD.font};box-sizing:border-box" readonly>
    <div style="position:absolute;right:14px;width:52px;height:52px;border-radius:50%;
                background:rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;cursor:pointer">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="M11 3a8 8 0 1 0 0 16A8 8 0 0 0 11 3zM1 11a10 10 0 1 1 17.906 6.09l3.002 3.002-1.414 1.414L17.49 18.5A10 10 0 0 1 1 11z" fill="white"/>
      </svg>
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Horizontal padding (%)</label>
        <input type="number" value="${Number(block.settings.paddingX)}" min="0" max="25" class="pp-input" data-key="settings.paddingX">
      </div>
      <div class="pp-group">
        <label class="pp-label">Search placeholder</label>
        <input type="text" value="${escapeHtml(String(block.content.placeholder))}" class="pp-input" data-key="content.placeholder">
      </div>`;
  },
};

// ── LD Trending Roles ──────────────────────────────────────────────────
// font-thin 48px heading + 3 cards with: Spark yellow icon, bold job
// title, location, pay range. Border turns blue on hover.
// Direct port of JobRolesCard-container from careers.walmart.com.

export const ldTrendingRoles: BlockDef = {
  name: 'LD Trending Roles',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 90" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="90" fill="white"/>
    <rect x="8" y="6" width="88" height="12" rx="2" fill="#1a1a1a"/>
    <rect x="8"   y="26" width="82" height="58" rx="10" fill="white" stroke="#d4d7db" stroke-width="1.2"/>
    <rect x="98"  y="26" width="82" height="58" rx="10" fill="white" stroke="#d4d7db" stroke-width="1.2"/>
    <rect x="188" y="26" width="84" height="58" rx="10" fill="white" stroke="#d4d7db" stroke-width="1.2"/>
    <path d="M16 33l1.5 3.5L21 37l-2.5 2 .5 3.5L16 41l-3 1.5.5-3.5L11 37l3.5-.5z" fill="#ffc220"/>
    <path d="M106 33l1.5 3.5 3.5.5-2.5 2 .5 3.5-3-1.5-3 1.5.5-3.5L101 37l3.5-.5z" fill="#ffc220"/>
    <path d="M196 33l1.5 3.5 3.5.5-2.5 2 .5 3.5-3-1.5-3 1.5.5-3.5L191 37l3.5-.5z" fill="#ffc220"/>
    <rect x="16"  y="46" width="64" height="7" rx="2" fill="#1a1a1a"/>
    <rect x="106" y="46" width="64" height="7" rx="2" fill="#1a1a1a"/>
    <rect x="196" y="46" width="64" height="7" rx="2" fill="#1a1a1a"/>
    <rect x="16"  y="57" width="50" height="5" rx="2" fill="#adb0b5"/>
    <rect x="106" y="57" width="50" height="5" rx="2" fill="#adb0b5"/>
    <rect x="196" y="57" width="50" height="5" rx="2" fill="#adb0b5"/>
    <rect x="16"  y="66" width="60" height="4" rx="2" fill="#d4d7db"/>
    <rect x="106" y="66" width="60" height="4" rx="2" fill="#d4d7db"/>
    <rect x="196" y="66" width="60" height="4" rx="2" fill="#d4d7db"/>
  </svg>`,
  defaultContent: () => ({
    heading:  'Trending roles',
    job1Title: '(USA) Area Manager Asset Protection',   job1Loc: 'Stockton, CA',    job1Pay: 'Multiple shifts • $72,050 – $108,000/yr',    job1Href: '#',
    job2Title: 'Software Engineer III — Machine Learning', job2Loc: 'Sunnyvale, CA', job2Pay: 'Multiple shifts • $117,000 – $234,000/yr',  job2Href: '#',
    job3Title: 'Staff, Software Engineer',              job3Loc: 'Sunnyvale, CA',    job3Pay: 'Multiple shifts • $143,000 – $286,000/yr',  job3Href: '#',
  }),
  defaultSettings: (theme) => ({
    bg:       theme.bg,
    paddingX: '8.33',
  }),
  render(block, theme, editing) {
    const px = `${String(block.settings.paddingX)}%`;
    const jobCard = (n: number) => {
      const href = sanitizeUrl(String(block.content[`job${n}Href`] ?? '#'));
      const hIn  = `this.style.borderColor='${LD.blue}'`;
      const hOut = `this.style.borderColor='${LD.border}'`;
      return `<a href="${href}"
        style="background:${LD.white};border:1.5px solid ${LD.border};border-radius:24px;
               padding:24px;display:flex;flex-direction:column;gap:16px;
               text-decoration:none;color:inherit;cursor:pointer;
               transition:border-color 0.4s ease;font-family:${LD.font}"
        ${editing ? '' : `onmouseenter="${hIn}" onmouseleave="${hOut}"`}>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${walmartSparkSvg(28, LD.yellow)}
          <div>
            <div${editAttr(block.id, `job${n}Title`, editing)} style="font-size:1.1rem;font-weight:700;color:${theme.text};line-height:1.35;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${escapeHtml(String(block.content[`job${n}Title`] ?? ''))}</div>
            <div style="font-size:1rem;color:${theme.textMuted};margin-top:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${escapeHtml(String(block.content[`job${n}Loc`] ?? ''))}</div>
          </div>
          <div style="font-size:1rem;color:${theme.textMuted};line-height:1.5">${escapeHtml(String(block.content[`job${n}Pay`] ?? ''))}</div>
        </div>
      </a>`;
    };
    return `<section style="background:${String(block.settings.bg)};padding:40px 24px;font-family:${LD.font}">
  <div style="max-width:1200px;margin:0 auto;padding:0 ${px}">
    <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(2rem,4vw,3rem);font-weight:300;color:${theme.text};margin-bottom:24px;letter-spacing:-.02em">${escapeHtml(String(block.content.heading ?? ''))}</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px">
      ${jobCard(1)}${jobCard(2)}${jobCard(3)}
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Job Links</label>
        <input type="text" value="${escapeHtml(String(block.content.job1Href))}" class="pp-input" data-key="content.job1Href" placeholder="Job 1 URL">
        <input type="text" value="${escapeHtml(String(block.content.job2Href))}" class="pp-input" style="margin-top:4px" data-key="content.job2Href" placeholder="Job 2 URL">
        <input type="text" value="${escapeHtml(String(block.content.job3Href))}" class="pp-input" style="margin-top:4px" data-key="content.job3Href" placeholder="Job 3 URL">
      </div>
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
      </div>`;
  },
};

// ── LD Benefits Strip ──────────────────────────────────────────────────
// font-thin 48px section heading + 5-item icon/title/desc grid.
// Direct port of BenefitsSecondaryList from careers.walmart.com.
// Icon size: 72px. Title: 14px bold. Description: 14px normal.

export const ldBenefitsStrip: BlockDef = {
  name: 'LD Benefits Strip',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 80" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="80" fill="white"/>
    <rect x="8" y="6" width="120" height="12" rx="2" fill="#1a1a1a"/>
    <rect x="8"   y="26" width="36" height="36" rx="6" fill="#e5f2fc"/>
    <rect x="62"  y="26" width="36" height="36" rx="6" fill="#e5f2fc"/>
    <rect x="116" y="26" width="36" height="36" rx="6" fill="#e5f2fc"/>
    <rect x="170" y="26" width="36" height="36" rx="6" fill="#e5f2fc"/>
    <rect x="224" y="26" width="36" height="36" rx="6" fill="#e5f2fc"/>
    <rect x="8"   y="66" width="36" height="5" rx="2" fill="#1a1a1a"/>
    <rect x="62"  y="66" width="36" height="5" rx="2" fill="#1a1a1a"/>
    <rect x="116" y="66" width="36" height="5" rx="2" fill="#1a1a1a"/>
    <rect x="170" y="66" width="36" height="5" rx="2" fill="#1a1a1a"/>
    <rect x="224" y="66" width="36" height="5" rx="2" fill="#1a1a1a"/>
  </svg>`,
  defaultContent: () => ({
    heading:    'Explore our Benefits',
    ctaText:    'Learn more about benefits',
    ctaHref:    '#',
    bf1Icon: '💰', bf1Title: 'Financial perks',                  bf1Desc: 'Enjoy 401(k) matching and stock purchase plans',
    bf2Icon: '⏰', bf2Title: 'Paid time off',                    bf2Desc: 'Vacations, sick leave, holidays, and parental leave',
    bf3Icon: '❤️', bf3Title: 'Comprehensive health benefits',   bf3Desc: 'Medical, dental, vision, and wellness for your family',
    bf4Icon: '🧘', bf4Title: 'Wellbeing programs',               bf4Desc: 'Mental health resources and assistance programs',
    bf5Icon: '📈', bf5Title: 'Career growth opportunities',      bf5Desc: 'Training, leadership programs, and clear paths forward',
  }),
  defaultSettings: (theme) => ({
    bg:       theme.bg,
    paddingX: '8.33',
  }),
  render(block, theme, editing) {
    const px = `${String(block.settings.paddingX)}%`;
    const item = (n: number) =>
      `<div style="display:flex;flex-direction:column;gap:12px">
        <div style="width:72px;height:72px;background:${LD.blueLight};border-radius:${LD.radiusLg};display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0">${escapeHtml(String(block.content[`bf${n}Icon`] ?? ''))}</div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <div${editAttr(block.id, `bf${n}Title`, editing)} style="font-size:14px;font-weight:700;color:${theme.text};line-height:1.43">${escapeHtml(String(block.content[`bf${n}Title`] ?? ''))}</div>
          <div${editAttr(block.id, `bf${n}Desc`, editing)} style="font-size:14px;font-weight:400;color:${theme.textMuted};line-height:1.5">${escapeHtml(String(block.content[`bf${n}Desc`] ?? ''))}</div>
        </div>
      </div>`;
    return `<section style="background:${String(block.settings.bg)};padding:64px 24px;font-family:${LD.font}">
  <div style="max-width:1200px;margin:0 auto;padding:0 ${px}">
    <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(2rem,4vw,3rem);font-weight:300;color:${theme.text};letter-spacing:-.02em;margin-bottom:48px">${escapeHtml(String(block.content.heading ?? ''))}</h2>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:24px;margin-bottom:40px">
      ${[1,2,3,4,5].map(n => item(n)).join('')}
    </div>
    <a href="${sanitizeUrl(String(block.content.ctaHref ?? '#'))}" style="display:inline-flex;height:48px;padding:0 24px;align-items:center;justify-content:center;border-radius:9999px;border:2px solid ${theme.text};font-size:18px;font-weight:700;color:${theme.text};text-decoration:none;font-family:${LD.font}">${escapeHtml(String(block.content.ctaText ?? 'Learn more'))}</a>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Benefit Icons <small style="font-weight:400;opacity:.7">(paste emoji)</small></label>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">
          ${[1,2,3,4,5].map(n => `<input type="text" value="${escapeHtml(String(block.content[`bf${n}Icon`]))}" class="pp-input" data-key="content.bf${n}Icon" placeholder="${['💰','⏰','❤️','🧘','📈'][n-1]}" style="text-align:center;font-size:18px">`).join('')}
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">CTA</label>
        <input type="text" value="${escapeHtml(String(block.content.ctaHref))}" class="pp-input" data-key="content.ctaHref" placeholder="CTA URL">
      </div>
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
      </div>`;
  },
};

// ── LD Category Cards ─────────────────────────────────────────────────
// Four colour-coded tiles for career areas / product categories.
// Inspired by the career-area selector on careers.walmart.com.

export const ldCategoryCards: BlockDef = {
  name: 'LD Category Cards',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 80" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="80" fill="#f4f4f4"/>
    <rect x="8"   y="12" width="60" height="56" rx="12" fill="#e5f2fc"/>
    <rect x="74"  y="12" width="60" height="56" rx="12" fill="#a9ddf7"/>
    <rect x="140" y="12" width="60" height="56" rx="12" fill="#0071ce"/>
    <rect x="206" y="12" width="66" height="56" rx="12" fill="#001e60"/>
    <rect x="16"  y="22" width="44" height="7"  rx="2" fill="#001e60"/>
    <rect x="16"  y="33" width="30" height="4"  rx="2" fill="rgba(0,30,96,.4)"/>
    <rect x="82"  y="22" width="44" height="7"  rx="2" fill="#001e60"/>
    <rect x="82"  y="33" width="30" height="4"  rx="2" fill="rgba(0,30,96,.4)"/>
    <rect x="148" y="22" width="44" height="7"  rx="2" fill="white"/>
    <rect x="148" y="33" width="30" height="4"  rx="2" fill="rgba(255,255,255,.5)"/>
    <rect x="214" y="22" width="44" height="7"  rx="2" fill="white"/>
    <rect x="214" y="33" width="30" height="4"  rx="2" fill="rgba(255,255,255,.5)"/>
    <rect x="16"  y="55" width="28" height="6"  rx="3" fill="rgba(0,113,206,.4)"/>
    <rect x="82"  y="55" width="28" height="6"  rx="3" fill="rgba(0,113,206,.4)"/>
    <rect x="148" y="55" width="28" height="6"  rx="3" fill="rgba(255,255,255,.35)"/>
    <rect x="214" y="55" width="28" height="6"  rx="3" fill="rgba(255,194,32,.7)"/>
  </svg>`,
  defaultContent: () => ({
    heading:    'Explore Career Areas',
    card1Title: 'Stores & Clubs',   card1Body: "Front-line retail and Sam's Club opportunities",  card1Href: '#',
    card2Title: 'Technology',       card2Body: 'Engineering, data science, and product design',    card2Href: '#',
    card3Title: 'Healthcare',       card3Body: 'Pharmacy, optical, and clinical services',         card3Href: '#',
    card4Title: 'Corporate',        card4Body: 'Finance, HR, strategy, and operations',            card4Href: '#',
  }),
  defaultSettings: (theme) => ({
    bg:   theme.bgAlt,
    cols: '4',
  }),
  render(block, theme, editing) {
    const cols = Number(block.settings.cols) || 4;
    const palette = [
      { bg: LD.blueLight, text: LD.navy,  muted: theme.textMuted,         cta: theme.accent },
      { bg: LD.skyBlue,   text: LD.navy,  muted: theme.textMuted,         cta: theme.accent },
      { bg: LD.blue,      text: LD.white, muted: 'rgba(255,255,255,.78)', cta: LD.white  },
      { bg: LD.navy,      text: LD.white, muted: 'rgba(255,255,255,.78)', cta: LD.yellow },
    ];
    const arrowSvg = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style="margin-left:4px;flex-shrink:0"><path d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z"/></svg>`;
    const cardHtml = [1, 2, 3, 4].map((n, i) => {
      const p = palette[i];
      const href = sanitizeUrl(String(block.content[`card${n}Href`] ?? '#'));
      return `<div style="background:${p.bg};border-radius:${LD.radiusFrame};padding:36px 28px;display:flex;flex-direction:column;box-shadow:${LD.shadowTile}">
        <h3${editAttr(block.id, `card${n}Title`, editing)} style="font-size:1.15rem;font-weight:700;color:${p.text};letter-spacing:-.025em;margin-bottom:10px;line-height:1.3">${escapeHtml(String(block.content[`card${n}Title`] ?? ''))}</h3>
        <p${editAttr(block.id, `card${n}Body`, editing)} style="font-size:13.5px;color:${p.muted};line-height:1.6;margin-bottom:24px;flex:1">${escapeHtml(String(block.content[`card${n}Body`] ?? ''))}</p>
        <a href="${href}" style="display:inline-flex;align-items:center;font-size:13px;font-weight:700;color:${p.cta};text-decoration:none">Explore${arrowSvg}</a>
      </div>`;
    }).join('');
    return `<section style="background:${String(block.settings.bg)};padding:72px 40px;font-family:${LD.font}">
  <div style="max-width:1200px;margin:0 auto">
    <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(1.6rem,3vw,2.2rem);font-weight:700;color:${LD.navy};letter-spacing:-.03em;margin-bottom:32px">${escapeHtml(String(block.content.heading ?? ''))}</h2>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px">${cardHtml}</div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Columns</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${String(block.settings.cols) === '2' ? 'active' : ''}" data-val="2" data-key="settings.cols">2</button>
          <button class="pp-seg-btn ${String(block.settings.cols) === '3' ? 'active' : ''}" data-val="3" data-key="settings.cols">3</button>
          <button class="pp-seg-btn ${String(block.settings.cols) === '4' ? 'active' : ''}" data-val="4" data-key="settings.cols">4</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Card Links</label>
        <input type="text" value="${escapeHtml(String(block.content.card1Href))}" class="pp-input" data-key="content.card1Href" placeholder="Card 1 URL">
        <input type="text" value="${escapeHtml(String(block.content.card2Href))}" class="pp-input" style="margin-top:4px" data-key="content.card2Href" placeholder="Card 2 URL">
        <input type="text" value="${escapeHtml(String(block.content.card3Href))}" class="pp-input" style="margin-top:4px" data-key="content.card3Href" placeholder="Card 3 URL">
        <input type="text" value="${escapeHtml(String(block.content.card4Href))}" class="pp-input" style="margin-top:4px" data-key="content.card4Href" placeholder="Card 4 URL">
      </div>
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
      </div>`;
  },
};

// ── LD Bento Grid ─────────────────────────────────────────────────────
// Mixed-size content grid: one large featured card + two medium cards +
// an optional row of three icon mini-cards.
// Mirrors the values/culture bento on careers.walmart.com.

export const ldBentoGrid: BlockDef = {
  name: 'LD Bento Grid',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="110" fill="#f4f4f4"/>
    <rect x="8"   y="8" width="128" height="94" rx="14" fill="#001e60"/>
    <rect x="144" y="8" width="128" height="44" rx="14" fill="#a9ddf7"/>
    <rect x="144" y="58" width="128" height="44" rx="14" fill="#0071ce"/>
    <rect x="20"  y="26" width="84" height="10" rx="2" fill="white" opacity=".9"/>
    <rect x="20"  y="40" width="66" height="5"  rx="2" fill="rgba(255,255,255,.5)"/>
    <rect x="20"  y="48" width="58" height="5"  rx="2" fill="rgba(255,255,255,.5)"/>
    <rect x="20"  y="70" width="52" height="14" rx="7" fill="#0071ce"/>
    <rect x="156" y="19" width="68" height="8"  rx="2" fill="#001e60"/>
    <rect x="156" y="31" width="50" height="5"  rx="2" fill="#46464a"/>
    <rect x="156" y="69" width="68" height="8"  rx="2" fill="white"/>
    <rect x="156" y="81" width="50" height="5"  rx="2" fill="rgba(255,255,255,.6)"/>
  </svg>`,
  defaultContent: () => ({
    featHeading:  'Grow your career here.',
    featBody:     'From hourly roles to global leadership — your path to an amazing career starts with us.',
    featCtaText:  'Explore Opportunities',
    featCtaHref:  '#',
    card2Heading: 'People-led. Tech-powered.',
    card2Body:    'Our associates drive innovation at every level of the business.',
    card3Heading: 'Guided by our values.',
    card3Body:    'Integrity, service, and excellence are at the heart of everything we do.',
    mini1Icon:    '🌱', mini1Title: 'Career Growth',  mini1Body: 'Pathways to advance at every stage',
    mini2Icon:    '💡', mini2Title: 'Innovation',      mini2Body: 'Technology shaping the future of retail',
    mini3Icon:    '🤝', mini3Title: 'Inclusion',        mini3Body: 'A diverse and welcoming place to work',
    showMiniRow:  true,
  }),
  defaultSettings: (theme) => ({
    bg: theme.bgAlt,
  }),
  render(block, theme, editing) {
    const mini = (icon: string, title: string, body: string, tf: string, bf: string) =>
      `<div style="background:${LD.white};border-radius:${LD.radiusFrame};padding:28px;box-shadow:${LD.shadowTile}">
        <div style="font-size:28px;margin-bottom:12px">${escapeHtml(icon)}</div>
        <h4${editAttr(block.id, tf, editing)} style="font-size:1rem;font-weight:700;color:${LD.navy};margin-bottom:6px">${escapeHtml(title)}</h4>
        <p${editAttr(block.id, bf, editing)} style="font-size:13px;color:${theme.textMuted};line-height:1.55">${escapeHtml(body)}</p>
      </div>`;

    const miniRow = block.content.showMiniRow
      ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px">
          ${mini(String(block.content.mini1Icon ?? '🌱'), String(block.content.mini1Title ?? ''), String(block.content.mini1Body ?? ''), 'mini1Title', 'mini1Body')}
          ${mini(String(block.content.mini2Icon ?? '💡'), String(block.content.mini2Title ?? ''), String(block.content.mini2Body ?? ''), 'mini2Title', 'mini2Body')}
          ${mini(String(block.content.mini3Icon ?? '🤝'), String(block.content.mini3Title ?? ''), String(block.content.mini3Body ?? ''), 'mini3Title', 'mini3Body')}
        </div>`
      : '';

    return `<section style="background:${String(block.settings.bg)};padding:72px 40px;font-family:${LD.font}">
  <div style="max-width:1200px;margin:0 auto">
    <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:16px">
      <div style="background:${LD.navy};border-radius:${LD.radiusFrame};padding:48px 40px;display:flex;flex-direction:column;justify-content:center;box-shadow:${LD.shadowLg}">
        <h2${editAttr(block.id, 'featHeading', editing)} style="font-size:clamp(1.6rem,2.8vw,2.4rem);font-weight:700;color:${LD.white};letter-spacing:-.04em;line-height:1.2;margin-bottom:16px">${escapeHtml(String(block.content.featHeading ?? ''))}</h2>
        <p${editAttr(block.id, 'featBody', editing)} style="font-size:1rem;color:rgba(255,255,255,.75);line-height:1.65;margin-bottom:32px">${escapeHtml(String(block.content.featBody ?? ''))}</p>
        ${ldBtn(String(block.content.featCtaText ?? 'Learn More'), String(block.content.featCtaHref ?? '#'), 'primary', theme)}
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="background:${LD.skyBlue};border-radius:${LD.radiusFrame};padding:32px;flex:1;box-shadow:${LD.shadowTile}">
          <h3${editAttr(block.id, 'card2Heading', editing)} style="font-size:1.2rem;font-weight:700;color:${LD.navy};letter-spacing:-.025em;margin-bottom:10px">${escapeHtml(String(block.content.card2Heading ?? ''))}</h3>
          <p${editAttr(block.id, 'card2Body', editing)} style="font-size:14px;color:${theme.textMuted};line-height:1.6">${escapeHtml(String(block.content.card2Body ?? ''))}</p>
        </div>
        <div style="background:${LD.blue};border-radius:${LD.radiusFrame};padding:32px;flex:1;box-shadow:${LD.shadowTile}">
          <h3${editAttr(block.id, 'card3Heading', editing)} style="font-size:1.2rem;font-weight:700;color:${LD.white};letter-spacing:-.025em;margin-bottom:10px">${escapeHtml(String(block.content.card3Heading ?? ''))}</h3>
          <p${editAttr(block.id, 'card3Body', editing)} style="font-size:14px;color:rgba(255,255,255,.8);line-height:1.6">${escapeHtml(String(block.content.card3Body ?? ''))}</p>
        </div>
      </div>
    </div>
    ${miniRow}
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-toggle"><input type="checkbox" ${block.content.showMiniRow ? 'checked' : ''} data-key="content.showMiniRow"><span>Show mini cards row</span></label>
      </div>
      <div class="pp-group">
        <label class="pp-label">Feature CTA URL</label>
        <input type="text" value="${escapeHtml(String(block.content.featCtaHref))}" class="pp-input" data-key="content.featCtaHref" placeholder="https://…">
      </div>
      <div class="pp-group">
        <label class="pp-label">Mini Card Icons <small style="font-weight:400;opacity:.7">(paste emoji)</small></label>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px">
          <input type="text" value="${escapeHtml(String(block.content.mini1Icon))}" class="pp-input" data-key="content.mini1Icon" placeholder="🌱" style="text-align:center;font-size:18px">
          <input type="text" value="${escapeHtml(String(block.content.mini2Icon))}" class="pp-input" data-key="content.mini2Icon" placeholder="💡" style="text-align:center;font-size:18px">
          <input type="text" value="${escapeHtml(String(block.content.mini3Icon))}" class="pp-input" data-key="content.mini3Icon" placeholder="🤝" style="text-align:center;font-size:18px">
        </div>
      </div>
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
      </div>`;
  },
};

// ── LD Milestones ─────────────────────────────────────────────────────
// Three achievement stat cards with Spark Yellow badges and large numbers.
// Mirrors the milestones / impact section on careers.walmart.com.

export const ldMilestones: BlockDef = {
  name: 'LD Milestones',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 80" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="80" fill="#f4f4f4"/>
    <rect x="8"   y="8" width="82" height="64" rx="12" fill="white"/>
    <rect x="98"  y="8" width="82" height="64" rx="12" fill="white"/>
    <rect x="188" y="8" width="84" height="64" rx="12" fill="white"/>
    <rect x="16"  y="16" width="38" height="8" rx="4" fill="#ffc220"/>
    <rect x="106" y="16" width="38" height="8" rx="4" fill="#ffc220"/>
    <rect x="196" y="16" width="38" height="8" rx="4" fill="#ffc220"/>
    <rect x="16"  y="31" width="50" height="13" rx="2" fill="#0053e2" opacity=".85"/>
    <rect x="106" y="31" width="50" height="13" rx="2" fill="#0053e2" opacity=".85"/>
    <rect x="196" y="31" width="50" height="13" rx="2" fill="#0053e2" opacity=".85"/>
    <rect x="16"  y="52" width="60" height="4" rx="2" fill="#adb0b5"/>
    <rect x="16"  y="59" width="44" height="4" rx="2" fill="#adb0b5"/>
    <rect x="106" y="52" width="60" height="4" rx="2" fill="#adb0b5"/>
    <rect x="106" y="59" width="44" height="4" rx="2" fill="#adb0b5"/>
    <rect x="196" y="52" width="60" height="4" rx="2" fill="#adb0b5"/>
    <rect x="196" y="59" width="44" height="4" rx="2" fill="#adb0b5"/>
  </svg>`,
  defaultContent: () => ({
    heading: 'Our Impact in Numbers',
    stat1: '$1B+',   desc1: 'invested in associate training and development over five years', tag1: '5-Year Commitment',
    stat2: '75%',    desc2: 'of salaried managers started their career as hourly associates',  tag2: 'Career Advancement',
    stat3: '300K+',  desc3: 'associates have earned a 10+ year service recognition badge',    tag3: 'Loyal Team',
  }),
  defaultSettings: (theme) => ({
    bg: theme.bgAlt,
  }),
  render(block, theme, editing) {
    const card = (stat: string, desc: string, tag: string, sf: string, df: string) =>
      `<div style="background:${LD.white};border-radius:${LD.radiusFrame};padding:36px 32px;box-shadow:${LD.shadowTile};position:relative;overflow:hidden">
        <div style="position:absolute;bottom:-28px;right:-28px;opacity:.05">${walmartSparkSvg(130, LD.navy)}</div>
        <div style="display:inline-flex;align-items:center;gap:6px;background:${LD.yellow};border-radius:${LD.radius};padding:4px 12px;font-size:11px;font-weight:700;color:${LD.navy};margin-bottom:20px;letter-spacing:.3px">
          ${walmartSparkSvg(12, LD.navy)}&nbsp;${escapeHtml(tag)}
        </div>
        <div${editAttr(block.id, sf, editing)} style="font-size:clamp(2.2rem,4vw,3rem);font-weight:700;color:${LD.trueBlue};letter-spacing:-.04em;line-height:1;margin-bottom:14px">${escapeHtml(stat)}</div>
        <p${editAttr(block.id, df, editing)} style="font-size:14px;color:${theme.textMuted};line-height:1.65">${escapeHtml(desc)}</p>
      </div>`;
    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:${LD.font}">
  <div style="max-width:1200px;margin:0 auto">
    <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(1.6rem,3vw,2.2rem);font-weight:700;color:${LD.navy};letter-spacing:-.03em;margin-bottom:40px">${escapeHtml(String(block.content.heading ?? ''))}</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px">
      ${card(String(block.content.stat1 ?? ''), String(block.content.desc1 ?? ''), String(block.content.tag1 ?? ''), 'stat1', 'desc1')}
      ${card(String(block.content.stat2 ?? ''), String(block.content.desc2 ?? ''), String(block.content.tag2 ?? ''), 'stat2', 'desc2')}
      ${card(String(block.content.stat3 ?? ''), String(block.content.desc3 ?? ''), String(block.content.tag3 ?? ''), 'stat3', 'desc3')}
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
      </div>`;
  },
};

// ── LD Job Cards ──────────────────────────────────────────────────────
// Three job-listing cards with department badge, title, location,
// description, and outline CTA. From careers.walmart.com featured roles.

export const ldJobCards: BlockDef = {
  name: 'LD Job Cards',
  category: 'Living Design',
  thumbnail: `<svg viewBox="0 0 280 90" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="90" fill="#f4f4f4"/>
    <rect x="8"   y="8" width="82" height="74" rx="12" fill="white"/>
    <rect x="98"  y="8" width="82" height="74" rx="12" fill="white"/>
    <rect x="188" y="8" width="84" height="74" rx="12" fill="white"/>
    <rect x="16"  y="16" width="42" height="9" rx="4" fill="#e5f2fc"/>
    <rect x="106" y="16" width="42" height="9" rx="4" fill="#e5f2fc"/>
    <rect x="196" y="16" width="42" height="9" rx="4" fill="#e5f2fc"/>
    <rect x="16"  y="31" width="66" height="8" rx="2" fill="#1a1a1a"/>
    <rect x="106" y="31" width="66" height="8" rx="2" fill="#1a1a1a"/>
    <rect x="196" y="31" width="66" height="8" rx="2" fill="#1a1a1a"/>
    <rect x="16"  y="44" width="52" height="5" rx="2" fill="#adb0b5"/>
    <rect x="106" y="44" width="52" height="5" rx="2" fill="#adb0b5"/>
    <rect x="196" y="44" width="52" height="5" rx="2" fill="#adb0b5"/>
    <rect x="16"  y="54" width="64" height="4" rx="2" fill="#d4d7db"/>
    <rect x="16"  y="61" width="48" height="4" rx="2" fill="#d4d7db"/>
    <rect x="106" y="54" width="64" height="4" rx="2" fill="#d4d7db"/>
    <rect x="106" y="61" width="48" height="4" rx="2" fill="#d4d7db"/>
    <rect x="196" y="54" width="64" height="4" rx="2" fill="#d4d7db"/>
    <rect x="196" y="61" width="48" height="4" rx="2" fill="#d4d7db"/>
    <rect x="16"  y="70" width="56" height="8" rx="4" fill="none" stroke="#0071ce" stroke-width="1.5"/>
    <rect x="106" y="70" width="56" height="8" rx="4" fill="none" stroke="#0071ce" stroke-width="1.5"/>
    <rect x="196" y="70" width="56" height="8" rx="4" fill="none" stroke="#0071ce" stroke-width="1.5"/>
  </svg>`,
  defaultContent: () => ({
    heading:   'Featured Roles',
    job1Title: 'Software Engineer III',  job1Dept: 'Technology',    job1Loc: 'Bentonville, AR',       job1Desc: 'Build scalable systems that serve 500M+ customers worldwide.',                     job1Href: '#',
    job2Title: 'Pharmacy Manager',       job2Dept: 'Healthcare',    job2Loc: 'Multiple Locations',    job2Desc: 'Lead a clinical team and improve community health outcomes every day.',            job2Href: '#',
    job3Title: 'Store Coach',            job3Dept: 'Stores & Clubs', job3Loc: 'Nationwide',           job3Desc: 'Develop your store team and deliver exceptional experiences for every customer.', job3Href: '#',
  }),
  defaultSettings: (theme) => ({
    bg: theme.bgAlt,
  }),
  render(block, theme, editing) {
    const deptColors: Record<string, string> = {
      'Technology': LD.blueMid, 'Healthcare': '#d1fae5', 'Stores & Clubs': LD.skyBlue,
      'Corporate': LD.blueLight, 'Supply Chain': '#fef3c7', "Sam's Club": '#ede9fe',
    };
    const pinSvg = `<svg width="11" height="11" viewBox="0 0 16 16" fill="${LD.textTert}" style="flex-shrink:0;margin-right:4px"><path d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>`;
    const arrowSvg = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style="margin-left:4px"><path d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z"/></svg>`;
    const jobCard = (n: number) => {
      const dept    = String(block.content[`job${n}Dept`] ?? '');
      const deptBg  = deptColors[dept] ?? LD.blueLight;
      const href    = sanitizeUrl(String(block.content[`job${n}Href`] ?? '#'));
      return `<div style="background:${LD.white};border-radius:${LD.radiusFrame};padding:28px;display:flex;flex-direction:column;box-shadow:${LD.shadowTile}">
        <span style="display:inline-flex;align-items:center;background:${deptBg};border-radius:${LD.radius};padding:4px 12px;font-size:11px;font-weight:700;color:${LD.navy};margin-bottom:14px;width:fit-content;letter-spacing:.3px">${escapeHtml(dept)}</span>
        <h3${editAttr(block.id, `job${n}Title`, editing)} style="font-size:1.1rem;font-weight:700;color:${theme.text};letter-spacing:-.02em;margin-bottom:8px;line-height:1.3">${escapeHtml(String(block.content[`job${n}Title`] ?? ''))}</h3>
        <div style="display:flex;align-items:center;margin-bottom:12px">${pinSvg}<span style="font-size:12px;color:${LD.textTert}">${escapeHtml(String(block.content[`job${n}Loc`] ?? ''))}</span></div>
        <p${editAttr(block.id, `job${n}Desc`, editing)} style="font-size:13px;color:${theme.textMuted};line-height:1.6;margin-bottom:20px;flex:1">${escapeHtml(String(block.content[`job${n}Desc`] ?? ''))}</p>
        <a href="${href}" style="display:inline-flex;align-items:center;padding:9px 20px;border-radius:${LD.radius};border:2px solid ${LD.blue};font-size:13px;font-weight:700;color:${LD.blue};text-decoration:none;width:fit-content">View Role${arrowSvg}</a>
      </div>`;
    };
    const allJobsArrow = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z"/></svg>`;
    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:${LD.font}">
  <div style="max-width:1200px;margin:0 auto">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:12px">
      <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(1.6rem,3vw,2.2rem);font-weight:700;color:${LD.navy};letter-spacing:-.03em">${escapeHtml(String(block.content.heading ?? ''))}</h2>
      <a href="#" style="font-size:14px;font-weight:700;color:${LD.blue};text-decoration:none;display:inline-flex;align-items:center;gap:5px">View all roles ${allJobsArrow}</a>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px">
      ${jobCard(1)}${jobCard(2)}${jobCard(3)}
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Job Links</label>
        <input type="text" value="${escapeHtml(String(block.content.job1Href))}" class="pp-input" data-key="content.job1Href" placeholder="Job 1 URL">
        <input type="text" value="${escapeHtml(String(block.content.job2Href))}" class="pp-input" style="margin-top:4px" data-key="content.job2Href" placeholder="Job 2 URL">
        <input type="text" value="${escapeHtml(String(block.content.job3Href))}" class="pp-input" style="margin-top:4px" data-key="content.job3Href" placeholder="Job 3 URL">
      </div>
      <div class="pp-group">
        <label class="pp-label">Departments <small style="font-weight:400;opacity:.7">(click text in preview to edit)</small></label>
        <input type="text" value="${escapeHtml(String(block.content.job1Dept))}" class="pp-input" data-key="content.job1Dept" placeholder="e.g. Technology">
        <input type="text" value="${escapeHtml(String(block.content.job2Dept))}" class="pp-input" style="margin-top:4px" data-key="content.job2Dept" placeholder="e.g. Healthcare">
        <input type="text" value="${escapeHtml(String(block.content.job3Dept))}" class="pp-input" style="margin-top:4px" data-key="content.job3Dept" placeholder="e.g. Stores &amp; Clubs">
      </div>
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
      </div>`;
  },
};

// ── Export all LD block defs ──────────────────────────────────────────

export const LD_BLOCK_DEFS: Record<string, BlockDef> = {
  'ld-nav':             ldNav,
  'ld-announcement':    ldAnnouncement,
  'ld-hero':            ldHero,
  'ld-split':           ldSplit,
  'ld-product-tiles':   ldProductTiles,
  'ld-features':        ldFeatures,
  'ld-stats':           ldStats,
  'ld-pricing':         ldPricing,
  'ld-testimonial':     ldTestimonial,
  'ld-banner':          ldBanner,
  'ld-cta':             ldCta,
  'ld-form':            ldForm,
  'ld-footer':          ldFooter,
  'ld-waterfall-nav':   ldWaterfallNav,
  'ld-hero-search':     ldHeroSearch,
  'ld-trending-roles':  ldTrendingRoles,
  'ld-benefits-strip':  ldBenefitsStrip,
  'ld-category-cards':  ldCategoryCards,
  'ld-bento-grid':      ldBentoGrid,
  'ld-milestones':      ldMilestones,
  'ld-job-cards':       ldJobCards,
};
