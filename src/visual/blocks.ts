import type { Block, BlockContent, BlockSettings, NavLink, Theme } from '../types';
import { escapeHtml, renderInlineMarkdown, sanitizeUrl, uid } from '../utils';
import { LD_BLOCK_DEFS } from './ld-blocks';

// ── Block Definition Interface ─────────────────────────────────────────
export interface BlockDef {
  name: string;
  category: 'Structure' | 'Content' | 'Marketing' | 'Living Design';
  thumbnail: string;
  defaultContent(): BlockContent;
  defaultSettings(theme: Theme): BlockSettings;
  render(block: Block, theme: Theme, editing: boolean): string;
  settingsPanel(block: Block): string;
}

// ── Helpers ────────────────────────────────────────────────────────────
export function editAttr(blockId: string, field: string, editing: boolean): string {
  if (!editing) return '';
  return ` class="vc-text" data-block-id="${blockId}" data-field="${field}"`;
}

function sectionBg(settings: BlockSettings): string {
  if (settings.bgType === 'gradient') return `background: ${String(settings.bgGradient)};`;
  if (settings.bgType === 'image' && settings.bgImage)
    return `background: url('${escapeHtml(settings.bgImage)}') center/cover no-repeat;`;
  return `background: ${String(settings.bg)};`;
}

function btnStyle(accent: string, radius: string): string {
  return `display:inline-flex;align-items:center;justify-content:center;padding:13px 28px;border-radius:${radius}px;font-weight:600;font-size:15px;text-decoration:none;transition:opacity .2s,transform .2s;background:${accent};color:#fff;border:none;cursor:pointer;font-family:inherit`;
}

function btnOutlineStyle(color: string, radius: string): string {
  return `display:inline-flex;align-items:center;justify-content:center;padding:11px 26px;border-radius:${radius}px;font-weight:600;font-size:15px;text-decoration:none;transition:all .2s;background:transparent;color:${color};border:2px solid ${color};cursor:pointer;font-family:inherit`;
}

// ── BLOCK DEFINITIONS ──────────────────────────────────────────────────

const nav: BlockDef = {
  name: 'Navigation',
  category: 'Structure',
  thumbnail: `<svg viewBox="0 0 280 50" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="50" fill="#fff"/><text x="16" y="31" font-size="13" font-weight="700" fill="#0f172a" font-family="system-ui">Logo</text><rect x="140" y="19" width="28" height="8" rx="2" fill="#e2e8f0"/><rect x="176" y="19" width="28" height="8" rx="2" fill="#e2e8f0"/><rect x="212" y="19" width="28" height="8" rx="2" fill="#e2e8f0"/><rect x="244" y="17" width="28" height="13" rx="4" fill="#6366f1"/></svg>`,
  defaultContent: () => ({
    logo: 'MySite',
    links: [
      { text: 'Home', href: '#' },
      { text: 'About', href: '#about' },
      { text: 'Services', href: '#services' },
      { text: 'Contact', href: '#contact' },
    ] as NavLink[],
    showCta: true,
    ctaText: 'Get Started',
    ctaLink: '#contact',
  }),
  defaultSettings: (theme) => ({
    bg: theme.bg,
    logoColor: theme.primary,
    linkColor: theme.text,
    sticky: true,
    shadow: true,
  }),
  render(block, theme, editing) {
    const links = (block.content.links as NavLink[]) ?? [];
    const shadow = block.settings.shadow ? 'box-shadow:0 1px 3px rgba(0,0,0,.1);' : '';
    const pos = block.settings.sticky ? 'position:sticky;top:0;z-index:100;' : '';
    return `<nav style="${pos}background:${String(block.settings.bg)};${shadow}font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:1200px;margin:0 auto;padding:0 40px;height:70px;display:flex;align-items:center;justify-content:space-between">
    <a href="/" style="font-size:22px;font-weight:700;color:${String(block.settings.logoColor)};font-family:'${theme.headingFont}',sans-serif;text-decoration:none"${editAttr(block.id, 'logo', editing)}>${escapeHtml(block.content.logo)}</a>
    <div class="ws-nav-links" style="display:flex;gap:28px;align-items:center">
      ${links.map((l, i) => `<a href="${sanitizeUrl(escapeHtml(l.href))}"${editing ? ` class="vc-navlink" data-block-id="${block.id}" data-link-index="${i}"` : ''} style="color:${String(block.settings.linkColor)};text-decoration:none;font-size:15px;font-weight:500">${escapeHtml(l.text)}</a>`).join('')}
      ${block.content.showCta ? `<a href="${sanitizeUrl(escapeHtml(block.content.ctaLink as string))}"${editAttr(block.id, 'ctaText', editing)} style="${btnStyle(theme.accent, theme.radius)}">${escapeHtml(block.content.ctaText)}</a>` : ''}
    </div>
    <button class="ws-hamburger" aria-label="Menu" style="display:none;background:none;border:none;cursor:pointer;padding:4px">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${String(block.settings.linkColor)}" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
  </div>
</nav>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Background</label>
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.logoColor)}" class="pp-color" data-key="settings.logoColor"><span class="pp-color-label">Logo Color</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.linkColor)}" class="pp-color" data-key="settings.linkColor"><span class="pp-color-label">Link Color</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Options</label>
        <label class="pp-toggle"><input type="checkbox" ${block.settings.sticky ? 'checked' : ''} data-key="settings.sticky"><span>Sticky (scroll with page)</span></label>
        <label class="pp-toggle"><input type="checkbox" ${block.settings.shadow ? 'checked' : ''} data-key="settings.shadow"><span>Bottom shadow</span></label>
        <label class="pp-toggle"><input type="checkbox" ${block.content.showCta ? 'checked' : ''} data-key="content.showCta"><span>Show CTA button</span></label>
      </div>
      <div class="pp-group">
        <label class="pp-label">Nav Links <small style="font-weight:400;opacity:.7">(edit text by clicking in preview)</small></label>
        <div id="nav-links-editor" class="nav-links-editor"></div>
      </div>`;
  },
};

const hero: BlockDef = {
  name: 'Hero',
  category: 'Content',
  thumbnail: `<svg viewBox="0 0 280 120" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="120" fill="#0f172a"/><rect x="60" y="32" width="160" height="16" rx="3" fill="white"/><rect x="80" y="56" width="120" height="10" rx="2" fill="rgba(255,255,255,.6)"/><rect x="95" y="78" width="90" height="22" rx="5" fill="#6366f1"/></svg>`,
  defaultContent: () => ({
    heading: 'Build Something Amazing',
    subheading: 'Your website starts here — beautiful, fast, and easy to manage.',
    btn1Text: 'Get Started',
    btn1Link: '#contact',
    btn2Text: 'Learn More',
    btn2Link: '#about',
    showBtn2: true,
  }),
  defaultSettings: (theme) => ({
    bg: theme.primary,
    bgType: 'color',
    bgGradient: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.accent} 100%)`,
    bgImage: '',
    overlay: 0.4,
    textColor: '#ffffff',
    align: 'center',
    height: 'large',
  }),
  render(block, theme, editing) {
    const heights: Record<string, string> = { small: '280px', medium: '420px', large: '560px', full: '100vh' };
    const minH = heights[String(block.settings.height)] ?? '560px';
    const justify = block.settings.align === 'left' ? 'flex-start' : block.settings.align === 'right' ? 'flex-end' : 'center';
    const textA = String(block.settings.align);
    const overlay = block.settings.bgType === 'image' && Number(block.settings.overlay) > 0
      ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,${Number(block.settings.overlay)})"></div>` : '';
    const dropAttr = editing ? ` data-drop-field="settings.bgImage" data-block-id="${block.id}"` : '';
    return `<section${dropAttr} style="${sectionBg(block.settings)}min-height:${minH};display:flex;align-items:center;justify-content:${justify};color:${String(block.settings.textColor)};position:relative;text-align:${textA};font-family:'${theme.bodyFont}',sans-serif">
  ${overlay}
  <div style="position:relative;z-index:1;max-width:860px;margin:0 auto;padding:80px 40px">
    <h1${editAttr(block.id, 'heading', editing)} style="font-size:clamp(2.2rem,5vw,3.8rem);font-weight:800;line-height:1.1;margin-bottom:20px;font-family:'${theme.headingFont}',sans-serif">${renderInlineMarkdown(block.content.heading)}</h1>
    <p${editAttr(block.id, 'subheading', editing)} style="font-size:clamp(1rem,2.5vw,1.3rem);margin-bottom:40px;opacity:.85;max-width:620px;${textA === 'center' ? 'margin-left:auto;margin-right:auto' : ''};line-height:1.6">${renderInlineMarkdown(block.content.subheading)}</p>
    <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:${justify}">
      <a href="${sanitizeUrl(escapeHtml(block.content.btn1Link as string))}"${editAttr(block.id, 'btn1Text', editing)} style="${btnStyle(theme.accent, theme.radius)}">${escapeHtml(block.content.btn1Text)}</a>
      ${block.content.showBtn2 ? `<a href="${sanitizeUrl(escapeHtml(block.content.btn2Link as string))}"${editAttr(block.id, 'btn2Text', editing)} style="${btnOutlineStyle('rgba(255,255,255,.85)', theme.radius)}">${escapeHtml(block.content.btn2Text)}</a>` : ''}
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Background Type</label>
        <div class="pp-seg" id="hero-bg-type">
          <button class="pp-seg-btn ${block.settings.bgType === 'color' ? 'active' : ''}" data-val="color" data-key="settings.bgType">Color</button>
          <button class="pp-seg-btn ${block.settings.bgType === 'gradient' ? 'active' : ''}" data-val="gradient" data-key="settings.bgType">Gradient</button>
          <button class="pp-seg-btn ${block.settings.bgType === 'image' ? 'active' : ''}" data-val="image" data-key="settings.bgType">Image</button>
        </div>
        <div class="pp-row" id="hero-bg-color" ${block.settings.bgType !== 'color' ? 'style="display:none"' : ''}><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Color</span></div>
        <div id="hero-bg-gradient" ${block.settings.bgType !== 'gradient' ? 'style="display:none"' : ''}>
          <input type="text" value="${escapeHtml(block.settings.bgGradient)}" class="pp-input" data-key="settings.bgGradient" placeholder="CSS gradient…">
        </div>
        <div id="hero-bg-image" ${block.settings.bgType !== 'image' ? 'style="display:none"' : ''}>
          <input type="text" value="${escapeHtml(block.settings.bgImage)}" class="pp-input" data-key="settings.bgImage" placeholder="https://…">
          <label class="pp-label" style="margin-top:8px">Overlay opacity</label>
          <input type="range" min="0" max="0.8" step="0.05" value="${Number(block.settings.overlay)}" class="pp-range" data-key="settings.overlay">
        </div>
      </div>
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.textColor)}" class="pp-color" data-key="settings.textColor"><span class="pp-color-label">Text Color</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Layout</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.settings.align === 'left' ? 'active' : ''}" data-val="left" data-key="settings.align">Left</button>
          <button class="pp-seg-btn ${block.settings.align === 'center' ? 'active' : ''}" data-val="center" data-key="settings.align">Center</button>
          <button class="pp-seg-btn ${block.settings.align === 'right' ? 'active' : ''}" data-val="right" data-key="settings.align">Right</button>
        </div>
        <label class="pp-label" style="margin-top:8px">Height</label>
        <select class="pp-select" data-key="settings.height">
          <option value="small" ${block.settings.height === 'small' ? 'selected' : ''}>Small (280px)</option>
          <option value="medium" ${block.settings.height === 'medium' ? 'selected' : ''}>Medium (420px)</option>
          <option value="large" ${block.settings.height === 'large' ? 'selected' : ''}>Large (560px)</option>
          <option value="full" ${block.settings.height === 'full' ? 'selected' : ''}>Full Screen</option>
        </select>
      </div>
      <div class="pp-group">
        <label class="pp-toggle"><input type="checkbox" ${block.content.showBtn2 ? 'checked' : ''} data-key="content.showBtn2"><span>Show second button</span></label>
      </div>`;
  },
};

