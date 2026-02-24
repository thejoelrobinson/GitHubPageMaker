import type { Block, BlockContent, BlockSettings, NavLink, Theme } from '../types';
import { escapeHtml, sanitizeUrl, uid } from '../utils';

// ── Block Definition Interface ─────────────────────────────────────────
export interface BlockDef {
  name: string;
  category: 'Structure' | 'Content' | 'Marketing';
  thumbnail: string;
  defaultContent(): BlockContent;
  defaultSettings(theme: Theme): BlockSettings;
  render(block: Block, theme: Theme, editing: boolean): string;
  settingsPanel(block: Block): string;
}

// ── Helpers ────────────────────────────────────────────────────────────
function editAttr(blockId: string, field: string, editing: boolean): string {
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
    bg: '#ffffff',
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
  defaultSettings: (_theme) => ({
    bg: '#0f172a',
    bgType: 'color',
    bgGradient: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
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
    return `<section style="${sectionBg(block.settings)}min-height:${minH};display:flex;align-items:center;justify-content:${justify};color:${String(block.settings.textColor)};position:relative;text-align:${textA};font-family:'${theme.bodyFont}',sans-serif">
  ${overlay}
  <div style="position:relative;z-index:1;max-width:860px;margin:0 auto;padding:80px 40px">
    <h1${editAttr(block.id, 'heading', editing)} style="font-size:clamp(2.2rem,5vw,3.8rem);font-weight:800;line-height:1.1;margin-bottom:20px;font-family:'${theme.headingFont}',sans-serif">${escapeHtml(block.content.heading)}</h1>
    <p${editAttr(block.id, 'subheading', editing)} style="font-size:clamp(1rem,2.5vw,1.3rem);margin-bottom:40px;opacity:.85;max-width:620px;${textA === 'center' ? 'margin-left:auto;margin-right:auto' : ''};line-height:1.6">${escapeHtml(block.content.subheading)}</p>
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
    sectionSub: 'Everything you need to build and grow online.',
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
    const cards = [1, 2, 3].slice(0, cols);
    const shadow = block.settings.cardStyle === 'shadow' ? 'box-shadow:0 4px 24px rgba(0,0,0,.07);' : '';
    const border = block.settings.cardStyle === 'border' ? `border:1px solid #e2e8f0;` : '';
    return `<section style="background:${String(block.settings.bg)};padding:80px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:1200px;margin:0 auto">
    <div style="text-align:center;margin-bottom:52px">
      <h2${editAttr(block.id, 'sectionTitle', editing)} style="font-size:clamp(1.7rem,3vw,2.5rem);font-weight:800;color:${String(block.settings.textColor)};font-family:'${theme.headingFont}',sans-serif;margin-bottom:12px">${escapeHtml(block.content.sectionTitle)}</h2>
      <p${editAttr(block.id, 'sectionSub', editing)} style="font-size:1.1rem;color:${theme.textMuted};max-width:520px;margin:0 auto;line-height:1.6">${escapeHtml(block.content.sectionSub)}</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:28px">
      ${cards.map(i => `<div style="background:${String(block.settings.cardBg)};border-radius:${theme.radius}px;padding:36px 28px;${shadow}${border}">
        <div${editAttr(block.id, `card${i}Icon`, editing)} style="font-size:2rem;margin-bottom:16px">${escapeHtml(block.content[`card${i}Icon`])}</div>
        <h3${editAttr(block.id, `card${i}Title`, editing)} style="font-size:1.2rem;font-weight:700;color:${String(block.settings.textColor)};margin-bottom:10px;font-family:'${theme.headingFont}',sans-serif">${escapeHtml(block.content[`card${i}Title`])}</h3>
        <p${editAttr(block.id, `card${i}Desc`, editing)} style="color:${theme.textMuted};line-height:1.7;font-size:.95rem">${escapeHtml(block.content[`card${i}Desc`])}</p>
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
    bg: '#ffffff',
    textColor: theme.text,
    side: 'right',
  }),
  render(block, theme, editing) {
    const imgLeft = block.settings.side === 'left';
    const imgEl = `<div style="flex:1;min-width:280px"><img src="${escapeHtml(block.content.imageUrl as string)}" alt="${escapeHtml(block.content.imageAlt)}" style="width:100%;height:420px;object-fit:cover;border-radius:${theme.radius}px;display:block"></div>`;
    const textEl = `<div style="flex:1;min-width:280px;display:flex;flex-direction:column;justify-content:center">
      <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(1.7rem,3vw,2.4rem);font-weight:800;color:${String(block.settings.textColor)};margin-bottom:20px;line-height:1.2;font-family:'${theme.headingFont}',sans-serif">${escapeHtml(block.content.heading)}</h2>
      <p${editAttr(block.id, 'body', editing)} style="color:${theme.textMuted};line-height:1.8;font-size:1.05rem;margin-bottom:32px">${escapeHtml(block.content.body)}</p>
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
    bg: '#ffffff',
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
    bg: '#ffffff',
    textColor: theme.text,
    align: 'left',
    maxWidth: '760',
  }),
  render(block, theme, editing) {
    const paras = String(block.content.body).split('\n\n').filter(Boolean);
    return `<section style="background:${String(block.settings.bg)};padding:72px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:${String(block.settings.maxWidth)}px;margin:0 auto;text-align:${String(block.settings.align)}">
    <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(1.6rem,3vw,2.2rem);font-weight:800;color:${String(block.settings.textColor)};margin-bottom:24px;font-family:'${theme.headingFont}',sans-serif">${escapeHtml(block.content.heading)}</h2>
    <div style="color:${theme.textMuted};line-height:1.8;font-size:1.05rem">
      ${paras.map((p, i) => i === 0 && editing
        ? `<p${editAttr(block.id, 'body', editing)} style="margin-bottom:16px">${escapeHtml(p)}</p>`
        : `<p style="margin-bottom:16px">${escapeHtml(p)}</p>`
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
    <blockquote${editAttr(block.id, 'quote', editing)} style="font-size:clamp(1.1rem,2.5vw,1.4rem);color:${String(block.settings.quoteColor)};line-height:1.7;margin-bottom:36px;font-style:italic">${escapeHtml(block.content.quote)}</blockquote>
    <div style="display:flex;align-items:center;justify-content:center;gap:16px">
      <img src="${escapeHtml(block.content.avatar as string)}" alt="${escapeHtml(block.content.author)}" style="width:52px;height:52px;border-radius:50%;object-fit:cover">
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
    bg: '#ffffff',
    textColor: theme.text,
    cols: 3,
  }),
  render(block, theme, editing) {
    const cols = Number(block.settings.cols) || 3;
    const count = Number(block.content.count) || 6;
    const imgs = Array.from({ length: count }, (_, i) => block.content[`img${i+1}`] as string);
    return `<section style="background:${String(block.settings.bg)};padding:72px 40px;font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:1200px;margin:0 auto">
    <h2${editAttr(block.id, 'heading', editing)} style="text-align:center;font-size:clamp(1.6rem,3vw,2.2rem);font-weight:800;color:${String(block.settings.textColor)};margin-bottom:48px;font-family:'${theme.headingFont}',sans-serif">${escapeHtml(block.content.heading)}</h2>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px">
      ${imgs.map(src => `<div style="border-radius:${theme.radius}px;overflow:hidden;aspect-ratio:4/3"><img src="${escapeHtml(src)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'"></div>`).join('')}
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
  defaultSettings: (_theme) => ({
    bg: '#0f172a',
    textColor: '#ffffff',
    bgType: 'color',
    bgGradient: 'linear-gradient(135deg, #0f172a 0%, #312e81 100%)',
  }),
  render(block, theme, editing) {
    return `<section style="${sectionBg(block.settings)}padding:80px 40px;text-align:center;color:${String(block.settings.textColor)};font-family:'${theme.bodyFont}',sans-serif">
  <div style="max-width:680px;margin:0 auto">
    <h2${editAttr(block.id, 'heading', editing)} style="font-size:clamp(1.8rem,4vw,3rem);font-weight:800;margin-bottom:16px;font-family:'${theme.headingFont}',sans-serif">${escapeHtml(block.content.heading)}</h2>
    <p${editAttr(block.id, 'subtext', editing)} style="font-size:1.15rem;opacity:.8;margin-bottom:40px;line-height:1.6">${escapeHtml(block.content.subtext)}</p>
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
  defaultSettings: (_theme) => ({
    bg: '#0f172a',
    textColor: '#94a3b8',
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
        <p${editAttr(block.id, 'tagline', editing)} style="color:${String(block.settings.textColor)};line-height:1.6;font-size:.95rem;max-width:240px">${escapeHtml(block.content.tagline)}</p>
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

// ── Registry ──────────────────────────────────────────────────────────
export const BLOCK_DEFS: Record<string, BlockDef> = {
  nav, hero, features, split, stats, text: textBlock,
  testimonial, gallery, cta, footer,
  custom: customBlock,
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