const features: BlockDef = {
  name: 'Features',
  category: 'Content',
  thumbnail: `<svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="100" fill="#f8fafc"/><rect x="16" y="14" width="74" height="72" rx="6" fill="white" stroke="#e2e8f0" stroke-width="1"/><rect x="103" y="14" width="74" height="72" rx="6" fill="white" stroke="#e2e8f0" stroke-width="1"/><rect x="190" y="14" width="74" height="72" rx="6" fill="white" stroke="#e2e8f0" stroke-width="1"/><rect x="28" y="24" width="18" height="18" rx="4" fill="#6366f1"/><rect x="28" y="50" width="50" height="6" rx="2" fill="#334155"/><rect x="28" y="62" width="50" height="4" rx="2" fill="#94a3b8"/><rect x="28" y="70" width="40" height="4" rx="2" fill="#94a3b8"/><rect x="115" y="24" width="18" height="18" rx="4" fill="#10b981"/><rect x="115" y="50" width="50" height="6" rx="2" fill="#334155"/><rect x="115" y="62" width="50" height="4" rx="2" fill="#94a3b8"/><rect x="202" y="24" width="18" height="18" rx="4" fill="#f59e0b"/><rect x="202" y="50" width="50" height="6" rx="2" fill="#334155"/><rect x="202" y="62" width="50" height="4" rx="2" fill="#94a3b8"/></svg>`,
  defaultContent: () => ({
    sectionTitle: 'Why Choose Us',
    sectionSub: '',
    card1Icon: '⚡',
    card1Title: 'Lightning Fast',
    card1Desc: 'Optimized for performance so your visitors get the best experience every time.',
    card2Icon: '🎨',
    card2Title: 'Beautiful Design',
    card2Desc: 'Professional templates that look stunning on any device, small or large.',
    card3Icon: '🔒',
    card3Title: 'Secure & Reliable',
    card3Desc: 'Enterprise-grade security so you can focus on what matters — your business.',
    columns: 3,
  }),
  defaultSettings: (theme) => ({
    bg: theme.bgAlt,
    cardBg: '#ffffff',
    textColor: theme.text,
    accentColor: theme.accent,
    cardStyle: 'shadow',
  }),
  render(block, theme, editing) {
    const cols = Number(block.content.columns) || 3;
    // Only render cards that have a title — prevents empty placeholder slots
    const cards = ([1, 2, 3] as const).slice(0, cols)
      .filter(i => String(block.content[`card${i}Title`] ?? '').trim());
    const activeCols = cards.length || cols;
    const shadow = block.settings.cardStyle === 'shadow' ? 'box-shadow:0 4px 24px rgba(0,0,0,.07);' : '';
    const border = block.settings.cardStyle === 'border' ? `border:1px solid #e2e8f0;` : '';
    const sub = String(block.content.sectionSub ?? '').trim();
    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:1200px;margin:0 auto">
    <div style="text-align:center;margin-bottom:52px">
      <h2${editAttr(block.id, 'sectionTitle', editing)} style="font-size:clamp(1.7rem,3vw,2.5rem);font-weight:800;color:${String(block.settings.textColor)};font-family:'${theme.headingFont}',sans-serif;margin-bottom:${sub ? '12px' : '0'}">${escapeHtml(block.content.sectionTitle)}</h2>
      ${sub ? `<p${editAttr(block.id, 'sectionSub', editing)} style="font-size:1.1rem;color:${theme.textMuted};max-width:520px;margin:0 auto;line-height:1.6">${escapeHtml(sub)}</p>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:repeat(${activeCols},1fr);gap:28px">
      ${cards.map(i => `<div style="background:${String(block.settings.cardBg)};border-radius:${theme.radius}px;padding:36px 28px;${shadow}${border}">
        <div${editAttr(block.id, `card${i}Icon`, editing)} style="font-size:2rem;margin-bottom:16px">${escapeHtml(block.content[`card${i}Icon`])}</div>
        <h3${editAttr(block.id, `card${i}Title`, editing)} style="font-size:1.2rem;font-weight:700;color:${String(block.settings.textColor)};margin-bottom:10px;font-family:'${theme.headingFont}',sans-serif">${renderInlineMarkdown(block.content[`card${i}Title`])}</h3>
        <p${editAttr(block.id, `card${i}Desc`, editing)} style="color:${theme.textMuted};line-height:1.7;font-size:.95rem">${renderInlineMarkdown(block.content[`card${i}Desc`])}</p>
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
        <div class="pp-row"><input type="color" value="${String(block.settings.textColor)}" class="pp-color" data-key="settings.textColor"><span class="pp-color-label">Text Color</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Card Style</label>
        <select class="pp-select" data-key="settings.cardStyle">
          <option value="shadow" ${block.settings.cardStyle === 'shadow' ? 'selected' : ''}>Shadow</option>
          <option value="border" ${block.settings.cardStyle === 'border' ? 'selected' : ''}>Border</option>
          <option value="plain" ${block.settings.cardStyle === 'plain' ? 'selected' : ''}>Plain</option>
        </select>
      </div>
      <div class="pp-group">
        <label class="pp-label">Columns</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.content.columns === 2 ? 'active' : ''}" data-val="2" data-key="content.columns">2</button>
          <button class="pp-seg-btn ${block.content.columns === 3 ? 'active' : ''}" data-val="3" data-key="content.columns">3</button>
        </div>
      </div>`;
  },
};

const split: BlockDef = {
  name: 'Text + Image',
  category: 'Content',
  thumbnail: `<svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="100" fill="#fff"/><rect x="0" y="0" width="130" height="100" fill="#e2e8f0"/><rect x="148" y="22" width="112" height="12" rx="2" fill="#0f172a"/><rect x="148" y="42" width="100" height="6" rx="2" fill="#94a3b8"/><rect x="148" y="52" width="90" height="6" rx="2" fill="#94a3b8"/><rect x="148" y="62" width="70" height="6" rx="2" fill="#94a3b8"/><rect x="148" y="76" width="70" height="16" rx="4" fill="#6366f1"/></svg>`,
  defaultContent: () => ({
    heading: 'Our Story',
    body: 'We started with a simple idea: make the web accessible to everyone. Today we help thousands of businesses and creators build their online presence with ease.',
    btnText: 'Learn More',
    btnLink: '#',
    showBtn: true,
    imageUrl: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&q=80',
    imageAlt: 'Team at work',
  }),
  defaultSettings: (theme) => ({
    bg: theme.bg,
    textColor: theme.text,
    side: 'right',
  }),
  render(block, theme, editing) {
    const imgLeft = block.settings.side === 'left';
    const imgDropAttr = editing ? ` data-drop-field="content.imageUrl" data-block-id="${block.id}"` : '';
    const imgEl = `<div style="flex:1;min-width:280px"><img${imgDropAttr} src="${escapeHtml(block.content.imageUrl as string)}" alt="${escapeHtml(block.content.imageAlt)}" style="width:100%;height:420px;object-fit:cover;border-radius:${theme.radius}px;display:block"></div>`;
    const textEl = `<div style="flex:1;min-width:280px;display:flex;flex-direction:column;justify-content:center">
      <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(1.7rem,3vw,2.4rem);font-weight:800;color:${String(block.settings.textColor)};margin-bottom:20px;line-height:1.2;font-family:'${theme.headingFont}',sans-serif">${renderInlineMarkdown(block.content.heading)}</h2>
      <p${editAttr(block.id, 'body', editing)} style="color:${theme.textMuted};line-height:1.8;font-size:1.05rem;margin-bottom:32px">${renderInlineMarkdown(block.content.body)}</p>
      ${block.content.showBtn ? `<div><a href="${sanitizeUrl(escapeHtml(block.content.btnLink as string))}"${editAttr(block.id, 'btnText', editing)} style="${btnStyle(theme.accent, theme.radius)}">${escapeHtml(block.content.btnText)}</a></div>` : ''}
    </div>`;
    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:1100px;margin:0 auto;display:flex;gap:60px;align-items:center;flex-wrap:wrap">
    ${imgLeft ? imgEl + textEl : textEl + imgEl}
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.textColor)}" class="pp-color" data-key="settings.textColor"><span class="pp-color-label">Text Color</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Image Position</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.settings.side === 'left' ? 'active' : ''}" data-val="left" data-key="settings.side">Image Left</button>
          <button class="pp-seg-btn ${block.settings.side === 'right' ? 'active' : ''}" data-val="right" data-key="settings.side">Image Right</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Image URL</label>
        <input type="text" value="${escapeHtml(block.content.imageUrl)}" class="pp-input" data-key="content.imageUrl" placeholder="https://…">
        <label class="pp-label" style="margin-top:8px">Alt Text</label>
        <input type="text" value="${escapeHtml(block.content.imageAlt)}" class="pp-input" data-key="content.imageAlt" placeholder="Image description">
      </div>
      <label class="pp-toggle"><input type="checkbox" ${block.content.showBtn ? 'checked' : ''} data-key="content.showBtn"><span>Show button</span></label>`;
  },
};

const stats: BlockDef = {
  name: 'Stats',
  category: 'Content',
  thumbnail: `<svg viewBox="0 0 280 80" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="80" fill="#fff"/><rect x="10" y="14" width="60" height="52" rx="4" fill="#f8fafc"/><text x="28" y="44" font-size="18" font-weight="800" fill="#0f172a" font-family="system-ui">10k</text><rect x="19" y="52" width="42" height="6" rx="2" fill="#94a3b8"/><rect x="80" y="14" width="60" height="52" rx="4" fill="#f8fafc"/><text x="94" y="44" font-size="18" font-weight="800" fill="#0f172a" font-family="system-ui">98%</text><rect x="89" y="52" width="42" height="6" rx="2" fill="#94a3b8"/><rect x="150" y="14" width="60" height="52" rx="4" fill="#f8fafc"/><text x="166" y="44" font-size="18" font-weight="800" fill="#0f172a" font-family="system-ui">50+</text><rect x="159" y="52" width="42" height="6" rx="2" fill="#94a3b8"/><rect x="220" y="14" width="52" height="52" rx="4" fill="#f8fafc"/><text x="233" y="44" font-size="18" font-weight="800" fill="#0f172a" font-family="system-ui">5★</text><rect x="229" y="52" width="35" height="6" rx="2" fill="#94a3b8"/></svg>`,
  defaultContent: () => ({
    stat1Num: '10,000+', stat1Label: 'Happy Customers',
    stat2Num: '98%',    stat2Label: 'Satisfaction Rate',
    stat3Num: '50+',    stat3Label: 'Countries Served',
    stat4Num: '5★',     stat4Label: 'Average Rating',
  }),
  defaultSettings: (theme) => ({
    bg: theme.bg,
    numColor: theme.primary,
    labelColor: theme.textMuted,
  }),
  render(block, theme, editing) {
    const items = [1,2,3,4];
    return `<section style="background:${String(block.settings.bg)};padding:64px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:1000px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;text-align:center">
    ${items.map(i => `<div>
      <div${editAttr(block.id, `stat${i}Num`, editing)} style="font-size:clamp(2rem,4vw,3rem);font-weight:800;color:${String(block.settings.numColor)};font-family:'${theme.headingFont}',sans-serif;line-height:1">${escapeHtml(block.content[`stat${i}Num`])}</div>
      <div${editAttr(block.id, `stat${i}Label`, editing)} style="color:${String(block.settings.labelColor)};margin-top:8px;font-size:.95rem">${escapeHtml(block.content[`stat${i}Label`])}</div>
    </div>`).join('')}
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.numColor)}" class="pp-color" data-key="settings.numColor"><span class="pp-color-label">Number Color</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.labelColor)}" class="pp-color" data-key="settings.labelColor"><span class="pp-color-label">Label Color</span></div>
      </div>`;
  },
};

const textBlock: BlockDef = {
  name: 'Text',
  category: 'Content',
  thumbnail: `<svg viewBox="0 0 280 80" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="80" fill="#fff"/><rect x="40" y="14" width="200" height="12" rx="2" fill="#0f172a"/><rect x="16" y="36" width="248" height="6" rx="2" fill="#94a3b8"/><rect x="16" y="48" width="248" height="6" rx="2" fill="#94a3b8"/><rect x="16" y="60" width="180" height="6" rx="2" fill="#94a3b8"/></svg>`,
  defaultContent: () => ({
    heading: 'About Our Mission',
    body: 'We believe great websites should be accessible to everyone. Our platform combines powerful tools with an intuitive interface so you can create without limits.\n\nWhether you\'re a small business, freelancer, or creative — we\'ve got you covered.',
  }),
  defaultSettings: (theme) => ({
    bg: theme.bg,
    textColor: theme.text,
    align: 'left',
    maxWidth: '760',
  }),
  render(block, theme, editing) {
    const paras = String(block.content.body).split('\n\n').filter(Boolean);
    return `<section style="background:${String(block.settings.bg)};padding:72px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:${String(block.settings.maxWidth)}px;margin:0 auto;text-align:${String(block.settings.align)}">
    <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(1.6rem,3vw,2.2rem);font-weight:800;color:${String(block.settings.textColor)};margin-bottom:24px;font-family:'${theme.headingFont}',sans-serif">${renderInlineMarkdown(block.content.heading)}</h2>
    <div style="color:${theme.textMuted};line-height:1.8;font-size:1.05rem">
      ${paras.map((p, i) => i === 0 && editing
        ? `<p${editAttr(block.id, 'body', editing)} style="margin-bottom:16px">${renderInlineMarkdown(p)}</p>`
        : `<p style="margin-bottom:16px">${renderInlineMarkdown(p)}</p>`
      ).join('')}
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.textColor)}" class="pp-color" data-key="settings.textColor"><span class="pp-color-label">Text Color</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Alignment</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.settings.align === 'left' ? 'active' : ''}" data-val="left" data-key="settings.align">Left</button>
          <button class="pp-seg-btn ${block.settings.align === 'center' ? 'active' : ''}" data-val="center" data-key="settings.align">Center</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Max Width (px)</label>
        <input type="number" value="${Number(block.settings.maxWidth)}" min="400" max="1200" class="pp-input" data-key="settings.maxWidth">
      </div>`;
  },
};

const testimonial: BlockDef = {
  name: 'Testimonial',
  category: 'Marketing',
  thumbnail: `<svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="100" fill="#f8fafc"/><text x="16" y="36" font-size="32" fill="#6366f1" font-family="serif">"</text><rect x="40" y="18" width="220" height="8" rx="2" fill="#334155"/><rect x="40" y="32" width="200" height="6" rx="2" fill="#94a3b8"/><rect x="40" y="44" width="180" height="6" rx="2" fill="#94a3b8"/><circle cx="30" cy="72" r="14" fill="#6366f1"/><rect x="54" y="64" width="80" height="7" rx="2" fill="#334155"/><rect x="54" y="76" width="60" height="5" rx="2" fill="#94a3b8"/></svg>`,
  defaultContent: () => ({
    quote: 'This platform transformed how we manage our online presence. Setup was a breeze and the results speak for themselves.',
    author: 'Sarah Johnson',
    role: 'CEO, Acme Corp',
    avatar: 'https://i.pravatar.cc/80?img=5',
  }),
  defaultSettings: (theme) => ({
    bg: theme.bgAlt,
    quoteColor: theme.text,
    accentColor: theme.accent,
  }),
  render(block, theme, editing) {
    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:740px;margin:0 auto;text-align:center">
    <div style="font-size:4rem;color:${String(block.settings.accentColor)};line-height:.8;margin-bottom:16px;font-family:Georgia,serif">"</div>
    <blockquote${editAttr(block.id, 'quote', editing)} style="font-size:clamp(1.1rem,2.5vw,1.4rem);color:${String(block.settings.quoteColor)};line-height:1.7;margin-bottom:36px;font-style:italic">${renderInlineMarkdown(block.content.quote)}</blockquote>
    <div style="display:flex;align-items:center;justify-content:center;gap:16px">
      <img${editing ? ` data-drop-field="content.avatar" data-block-id="${block.id}"` : ''} src="${escapeHtml(block.content.avatar as string)}" alt="${escapeHtml(block.content.author)}" style="width:52px;height:52px;border-radius:50%;object-fit:cover">
      <div style="text-align:left">
        <div${editAttr(block.id, 'author', editing)} style="font-weight:700;color:${String(block.settings.quoteColor)};font-size:1rem">${escapeHtml(block.content.author)}</div>
        <div${editAttr(block.id, 'role', editing)} style="color:${theme.textMuted};font-size:.9rem">${escapeHtml(block.content.role)}</div>
      </div>
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.accentColor)}" class="pp-color" data-key="settings.accentColor"><span class="pp-color-label">Accent Color</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Avatar URL</label>
        <input type="text" value="${escapeHtml(block.content.avatar)}" class="pp-input" data-key="content.avatar" placeholder="https://…">
      </div>`;
  },
};

const gallery: BlockDef = {
  name: 'Gallery',
  category: 'Content',
  thumbnail: `<svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="100" fill="#fff"/><rect x="8" y="12" width="82" height="76" rx="4" fill="#e2e8f0"/><rect x="99" y="12" width="82" height="76" rx="4" fill="#e2e8f0"/><rect x="190" y="12" width="82" height="76" rx="4" fill="#e2e8f0"/></svg>`,
  defaultContent: () => ({
    heading: 'Our Work',
    img1: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600&q=80',
    img2: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?w=600&q=80',
    img3: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=80',
    img4: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=600&q=80',
    img5: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=600&q=80',
    img6: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&q=80',
    count: 6,
  }),
  defaultSettings: (theme) => ({
    bg: theme.bg,
    textColor: theme.text,
    cols: 3,
  }),
  render(block, theme, editing) {
    const cols = Number(block.settings.cols) || 3;
    const count = Number(block.content.count) || 6;
    const imgs = Array.from({ length: count }, (_, i) => block.content[`img${i+1}`] as string);
    return `<section style="background:${String(block.settings.bg)};padding:72px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:1200px;margin:0 auto">
    <h2${editAttr(block.id, 'heading', editing)} style="text-align:center;font-size:clamp(1.6rem,3vw,2.2rem);font-weight:800;color:${String(block.settings.textColor)};margin-bottom:48px;font-family:'${theme.headingFont}',sans-serif">${renderInlineMarkdown(block.content.heading)}</h2>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px">
      ${imgs.map((src, i) => `<div style="border-radius:${theme.radius}px;overflow:hidden;aspect-ratio:4/3"><img${editing ? ` data-drop-field="content.img${i+1}" data-block-id="${block.id}"` : ''} src="${escapeHtml(src)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'"></div>`).join('')}
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    const count = Number(block.content.count) || 6;
    const imgInputs = Array.from({ length: count }, (_, i) =>
      `<input type="text" value="${escapeHtml(block.content[`img${i+1}`])}" class="pp-input" data-key="content.img${i+1}" placeholder="Image ${i+1} URL" style="margin-top:4px">`
    ).join('');
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Columns</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.settings.cols === 2 ? 'active' : ''}" data-val="2" data-key="settings.cols">2</button>
          <button class="pp-seg-btn ${block.settings.cols === 3 ? 'active' : ''}" data-val="3" data-key="settings.cols">3</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Images (URLs)</label>
        ${imgInputs}
      </div>`;
  },
};

const cta: BlockDef = {
  name: 'Call to Action',
  category: 'Marketing',
  thumbnail: `<svg viewBox="0 0 280 80" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="80" fill="#0f172a"/><rect x="50" y="16" width="180" height="12" rx="2" fill="white"/><rect x="80" y="36" width="120" height="8" rx="2" fill="rgba(255,255,255,.5)"/><rect x="100" y="54" width="80" height="18" rx="5" fill="#6366f1"/></svg>`,
  defaultContent: () => ({
    heading: 'Ready to Get Started?',
    subtext: 'Join thousands of businesses already growing with us.',
    btnText: 'Start Free Today',
    btnLink: '#',
    btn2Text: 'See Pricing',
    btn2Link: '#',
    showBtn2: true,
  }),
  defaultSettings: (theme) => ({
    bg: theme.primary,
    textColor: '#ffffff',
    bgType: 'color',
    bgGradient: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.accent} 100%)`,
  }),
  render(block, theme, editing) {
    return `<section style="${sectionBg(block.settings)}padding:80px 40px;text-align:center;color:${String(block.settings.textColor)};font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:680px;margin:0 auto">
    <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(1.8rem,4vw,3rem);font-weight:800;margin-bottom:16px;font-family:'${theme.headingFont}',sans-serif">${renderInlineMarkdown(block.content.heading)}</h2>
    <p${editAttr(block.id, 'subtext', editing)} style="font-size:1.15rem;opacity:.8;margin-bottom:40px;line-height:1.6">${renderInlineMarkdown(block.content.subtext)}</p>
    <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
      <a href="${sanitizeUrl(escapeHtml(block.content.btnLink as string))}"${editAttr(block.id, 'btnText', editing)} style="${btnStyle(theme.accent, theme.radius)}">${escapeHtml(block.content.btnText)}</a>
      ${block.content.showBtn2 ? `<a href="${sanitizeUrl(escapeHtml(block.content.btn2Link as string))}"${editAttr(block.id, 'btn2Text', editing)} style="${btnOutlineStyle('rgba(255,255,255,.8)', theme.radius)}">${escapeHtml(block.content.btn2Text)}</a>` : ''}
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Background Type</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.settings.bgType === 'color' ? 'active' : ''}" data-val="color" data-key="settings.bgType">Solid</button>
          <button class="pp-seg-btn ${block.settings.bgType === 'gradient' ? 'active' : ''}" data-val="gradient" data-key="settings.bgType">Gradient</button>
        </div>
        <div class="pp-row" id="cta-bg-color"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background Color</span></div>
        <div id="cta-bg-grad"><input type="text" value="${escapeHtml(block.settings.bgGradient)}" class="pp-input" data-key="settings.bgGradient" placeholder="CSS gradient"></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.textColor)}" class="pp-color" data-key="settings.textColor"><span class="pp-color-label">Text Color</span></div>
      </div>
      <label class="pp-toggle"><input type="checkbox" ${block.content.showBtn2 ? 'checked' : ''} data-key="content.showBtn2"><span>Show second button</span></label>`;
  },
};

const footer: BlockDef = {
  name: 'Footer',
  category: 'Structure',
  thumbnail: `<svg viewBox="0 0 280 80" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="80" fill="#0f172a"/><text x="16" y="30" font-size="12" font-weight="700" fill="white" font-family="system-ui">Logo</text><rect x="16" y="40" width="60" height="5" rx="2" fill="rgba(255,255,255,.3)"/><rect x="100" y="16" width="40" height="6" rx="2" fill="rgba(255,255,255,.6)"/><rect x="100" y="28" width="50" height="5" rx="2" fill="rgba(255,255,255,.3)"/><rect x="100" y="38" width="45" height="5" rx="2" fill="rgba(255,255,255,.3)"/><rect x="170" y="16" width="40" height="6" rx="2" fill="rgba(255,255,255,.6)"/><rect x="170" y="28" width="50" height="5" rx="2" fill="rgba(255,255,255,.3)"/><rect x="170" y="38" width="45" height="5" rx="2" fill="rgba(255,255,255,.3)"/><rect x="16" y="64" width="248" height="1" fill="rgba(255,255,255,.1)"/><rect x="80" y="70" width="120" height="5" rx="2" fill="rgba(255,255,255,.2)"/></svg>`,
  defaultContent: () => ({
    logo: 'MySite',
    tagline: 'Building the web, one site at a time.',
    col1Title: 'Company',
    col1Links: [
      { text: 'About', href: '#about' },
      { text: 'Services', href: '#services' },
      { text: 'Blog', href: '#blog' },
    ] as NavLink[],
    col2Title: 'Support',
    col2Links: [
      { text: 'Help Center', href: '#' },
      { text: 'Contact', href: '#contact' },
      { text: 'Privacy', href: '#' },
    ] as NavLink[],
    copyright: `© ${new Date().getFullYear()} MySite. All rights reserved.`,
  }),
  defaultSettings: (theme) => ({
    bg: theme.primary,
    textColor: 'rgba(255,255,255,0.7)',
    headingColor: '#ffffff',
    logoColor: '#ffffff',
  }),
  render(block, theme, editing) {
    const renderLinks = (links: NavLink[], colKey: string) =>
      links.map((l, i) => `<a href="${sanitizeUrl(escapeHtml(l.href))}"${editing ? ` class="vc-footlink" data-block-id="${block.id}" data-col="${colKey}" data-link-index="${i}"` : ''} style="color:${String(block.settings.textColor)};text-decoration:none;font-size:.9rem;transition:color .2s;display:block;padding:4px 0" onmouseover="this.style.color='${String(block.settings.headingColor)}'" onmouseout="this.style.color='${String(block.settings.textColor)}'">${escapeHtml(l.text)}</a>`).join('');

    return `<footer style="background:${String(block.settings.bg)};padding:64px 40px 32px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:1200px;margin:0 auto">
    <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:48px;margin-bottom:48px">
      <div>
        <div${editAttr(block.id, 'logo', editing)} style="font-size:22px;font-weight:700;color:${String(block.settings.logoColor)};font-family:'${theme.headingFont}',sans-serif;margin-bottom:12px">${escapeHtml(block.content.logo)}</div>
        <p${editAttr(block.id, 'tagline', editing)} style="color:${String(block.settings.textColor)};line-height:1.6;font-size:.95rem;max-width:240px">${renderInlineMarkdown(block.content.tagline)}</p>
      </div>
      <div>
        <div${editAttr(block.id, 'col1Title', editing)} style="color:${String(block.settings.headingColor)};font-weight:700;margin-bottom:16px;font-size:.95rem;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(block.content.col1Title)}</div>
        ${renderLinks(block.content.col1Links as NavLink[], 'col1')}
      </div>
      <div>
        <div${editAttr(block.id, 'col2Title', editing)} style="color:${String(block.settings.headingColor)};font-weight:700;margin-bottom:16px;font-size:.95rem;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(block.content.col2Title)}</div>
        ${renderLinks(block.content.col2Links as NavLink[], 'col2')}
      </div>
    </div>
    <div style="border-top:1px solid rgba(255,255,255,.08);padding-top:24px;text-align:center">
      <p${editAttr(block.id, 'copyright', editing)} style="color:${String(block.settings.textColor)};font-size:.875rem">${escapeHtml(block.content.copyright)}</p>
    </div>
  </div>
</footer>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.headingColor)}" class="pp-color" data-key="settings.headingColor"><span class="pp-color-label">Heading Color</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.textColor)}" class="pp-color" data-key="settings.textColor"><span class="pp-color-label">Text Color</span></div>
      </div>`;
  },
};

// ── Custom HTML block ─────────────────────────────────────────────────
// Stores an arbitrary HTML section verbatim — created when the user converts
// a raw HTML page to visual blocks. Renders without escaping so the original
// markup is preserved exactly. Inline text editing is handled by the
// wb:customHtmlSave message path in canvas.ts.

const customBlock: BlockDef = {
  name: 'HTML Section',
  category: 'Structure',
  thumbnail: `<svg viewBox="0 0 280 80" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="80" fill="#1e1e1e"/><rect x="16" y="16" width="248" height="6" rx="2" fill="#569cd6"/><rect x="16" y="28" width="180" height="5" rx="2" fill="#ce9178"/><rect x="16" y="40" width="200" height="5" rx="2" fill="#9cdcfe"/><rect x="16" y="52" width="160" height="5" rx="2" fill="#6a9955"/><rect x="16" y="64" width="248" height="6" rx="2" fill="#569cd6"/></svg>`,
  defaultContent: () => ({
    html:  '<section style="padding:60px 40px;background:#f8fafc;text-align:center"><h2 style="font-size:2rem;margin-bottom:16px">New Section</h2><p style="color:#64748b">Edit this section\'s HTML in the properties panel, or click text to edit inline.</p></section>',
    label: 'Custom Section',
  }),
  defaultSettings: (_theme) => ({}),
  render(block, _theme, editing) {
    const html = String(block.content.html);
    if (!editing) return html;
    // In editing mode the editingBlockWrapper in export.ts already wraps
    // every block — just return the raw HTML for .wb-inner.
    return html;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Section Label</label>
        <input type="text" value="${escapeHtml(block.content.label)}" class="pp-input" data-key="content.label" placeholder="e.g. Hero, About, Footer">
      </div>
      <div class="pp-group">
        <label class="pp-label" style="display:flex;justify-content:space-between">
          HTML Content
          <span style="font-weight:400;opacity:.6">${String(block.content.html).length} chars</span>
        </label>
        <textarea class="pp-input pp-html-editor" data-key="content.html" rows="14"
          style="font-family:monospace;font-size:11px;resize:vertical;line-height:1.5">${escapeHtml(block.content.html)}</textarea>
        <div class="form-hint">Edit the raw HTML for this section. Changes update the preview in real time.</div>
      </div>`;
  },
};

// ── Embed / iFrame ───────────────────────────────────────────────────

const embed: BlockDef = {
  name: 'Embed / iFrame',
  category: 'Content',
  thumbnail: `<svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="100" fill="#f8fafc"/><rect x="20" y="10" width="240" height="72" rx="6" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1"/><text x="140" y="50" font-size="12" fill="#64748b" font-family="system-ui" text-anchor="middle">Embed / iFrame</text><rect x="80" y="88" width="120" height="6" rx="2" fill="#94a3b8"/></svg>`,
  defaultContent: () => ({
    embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    caption: '',
    aspectRatio: '16/9',
  }),
  defaultSettings: (theme) => ({
    bg: theme.bg,
    maxWidth: '800',
  }),
  render(block, theme, editing) {
    const url = sanitizeUrl(escapeHtml(block.content.embedUrl as string));
    const ratio = String(block.content.aspectRatio) || '16/9';
    return `<section style="background:${String(block.settings.bg)};padding:60px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:${String(block.settings.maxWidth)}px;margin:0 auto">
    <div style="position:relative;width:100%;aspect-ratio:${ratio};border-radius:${theme.radius}px;overflow:hidden;background:#000">
      <iframe src="${url}" style="position:absolute;inset:0;width:100%;height:100%;border:none" allowfullscreen loading="lazy"></iframe>
    </div>
    ${block.content.caption ? `<p${editAttr(block.id, 'caption', editing)} style="text-align:center;color:${theme.textMuted};font-size:.9rem;margin-top:12px">${escapeHtml(block.content.caption)}</p>` : ''}
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Embed URL</label>
        <input type="text" value="${escapeHtml(block.content.embedUrl)}" class="pp-input" data-key="content.embedUrl" placeholder="https://www.youtube.com/embed/…">
      </div>
      <div class="pp-group">
        <label class="pp-label">Aspect Ratio</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.content.aspectRatio === '16/9' ? 'active' : ''}" data-val="16/9" data-key="content.aspectRatio">16:9</button>
          <button class="pp-seg-btn ${block.content.aspectRatio === '4/3' ? 'active' : ''}" data-val="4/3" data-key="content.aspectRatio">4:3</button>
          <button class="pp-seg-btn ${block.content.aspectRatio === '1/1' ? 'active' : ''}" data-val="1/1" data-key="content.aspectRatio">1:1</button>
        </div>
      </div>
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <label class="pp-label" style="margin-top:8px">Max Width (px)</label>
        <input type="number" value="${Number(block.settings.maxWidth)}" min="400" max="1200" class="pp-input" data-key="settings.maxWidth">
      </div>`;
  },
};

// ── Image ────────────────────────────────────────────────────────────

const imageBlock: BlockDef = {
  name: 'Image',
  category: 'Content',
  thumbnail: `<svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="100" fill="#fff"/><rect x="40" y="8" width="200" height="76" rx="6" fill="#e2e8f0"/><circle cx="80" cy="36" r="12" fill="#94a3b8"/><path d="M40 62 L100 36 L160 54 L200 42 L240 60 L240 84 L40 84Z" fill="#cbd5e1"/><rect x="80" y="90" width="120" height="5" rx="2" fill="#94a3b8"/></svg>`,
  defaultContent: () => ({
    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=900&q=80',
    alt: 'Scenic landscape',
    caption: '',
  }),
  defaultSettings: (theme) => ({
    bg: theme.bg,
    maxWidth: '800',
    rounded: true,
    shadow: true,
  }),
  render(block, theme, editing) {
    const radius = block.settings.rounded ? `${theme.radius}px` : '0';
    const shadow = block.settings.shadow ? 'box-shadow:0 8px 30px rgba(0,0,0,.12);' : '';
    const dropAttr = editing ? ` data-drop-field="content.imageUrl" data-block-id="${block.id}"` : '';
    return `<section style="background:${String(block.settings.bg)};padding:60px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:${String(block.settings.maxWidth)}px;margin:0 auto">
    <img${dropAttr} src="${escapeHtml(block.content.imageUrl as string)}" alt="${escapeHtml(block.content.alt)}" style="width:100%;display:block;border-radius:${radius};${shadow}">
    ${block.content.caption ? `<p${editAttr(block.id, 'caption', editing)} style="text-align:center;color:${theme.textMuted};font-size:.9rem;margin-top:12px">${escapeHtml(block.content.caption)}</p>` : ''}
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Image URL</label>
        <input type="text" value="${escapeHtml(block.content.imageUrl)}" class="pp-input" data-key="content.imageUrl" placeholder="https://…">
        <label class="pp-label" style="margin-top:8px">Alt Text</label>
        <input type="text" value="${escapeHtml(block.content.alt)}" class="pp-input" data-key="content.alt" placeholder="Describe the image">
        <label class="pp-label" style="margin-top:8px">Caption</label>
        <input type="text" value="${escapeHtml(block.content.caption)}" class="pp-input" data-key="content.caption" placeholder="Optional caption">
      </div>
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <label class="pp-label" style="margin-top:8px">Max Width (px)</label>
        <input type="number" value="${Number(block.settings.maxWidth)}" min="200" max="1400" class="pp-input" data-key="settings.maxWidth">
      </div>
      <div class="pp-group">
        <label class="pp-toggle"><input type="checkbox" ${block.settings.rounded ? 'checked' : ''} data-key="settings.rounded"><span>Rounded corners</span></label>
        <label class="pp-toggle"><input type="checkbox" ${block.settings.shadow ? 'checked' : ''} data-key="settings.shadow"><span>Shadow</span></label>
      </div>`;
  },
};

// ── Video ────────────────────────────────────────────────────────────

const videoBlock: BlockDef = {
  name: 'Video',
  category: 'Content',
  thumbnail: `<svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="100" fill="#0f172a"/><rect x="30" y="10" width="220" height="72" rx="6" fill="#1e293b"/><polygon points="125,32 125,60 155,46" fill="#6366f1"/><rect x="80" y="88" width="120" height="6" rx="2" fill="#475569"/></svg>`,
  defaultContent: () => ({
    videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    poster: '',
    caption: '',
    autoplay: false,
    loop: false,
    muted: false,
  }),
  defaultSettings: (theme) => ({
    bg: theme.primary,
    maxWidth: '900',
    rounded: true,
  }),
  render(block, theme, editing) {
    const radius = block.settings.rounded ? `${theme.radius}px` : '0';
    const attrs = [
      'controls',
      'playsinline',
      block.content.autoplay ? 'autoplay' : '',
      block.content.loop ? 'loop' : '',
      block.content.muted ? 'muted' : '',
    ].filter(Boolean).join(' ');
    const posterAttr = block.content.poster ? ` poster="${escapeHtml(block.content.poster as string)}"` : '';
    const dropAttr = editing ? ` data-drop-field="content.poster" data-block-id="${block.id}"` : '';
    return `<section style="background:${String(block.settings.bg)};padding:60px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:${String(block.settings.maxWidth)}px;margin:0 auto">
    <video${dropAttr} src="${escapeHtml(block.content.videoUrl as string)}"${posterAttr} ${attrs} style="width:100%;display:block;border-radius:${radius}"></video>
    ${block.content.caption ? `<p${editAttr(block.id, 'caption', editing)} style="text-align:center;color:rgba(255,255,255,.6);font-size:.9rem;margin-top:12px">${escapeHtml(block.content.caption)}</p>` : ''}
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Video URL</label>
        <input type="text" value="${escapeHtml(block.content.videoUrl)}" class="pp-input" data-key="content.videoUrl" placeholder="https://…/video.mp4">
        <label class="pp-label" style="margin-top:8px">Poster Image</label>
        <input type="text" value="${escapeHtml(block.content.poster)}" class="pp-input" data-key="content.poster" placeholder="https://… (optional)">
      </div>
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <label class="pp-label" style="margin-top:8px">Max Width (px)</label>
        <input type="number" value="${Number(block.settings.maxWidth)}" min="300" max="1400" class="pp-input" data-key="settings.maxWidth">
      </div>
      <div class="pp-group">
        <label class="pp-toggle"><input type="checkbox" ${block.settings.rounded ? 'checked' : ''} data-key="settings.rounded"><span>Rounded corners</span></label>
        <label class="pp-toggle"><input type="checkbox" ${block.content.autoplay ? 'checked' : ''} data-key="content.autoplay"><span>Autoplay</span></label>
        <label class="pp-toggle"><input type="checkbox" ${block.content.loop ? 'checked' : ''} data-key="content.loop"><span>Loop</span></label>
        <label class="pp-toggle"><input type="checkbox" ${block.content.muted ? 'checked' : ''} data-key="content.muted"><span>Muted</span></label>
      </div>`;
  },
};

// ── Divider / Spacer ─────────────────────────────────────────────────

const divider: BlockDef = {
  name: 'Divider / Spacer',
  category: 'Structure',
  thumbnail: `<svg viewBox="0 0 280 50" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="50" fill="#fff"/><line x1="40" y1="25" x2="240" y2="25" stroke="#e2e8f0" stroke-width="2"/></svg>`,
  defaultContent: () => ({
    style: 'line',
    height: 80,
  }),
  defaultSettings: (theme) => ({
    bg: theme.bg,
    lineColor: '#e2e8f0',
  }),
  render(block, _theme, _editing) {
    const h = Number(block.content.height) || 80;
    const style = String(block.content.style);
    let inner = '';
    if (style === 'line') {
      inner = `<hr style="border:none;border-top:2px solid ${String(block.settings.lineColor)};max-width:200px;margin:0 auto">`;
    } else if (style === 'dots') {
      inner = `<div style="text-align:center;color:${String(block.settings.lineColor)};font-size:24px;letter-spacing:12px">···</div>`;
    }
    return `<div style="background:${String(block.settings.bg)};display:flex;align-items:center;justify-content:center;min-height:${h}px">${inner}</div>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <label class="pp-label">Style</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.content.style === 'line' ? 'active' : ''}" data-val="line" data-key="content.style">Line</button>
          <button class="pp-seg-btn ${block.content.style === 'dots' ? 'active' : ''}" data-val="dots" data-key="content.style">Dots</button>
          <button class="pp-seg-btn ${block.content.style === 'space' ? 'active' : ''}" data-val="space" data-key="content.style">Space</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Height (px)</label>
        <input type="range" min="40" max="200" step="10" value="${Number(block.content.height)}" class="pp-range" data-key="content.height">
      </div>
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.lineColor)}" class="pp-color" data-key="settings.lineColor"><span class="pp-color-label">Line Color</span></div>
      </div>`;
  },
};

// ── Logo Cloud ───────────────────────────────────────────────────────

const logos: BlockDef = {
  name: 'Logo Cloud',
  category: 'Marketing',
  thumbnail: `<svg viewBox="0 0 280 80" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="80" fill="#f8fafc"/><rect x="80" y="6" width="120" height="8" rx="2" fill="#94a3b8"/><rect x="10" y="28" width="56" height="32" rx="4" fill="#e2e8f0"/><rect x="76" y="28" width="56" height="32" rx="4" fill="#e2e8f0"/><rect x="142" y="28" width="56" height="32" rx="4" fill="#e2e8f0"/><rect x="208" y="28" width="56" height="32" rx="4" fill="#e2e8f0"/><rect x="44" y="68" width="56" height="8" rx="3" fill="#e2e8f0"/><rect x="110" y="68" width="56" height="8" rx="3" fill="#e2e8f0"/><rect x="176" y="68" width="56" height="8" rx="3" fill="#e2e8f0"/></svg>`,
  defaultContent: () => ({
    heading: 'Trusted by leading companies',
    logo1: 'https://placehold.co/160x60/e2e8f0/64748b?text=Logo+1',
    logo2: 'https://placehold.co/160x60/e2e8f0/64748b?text=Logo+2',
    logo3: 'https://placehold.co/160x60/e2e8f0/64748b?text=Logo+3',
    logo4: 'https://placehold.co/160x60/e2e8f0/64748b?text=Logo+4',
    logo5: 'https://placehold.co/160x60/e2e8f0/64748b?text=Logo+5',
    logo6: 'https://placehold.co/160x60/e2e8f0/64748b?text=Logo+6',
    count: 6,
    grayscale: true,
  }),
  defaultSettings: (theme) => ({
    bg: theme.bgAlt,
    textColor: theme.textMuted,
  }),
  render(block, theme, editing) {
    const count = Number(block.content.count) || 6;
    const gs = block.content.grayscale ? 'filter:grayscale(1);opacity:.6;transition:all .3s;' : 'transition:all .3s;';
    const hover = block.content.grayscale ? 'onmouseover="this.style.filter=\'none\';this.style.opacity=1" onmouseout="this.style.filter=\'grayscale(1)\';this.style.opacity=.6"' : '';
    const imgs = Array.from({ length: count }, (_, i) =>
      `<img src="${escapeHtml(block.content[`logo${i+1}`] as string)}" alt="Logo ${i+1}" style="height:40px;max-width:140px;object-fit:contain;${gs}" ${hover}>`
    ).join('');
    return `<section style="background:${String(block.settings.bg)};padding:56px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:1000px;margin:0 auto;text-align:center">
    <p${editAttr(block.id, 'heading', editing)} style="color:${String(block.settings.textColor)};font-size:.95rem;margin-bottom:32px;text-transform:uppercase;letter-spacing:1px;font-weight:600">${renderInlineMarkdown(block.content.heading)}</p>
    <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:40px">${imgs}</div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    const count = Number(block.content.count) || 6;
    const logoInputs = Array.from({ length: count }, (_, i) =>
      `<input type="text" value="${escapeHtml(block.content[`logo${i+1}`])}" class="pp-input" data-key="content.logo${i+1}" placeholder="Logo ${i+1} URL" style="margin-top:4px">`
    ).join('');
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Number of Logos</label>
        <input type="range" min="3" max="8" step="1" value="${count}" class="pp-range" data-key="content.count">
      </div>
      <div class="pp-group">
        <label class="pp-toggle"><input type="checkbox" ${block.content.grayscale ? 'checked' : ''} data-key="content.grayscale"><span>Grayscale effect</span></label>
      </div>
      <div class="pp-group">
        <label class="pp-label">Logo URLs</label>
        ${logoInputs}
      </div>`;
  },
};

// ── Pricing ──────────────────────────────────────────────────────────

const pricing: BlockDef = {
  name: 'Pricing',
  category: 'Marketing',
  thumbnail: `<svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="100" fill="#f8fafc"/><rect x="8" y="12" width="82" height="78" rx="6" fill="white" stroke="#e2e8f0" stroke-width="1"/><rect x="99" y="8" width="82" height="84" rx="6" fill="white" stroke="#6366f1" stroke-width="2"/><rect x="190" y="12" width="82" height="78" rx="6" fill="white" stroke="#e2e8f0" stroke-width="1"/><text x="140" y="40" font-size="16" font-weight="800" fill="#0f172a" text-anchor="middle" font-family="system-ui">$29</text><rect x="112" y="50" width="56" height="6" rx="2" fill="#94a3b8"/><rect x="116" y="62" width="48" height="14" rx="4" fill="#6366f1"/></svg>`,
  defaultContent: () => ({
    heading: 'Simple, Transparent Pricing',
    subtext: 'No hidden fees. Choose the plan that fits your needs.',
    plan1Name: 'Starter', plan1Price: '$9', plan1Period: '/month',
    plan1Features: 'Up to 3 pages\nBasic templates\nEmail support',
    plan1Cta: 'Get Started',
    plan2Name: 'Pro', plan2Price: '$29', plan2Period: '/month',
    plan2Features: 'Unlimited pages\nAll templates\nPriority support\nCustom domain',
    plan2Cta: 'Go Pro',
    plan2Featured: true,
    plan3Name: 'Enterprise', plan3Price: '$99', plan3Period: '/month',
    plan3Features: 'Everything in Pro\nTeam accounts\nDedicated support\nSLA guarantee',
    plan3Cta: 'Contact Us',
  }),
  defaultSettings: (theme) => ({
    bg: theme.bgAlt,
    cardBg: '#ffffff',
    textColor: theme.text,
  }),
  render(block, theme, editing) {
    const plans = [1, 2, 3];
    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:1100px;margin:0 auto">
    <div style="text-align:center;margin-bottom:52px">
      <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(1.7rem,3vw,2.5rem);font-weight:800;color:${String(block.settings.textColor)};font-family:'${theme.headingFont}',sans-serif;margin-bottom:12px">${renderInlineMarkdown(block.content.heading)}</h2>
      <p${editAttr(block.id, 'subtext', editing)} style="font-size:1.1rem;color:${theme.textMuted};max-width:520px;margin:0 auto;line-height:1.6">${renderInlineMarkdown(block.content.subtext)}</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;align-items:start">
      ${plans.map(i => {
        const featured = i === 2 && block.content.plan2Featured;
        const border = featured ? `border:2px solid ${theme.accent}` : `border:1px solid #e2e8f0`;
        const feats = String(block.content[`plan${i}Features`]).split('\n').filter(Boolean);
        return `<div style="background:${String(block.settings.cardBg)};${border};border-radius:${theme.radius}px;padding:36px 28px;${featured ? 'transform:scale(1.04);box-shadow:0 8px 30px rgba(99,102,241,.15);position:relative' : ''}">
          ${featured ? `<div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:${theme.accent};color:#fff;font-size:11px;font-weight:600;padding:3px 14px;border-radius:20px">Most Popular</div>` : ''}
          <div${editAttr(block.id, `plan${i}Name`, editing)} style="font-size:1rem;font-weight:600;color:${String(block.settings.textColor)};margin-bottom:8px">${escapeHtml(block.content[`plan${i}Name`])}</div>
          <div style="display:flex;align-items:baseline;gap:2px;margin-bottom:24px">
            <span${editAttr(block.id, `plan${i}Price`, editing)} style="font-size:2.5rem;font-weight:800;color:${String(block.settings.textColor)};font-family:'${theme.headingFont}',sans-serif">${escapeHtml(block.content[`plan${i}Price`])}</span>
            <span${editAttr(block.id, `plan${i}Period`, editing)} style="color:${theme.textMuted};font-size:.95rem">${escapeHtml(block.content[`plan${i}Period`])}</span>
          </div>
          <ul style="list-style:none;padding:0;margin:0 0 28px">
            ${feats.map(f => `<li style="padding:6px 0;color:${theme.textMuted};font-size:.9rem;display:flex;align-items:center;gap:8px"><span style="color:${theme.accent}">✓</span>${escapeHtml(f)}</li>`).join('')}
          </ul>
          <a${editAttr(block.id, `plan${i}Cta`, editing)} href="#" style="${featured ? btnStyle(theme.accent, theme.radius) : btnOutlineStyle(theme.accent, theme.radius)};width:100%;text-align:center">${escapeHtml(block.content[`plan${i}Cta`])}</a>
        </div>`;
      }).join('')}
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.cardBg)}" class="pp-color" data-key="settings.cardBg"><span class="pp-color-label">Card Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.textColor)}" class="pp-color" data-key="settings.textColor"><span class="pp-color-label">Text Color</span></div>
      </div>`;
  },
};

// ── FAQ ──────────────────────────────────────────────────────────────

const faq: BlockDef = {
  name: 'FAQ',
  category: 'Content',
  thumbnail: `<svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="100" fill="#fff"/><rect x="20" y="10" width="240" height="12" rx="2" fill="#0f172a"/><rect x="20" y="30" width="240" height="20" rx="3" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/><text x="30" y="44" font-size="10" fill="#334155" font-family="system-ui">What is this?</text><text x="246" y="44" font-size="12" fill="#6366f1" font-family="system-ui">+</text><rect x="20" y="56" width="240" height="20" rx="3" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/><text x="30" y="70" font-size="10" fill="#334155" font-family="system-ui">How does it work?</text><text x="246" y="70" font-size="12" fill="#6366f1" font-family="system-ui">+</text><rect x="20" y="82" width="240" height="14" rx="3" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/></svg>`,
  defaultContent: () => ({
    heading: 'Frequently Asked Questions',
    q1: 'What is Website Builder?',
    a1: 'Website Builder is a visual editing tool that lets you create and manage websites directly from your browser, with changes pushed to GitHub Pages.',
    q2: 'Do I need to know how to code?',
    a2: 'Not at all! The visual editor lets you build pages by adding sections and editing text inline. But if you do know code, our code editor gives you full control.',
    q3: 'How much does it cost?',
    a3: 'Website Builder is free to use. You only need a GitHub account and a repository to host your site.',
    q4: 'Can I use my own domain?',
    a4: 'Yes! GitHub Pages supports custom domains. You can configure this in your repository settings.',
    count: 4,
  }),
  defaultSettings: (theme) => ({
    bg: theme.bg,
    textColor: theme.text,
    accentColor: theme.accent,
  }),
  render(block, theme, editing) {
    const count = Number(block.content.count) || 4;
    const items = Array.from({ length: count }, (_, i) => i + 1);
    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:760px;margin:0 auto">
    <h2${editAttr(block.id, 'heading', editing)} style="text-align:center;font-size:clamp(1.6rem,3vw,2.2rem);font-weight:800;color:${String(block.settings.textColor)};margin-bottom:48px;font-family:'${theme.headingFont}',sans-serif">${renderInlineMarkdown(block.content.heading)}</h2>
    ${items.map(i => `<details style="border-bottom:1px solid #e2e8f0;padding:16px 0;cursor:pointer" ${i === 1 ? 'open' : ''}>
      <summary${editAttr(block.id, `q${i}`, editing)} style="font-weight:600;color:${String(block.settings.textColor)};font-size:1.05rem;list-style:none;display:flex;align-items:center;justify-content:space-between">
        ${escapeHtml(block.content[`q${i}`])}
        <span style="color:${String(block.settings.accentColor)};font-size:1.4rem;flex-shrink:0;margin-left:16px;font-weight:300;transition:transform .2s">+</span>
      </summary>
      <p${editAttr(block.id, `a${i}`, editing)} style="color:${theme.textMuted};line-height:1.7;margin-top:12px;padding-right:32px">${escapeHtml(block.content[`a${i}`])}</p>
    </details>`).join('')}
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.textColor)}" class="pp-color" data-key="settings.textColor"><span class="pp-color-label">Text Color</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.accentColor)}" class="pp-color" data-key="settings.accentColor"><span class="pp-color-label">Accent</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Number of Questions</label>
        <input type="range" min="2" max="6" step="1" value="${Number(block.content.count)}" class="pp-range" data-key="content.count">
      </div>`;
  },
};

// ── Contact Form ─────────────────────────────────────────────────────

const formBlock: BlockDef = {
  name: 'Contact Form',
  category: 'Marketing',
  thumbnail: `<svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="100" fill="#f8fafc"/><rect x="40" y="10" width="200" height="12" rx="2" fill="#0f172a"/><rect x="60" y="28" width="160" height="14" rx="3" fill="white" stroke="#e2e8f0" stroke-width="1"/><rect x="60" y="48" width="160" height="14" rx="3" fill="white" stroke="#e2e8f0" stroke-width="1"/><rect x="60" y="68" width="160" height="20" rx="3" fill="white" stroke="#e2e8f0" stroke-width="1"/><rect x="100" y="92" width="80" height="6" rx="3" fill="#6366f1"/></svg>`,
  defaultContent: () => ({
    heading: 'Get in Touch',
    subtext: 'Have a question? We\'d love to hear from you. Send us a message and we\'ll get back to you within 24 hours.',
    buttonText: 'Send Message',
    fields: 'name,email,message',
    action: '#',
  }),
  defaultSettings: (theme) => ({
    bg: theme.bgAlt,
    cardBg: '#ffffff',
    textColor: theme.text,
  }),
  render(block, theme, editing) {
    const fields = String(block.content.fields).split(',').map(f => f.trim()).filter(Boolean);
    const fieldHtml = fields.map(f => {
      if (f === 'message') {
        return `<div style="margin-bottom:16px">
          <label style="display:block;font-size:.875rem;font-weight:500;color:${String(block.settings.textColor)};margin-bottom:6px">Message</label>
          <textarea rows="4" style="width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:${theme.radius}px;font-family:inherit;font-size:.95rem;resize:vertical;outline:none" placeholder="Your message…"></textarea>
        </div>`;
      }
      const label = f.charAt(0).toUpperCase() + f.slice(1);
      const type = f === 'email' ? 'email' : 'text';
      return `<div style="margin-bottom:16px">
        <label style="display:block;font-size:.875rem;font-weight:500;color:${String(block.settings.textColor)};margin-bottom:6px">${escapeHtml(label)}</label>
        <input type="${type}" style="width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:${theme.radius}px;font-family:inherit;font-size:.95rem;outline:none" placeholder="Your ${escapeHtml(f)}…">
      </div>`;
    }).join('');
    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:560px;margin:0 auto">
    <div style="text-align:center;margin-bottom:40px">
      <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(1.6rem,3vw,2.2rem);font-weight:800;color:${String(block.settings.textColor)};margin-bottom:12px;font-family:'${theme.headingFont}',sans-serif">${renderInlineMarkdown(block.content.heading)}</h2>
      <p${editAttr(block.id, 'subtext', editing)} style="color:${theme.textMuted};line-height:1.6">${renderInlineMarkdown(block.content.subtext)}</p>
    </div>
    <form action="${sanitizeUrl(escapeHtml(block.content.action as string))}" method="POST" style="background:${String(block.settings.cardBg)};border-radius:${theme.radius}px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.06)">
      ${fieldHtml}
      <button type="submit" style="${btnStyle(theme.accent, theme.radius)};width:100%;text-align:center">${escapeHtml(block.content.buttonText)}</button>
    </form>
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.cardBg)}" class="pp-color" data-key="settings.cardBg"><span class="pp-color-label">Form Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.textColor)}" class="pp-color" data-key="settings.textColor"><span class="pp-color-label">Text Color</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Button Text</label>
        <input type="text" value="${escapeHtml(block.content.buttonText)}" class="pp-input" data-key="content.buttonText">
        <label class="pp-label" style="margin-top:8px">Form Action URL</label>
        <input type="text" value="${escapeHtml(block.content.action)}" class="pp-input" data-key="content.action" placeholder="https://… or #">
        <label class="pp-label" style="margin-top:8px">Fields (comma-separated)</label>
        <input type="text" value="${escapeHtml(block.content.fields)}" class="pp-input" data-key="content.fields" placeholder="name,email,message">
      </div>`;
  },
};

// ── Pull Quote ────────────────────────────────────────────────────────

const quote: BlockDef = {
  name: 'Pull Quote',
  category: 'Content',
  thumbnail: `<svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="100" fill="#f8fafc"/><text x="20" y="56" font-size="48" fill="#6366f1" font-family="Georgia,serif" opacity=".3">"</text><rect x="60" y="28" width="180" height="10" rx="2" fill="#334155"/><rect x="70" y="44" width="160" height="8" rx="2" fill="#94a3b8"/><rect x="80" y="58" width="140" height="8" rx="2" fill="#94a3b8"/><rect x="90" y="76" width="100" height="6" rx="2" fill="#6366f1" opacity=".5"/></svg>`,
  defaultContent: () => ({
    quote: 'The customer experience is the next competitive battleground.',
    attribution: 'Jerry Gregoire, Former CIO Dell',
    showAttrib: true,
  }),
  defaultSettings: (theme) => ({
    bg: theme.bgAlt,
    accentColor: theme.accent,
    textColor: theme.text,
    align: 'center',
    size: 'medium',
  }),
  render(block, theme, editing) {
    const sizes: Record<string, string> = { small: '1.2rem', medium: '1.6rem', large: '2.2rem' };
    const fontSize = sizes[String(block.settings.size)] ?? '1.6rem';
    const align = String(block.settings.align);
    const justify = align === 'left' ? 'flex-start' : 'center';
    return `<section style="background:${String(block.settings.bg)};padding:60px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:800px;margin:0 auto;text-align:${align}">
    <div style="display:flex;justify-content:${justify};margin-bottom:8px">
      <span style="font-size:5rem;color:${String(block.settings.accentColor)};line-height:.7;font-family:Georgia,serif;opacity:.4">\u201C</span>
    </div>
    <blockquote${editAttr(block.id, 'quote', editing)} style="font-size:${fontSize};font-style:italic;color:${String(block.settings.textColor)};line-height:1.6;margin:0 0 24px;font-family:'${theme.headingFont}',sans-serif">${renderInlineMarkdown(block.content.quote)}</blockquote>
    ${block.content.showAttrib ? `<p${editAttr(block.id, 'attribution', editing)} style="color:${String(block.settings.accentColor)};font-size:.95rem;font-weight:600;letter-spacing:.02em">\u2014 ${escapeHtml(block.content.attribution)}</p>` : ''}
  </div>
</section>`;
  },
  settingsPanel(block) {
    return `
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.accentColor)}" class="pp-color" data-key="settings.accentColor"><span class="pp-color-label">Accent Color</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.textColor)}" class="pp-color" data-key="settings.textColor"><span class="pp-color-label">Text Color</span></div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Alignment</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${block.settings.align === 'left' ? 'active' : ''}" data-val="left" data-key="settings.align">Left</button>
          <button class="pp-seg-btn ${block.settings.align === 'center' ? 'active' : ''}" data-val="center" data-key="settings.align">Center</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Quote Size</label>
        <select class="pp-select" data-key="settings.size">
          <option value="small" ${block.settings.size === 'small' ? 'selected' : ''}>Small</option>
          <option value="medium" ${block.settings.size === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="large" ${block.settings.size === 'large' ? 'selected' : ''}>Large</option>
        </select>
      </div>
      <div class="pp-group">
        <label class="pp-toggle"><input type="checkbox" ${block.content.showAttrib ? 'checked' : ''} data-key="content.showAttrib"><span>Show attribution</span></label>
      </div>`;
  },
};

// ── Text Columns ──────────────────────────────────────────────────────

const columns: BlockDef = {
  name: 'Columns',
  category: 'Content',
  thumbnail: `<svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="100" fill="#fff"/><rect x="16" y="10" width="76" height="80" rx="4" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/><rect x="102" y="10" width="76" height="80" rx="4" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/><rect x="188" y="10" width="76" height="80" rx="4" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/><rect x="24" y="18" width="60" height="7" rx="2" fill="#334155"/><rect x="24" y="30" width="60" height="5" rx="2" fill="#94a3b8"/><rect x="24" y="40" width="54" height="5" rx="2" fill="#94a3b8"/><rect x="110" y="18" width="60" height="7" rx="2" fill="#334155"/><rect x="110" y="30" width="60" height="5" rx="2" fill="#94a3b8"/><rect x="110" y="40" width="54" height="5" rx="2" fill="#94a3b8"/><rect x="196" y="18" width="60" height="7" rx="2" fill="#334155"/><rect x="196" y="30" width="60" height="5" rx="2" fill="#94a3b8"/><rect x="196" y="40" width="54" height="5" rx="2" fill="#94a3b8"/></svg>`,
  defaultContent: () => ({
    heading: 'Our Approach',
    col1Title: 'Discover',
    col1Text: 'We start by deeply understanding your goals, your audience, and the challenges you face.',
    col2Title: 'Design',
    col2Text: 'Our team creates tailored solutions that balance functionality with beautiful aesthetics.',
    col3Title: 'Deliver',
    col3Text: 'We ship fast, iterate based on real feedback, and stand behind everything we build.',
    cols: '3',
  }),
  defaultSettings: (theme) => ({
    bg: theme.bg,
    headingColor: theme.primary,
    titleColor: theme.text,
    textColor: theme.textMuted,
  }),
  render(block, theme, editing) {
    const cols = String(block.content.cols) === '2' ? 2 : 3;
    const colItems = [1, 2, 3].slice(0, cols);
    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:1100px;margin:0 auto">
    ${block.content.heading ? `<h2${editAttr(block.id, 'heading', editing)} style="text-align:center;font-size:clamp(1.6rem,3vw,2.2rem);font-weight:800;color:${String(block.settings.headingColor)};margin-bottom:48px;font-family:'${theme.headingFont}',sans-serif">${renderInlineMarkdown(block.content.heading)}</h2>` : ''}
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:40px">
      ${colItems.map(i => `<div>
        <h3${editAttr(block.id, `col${i}Title`, editing)} style="font-size:1.2rem;font-weight:700;color:${String(block.settings.titleColor)};margin-bottom:12px;font-family:'${theme.headingFont}',sans-serif">${escapeHtml(block.content[`col${i}Title`])}</h3>
        <p${editAttr(block.id, `col${i}Text`, editing)} style="color:${String(block.settings.textColor)};line-height:1.7;font-size:.95rem">${renderInlineMarkdown(block.content[`col${i}Text`])}</p>
      </div>`).join('')}
    </div>
  </div>
</section>`;
  },
  settingsPanel(block) {
    const cols = String(block.content.cols);
    return `
      <div class="pp-group">
        <label class="pp-label">Columns</label>
        <div class="pp-seg">
          <button class="pp-seg-btn ${cols === '2' ? 'active' : ''}" data-val="2" data-key="content.cols">2 Columns</button>
          <button class="pp-seg-btn ${cols !== '2' ? 'active' : ''}" data-val="3" data-key="content.cols">3 Columns</button>
        </div>
      </div>
      <div class="pp-group">
        <label class="pp-label">Section Heading</label>
        <input type="text" value="${escapeHtml(block.content.heading)}" class="pp-input" data-key="content.heading" placeholder="Optional heading">
      </div>
      <div class="pp-group">
        <label class="pp-label">Column 1</label>
        <input type="text" value="${escapeHtml(block.content.col1Title)}" class="pp-input" data-key="content.col1Title" placeholder="Title">
        <textarea class="pp-input" data-key="content.col1Text" rows="3" style="margin-top:4px;resize:vertical">${escapeHtml(block.content.col1Text)}</textarea>
      </div>
      <div class="pp-group">
        <label class="pp-label">Column 2</label>
        <input type="text" value="${escapeHtml(block.content.col2Title)}" class="pp-input" data-key="content.col2Title" placeholder="Title">
        <textarea class="pp-input" data-key="content.col2Text" rows="3" style="margin-top:4px;resize:vertical">${escapeHtml(block.content.col2Text)}</textarea>
      </div>
      <div class="pp-group" data-show-when-cols="3" ${cols === '2' ? 'style="display:none"' : ''}>
        <label class="pp-label">Column 3</label>
        <input type="text" value="${escapeHtml(block.content.col3Title)}" class="pp-input" data-key="content.col3Title" placeholder="Title">
        <textarea class="pp-input" data-key="content.col3Text" rows="3" style="margin-top:4px;resize:vertical">${escapeHtml(block.content.col3Text)}</textarea>
      </div>
      <div class="pp-group">
        <div class="pp-row"><input type="color" value="${String(block.settings.bg)}" class="pp-color" data-key="settings.bg"><span class="pp-color-label">Background</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.headingColor)}" class="pp-color" data-key="settings.headingColor"><span class="pp-color-label">Heading Color</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.titleColor)}" class="pp-color" data-key="settings.titleColor"><span class="pp-color-label">Title Color</span></div>
        <div class="pp-row"><input type="color" value="${String(block.settings.textColor)}" class="pp-color" data-key="settings.textColor"><span class="pp-color-label">Text Color</span></div>
      </div>`;
  },
};

// ── Registry ──────────────────────────────────────────────────────────
export const BLOCK_DEFS: Record<string, BlockDef> = {
  nav, hero, features, split, stats, text: textBlock,
  testimonial, gallery, cta, footer,
  custom: customBlock,
  embed, image: imageBlock, video: videoBlock, divider,
  logos, pricing, faq, form: formBlock,
  quote, columns,
  ...LD_BLOCK_DEFS,
};

export function newBlock(type: string, theme: Theme): Block {
  const def = BLOCK_DEFS[type];
  if (!def) throw new Error(`Unknown block type: ${type}`);
  return {
    id: uid(),
    type,
    content: def.defaultContent(),
    settings: def.defaultSettings(theme),
  };
}

export function renderBlock(block: Block, theme: Theme, editing: boolean): string {
  return BLOCK_DEFS[block.type]?.render(block, theme, editing) ?? '';
}
