import { visual, state, DEFAULT_THEME, markVisualDirty } from '../state';
import { BLOCK_DEFS } from './blocks';
import { coordinator } from './visual-coordinator';
import type { SelectedElement, BreadcrumbItem } from './canvas';
import { escapeHtml, debounce } from '../utils';
import type { NavLink, Theme } from '../types';

// ── Collapse state (persists for the session) ─────────────────────────

const _collapsedSections = new Set<string>();

const CHEVRON_SVG = `<svg class="pp-chevron" viewBox="0 0 16 16" fill="currentColor" width="11" height="11" aria-hidden="true"><path d="M4.427 6.177a.75.75 0 0 0-1.057 1.069l4.25 4.25a.75.75 0 0 0 1.06 0l4.25-4.25a.75.75 0 0 0-1.06-1.069L8 9.887 4.427 6.177Z"/></svg>`;

function initCollapseSections(panel: HTMLElement): void {
  panel.querySelectorAll<HTMLElement>('.pp-section').forEach(section => {
    const key = section.id;
    if (_collapsedSections.has(key)) section.classList.add('pp-collapsed');
    section.querySelector<HTMLElement>('.pp-collapsible')?.addEventListener('click', () => {
      section.classList.toggle('pp-collapsed');
      if (section.classList.contains('pp-collapsed')) _collapsedSections.add(key);
      else _collapsedSections.delete(key);
    });
  });
}

// ── Theme-link icons ──────────────────────────────────────────────────

const LINK_ICON = `<svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11" aria-hidden="true"><path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .75.75 0 0 1 1.06-1.06 2 2 0 0 0 2.83 0l2.5-2.5a2 2 0 0 0-2.83-2.83l-1.25 1.25a.75.75 0 0 1-1.06-1.06Zm-4.69 9.64a2 2 0 0 0 2.83 0l1.25-1.25a.75.75 0 0 1 1.06 1.06l-1.25 1.25a3.5 3.5 0 0 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .75.75 0 0 1-1.06 1.06 2 2 0 0 0-2.83 0l-2.5 2.5a2 2 0 0 0 0 2.83Z"/></svg>`;
const UNLINK_ICON = `<svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11" aria-hidden="true"><path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .75.75 0 0 1 1.06-1.06 2 2 0 0 0 2.83 0l2.5-2.5a2 2 0 0 0-2.83-2.83l-1.25 1.25a.75.75 0 0 1-1.06-1.06Zm-4.69 9.64a2 2 0 0 0 2.83 0l1.25-1.25a.75.75 0 0 1 1.06 1.06l-1.25 1.25a3.5 3.5 0 0 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .75.75 0 0 1-1.06 1.06 2 2 0 0 0-2.83 0l-2.5 2.5a2 2 0 0 0 0 2.83Z"/><line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

/**
 * Returns the set of setting keys for a block type that are derived from the
 * theme (i.e. change when the theme changes).  Computed by comparing
 * defaultSettings against a dummy theme with completely different values.
 */
function getThemeDerivedKeys(blockType: string): Set<string> {
  const def = BLOCK_DEFS[blockType];
  if (!def) return new Set();
  const d1 = def.defaultSettings(DEFAULT_THEME);
  const alt: typeof DEFAULT_THEME = {
    primary: '#ff0000', accent: '#00ff00', text: '#0000ff', textMuted: '#ffff00',
    bg: '#ff00ff', bgAlt: '#00ffff', headingFont: '__H__', bodyFont: '__B__', radius: '99',
  };
  const d2 = def.defaultSettings(alt);
  return new Set(Object.keys(d1).filter(k => d1[k] !== d2[k]));
}

/** Inject link/unlink toggle buttons next to theme-derived settings in the panel. */
function injectLinkIcons(panel: HTMLElement, block: import('../types').Block): void {
  const themed = getThemeDerivedKeys(block.type);
  if (!themed.size) return;

  panel.querySelectorAll<HTMLElement>('[data-key^="settings."]').forEach(input => {
    const settingKey = (input.getAttribute('data-key') ?? '').replace('settings.', '');
    if (!themed.has(settingKey)) return;

    const row = input.closest('.pp-row');
    if (!row || row.querySelector('.pp-link-btn')) return;

    const isLinked = !block.unlinked?.includes(settingKey);
    const btn = document.createElement('button');
    btn.className = `pp-link-btn${isLinked ? ' linked' : ' unlinked'}`;
    btn.dataset.linkKey = settingKey;
    btn.title = isLinked
      ? 'Linked to theme — Looks will update this color'
      : 'Unlinked from theme — Looks won\'t change this';
    btn.innerHTML = isLinked ? LINK_ICON : UNLINK_ICON;
    row.appendChild(btn);
  });
}


// ── Entrance Animation panel section (appended to every block's settings) ──

const ANIM_OPTIONS: [string, string][] = [
  ['none',          'None'],
  ['fade-up',       'Fade Up \u2191'],
  ['fade-down',     'Fade Down \u2193'],
  ['fade-in-left',  'Slide In \u2190 Left'],
  ['fade-in-right', 'Slide In Right \u2192'],
  ['fade-in',       'Fade In'],
  ['zoom-in',       'Zoom In'],
  ['zoom-out',      'Zoom Out'],
  ['flip-up',       'Flip Up'],
  ['slide-up',      'Slide Up'],
  ['blur-in',       'Blur In'],
];

const EASING_OPTIONS: [string, string][] = [
  ['ease',                            'Ease'],
  ['ease-out',                        'Ease Out'],
  ['ease-in-out',                     'Ease In-Out'],
  ['cubic-bezier(0.34,1.56,0.64,1)', 'Spring'],
  ['cubic-bezier(0.16,1,0.3,1)',     'Power'],
];

function animationSection(block: import('../types').Block): string {
  const animIn = String(block.settings.animIn       ?? 'none');
  const dur    = Number(block.settings.animDuration ?? 600);
  const delay  = Number(block.settings.animDelay    ?? 0);
  const ease   = String(block.settings.animEasing   ?? 'ease');

  const animOpts = ANIM_OPTIONS.map(([v, l]) =>
    `<option value="${v}"${animIn === v ? ' selected' : ''}>${l}</option>`,
  ).join('');
  const easeOpts = EASING_OPTIONS.map(([v, l]) =>
    `<option value="${v}"${ease === v ? ' selected' : ''}>${l}</option>`,
  ).join('');

  const PLAY_SVG = `<svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11" aria-hidden="true"><path d="M3 3.732a1.125 1.125 0 0 1 1.75-.936l7.5 4.267a1.125 1.125 0 0 1 0 1.874l-7.5 4.267A1.125 1.125 0 0 1 3 12.268V3.732Z"/></svg>`;

  return `<div class="pp-group">
    <label class="pp-label">Entrance Animation</label>
    <div class="pp-row">
      <select class="pp-select" data-key="settings.animIn" style="flex:1">${animOpts}</select>
      <button class="pp-icon-btn" id="pp-anim-replay" title="Preview animation"
        style="flex-shrink:0${animIn === 'none' ? ';display:none' : ''}">${PLAY_SVG}</button>
    </div>
    <div id="pp-anim-timing"${animIn === 'none' ? ' style="display:none"' : ''}>
      <div class="pp-row" style="margin-top:6px;align-items:center">
        <span style="font-size:11px;color:var(--text-secondary);width:52px;flex-shrink:0">Duration</span>
        <input type="range" class="pp-range" data-key="settings.animDuration"
          min="200" max="1500" step="100" value="${dur}" style="flex:1">
        <span id="pp-anim-dur-val" style="font-size:11px;color:var(--text-dim);width:38px;text-align:right">${dur}ms</span>
      </div>
      <div class="pp-row" style="margin-top:4px;align-items:center">
        <span style="font-size:11px;color:var(--text-secondary);width:52px;flex-shrink:0">Delay</span>
        <input type="range" class="pp-range" data-key="settings.animDelay"
          min="0" max="1000" step="50" value="${delay}" style="flex:1">
        <span id="pp-anim-delay-val" style="font-size:11px;color:var(--text-dim);width:38px;text-align:right">${delay}ms</span>
      </div>
      <div class="pp-row" style="margin-top:4px">
        <select class="pp-select" data-key="settings.animEasing" style="flex:1">${easeOpts}</select>
      </div>
    </div>
  </div>`;
}

// ── Properties Panel ──────────────────────────────────────────────────

// ── Properties panel tab state ────────────────────────────────────────
let _propsTab: 'block' | 'design' = 'design';

export function renderProperties(): void {
  const panel = document.getElementById('vis-props') as HTMLElement;
  if (!panel) return;

  // Raw HTML page (no blocks) → show the DOM inspector (no tabs)
  const activePage = visual.activePage;
  if (activePage && activePage.blocks.length === 0) {
    const dmSel = (coordinator.getDmSelected?.() ?? null) as SelectedElement | null;
    panel.innerHTML = dmSel ? renderDmInspectorPanel(dmSel) : renderDmEmptyPanel();
    bindDmPanelEvents(panel);
    return;
  }

  // Auto-manage tab: switch to Block when a block is selected, back to Design when nothing is
  const block = visual.selectedBlockId && visual.activePage
    ? visual.activePage.blocks.find(b => b.id === visual.selectedBlockId)
    : null;
  if (block) _propsTab = 'block';
  else if (_propsTab === 'block') _propsTab = 'design'; // no block selected — return to Design

  // Tab bar
  const tabBar = `<div class="pp-tabs">
    <button class="pp-tab${_propsTab === 'block'  ? ' active' : ''}" data-props-tab="block">Block</button>
    <button class="pp-tab${_propsTab === 'design' ? ' active' : ''}" data-props-tab="design">Design</button>
  </div>`;

  let content = '';

  if (_propsTab === 'design') {
    content = renderThemePanel();
  } else {
    // Block tab
    if (block) {
      const def = BLOCK_DEFS[block.type];
      content = `<div class="pp-section" id="vis-block-panel">
        <div class="pp-block-header">
          <span class="pp-block-type">${def?.name ?? block.type}</span>
        </div>
        <div class="pp-section-body">
          ${def?.settingsPanel(block) ?? ''}
          ${block.type === 'nav' ? renderNavLinksEditor(block.id, block.content.links as NavLink[]) : ''}
          ${animationSection(block)}
        </div>
      </div>`;
    } else {
      content = `<div style="padding:40px 14px;text-align:center;color:var(--text-dim);font-size:12px;line-height:1.8">
        Click any section on the canvas to edit its settings here.
      </div>`;
    }
  }

  panel.innerHTML = tabBar + content;

  // Bind tab-switch clicks
  panel.querySelectorAll<HTMLElement>('[data-props-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _propsTab = btn.dataset.propsTab as 'block' | 'design';
      renderProperties();
    });
  });

  if (_propsTab === 'design') {
    bindThemePanelEvents(panel);
    initCollapseSections(panel);
  } else {
    const blockPanelEl = panel.querySelector<HTMLElement>('#vis-block-panel');
    if (blockPanelEl && block) {
      injectLinkIcons(blockPanelEl, block);
      bindPanelEvents(blockPanelEl);
    }
  }
}

// ── Nav links editor ──────────────────────────────────────────────────

function renderNavLinksEditor(blockId: string, links: NavLink[]): string {
  return `<div class="pp-group" id="nav-links-editor">
    <label class="pp-label">Navigation Links</label>
    ${links.map((l, i) => `
      <div class="nav-link-row">
        <div style="flex:1">
          <input type="text" value="${escapeHtml(l.text)}" class="pp-input" placeholder="Label" data-navlink="${blockId}" data-idx="${i}" data-field="text" style="margin-bottom:4px">
          <input type="text" value="${escapeHtml(l.href)}" class="pp-input" placeholder="URL" data-navlink="${blockId}" data-idx="${i}" data-field="href">
        </div>
        <button class="pp-icon-btn" onclick="window._removeNavLink('${blockId}',${i})" title="Remove">
          <svg viewBox="0 0 16 16" fill="currentColor" width="12"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
        </button>
      </div>
    `).join('')}
    <button class="pp-add-link-btn" onclick="window._addNavLink('${blockId}')">+ Add Link</button>
  </div>`;
}

// ── Theme Panel ───────────────────────────────────────────────────────

const FONTS = [
  'Inter', 'Plus Jakarta Sans', 'Poppins', 'Montserrat',
  'Lato', 'Open Sans', 'Merriweather', 'Playfair Display', 'Space Grotesk', 'Raleway',
];

function fontOptions(selected: string): string {
  return FONTS.map(f => `<option value="${f}" ${f === selected ? 'selected' : ''}>${f}</option>`).join('');
}

/** Render a link/unlink toggle button for a theme-level field. */
function themeLinkBtn(field: string): string {
  const linked = !_unlinkedThemeFields.has(field);
  return `<button class="pp-link-btn ${linked ? 'linked' : 'unlinked'}" data-theme-link="${field}"
    title="${linked ? 'Linked — Looks will update this' : 'Unlinked — Looks won\'t change this'}">
    ${linked ? LINK_ICON : UNLINK_ICON}
  </button>`;
}

function renderThemePanel(): string {
  const t = visual.theme;
  return `
    <div class="pp-section" id="pp-sect-theme">
      <div class="pp-block-header pp-collapsible">
        <span class="pp-block-type">Site Design</span>
        ${CHEVRON_SVG}
      </div>
      <div class="pp-section-body">
        <div class="pp-group">
          <label class="pp-label">Site Name</label>
          <input type="text" value="${escapeHtml(visual.siteName)}" class="pp-input" id="pp-site-name">
        </div>
        <div class="pp-group">
          <label class="pp-label">Colors</label>
          <div class="pp-row"><input type="color" value="${t.primary}" class="pp-color" id="tc-primary"><span class="pp-color-label">Primary</span>${themeLinkBtn('primary')}</div>
          <div class="pp-row"><input type="color" value="${t.accent}" class="pp-color" id="tc-accent"><span class="pp-color-label">Accent / Buttons</span>${themeLinkBtn('accent')}</div>
          <div class="pp-row"><input type="color" value="${t.text}" class="pp-color" id="tc-text"><span class="pp-color-label">Body Text</span>${themeLinkBtn('text')}</div>
          <div class="pp-row"><input type="color" value="${t.bg}" class="pp-color" id="tc-bg"><span class="pp-color-label">Page Background</span>${themeLinkBtn('bg')}</div>
          <div class="pp-row"><input type="color" value="${t.bgAlt}" class="pp-color" id="tc-bgAlt"><span class="pp-color-label">Alt Background</span>${themeLinkBtn('bgAlt')}</div>
        </div>
        <div class="pp-group">
          <label class="pp-label">Typography</label>
          <div class="pp-row" style="align-items:center;margin-bottom:4px">
            <span style="font-size:11px;color:var(--text-secondary);flex:1">Heading Font</span>${themeLinkBtn('headingFont')}
          </div>
          <select class="pp-select" id="tf-heading">${fontOptions(t.headingFont)}</select>
          <div class="pp-row" style="align-items:center;margin-top:8px;margin-bottom:4px">
            <span style="font-size:11px;color:var(--text-secondary);flex:1">Body Font</span>${themeLinkBtn('bodyFont')}
          </div>
          <select class="pp-select" id="tf-body">${fontOptions(t.bodyFont)}</select>
        </div>
        <div class="pp-group">
          <div class="pp-row" style="align-items:center;margin-bottom:4px">
            <label class="pp-label" style="margin:0;flex:1">Border Radius</label>${themeLinkBtn('radius')}
          </div>
          <input type="range" min="0" max="20" step="1" value="${t.radius}" class="pp-range" id="t-radius">
          <span id="t-radius-val" style="font-size:11px;color:var(--text-secondary)">${t.radius}px</span>
        </div>
      </div>
    </div>
  `;
}

// ── Event binding ─────────────────────────────────────────────────────

function bindPanelEvents(panel: HTMLElement): void {
  const blockId = visual.selectedBlockId;
  if (!blockId) return;

  // Capture block type at bind time (safe — type never changes mid-session)
  const blockType = visual.activePage?.blocks.find(b => b.id === blockId)?.type ?? '';
  const themedKeys = getThemeDerivedKeys(blockType);

  // Link / unlink toggle buttons
  panel.querySelectorAll<HTMLButtonElement>('.pp-link-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      // Fresh lookup — avoids stale closure if selection changed
      const block = visual.activePage?.blocks.find(b => b.id === blockId);
      if (!block) return;
      const key = btn.dataset.linkKey!;
      if (!block.unlinked) block.unlinked = [];
      const idx = block.unlinked.indexOf(key);
      if (idx >= 0) {
        block.unlinked.splice(idx, 1);
        btn.className = 'pp-link-btn linked';
        btn.title = 'Linked to theme — Looks will update this color';
        btn.innerHTML = LINK_ICON;
      } else {
        block.unlinked.push(key);
        btn.className = 'pp-link-btn unlinked';
        btn.title = 'Unlinked from theme — Looks won\'t change this';
        btn.innerHTML = UNLINK_ICON;
      }
      markVisualDirty();
    });
  });

  // Auto-unlink helper — applies to any theme-derived input (color, text, gradient, etc.)
  function autoUnlinkInput(input: HTMLInputElement | HTMLTextAreaElement): void {
    const key = (input.dataset.key ?? '').replace('settings.', '');
    if (!themedKeys.has(key)) return;
    const block = visual.activePage?.blocks.find(b => b.id === blockId); // fresh lookup
    if (!block) return;
    if (!block.unlinked) block.unlinked = [];
    if (!block.unlinked.includes(key)) {
      block.unlinked.push(key);
      markVisualDirty();
    }
    const btn = input.closest('.pp-row')?.querySelector<HTMLElement>('.pp-link-btn');
    if (btn) {
      btn.className = 'pp-link-btn unlinked';
      btn.title = 'Unlinked from theme — Looks won\'t change this';
      btn.innerHTML = UNLINK_ICON;
    }
  }

  // Color pickers
  panel.querySelectorAll<HTMLInputElement>('.pp-color[data-key]').forEach(input => {
    input.addEventListener('input', () => {
      coordinator.updateBlockValue?.(blockId, input.dataset.key!, input.value);
      autoUnlinkInput(input);
    });
  });

  // Selects
  panel.querySelectorAll<HTMLSelectElement>('.pp-select[data-key]').forEach(sel => {
    sel.addEventListener('change', () => {
      const val = isNaN(Number(sel.value)) ? sel.value : Number(sel.value);
      coordinator.updateBlockValue?.(blockId, sel.dataset.key!, val);
    });
  });

  // Text inputs — also auto-unlink if the setting is theme-derived (e.g. bgGradient)
  panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    '.pp-input[data-key]:not(.pp-html-editor)',
  ).forEach(input => {
    input.addEventListener('change', () => {
      coordinator.updateBlockValue?.(blockId, input.dataset.key!, input.value);
      autoUnlinkInput(input);
    });
  });

  // HTML editor textarea — debounced live preview as user types
  panel.querySelectorAll<HTMLTextAreaElement>('.pp-html-editor[data-key]').forEach(ta => {
    ta.addEventListener('change', () => {
      coordinator.updateBlockValue?.(blockId, ta.dataset.key!, ta.value);
    });
    let _t: ReturnType<typeof setTimeout> | null = null;
    ta.addEventListener('input', () => {
      if (_t) clearTimeout(_t);
      _t = setTimeout(() => { _t = null; coordinator.updateBlockValue?.(blockId, ta.dataset.key!, ta.value); }, 400);
    });
  });

  // Checkboxes (toggles)
  panel.querySelectorAll<HTMLInputElement>('.pp-toggle input[data-key]').forEach(cb => {
    cb.addEventListener('change', () => {
      coordinator.updateBlockValue?.(blockId, cb.dataset.key!, cb.checked);
    });
  });

  // Segmented buttons
  panel.querySelectorAll<HTMLButtonElement>('.pp-seg-btn[data-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key!;
      const raw = btn.dataset.val!;
      const val = isNaN(Number(raw)) ? raw : Number(raw);
      coordinator.updateBlockValue?.(blockId, key, val);
      // Update active state
      btn.closest('.pp-seg')?.querySelectorAll('.pp-seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Range inputs
  panel.querySelectorAll<HTMLInputElement>('.pp-range[data-key]').forEach(range => {
    range.addEventListener('input', () => {
      coordinator.updateBlockValue?.(blockId, range.dataset.key!, Number(range.value));
    });
  });

  // Nav link inputs (no data-key, handled separately)
  panel.querySelectorAll<HTMLInputElement>('[data-navlink]').forEach(input => {
    input.addEventListener('change', () => {
      const bid = input.dataset.navlink!;
      const idx = Number(input.dataset.idx);
      const field = input.dataset.field!;
      const block = visual.activePage?.blocks.find(b => b.id === bid);
      if (!block) return;
      const links = block.content.links as NavLink[];
      if (links[idx]) {
        links[idx][field as keyof NavLink] = input.value;
        visual.dirty = true;
        if (visual.activePage) visual.activePage.dirty = true;
        coordinator.updateVisualSaveBtn?.();
        coordinator.rerenderBlock?.(bid);
      }
    });
  });

  // Hero BG type show/hide
  const heroBgBtns = panel.querySelectorAll<HTMLButtonElement>('#hero-bg-type .pp-seg-btn');
  heroBgBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      (panel.querySelector('#hero-bg-color') as HTMLElement | null)?.style.setProperty('display', val === 'color' ? 'flex' : 'none');
      (panel.querySelector('#hero-bg-gradient') as HTMLElement | null)?.style.setProperty('display', val === 'gradient' ? 'block' : 'none');
      (panel.querySelector('#hero-bg-image') as HTMLElement | null)?.style.setProperty('display', val === 'image' ? 'block' : 'none');
    });
  });

  // Entrance animation: toggle timing controls + auto-preview + replay button
  const animInSel   = panel.querySelector<HTMLSelectElement>('[data-key="settings.animIn"]');
  const animTiming  = panel.querySelector<HTMLElement>('#pp-anim-timing');
  const animReplay  = panel.querySelector<HTMLButtonElement>('#pp-anim-replay');

  function getAnimSettings() {
    const block = visual.activePage?.blocks.find(b => b.id === blockId);
    return {
      animIn:   String(block?.settings.animIn       ?? 'none'),
      duration: Number(block?.settings.animDuration ?? 600),
      delay:    Number(block?.settings.animDelay    ?? 0),
      ease:     String(block?.settings.animEasing   ?? 'ease'),
    };
  }

  function triggerPreview() {
    const s = getAnimSettings();
    if (s.animIn !== 'none') coordinator.previewBlockAnimation?.(blockId!, s.animIn, s.duration, s.delay, s.ease);
  }

  if (animInSel && animTiming) {
    animInSel.addEventListener('change', () => {
      const isNone = animInSel.value === 'none';
      animTiming.style.display = isNone ? 'none' : '';
      if (animReplay) animReplay.style.display = isNone ? 'none' : '';
      // Auto-preview: fire after the updateBlockValue has applied the new value
      if (!isNone) requestAnimationFrame(triggerPreview);
    });
  }

  animReplay?.addEventListener('click', triggerPreview);

  panel.querySelector<HTMLInputElement>('[data-key="settings.animDuration"]')
    ?.addEventListener('input', e => {
      const lbl = panel.querySelector<HTMLElement>('#pp-anim-dur-val');
      if (lbl) lbl.textContent = (e.target as HTMLInputElement).value + 'ms';
    });
  panel.querySelector<HTMLInputElement>('[data-key="settings.animDelay"]')
    ?.addEventListener('input', e => {
      const lbl = panel.querySelector<HTMLElement>('#pp-anim-delay-val');
      if (lbl) lbl.textContent = (e.target as HTMLInputElement).value + 'ms';
    });
}

type ThemeKey = keyof Theme;

function bindThemePanelEvents(panel: HTMLElement): void {
  // ── Link / unlink toggles for theme-level fields ───────────────────
  panel.querySelectorAll<HTMLButtonElement>('[data-theme-link]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const field = btn.dataset.themeLink!;
      if (_unlinkedThemeFields.has(field)) {
        _unlinkedThemeFields.delete(field);
        btn.className = 'pp-link-btn linked';
        btn.title = 'Linked — Looks will update this';
        btn.innerHTML = LINK_ICON;
      } else {
        _unlinkedThemeFields.add(field);
        btn.className = 'pp-link-btn unlinked';
        btn.title = 'Unlinked — Looks won\'t change this';
        btn.innerHTML = UNLINK_ICON;
      }
    });
  });

  // Helper: auto-unlink a theme field when the user manually edits it
  function autoUnlinkTheme(field: string): void {
    if (_unlinkedThemeFields.has(field)) return; // already unlinked
    _unlinkedThemeFields.add(field);
    const btn = panel.querySelector<HTMLElement>(`[data-theme-link="${field}"]`);
    if (btn) {
      btn.className = 'pp-link-btn unlinked';
      btn.title = 'Unlinked — Looks won\'t change this';
      btn.innerHTML = UNLINK_ICON;
    }
  }

  // ── Color pickers ─────────────────────────────────────────────────
  const themeColorMap: Record<string, ThemeKey> = {
    'tc-primary': 'primary',
    'tc-accent':  'accent',
    'tc-text':    'text',
    'tc-bg':      'bg',
    'tc-bgAlt':   'bgAlt',
  };

  Object.entries(themeColorMap).forEach(([id, key]) => {
    panel.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('input', function () {
      (visual.theme as unknown as Record<string, string>)[key as string] = this.value;
      autoUnlinkTheme(key as string);
      onThemeChange();
    });
  });

  panel.querySelector<HTMLInputElement>('#pp-site-name')?.addEventListener('change', function () {
    visual.siteName = this.value;
    visual.dirty = true;
    coordinator.updateVisualSaveBtn?.();
  });

  // ── Font selects ──────────────────────────────────────────────────
  panel.querySelector<HTMLSelectElement>('#tf-heading')?.addEventListener('change', function () {
    visual.theme.headingFont = this.value;
    autoUnlinkTheme('headingFont');
    onThemeChange();
  });

  panel.querySelector<HTMLSelectElement>('#tf-body')?.addEventListener('change', function () {
    visual.theme.bodyFont = this.value;
    autoUnlinkTheme('bodyFont');
    onThemeChange();
  });

  // ── Radius range ──────────────────────────────────────────────────
  const radiusRange = panel.querySelector<HTMLInputElement>('#t-radius');
  const radiusVal   = panel.querySelector<HTMLElement>('#t-radius-val');
  radiusRange?.addEventListener('input', function () {
    visual.theme.radius = this.value;
    if (radiusVal) radiusVal.textContent = `${this.value}px`;
    autoUnlinkTheme('radius');
    onThemeChange();
  });
}

// Debounced: dragging a color slider fires this continuously;
// wait 150 ms after the last change before re-rendering the iframe.
const debouncedThemeRender = debounce(() => {
  // Sync the code tab BEFORE re-rendering so renderBlockPage's hasManualEdits
  // check sees the updated (new-theme) HTML, not the old one.
  coordinator.syncActivePageCodeTab?.();
  // Push new theme values into every block's linked settings so render() picks them up.
  propagateThemeColors(visual.theme);
  coordinator.applyThemeToCanvas?.();
  coordinator.renderCanvas?.();
  coordinator.updateVisualSaveBtn?.();
}, 150);

function onThemeChange(): void {
  visual.dirty = true;
  // Mark every page dirty so they all get regenerated on the next publish
  // and so enterCodeMode() knows the active page's HTML has changed.
  visual.pages.forEach(p => { p.dirty = true; });
  debouncedThemeRender();
}

// ── Design-mode inspector helpers ─────────────────────────────────────

function cssColorToHex(cssColor: string | undefined): string {
  if (!cssColor) return '#000000';
  if (cssColor.startsWith('#')) return cssColor;
  const m = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    return '#' +
      parseInt(m[1]).toString(16).padStart(2, '0') +
      parseInt(m[2]).toString(16).padStart(2, '0') +
      parseInt(m[3]).toString(16).padStart(2, '0');
  }
  return '#000000';
}

function parsePxValue(val: string | undefined): string {
  if (!val) return '';
  const n = parseFloat(val);
  return isNaN(n) ? '' : String(Math.round(n));
}

function parseFloatValue(val: string | undefined): string {
  if (!val || val === 'normal') return '';
  const n = parseFloat(val);
  return isNaN(n) ? '' : String(n);
}

// ── CSS Rules State (persists across panel re-renders) ────────────────
interface CssPropEntry { prop: string; value: string; }
interface CssRuleEntry { selector: string; props: CssPropEntry[]; }

let dmCssContent     = '';
let dmCssPath: string | null = null;
/** Page id that dmCssContent was loaded from when dmCssPath is null (inline CSS). */
let dmCssPageId: string | null = null;
let dmCssParsed: CssRuleEntry[] = [];
let dmCssActiveRule: number | null = null;
let dmCssTimer: ReturnType<typeof setTimeout> | null = null;
/** Set to true once initSidebarCssPanel has finished its first load attempt. */
let dmCssInitialized = false;
/** User-captured Looks (e.g. "Original" saved when converting imported CSS). Session-only. */
let _customLooks: Look[] = [];
/** owner/repo these were captured for — clears _customLooks on repo switch. */
let _customLooksRepo = '';
/**
 * Theme-level fields explicitly unlinked from the Look system.
 * When a field is in this set, applying a Look will NOT update that visual.theme field.
 */
let _unlinkedThemeFields = new Set<string>();

// ── CSS Variables state ───────────────────────────────────────────────
interface CssVariable  { name: string; value: string; }
interface CssVarsState { light: CssVariable[]; dark: CssVariable[]; hasDarkMode: boolean; darkSelector: string; }
type CssVarType = 'color' | 'font' | 'size' | 'gradient' | 'shadow' | 'transition' | 'other';
let dmCssVars: CssVarsState = { light: [], dark: [], hasDarkMode: false, darkSelector: '' };
let dmCssPanelView: 'variables' | 'looks' | 'rules' = 'rules';
let dmCssVarsDark = false;
let dmVarTimer: ReturnType<typeof setTimeout> | null = null;

function parseCss(css: string): CssRuleEntry[] {
  const rules: CssRuleEntry[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  while (i < clean.length) {
    while (i < clean.length && clean[i] <= ' ') i++;
    if (i >= clean.length) break;
    const braceIdx = clean.indexOf('{', i);
    if (braceIdx === -1) break;
    const selector = clean.slice(i, braceIdx).trim();
    let depth = 1; let j = braceIdx + 1;
    while (j < clean.length && depth > 0) {
      if (clean[j] === '{') depth++; else if (clean[j] === '}') depth--; j++;
    }
    if (!selector.startsWith('@') && depth === 0) {
      const body = clean.slice(braceIdx + 1, j - 1);
      if (!body.includes('{')) {
        const props: CssPropEntry[] = [];
        body.split(';').forEach(decl => {
          const ci = decl.indexOf(':');
          if (ci === -1) return;
          const p = decl.slice(0, ci).trim(); const v = decl.slice(ci + 1).trim();
          if (p && v && /^[a-z][a-z0-9-]*$/.test(p)) props.push({ prop: p, value: v });
        });
        if (props.length) rules.push({ selector, props });
      }
    }
    i = j;
  }
  return rules;
}

function valueToHex(value: string): string | null {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6,8}$/.test(v)) return v.slice(0, 7);
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  return null;
}

function updateCssValue(css: string, selector: string, prop: string, oldVal: string, newVal: string): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    // Use [\s\S]*? (matches newlines) so multi-line rule bodies are handled correctly
    return css.replace(new RegExp(`(${esc(selector)}\\s*\\{[\\s\\S]*?${esc(prop)}\\s*:\\s*)${esc(oldVal)}`), `$1${newVal}`);
  } catch { return css; }
}

// ── CSS Variable parser ───────────────────────────────────────────────

function parseCssVariables(css: string): CssVarsState {
  const result: CssVarsState = { light: [], dark: [], hasDarkMode: false, darkSelector: '' };
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');

  function extractVarsFromBlock(block: string): CssVariable[] {
    const vars: CssVariable[] = [];
    block.split(';').forEach(decl => {
      const ci = decl.indexOf(':');
      if (ci === -1) return;
      const name  = decl.slice(0, ci).trim();
      // Preserve the value as-is but collapse internal whitespace runs for matching stability
      const value = decl.slice(ci + 1).trim().replace(/\s+/g, ' ');
      if (name.startsWith('--') && value) vars.push({ name, value });
    });
    return vars;
  }

  function extractBracedContent(src: string, fromIdx: number): string | null {
    const bi = src.indexOf('{', fromIdx);
    if (bi === -1) return null;
    let depth = 1; let i = bi + 1;
    while (i < src.length && depth > 0) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; }
    return src.slice(bi + 1, i - 1);
  }

  // Find top-level :root {} blocks (depth == 0 when encountered)
  let pos = 0;
  while (pos < clean.length) {
    const ri = clean.indexOf(':root', pos);
    if (ri === -1) break;
    // Check if this :root is top-level (not inside @media)
    let depth = 0;
    for (let k = 0; k < ri; k++) { if (clean[k] === '{') depth++; else if (clean[k] === '}') depth--; }
    if (depth === 0) {
      const block = extractBracedContent(clean, ri);
      if (block && !block.includes('{')) result.light.push(...extractVarsFromBlock(block));
    }
    pos = ri + 5;
  }

  // Find dark mode blocks
  const darkPatterns = [
    { search: 'prefers-color-scheme: dark', sel: 'prefers-color-scheme' },
    { search: 'prefers-color-scheme:dark',  sel: 'prefers-color-scheme' },
    { search: '[data-theme="dark"]',        sel: '[data-theme]' },
    { search: "[data-theme='dark']",        sel: '[data-theme]' },
  ];
  for (const { search, sel } of darkPatterns) {
    const di = clean.indexOf(search);
    if (di === -1) continue;
    const outerBlock = extractBracedContent(clean, di);
    if (!outerBlock) continue;
    const innerRi = outerBlock.indexOf(':root');
    const body = innerRi !== -1 ? extractBracedContent(outerBlock, innerRi) ?? outerBlock : outerBlock;
    const vars = extractVarsFromBlock(body);
    if (vars.length) {
      result.dark = vars; result.hasDarkMode = true; result.darkSelector = sel; break;
    }
  }
  return result;
}

function guessVarType(name: string, value: string): CssVarType {
  const n = name.toLowerCase(); const v = value.toLowerCase();
  if (/color|bg|background|text|fill|border|accent|primary|secondary|surface|foreground|muted/.test(n)) return 'color';
  if (/font|family|typeface/.test(n)) return 'font';
  if (/gradient/.test(n) || v.includes('gradient')) return 'gradient';
  if (/shadow/.test(n) || v.includes('shadow')) return 'shadow';
  if (/transition|duration|timing|delay|ease/.test(n)) return 'transition';
  if (/size|space|gap|padding|margin|radius|width|height/.test(n) || /^-?[\d.]+\s*(px|rem|em|%|vw|vh|fr)/.test(v)) return 'size';
  if (valueToHex(value)) return 'color';
  return 'other';
}

// ── Human-readable helpers ─────────────────────────────────────────────

/** Convert --color-primary-dark → "Color Primary Dark" */
function humanizeVarName(name: string): string {
  return name.replace(/^--/, '').replace(/-/g, ' ')
    .replace(/\b(bg|bgr)\b/gi, 'Background')
    .replace(/\b(clr)\b/gi, 'Color')
    .replace(/\b(fnt|typ)\b/gi, 'Font')
    .replace(/\b(md)\b/gi, 'Medium')
    .replace(/\b(lg)\b/gi, 'Large')
    .replace(/\b(sm)\b/gi, 'Small')
    .replace(/\b(xl)\b/gi, 'XL')
    .replace(/\b(xs)\b/gi, 'XS')
    .replace(/\b(cta)\b/gi, 'CTA')
    .replace(/\b\w/g, c => c.toUpperCase());
}

type SemanticGroup = 'brand' | 'text' | 'backgrounds' | 'typography' | 'spacing' | 'effects' | 'other';

const SEMANTIC_META: Record<SemanticGroup, { icon: string; label: string; desc: string; addType: CssVarType }> = {
  brand:       { icon: '✦', label: 'Brand Colors',    desc: 'Your main identity colors — used on buttons, links, and key highlights',  addType: 'color'      },
  text:        { icon: 'T', label: 'Text Colors',      desc: 'Colors for headings, body copy, and labels throughout the page',          addType: 'color'      },
  backgrounds: { icon: '▭', label: 'Backgrounds',      desc: 'Page background, card fills, and section colors',                        addType: 'color'      },
  typography:  { icon: 'A', label: 'Fonts',            desc: 'Typefaces used for headings and body text across the site',               addType: 'font'       },
  spacing:     { icon: '↔', label: 'Spacing & Sizes',  desc: 'Gaps, padding, corner radius, and other size tokens',                    addType: 'size'       },
  effects:     { icon: '✧', label: 'Effects',          desc: 'Gradients, shadows, and motion used across sections',                    addType: 'gradient'   },
  other:       { icon: '◎', label: 'Other',            desc: 'Custom variables not matched to a standard category',                    addType: 'other'      },
};

function getSemanticGroup(name: string, value: string): SemanticGroup {
  const n = name.toLowerCase().replace(/^--/, '');
  const t = guessVarType(name, value);
  if (t === 'font')                            return 'typography';
  if (t === 'size')                            return 'spacing';
  if (t === 'gradient' || t === 'shadow' || t === 'transition') return 'effects';
  if (t === 'other')                           return 'other';
  // Split colors into semantic groups
  if (/text|heading|title|body|copy|label|caption|link|anchor|fore/.test(n)) return 'text';
  if (/bg|background|surface|card|page|panel|back|canvas|fill/.test(n))       return 'backgrounds';
  if (/border|outline|divider|line|separator|stroke/.test(n))                 return 'backgrounds';
  return 'brand';
}

/** Find up to 3 CSS selectors in the current stylesheet that use a given variable.
 *  Handles both `var(--name)` and `var(--name, fallback)` syntax. */
function findVarUsages(varName: string): string[] {
  // Match var(--name) and var(--name, anything)
  const pattern = new RegExp(`var\\(\\s*${varName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\s*[,)]`);
  const seen    = new Set<string>();
  dmCssParsed.forEach(rule => {
    if (rule.props.some(p => pattern.test(p.value))) {
      const short = rule.selector.length > 22 ? rule.selector.slice(0, 20) + '…' : rule.selector;
      seen.add(short);
    }
  });
  return [...seen].slice(0, 3);
}

// ── CSS Variable controls (parallel to prop controls but use data-var) ─

function renderVarControl(idx: number, name: string, value: string, isDark: boolean): string {
  const ba = `data-var="${idx}" data-dark="${isDark ? 1 : 0}"`;
  const type = guessVarType(name, value);

  if (type === 'color') {
    const hex = valueToHex(value) ?? '#000000';
    return `<div class="css-var-color-ctrl">
      <input type="color" class="css-var-swatch css-var-ctrl" value="${hex}" ${ba} data-ctrl="color" title="Click to pick a color">
      <input type="text" class="pp-input css-var-ctrl css-txt-mirror css-var-hex-input" value="${escapeHtml(value)}" ${ba} data-ctrl="text" spellcheck="false" placeholder="#000000">
    </div>`;
  }

  if (type === 'font') {
    const FONTS = ['inherit','system-ui, sans-serif','Inter','Plus Jakarta Sans','Poppins','Montserrat','Lato','Open Sans','Roboto','Nunito','DM Sans','Merriweather','Playfair Display','Georgia, serif','Space Grotesk','Raleway','Fira Code, monospace'];
    const cleanVal = value.replace(/['"]/g, '').trim();
    const fontStack = cleanVal || 'inherit';
    const inList = FONTS.some(f => cleanVal.toLowerCase().startsWith(f.toLowerCase().split(',')[0]));
    return `<div class="css-var-font-ctrl">
      <span class="css-font-aa" style="font-family:${fontStack.replace(/"/g, "'")},sans-serif" title="${escapeHtml(cleanVal)}">Aa</span>
      <select class="pp-select css-var-ctrl" ${ba} data-ctrl="select" style="flex:1">
        ${FONTS.map(f => { const lbl = f.split(',')[0].trim(); return `<option value="${f}"${cleanVal.toLowerCase().startsWith(lbl.toLowerCase()) ? ' selected' : ''}>${lbl}</option>`; }).join('')}
        ${!inList ? `<option value="${escapeHtml(cleanVal)}" selected>${escapeHtml(cleanVal)}</option>` : ''}
      </select>
    </div>`;
  }

  if (type === 'gradient') {
    const g = parseLinearGradient(value);
    if (g && g.stops.length >= 2) {
      const s1 = g.stops[0]!; const s2 = g.stops[g.stops.length - 1]!;
      const DIRS = ['to bottom','to right','to bottom right','to bottom left','135deg','45deg','90deg','0deg'];
      return `<div class="css-grad-bld" ${ba} data-ctrl="gradient"><select class="pp-select css-grad-dir" style="margin-bottom:6px;width:100%">${DIRS.map(d => `<option value="${d}"${d===g.angle?' selected':''}>${d}</option>`).join('')}${!DIRS.includes(g.angle)?`<option value="${escapeHtml(g.angle)}" selected>${escapeHtml(g.angle)}</option>`:''}</select><div class="css-stop-row"><input type="color" class="pp-color css-stop-col" value="${valueToHex(s1.color)??'#000'}"><input type="range" min="0" max="100" value="${parseFloat(s1.pos)||0}" class="pp-range css-stop-pos" style="flex:1"><span class="css-stop-pct" style="font-size:10px;min-width:26px;text-align:right;color:var(--text-dim)">${s1.pos||'0%'}</span></div><div class="css-stop-row"><input type="color" class="pp-color css-stop-col" value="${valueToHex(s2.color)??'#fff'}"><input type="range" min="0" max="100" value="${parseFloat(s2.pos)||100}" class="pp-range css-stop-pos" style="flex:1"><span class="css-stop-pct" style="font-size:10px;min-width:26px;text-align:right;color:var(--text-dim)">${s2.pos||'100%'}</span></div><div class="css-grad-preview" style="height:14px;border-radius:3px;margin-top:6px;background:${escapeHtml(value)}"></div></div>`;
    }
    return `<input type="text" class="pp-input css-var-ctrl" value="${escapeHtml(value)}" ${ba} data-ctrl="text">`;
  }

  if (type === 'shadow') {
    const s = parseShadow(value);
    if (s) {
      const sHex = valueToHex(s.color) ?? '#000000';
      return `<div class="css-shadow-bld css-var-ctrl" ${ba} data-ctrl="vshadow"><div class="css-ctrl-row" style="margin-bottom:4px"><input type="color" class="pp-color css-shd-col" value="${sHex}"><input type="text" class="pp-input css-shd-coltxt" value="${escapeHtml(s.color)}" style="flex:1;min-width:0"></div><div class="css-shadow-grid"><div><label class="css-prop-name">X</label><input type="number" class="pp-input css-shd-x" value="${s.x}" style="width:100%"></div><div><label class="css-prop-name">Y</label><input type="number" class="pp-input css-shd-y" value="${s.y}" style="width:100%"></div><div><label class="css-prop-name">Blur</label><input type="number" class="pp-input css-shd-blur" value="${s.blur}" min="0" style="width:100%"></div><div><label class="css-prop-name">Spread</label><input type="number" class="pp-input css-shd-spread" value="${s.spread}" style="width:100%"></div></div></div>`;
    }
    return `<input type="text" class="pp-input css-var-ctrl" value="${escapeHtml(value)}" ${ba} data-ctrl="text">`;
  }

  if (type === 'size' && /^-?[\d.]+/.test(value.trim())) {
    const num = parseFloat(value); const unit = value.trim().replace(/^-?[\d.]+/, '') || 'px';
    const units = ['px','%','rem','em','vh','vw'];
    return `<div class="css-ctrl-row"><input type="number" class="pp-input css-var-ctrl" value="${isNaN(num)?'':num}" ${ba} data-ctrl="number" data-unit="${unit}" style="width:55px;text-align:right"><select class="pp-select css-var-unit-sel css-var-ctrl" ${ba} style="width:52px;padding:4px 2px">${units.map(u => `<option value="${u}"${u===unit?' selected':''}>${u}</option>`).join('')}</select></div>`;
  }

  return `<input type="text" class="pp-input css-var-ctrl" value="${escapeHtml(value)}" ${ba} data-ctrl="text">`;
}

// ── Looks Gallery ─────────────────────────────────────────────────────

interface Look {
  id: string; name: string; emoji: string; description: string;
  vars: Record<string, string>;
}

const LOOKS: Look[] = [
  { id:'modern-dark', name:'Modern Dark', emoji:'\u{1F311}', description:'Sleek dark background with indigo accent',
    vars: { '--color-primary':'#6366f1','--color-accent':'#6366f1','--color-bg':'#0f172a','--color-bg-alt':'#1e293b','--color-text':'#e2e8f0','--color-text-muted':'#94a3b8','--font-heading':"'Plus Jakarta Sans', sans-serif",'--font-body':"'DM Sans', sans-serif" ,'--radius':'6'}},
  { id:'warm-minimal', name:'Warm Minimal', emoji:'\u2600\uFE0F', description:'Warm cream tones, clean typography',
    vars: { '--color-primary':'#d97706','--color-accent':'#f59e0b','--color-bg':'#fffbeb','--color-bg-alt':'#fef3c7','--color-text':'#1c1917','--color-text-muted':'#a16207','--font-heading':"'Merriweather', serif",'--font-body':"'Lato', sans-serif" ,'--radius':'12'}},
  { id:'bold-agency', name:'Bold Agency', emoji:'\u26A1', description:'High contrast black with bright accent',
    vars: { '--color-primary':'#facc15','--color-accent':'#eab308','--color-bg':'#09090b','--color-bg-alt':'#18181b','--color-text':'#fafafa','--color-text-muted':'#a1a1aa','--font-heading':"'Oswald', sans-serif",'--font-body':"'Open Sans', sans-serif" ,'--radius':'0'}},
  { id:'classic-editorial', name:'Classic Editorial', emoji:'\u{1F4F0}', description:'Sophisticated serif for content-first sites',
    vars: { '--color-primary':'#1e40af','--color-accent':'#2563eb','--color-bg':'#fefce8','--color-bg-alt':'#fef9c3','--color-text':'#1e293b','--color-text-muted':'#78716c','--font-heading':"'Playfair Display', serif",'--font-body':"'Source Serif 4', serif" ,'--radius':'4'}},
  { id:'friendly-startup', name:'Friendly Startup', emoji:'\u{1F680}', description:'Rounded and approachable with teal accent',
    vars: { '--color-primary':'#0d9488','--color-accent':'#0d9488','--color-bg':'#f0fdfa','--color-bg-alt':'#ccfbf1','--color-text':'#134e4a','--color-text-muted':'#4d7c74','--font-heading':"'Nunito', sans-serif",'--font-body':"'Nunito', sans-serif" ,'--radius':'16'}},
  { id:'luxury-minimal', name:'Luxury Minimal', emoji:'\u{1F48E}', description:'Refined gold accent on pure white',
    vars: { '--color-primary':'#b45309','--color-accent':'#d97706','--color-bg':'#ffffff','--color-bg-alt':'#fafaf9','--color-text':'#1c1917','--color-text-muted':'#78716c','--font-heading':"'Raleway', sans-serif",'--font-body':"'Lato', sans-serif" ,'--radius':'6'}},
  { id:'ocean-fresh', name:'Ocean Fresh', emoji:'\u{1F30A}', description:'Clean blues and whites, modern feel',
    vars: { '--color-primary':'#0284c7','--color-accent':'#0ea5e9','--color-bg':'#f0f9ff','--color-bg-alt':'#e0f2fe','--color-text':'#0c4a6e','--color-text-muted':'#5e8ca0','--font-heading':"'Poppins', sans-serif",'--font-body':"'Open Sans', sans-serif" ,'--radius':'8'}},
  { id:'forest-natural', name:'Forest Natural', emoji:'\u{1F33F}', description:'Earthy greens for wellness and nature brands',
    vars: { '--color-primary':'#16a34a','--color-accent':'#22c55e','--color-bg':'#f0fdf4','--color-bg-alt':'#dcfce7','--color-text':'#14532d','--color-text-muted':'#4a7c5b','--font-heading':"'Plus Jakarta Sans', sans-serif",'--font-body':"'Lato', sans-serif" ,'--radius':'10'}},
  { id:'tech-purple', name:'Tech Purple', emoji:'\u{1F52E}', description:'Deep purple tech-startup aesthetic',
    vars: { '--color-primary':'#9333ea','--color-accent':'#a855f7','--color-bg':'#0f0a1e','--color-bg-alt':'#1a0f2e','--color-text':'#f3e8ff','--color-text-muted':'#a78bfa','--font-heading':"'Space Grotesk', sans-serif",'--font-body':"'Inter', sans-serif" ,'--radius':'8'}},
  { id:'rose-elegant', name:'Rose Elegant', emoji:'\u{1F338}', description:'Soft rose tones for lifestyle and beauty',
    vars: { '--color-primary':'#e11d48','--color-accent':'#f43f5e','--color-bg':'#fff1f2','--color-bg-alt':'#ffe4e6','--color-text':'#881337','--color-text-muted':'#be123c','--font-heading':"'Playfair Display', serif",'--font-body':"'DM Sans', sans-serif" ,'--radius':'14'}},
  { id:'monochrome', name:'Monochrome', emoji:'\u25D1', description:'Timeless black and white, no distractions',
    vars: { '--color-primary':'#18181b','--color-accent':'#3f3f46','--color-bg':'#fafafa','--color-bg-alt':'#f4f4f5','--color-text':'#09090b','--color-text-muted':'#71717a','--font-heading':"'Inter', sans-serif",'--font-body':"'Inter', sans-serif" ,'--radius':'2'}},
  { id:'retro-warm', name:'Retro Warm', emoji:'\u{1F39E}\uFE0F', description:'70s-inspired warm oranges and cream',
    vars: { '--color-primary':'#c2410c','--color-accent':'#ea580c','--color-bg':'#fffbf0','--color-bg-alt':'#fef3c7','--color-text':'#7c2d12','--color-text-muted':'#b45309','--font-heading':"'Bebas Neue', sans-serif",'--font-body':"'Raleway', sans-serif" ,'--radius':'4'}},
  { id:'living-design', name:'Living Design', emoji:'\u{1F537}', description:'Walmart Living Design 3.5 — Bentonville Blue, rounded tiles, clean sans',
    vars: { '--color-primary':'#001e60','--color-accent':'#0071ce','--color-bg':'#ffffff','--color-bg-alt':'#f4f4f4','--color-text':'#1a1a1a','--color-text-muted':'#46464a','--font-heading':"'Plus Jakarta Sans', sans-serif",'--font-body':"'Plus Jakarta Sans', sans-serif",'--radius':'12' }},
];

const FONT_PAIRS = [
  { name: 'Modern',    heading: 'Inter',             body: 'DM Sans',            desc: 'Clean and professional' },
  { name: 'Editorial', heading: 'Playfair Display',  body: 'Lato',               desc: 'Elegant storytelling' },
  { name: 'Bold',      heading: 'Oswald',            body: 'Open Sans',          desc: 'Strong and direct' },
  { name: 'Friendly',  heading: 'Nunito',            body: 'Nunito',             desc: 'Warm and approachable' },
  { name: 'Tech',      heading: 'Space Grotesk',     body: 'Inter',              desc: 'Developer-forward' },
  { name: 'Classic',   heading: 'Merriweather',      body: 'Georgia, serif',     desc: 'Timeless readability' },
  { name: 'Playful',   heading: 'Raleway',           body: 'Montserrat',         desc: 'Creative and fun' },
  { name: 'Sharp',     heading: 'Plus Jakarta Sans', body: 'Plus Jakarta Sans',  desc: 'Modern Swiss style' },
];

let _fontPairFontsInjected = false;
function ensureFontPairFontsLoaded(): void {
  if (_fontPairFontsInjected) return;
  _fontPairFontsInjected = true;
  // Collect all unique Google Font families from FONT_PAIRS (skip system fonts like Georgia)
  const systemFonts = new Set(['Georgia', 'serif', 'sans-serif', 'monospace']);
  const families = [...new Set(
    FONT_PAIRS.flatMap(p => [p.heading, p.body])
      .flatMap(f => f.split(',').map(s => s.trim()))
      .filter(f => f && !systemFonts.has(f))
  )];
  const query = families.map(f => `family=${encodeURIComponent(f)}:wght@400;600;700`).join('&');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
  document.head.appendChild(link);
}

function renderLookCard(look: Look): string {
  const bgColor     = look.vars['--color-bg']      ?? '#fff';
  const primaryColor = look.vars['--color-primary'] ?? '#000';
  const accentColor  = look.vars['--color-accent']  ?? primaryColor;
  const textColor   = look.vars['--color-text']    ?? '#000';
  const headingFont = (look.vars['--font-heading'] ?? '').replace(/['"]/g, '').split(',')[0].trim();
  return `<button class="look-card" data-look-id="${look.id}" title="${escapeHtml(look.description)}">
    <div class="look-preview" style="background:${escapeHtml(bgColor)}">
      <div class="look-stripe" style="background:${escapeHtml(primaryColor)}"></div>
      <div class="look-stripe look-stripe--accent" style="background:${escapeHtml(accentColor)};margin-top:3px"></div>
      <div class="look-text-preview" style="color:${escapeHtml(textColor)}${headingFont ? `;font-family:'${escapeHtml(headingFont)}',sans-serif` : ''}">Aa</div>
    </div>
    <div class="look-name">${look.emoji} ${escapeHtml(look.name)}</div>
  </button>`;
}

function renderLooksPanel(): string {
  const customSection = _customLooks.length ? `
    <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">Captured from your site</div>
    <div class="looks-grid" style="margin-bottom:12px">
      ${_customLooks.map(renderLookCard).join('')}
    </div>` : '';

  return `<div style="padding:6px 8px">
    <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;line-height:1.6">
      Pick a visual style. It updates colors and fonts across the whole site instantly.
    </div>
    ${customSection}
    <div class="looks-grid">
      ${LOOKS.map(renderLookCard).join('')}
    </div>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="font-size:11px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Font Pairings</div>
      <div class="font-pairs-grid">
        ${FONT_PAIRS.map(pair => `<button class="font-pair-card" data-heading="${escapeHtml(pair.heading)}" data-body="${escapeHtml(pair.body)}" title="${escapeHtml(pair.desc)}">
          <div class="font-pair-aa" style="font-family:'${escapeHtml(pair.heading)}',sans-serif">Aa</div>
          <div class="font-pair-body" style="font-family:'${escapeHtml(pair.body)}',sans-serif">Body text</div>
          <div class="font-pair-name">${escapeHtml(pair.name)}</div>
        </button>`).join('')}
      </div>
    </div>
  </div>`;
}

// Semantic aliases for each Look variable name — tried in order when exact match fails.
const LOOK_ALIASES: Record<string, string[]> = {
  '--color-primary':    ['--primary','--brand','--brand-color','--clr-primary','--main','--cta','--link-color','--color-brand'],
  '--color-accent':     ['--accent','--color-accent','--highlight','--clr-accent','--color-highlight','--btn-color'],
  '--color-bg':         ['--background','--bg','--page-bg','--body-bg','--surface','--background-color','--color-background','--clr-bg','--site-bg'],
  '--color-bg-alt':     ['--bg-alt','--bgAlt','--bg-secondary','--surface-alt','--color-bg-secondary','--section-bg','--card-bg'],
  '--color-text':       ['--text','--foreground','--body-color','--text-color','--copy','--clr-text','--fg','--color-body'],
  '--color-text-muted': ['--text-muted','--textMuted','--text-secondary','--muted','--color-muted','--clr-muted','--text-dim'],
  '--font-heading':     ['--heading-font','--font-display','--font-title','--ff-heading','--type-heading','--display-font'],
  '--font-body':        ['--body-font','--font-text','--font-sans','--ff-body','--type-body','--text-font','--font-ui'],
};

/** Strip quotes and take the first font name: "'Merriweather', serif" → "Merriweather" */
function extractFontName(v: string): string {
  return v.replace(/['"]/g, '').split(',')[0].trim();
}

/**
 * Propagate Look colors/fonts to every block's per-block settings.
 * Skips only settings explicitly unlinked by the user.
 */
function propagateThemeColors(newTheme: Theme): void {
  const page = visual.activePage;
  if (!page) return;
  for (const block of page.blocks) {
    const def = BLOCK_DEFS[block.type];
    if (!def) continue;
    const newDef = def.defaultSettings(newTheme);
    for (const key of Object.keys(newDef)) {
      if (block.unlinked?.includes(key)) continue; // user explicitly unlinked
      if (newDef[key] !== undefined) block.settings[key] = newDef[key];
    }
  }
}

function applyLook(lookId: string): void {
  const look = [..._customLooks, ...LOOKS].find(l => l.id === lookId);
  if (!look) return;

  const v = look.vars;

  // ── Block-based page: update visual.theme and re-render ──────────────
  // Block pages render via srcdoc using themeCSS() — the external CSS file is
  // never loaded by them. Looks must change visual.theme, not dmCssContent.
  if (visual.activePage && visual.activePage.blocks.length > 0) {
    const unl = _unlinkedThemeFields; // alias for brevity
    if (v['--color-primary']    && !unl.has('primary'))     visual.theme.primary     = v['--color-primary'];
    if (v['--color-accent']     && !unl.has('accent'))      visual.theme.accent      = v['--color-accent'];
    if (v['--color-bg']         && !unl.has('bg'))          visual.theme.bg          = v['--color-bg'];
    if (v['--color-bg-alt']     && !unl.has('bgAlt'))       visual.theme.bgAlt       = v['--color-bg-alt'];
    if (v['--color-text']       && !unl.has('text'))        visual.theme.text        = v['--color-text'];
    if (v['--color-text-muted'] && !unl.has('textMuted'))   visual.theme.textMuted   = v['--color-text-muted'];
    if (v['--font-heading']     && !unl.has('headingFont')) visual.theme.headingFont = extractFontName(v['--font-heading']);
    if (v['--font-body']        && !unl.has('bodyFont'))    visual.theme.bodyFont    = extractFontName(v['--font-body']);
    if (v['--radius']           && !unl.has('radius'))      visual.theme.radius      = v['--radius'];
    propagateThemeColors(visual.theme);
    onThemeChange();
    return;
  }

  // ── Raw HTML page: update CSS variables in the loaded CSS file ────────
  const assigned = new Set<string>(); // user var names already claimed by a Look var
  const updates: Array<{ entry: CssVariable; newValue: string }> = [];
  const injects: Array<{ name: string; value: string }> = [];

  for (const [lookName, lookValue] of Object.entries(look.vars)) {
    // 1. Exact name match
    let idx = dmCssVars.light.findIndex(v => v.name === lookName && !assigned.has(v.name));
    if (idx >= 0) { updates.push({ entry: dmCssVars.light[idx], newValue: lookValue }); assigned.add(dmCssVars.light[idx].name); continue; }

    // 2. Known semantic alias
    const aliases = LOOK_ALIASES[lookName] ?? [];
    for (const alias of aliases) {
      idx = dmCssVars.light.findIndex(v => v.name === alias && !assigned.has(v.name));
      if (idx >= 0) break;
    }
    if (idx >= 0 && !assigned.has(dmCssVars.light[idx].name)) {
      updates.push({ entry: dmCssVars.light[idx], newValue: lookValue }); assigned.add(dmCssVars.light[idx].name); continue;
    }

    // 3. Type-based inference: find the first unassigned var of the same semantic type
    const lookType  = guessVarType(lookName, lookValue);
    const lookGroup = getSemanticGroup(lookName, lookValue);
    // Prefer same semantic group (brand/text/backgrounds/typography), then same type
    idx = dmCssVars.light.findIndex(v => !assigned.has(v.name) && getSemanticGroup(v.name, v.value) === lookGroup);
    if (idx < 0) idx = dmCssVars.light.findIndex(v => !assigned.has(v.name) && guessVarType(v.name, v.value) === lookType);
    if (idx >= 0) {
      updates.push({ entry: dmCssVars.light[idx], newValue: lookValue }); assigned.add(dmCssVars.light[idx].name); continue;
    }

    // 4. No match — inject as a new variable without triggering per-variable side effects
    injects.push({ name: lookName, value: lookValue });
  }

  // Apply updates
  for (const { entry, newValue } of updates) {
    const old = entry.value; entry.value = newValue;
    dmCssContent = updateCssVariableInContent(dmCssContent, entry.name, old, newValue, false);
  }

  // Inject new variables directly into :root (bypass addVariable to keep batching)
  for (const { name, value } of injects) {
    if (dmCssContent.includes(':root')) {
      dmCssContent = dmCssContent.replace(/(:root\s*\{)/, `$1\n  ${name}: ${value};`);
    } else {
      dmCssContent = `:root {\n  ${name}: ${value};\n}\n\n` + dmCssContent;
    }
  }

  // Single live-inject after all changes
  dmCssVars = parseCssVariables(dmCssContent);
  coordinator.dmSetCssLive?.(dmCssContent);
  syncVarTimer();
  const dirtyEl = _sidebarCssContainer?.querySelector<HTMLElement>('#dm-css-dirty');
  if (dirtyEl) dirtyEl.style.display = 'inline';
}

function applyFontPair(heading: string, body: string): void {
  // ── Block-based page: update visual.theme (same path as applyLook) ───
  if (visual.activePage && visual.activePage.blocks.length > 0) {
    const unl = _unlinkedThemeFields;
    if (!unl.has('headingFont')) visual.theme.headingFont = heading;
    if (!unl.has('bodyFont'))    visual.theme.bodyFont    = body;
    propagateThemeColors(visual.theme);
    onThemeChange();
    return;
  }

  const headingVal = `'${heading}', sans-serif`;
  const bodyVal = `'${body}', sans-serif`;
  const headIdx = dmCssVars.light.findIndex(v => v.name === '--font-heading');

  if (headIdx >= 0) {
    applyVarChange(headIdx, headingVal, false);
  } else {
    addVariable('font', '--font-heading', headingVal, false);
  }
  // Re-read index after potential addVariable
  const bodyIdx2 = dmCssVars.light.findIndex(v => v.name === '--font-body');
  if (bodyIdx2 >= 0) {
    applyVarChange(bodyIdx2, bodyVal, false);
  } else {
    addVariable('font', '--font-body', bodyVal, false);
  }
  dmCssVars = parseCssVariables(dmCssContent);
  coordinator.dmSetCssLive?.(dmCssContent);
}

// ── Color Palette Generator ───────────────────────────────────────────

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generatePalette(primaryHex: string): { primary: string; accent: string; text: string; bg: string; surface: string } {
  // Guard against invalid hex (e.g. rgb() values or empty string) — return safe defaults
  if (!/^#[0-9a-fA-F]{6}$/.test(primaryHex)) {
    return { primary: primaryHex, accent: '#6366f1', text: '#1e293b', bg: '#f8fafc', surface: '#f1f5f9' };
  }
  const [h, s, l] = hexToHsl(primaryHex);
  return {
    primary: primaryHex,
    accent: hslToHex((h + 30) % 360, Math.min(s, 90), Math.max(l, 40)),
    text: hslToHex(h, Math.min(s * 0.2, 20), 12),
    bg: hslToHex(h, Math.min(s * 0.08, 8), 98),
    surface: hslToHex(h, Math.min(s * 0.06, 6), 94),
  };
}

let palettePreviewHex: string | null = null;

function renderPalettePreview(): string {
  if (!palettePreviewHex) return '';
  const p = generatePalette(palettePreviewHex);
  return `<div class="palette-section">
    <div class="palette-preview">
      <div class="palette-swatch" style="background:${escapeHtml(p.primary)}" title="Primary"></div>
      <div class="palette-swatch" style="background:${escapeHtml(p.accent)}" title="Accent"></div>
      <div class="palette-swatch" style="background:${escapeHtml(p.text)}" title="Text"></div>
      <div class="palette-swatch" style="background:${escapeHtml(p.bg)}" title="Background"></div>
      <div class="palette-swatch" style="background:${escapeHtml(p.surface)}" title="Surface"></div>
    </div>
    <div style="display:flex;gap:4px;margin-top:6px">
      <button class="pp-seg-btn palette-apply" style="flex:1;font-size:10px;padding:4px">Apply to site</button>
      <button class="pp-seg-btn palette-dismiss" style="flex:0 0 auto;padding:4px 8px;font-size:10px">Dismiss</button>
    </div>
  </div>`;
}

function applyPalette(primaryHex: string): void {
  const p = generatePalette(primaryHex);
  const mapping: [string, string][] = [
    ['--color-primary', p.primary],
    ['--color-bg', p.bg],
    ['--color-text', p.text],
  ];
  // Try --color-surface or --color-surface-alt
  const surfaceIdx = dmCssVars.light.findIndex(v => /surface/.test(v.name));
  if (surfaceIdx >= 0) mapping.push([dmCssVars.light[surfaceIdx].name, p.surface]);

  // Also try accent
  const accentIdx = dmCssVars.light.findIndex(v => /accent/.test(v.name));
  if (accentIdx >= 0) mapping.push([dmCssVars.light[accentIdx].name, p.accent]);

  for (const [varName, val] of mapping) {
    const idx = dmCssVars.light.findIndex(v => v.name === varName);
    if (idx >= 0) applyVarChange(idx, val, false);
  }
  palettePreviewHex = null;
}

// ── Design Consistency Check ──────────────────────────────────────────

interface DesignIssue { severity: 'warn' | 'info'; message: string; suggestion: string; }

function getContrastRatio(hex1: string, hex2: string): number {
  // Normalize 3-digit hex (#abc → #aabbcc) before slicing
  const expand = (h: string) =>
    h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
  const luminance = (hex: string) => {
    const h = expand(hex);
    const r = parseInt(h.slice(1, 3), 16) / 255;
    const g = parseInt(h.slice(3, 5), 16) / 255;
    const b = parseInt(h.slice(5, 7), 16) / 255;
    const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  };
  const l1 = luminance(hex1), l2 = luminance(hex2);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function checkDesignConsistency(): DesignIssue[] {
  const issues: DesignIssue[] = [];

  // 1. Too many unique colors in CSS rules
  const colors = new Set<string>();
  dmCssParsed.forEach(r => r.props.forEach(p => {
    if (/(color|background)/i.test(p.prop) && valueToHex(p.value)) colors.add(valueToHex(p.value)!);
  }));
  if (colors.size > 8) issues.push({ severity:'warn', message:`${colors.size} different colors used`, suggestion:'Aim for 4-6 colors for a cohesive look' });

  // 2. Color contrast check for common text/bg pairs
  const textVars = dmCssVars.light.filter(v => /text|body|copy/.test(v.name));
  const bgVars   = dmCssVars.light.filter(v => /bg|background|surface/.test(v.name));
  textVars.forEach(tv => bgVars.forEach(bv => {
    const tvHex = valueToHex(tv.value);
    const bvHex = valueToHex(bv.value);
    if (!tvHex || !bvHex) return;
    const ratio = getContrastRatio(tvHex, bvHex);
    if (ratio < 4.5) issues.push({ severity:'warn', message:`Low contrast: ${tv.name} on ${bv.name} (${ratio.toFixed(1)}:1)`, suggestion:'WCAG AA requires at least 4.5:1 for normal text' });
  }));

  // 3. No font variables set
  if (!dmCssVars.light.some(v => /font|family/.test(v.name))) {
    issues.push({ severity:'info', message:'No font variables set', suggestion:'Add font variables for consistent typography across sections' });
  }

  return issues;
}

let designCheckResults: DesignIssue[] | null = null;

// ── Variables Panel HTML ──────────────────────────────────────────────

function renderVarCard(idx: number, name: string, value: string, isDk: boolean): string {
  const humanName = humanizeVarName(name);
  const usages    = findVarUsages(name);
  const usageHtml = usages.length
    ? `<div class="css-var-usages">${usages.map(u => `<span class="css-usage-chip" title="This variable is used in ${escapeHtml(u)}">${escapeHtml(u)}</span>`).join('')}</div>`
    : '';
  const ctrl = renderVarControl(idx, name, value, isDk);
  return `<div class="css-var-card">
    <div class="css-var-card-meta">
      <span class="css-var-human-name">${escapeHtml(humanName)}</span>
      <span class="css-var-tech-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      ${usageHtml}
    </div>
    <div class="css-var-card-ctrl">${ctrl}</div>
  </div>`;
}

function renderVariablesPanel(): string {
  const vars  = dmCssVarsDark ? dmCssVars.dark : dmCssVars.light;
  const isDk  = dmCssVarsDark;
  const dk    = isDk ? 1 : 0;

  const modeTabs = dmCssVars.hasDarkMode
    ? `<div class="css-mode-tabs"><button class="css-mode-tab${!isDk?' active':''}" data-mode="light">☀️ Light</button><button class="css-mode-tab${isDk?' active':''}" data-mode="dark">🌙 Dark</button></div>`
    : '';

  const addBtn  = `<button class="css-add-var-btn" id="css-add-var-btn" data-dark="${dk}"><svg viewBox="0 0 16 16" fill="currentColor" width="12"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/></svg> Add variable</button>`;
  const darkBtn = !dmCssVars.hasDarkMode && !isDk
    ? `<button class="css-add-var-btn" id="css-add-dark-btn">🌙 Add dark mode</button>`
    : '';

  if (!vars.length) return `${modeTabs}
    <div style="padding:20px 4px;text-align:center">
      <div style="font-size:28px;margin-bottom:10px">🎨</div>
      <div style="font-size:13px;font-weight:500;color:var(--text-primary);margin-bottom:6px">No global styles set up yet</div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;margin-bottom:14px">Global variables let you change one value and have it update everywhere on your site — like changing your brand color in one place.</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px">${addBtn}${darkBtn}</div>`;

  // Group variables by semantic meaning (not CSS type)
  const ORDER: SemanticGroup[] = ['brand','text','backgrounds','typography','spacing','effects','other'];
  const groups = new Map<SemanticGroup, { idx: number; name: string; value: string }[]>();
  ORDER.forEach(g => groups.set(g, []));
  vars.forEach((v, idx) => groups.get(getSemanticGroup(v.name, v.value))!.push({ idx, name: v.name, value: v.value }));

  // Palette generator button (shown in the Brand Colors group header area)
  const primaryVar = dmCssVars.light.find(v => /primary/.test(v.name));
  const paletteBtn = primaryVar ? `<button class="css-add-var-btn" id="css-gen-palette-btn" style="margin-top:4px" title="Generate a full color palette from your primary color">&#10024; Generate palette</button>` : '';

  const groupsHtml = ORDER.map(group => {
    const items = groups.get(group)!;
    if (!items.length) return '';
    const { icon, label, desc, addType } = SEMANTIC_META[group];
    const extraAfterHeader = group === 'brand' ? `${paletteBtn}${renderPalettePreview()}` : '';
    return `<div class="css-var-group">
      <div class="css-var-group-hd">${icon} ${label}</div>
      <div class="css-var-group-desc">${desc}</div>
      ${extraAfterHeader}
      ${items.map(({ idx, name, value }) => renderVarCard(idx, name, value, isDk)).join('')}
      <button class="css-var-add" data-add-type="${addType}" data-dark="${dk}">+ Add ${label.toLowerCase().replace(/s$/, '').replace(/ &.*/, '')} variable</button>
    </div>`;
  }).join('');

  // Design check results
  const designCheckHtml = designCheckResults !== null
    ? `<div class="design-check-results" style="margin-top:8px">
        ${designCheckResults.length === 0
          ? '<div style="font-size:11px;color:var(--green);padding:8px 0;text-align:center">All checks passed!</div>'
          : designCheckResults.map(issue => `<div class="design-check-item ${escapeHtml(issue.severity)}">
              <span class="design-check-icon">${issue.severity === 'warn' ? '⚠️' : 'ℹ️'}</span>
              <div class="design-check-body">
                <div class="design-check-msg">${escapeHtml(issue.message)}</div>
                <div class="design-check-suggestion">${escapeHtml(issue.suggestion)}</div>
              </div>
            </div>`).join('')}
      </div>`
    : '';

  // TODO: Section Style Variants — future enhancement for per-section style overrides
  const designCheckBtn = `<button class="css-add-var-btn" id="css-design-check-btn" style="margin-top:4px">&#128269; Check design</button>`;

  return `${modeTabs}${groupsHtml}<div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;padding-top:8px;border-top:1px solid var(--border)">${addBtn}${darkBtn}${designCheckBtn}${designCheckHtml}</div>`;
}

// ── Variable change helpers ───────────────────────────────────────────

function updateCssVariableInContent(css: string, varName: string, oldVal: string, newVal: string, isDark: boolean): string {
  if (!isDark) return updateCssValue(css, ':root', varName, oldVal, newVal);
  const markers = ['prefers-color-scheme: dark','prefers-color-scheme:dark','[data-theme="dark"]',"[data-theme='dark']"];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const marker of markers) {
    const di = css.indexOf(marker);
    if (di === -1) continue;
    const bi = css.indexOf('{', di); if (bi === -1) continue;
    let depth = 1; let j = bi + 1;
    while (j < css.length && depth > 0) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const before = css.slice(0, bi + 1); const block = css.slice(bi + 1, j - 1); const after = css.slice(j - 1);
    try {
      // varName starts with -- so no special regex meaning; oldVal might contain special chars
      const updated = block.replace(new RegExp(`(${esc(varName)}\\s*:\\s*)${esc(oldVal.trim())}`), `$1${newVal}`);
      return before + updated + after;
    } catch { return css; }
  }
  return css;
}

function syncVarTimer(): void {
  if (dmVarTimer) clearTimeout(dmVarTimer);
  dmVarTimer = setTimeout(() => {
    if (dmCssPath) {
      const tab = state.openTabs.find(t => t.path === dmCssPath);
      if (tab) { tab.content = dmCssContent; tab.dirty = true; }
      import('../preview-sw-client').then(({ cacheFileInSW }) => cacheFileInSW(dmCssPath!, dmCssContent));
    } else if (visual.activePage) {
      visual.activePage.customCss = dmCssContent;
    }
    visual.dirty = true;
    coordinator.updateVisualSaveBtn?.();
  }, 500);
}

function applyVarChange(idx: number, newVal: string, isDark: boolean): void {
  const vars = isDark ? dmCssVars.dark : dmCssVars.light;
  if (idx >= vars.length) return;
  const variable = vars[idx];
  const oldVal = variable.value;
  variable.value = newVal;
  dmCssContent = updateCssVariableInContent(dmCssContent, variable.name, oldVal, newVal, isDark);
  const dirtyEl = _sidebarCssContainer?.querySelector<HTMLElement>('#dm-css-dirty');
  if (dirtyEl) dirtyEl.style.display = 'inline';
  coordinator.dmSetCssLive?.(dmCssContent);
  syncVarTimer();
}

const VAR_DEFAULTS: Record<CssVarType, { suffix: string; value: string }> = {
  color:      { suffix: 'color',      value: '#000000' },
  font:       { suffix: 'font',       value: "'Inter', sans-serif" },
  size:       { suffix: 'size',       value: '16px' },
  gradient:   { suffix: 'gradient',   value: 'linear-gradient(135deg, #6366f1, #4ecdc4)' },
  shadow:     { suffix: 'shadow',     value: '0px 4px 12px 0px rgba(0,0,0,0.15)' },
  transition: { suffix: 'transition', value: '0.3s ease' },
  other:      { suffix: 'var',        value: 'auto' },
};

function addVariable(type: CssVarType, suggestedName?: string, suggestedValue?: string, isDark = false): void {
  const def = VAR_DEFAULTS[type];
  const vars = isDark ? dmCssVars.dark : dmCssVars.light;
  let baseName = suggestedName ?? `--${def.suffix}`;
  let finalName = baseName; let counter = 1;
  while (vars.some(v => v.name === finalName)) finalName = `${baseName}-${counter++}`;
  const finalValue = suggestedValue ?? def.value;
  vars.push({ name: finalName, value: finalValue });

  if (!isDark) {
    if (dmCssContent.includes(':root')) {
      dmCssContent = dmCssContent.replace(/(:root\s*\{)/, `$1\n  ${finalName}: ${finalValue};`);
    } else {
      dmCssContent = `:root {\n  ${finalName}: ${finalValue};\n}\n\n` + dmCssContent;
    }
  } else {
    const markers = ['prefers-color-scheme: dark','prefers-color-scheme:dark','[data-theme="dark"]'];
    let inserted = false;
    for (const marker of markers) {
      if (!dmCssContent.includes(marker)) continue;
      const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const innerRoot = new RegExp(`(${esc(marker)}[\\s\\S]*?:root\\s*\\{)`);
      if (innerRoot.test(dmCssContent)) {
        dmCssContent = dmCssContent.replace(innerRoot, `$1\n    ${finalName}: ${finalValue};`);
      } else {
        dmCssContent = dmCssContent.replace(new RegExp(`(${esc(marker)}\\s*\\{)`), `$1\n  ${finalName}: ${finalValue};`);
      }
      inserted = true; break;
    }
    if (!inserted) { addDarkModeToCSS(); return; }
  }
  // Re-parse to ensure dmCssVars stays consistent with dmCssContent
  dmCssVars = parseCssVariables(dmCssContent);
  coordinator.dmSetCssLive?.(dmCssContent);
  syncVarTimer();
}

function addDarkModeToCSS(): void {
  const colorVars = dmCssVars.light.filter(v => guessVarType(v.name, v.value) === 'color').map(v => `    ${v.name}: ${v.value};`).join('\n');
  dmCssContent += `\n\n@media (prefers-color-scheme: dark) {\n  :root {\n${colorVars || '    /* Add dark mode colors here */'}\n  }\n}`;
  dmCssVars = parseCssVariables(dmCssContent);
  // Automatically switch to the dark tab so the user sees what was just created
  dmCssVarsDark = true;
  coordinator.dmSetCssLive?.(dmCssContent);
  syncVarTimer();
}

// ── Rule editor row with link/unlink button ───────────────────────────

const CHAIN_ICON = `<svg viewBox="0 0 16 16" fill="currentColor" width="11"><path d="M7.775 3.275a.75.75 0 0 0 0-1.06l-1.25-1.25a3.5 3.5 0 0 0-4.95 4.95l2.5 2.5a3.5 3.5 0 0 0 4.95 0 .751.751 0 0 0-.018-1.042.751.751 0 0 0-1.042-.018 2 2 0 0 1-2.83 0l-2.5-2.5a2 2 0 0 1 2.83-2.83l1.25 1.25a.75.75 0 0 0 1.06 0Zm4.5 4.5a.75.75 0 0 0 0 1.06l1.25 1.25a2 2 0 0 1-2.83 2.83l-1.25-1.25a.75.75 0 0 0-1.06 0 .75.75 0 0 0 0 1.06l1.25 1.25a3.5 3.5 0 0 0 4.95-4.95l-2.5-2.5a3.5 3.5 0 0 0-4.95 0 .751.751 0 0 0 .018 1.042.751.751 0 0 0 1.042.018 2 2 0 0 1 2.83 0l2.5 2.5a2 2 0 0 1 0 2.83Z"/></svg>`;

function renderRuleEditorRow(prop: string, value: string, ri: number, pi: number): string {
  const isLinked     = /^var\(--/.test(value.trim());
  const linkedVarName = isLinked ? (value.match(/var\(--([^)]+)\)/) ?? [])[1] ?? '' : '';
  const linkTitle    = isLinked ? `Linked to --${escapeHtml(linkedVarName)} — click to unlink` : 'Link to a global variable';
  const linkBtn      = `<button class="css-var-link-btn${isLinked ? ' linked' : ''}" data-rule="${ri}" data-prop="${pi}" title="${linkTitle}">${CHAIN_ICON}</button>`;
  const ctrl         = isLinked
    ? `<div class="css-linked-val"><span style="overflow:hidden;text-overflow:ellipsis">--${escapeHtml(linkedVarName)}</span></div>`
    : getPropControlHtmlEnhanced(prop, value, ri, pi);
  return `<div class="css-prop-row"><label class="css-prop-name" title="${escapeHtml(prop)}">${escapeHtml(prop)}</label><div style="display:flex;align-items:flex-start;gap:4px;flex:1;min-width:0">${linkBtn}<div style="flex:1;min-width:0">${ctrl}</div></div></div>`;
}

// ── Comprehensive options map for enumerated CSS properties ───────────
const CSS_OPTS: Record<string, string[]> = {
  // Flexbox layout
  'flex-direction':    ['row','column','row-reverse','column-reverse'],
  'flex-wrap':         ['nowrap','wrap','wrap-reverse'],
  'align-items':       ['normal','stretch','center','flex-start','flex-end','start','end','baseline','self-start','self-end'],
  'align-content':     ['normal','stretch','center','flex-start','flex-end','start','end','space-between','space-around','space-evenly'],
  'align-self':        ['auto','normal','stretch','center','flex-start','flex-end','start','end','baseline'],
  'justify-content':   ['normal','center','flex-start','flex-end','start','end','left','right','space-between','space-around','space-evenly','stretch'],
  'justify-items':     ['normal','stretch','center','start','end','flex-start','flex-end','left','right','baseline'],
  'justify-self':      ['auto','normal','stretch','center','start','end','flex-start','flex-end','left','right','baseline'],
  'place-items':       ['normal','stretch','center','start','end','flex-start','flex-end','baseline'],
  'place-content':     ['normal','stretch','center','start','end','space-between','space-around','space-evenly'],
  'place-self':        ['auto','normal','stretch','center','start','end'],
  'flex-grow':         ['0','1','2','3'],
  'flex-shrink':       ['0','1','2'],
  // Grid
  'grid-auto-flow':    ['row','column','dense','row dense','column dense'],
  // Positioning
  'position':          ['static','relative','absolute','fixed','sticky'],
  'float':             ['none','left','right','inline-start','inline-end'],
  'clear':             ['none','left','right','both','inline-start','inline-end'],
  // Overflow
  'overflow':          ['visible','hidden','scroll','auto','clip'],
  'overflow-x':        ['visible','hidden','scroll','auto','clip'],
  'overflow-y':        ['visible','hidden','scroll','auto','clip'],
  'overflow-wrap':     ['normal','break-word','anywhere'],
  // Visibility
  'visibility':        ['visible','hidden','collapse'],
  'pointer-events':    ['auto','none','all','fill','stroke','painted','visible'],
  'user-select':       ['none','auto','text','all','contain'],
  // Box model
  'box-sizing':        ['content-box','border-box'],
  'resize':            ['none','both','horizontal','vertical'],
  'isolation':         ['auto','isolate'],
  // Cursor
  'cursor':            ['auto','default','none','pointer','text','wait','crosshair','not-allowed','move','grab','grabbing','zoom-in','zoom-out','help','progress','col-resize','row-resize','ew-resize','ns-resize','nesw-resize','nwse-resize','cell','copy'],
  // Typography
  'font-style':        ['normal','italic','oblique'],
  'font-variant':      ['normal','small-caps'],
  'font-stretch':      ['normal','condensed','expanded','extra-condensed','semi-condensed','semi-expanded','extra-expanded','ultra-condensed','ultra-expanded'],
  'font-kerning':      ['auto','normal','none'],
  'text-transform':    ['none','capitalize','uppercase','lowercase','full-width'],
  'text-decoration':   ['none','underline','overline','line-through','underline overline'],
  'text-decoration-style': ['solid','double','dotted','dashed','wavy'],
  'text-rendering':    ['auto','optimizeSpeed','optimizeLegibility','geometricPrecision'],
  'vertical-align':    ['baseline','top','middle','bottom','text-top','text-bottom','sub','super'],
  'white-space':       ['normal','nowrap','pre','pre-wrap','pre-line','break-spaces'],
  'word-break':        ['normal','break-all','keep-all','break-word'],
  'word-wrap':         ['normal','break-word','anywhere'],
  'hyphens':           ['none','manual','auto'],
  'text-overflow':     ['clip','ellipsis'],
  'direction':         ['ltr','rtl'],
  'writing-mode':      ['horizontal-tb','vertical-lr','vertical-rl'],
  // Border
  'border-style':      ['none','hidden','dotted','dashed','solid','double','groove','ridge','inset','outset'],
  'border-top-style':  ['none','dotted','dashed','solid','double','groove','ridge','inset','outset'],
  'border-right-style':['none','dotted','dashed','solid','double','groove','ridge','inset','outset'],
  'border-bottom-style':['none','dotted','dashed','solid','double','groove','ridge','inset','outset'],
  'border-left-style': ['none','dotted','dashed','solid','double','groove','ridge','inset','outset'],
  'border-collapse':   ['separate','collapse'],
  'outline-style':     ['none','auto','dotted','dashed','solid','double','groove','ridge','inset','outset'],
  // Background
  'background-repeat': ['repeat','no-repeat','repeat-x','repeat-y','round','space'],
  'background-size':   ['auto','cover','contain'],
  'background-attachment': ['scroll','fixed','local'],
  'background-origin': ['border-box','padding-box','content-box'],
  'background-clip':   ['border-box','padding-box','content-box','text'],
  'background-blend-mode': ['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'],
  // Object
  'object-fit':        ['fill','contain','cover','none','scale-down'],
  'object-position':   ['center','top','bottom','left','right','top left','top right','bottom left','bottom right'],
  // Table
  'table-layout':      ['auto','fixed'],
  'caption-side':      ['top','bottom'],
  'empty-cells':       ['show','hide'],
  // List
  'list-style-type':   ['none','disc','circle','square','decimal','decimal-leading-zero','lower-roman','upper-roman','lower-alpha','upper-alpha','lower-latin','upper-latin'],
  'list-style-position': ['inside','outside'],
  // Mix blend / compositing
  'mix-blend-mode':    ['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'],
  // Image / media
  'image-rendering':   ['auto','crisp-edges','pixelated','smooth'],
  // Appearance
  'appearance':        ['none','auto','textfield','checkbox','radio','select-one','button'],
  // Misc
  'will-change':       ['auto','transform','opacity','scroll-position','contents'],
  'contain':           ['none','strict','content','size','layout','style','paint'],
};

function makePropSelect(options: string[], current: string, ba: string): string {
  const v = current.trim();
  const inList = options.includes(v);
  return `<select class="pp-select css-prop-ctrl" ${ba} data-ctrl="select">
    ${!inList && v ? `<option value="${escapeHtml(v)}" selected>${escapeHtml(v)}</option>` : ''}
    ${options.map(o => `<option value="${o}"${o === v ? ' selected' : ''}>${o}</option>`).join('')}
  </select>`;
}

function getPropControlHtml(prop: string, value: string, ri: number, pi: number): string {
  const ba = `data-rule="${ri}" data-prop="${pi}"`;

  // Color properties — picker + text
  const isColorProp = /(^|-)color$/.test(prop) || prop === 'background-color';
  const hex = isColorProp ? valueToHex(value) : null;
  if (hex) return `<div class="css-ctrl-row">
    <input type="color" class="pp-color css-prop-ctrl" value="${hex}" ${ba} data-ctrl="color">
    <input type="text" class="pp-input css-prop-ctrl css-txt-mirror" value="${escapeHtml(value)}" ${ba} data-ctrl="text" style="flex:1;min-width:0"></div>`;

  // Size properties — number + unit select
  const isSizeProp = /^(font-size|width|height|max-width|min-width|max-height|min-height|border-radius|top|bottom|left|right|gap|row-gap|column-gap|letter-spacing|word-spacing|flex-basis|z-index|line-height|border-width|border-top-width|border-right-width|border-bottom-width|border-left-width|outline-width|outline-offset|padding|margin)$/.test(prop)
    || /^(padding|margin)-(top|right|bottom|left)$/.test(prop)
    || /^border-(top|right|bottom|left)?-?(radius)?$/.test(prop);
  if (isSizeProp && /^-?[\d.]+/.test(value.trim())) {
    const num = parseFloat(value); const unit = value.trim().replace(/^-?[\d.]+/, '') || 'px';
    const units = ['px', '%', 'rem', 'em', 'vh', 'vw'];
    return `<div class="css-ctrl-row">
      <input type="number" class="pp-input css-prop-ctrl" value="${isNaN(num) ? '' : num}" ${ba} data-ctrl="number" data-unit="${unit}" style="width:55px;text-align:right">
      <select class="pp-select css-unit-sel css-prop-ctrl" ${ba} style="width:52px;padding:4px 2px">
        ${units.map(u => `<option value="${u}"${u === unit ? ' selected' : ''}>${u}</option>`).join('')}
      </select></div>`;
  }

  // Opacity — range slider
  if (prop === 'opacity') {
    const num = Math.min(1, Math.max(0, parseFloat(value) || 0));
    return `<div class="css-ctrl-row" style="gap:6px">
      <input type="range" min="0" max="1" step="0.01" value="${num}" class="pp-range css-prop-ctrl" ${ba} data-ctrl="range" style="flex:1">
      <span class="css-range-val" style="font-size:11px;color:var(--text-secondary);min-width:28px">${num}</span></div>`;
  }

  // Display — segmented (most common values)
  if (prop === 'display') {
    const opts = ['block','flex','grid','inline','inline-flex','inline-block','none'];
    return `<div class="css-ctrl-row" style="flex-wrap:wrap;gap:2px">
      ${opts.map(o => `<button class="pp-seg-btn css-seg css-prop-ctrl${value === o ? ' active' : ''}" ${ba} data-ctrl="seg" data-val="${o}" style="flex:0 0 auto;padding:3px 5px;font-size:10px">${o}</button>`).join('')}</div>`;
  }

  // Text-align — segmented
  if (prop === 'text-align') {
    return `<div class="css-ctrl-row" style="gap:2px">
      ${['left','center','right','justify'].map(o => `<button class="pp-seg-btn css-seg css-prop-ctrl${value === o ? ' active' : ''}" ${ba} data-ctrl="seg" data-val="${o}" style="flex:1;padding:3px">${o}</button>`).join('')}</div>`;
  }

  // Font-weight — select
  if (prop === 'font-weight') {
    return makePropSelect(['100','200','300','400','500','600','700','800','900','bold','normal','lighter','bolder'], value, ba);
  }

  // Any other enumerated property — select from the options map
  const knownOpts = CSS_OPTS[prop];
  if (knownOpts) return makePropSelect(knownOpts, value, ba);

  // Fallback — text input
  return `<input type="text" class="pp-input css-prop-ctrl css-txt-mirror" value="${escapeHtml(value)}" ${ba} data-ctrl="text">`;
}

function renderDmCssPanel(): string {
  const dirty   = `<span id="dm-css-dirty" style="display:none;color:var(--orange);font-size:10px">●</span>`;
  const BACK_SVG = `<svg viewBox="0 0 16 16" fill="currentColor" width="10"><path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z"/></svg>`;

  const tabBar = `<div class="css-panel-tabs"><button class="css-tab${dmCssPanelView==='variables'?' active':''}" data-tab="variables">Variables</button><button class="css-tab${dmCssPanelView==='looks'?' active':''}" data-tab="looks">Looks</button><button class="css-tab${dmCssPanelView==='rules'?' active':''}" data-tab="rules">Rules</button></div>`;

  // Still awaiting first load — show spinner
  if (!dmCssInitialized) return `<div id="dm-css-panel">${tabBar}<div style="padding:16px 12px;text-align:center"><div class="css-empty-msg">Loading\u2026</div></div></div>`;

  // Init complete but no CSS file found in repo
  if (!dmCssPath && !dmCssContent) return `<div id="dm-css-panel">${tabBar}<div style="padding:16px 12px;text-align:center"><div style="font-size:12px;color:var(--text-dim);line-height:1.6;margin-bottom:12px">No CSS file found in this repository.</div><button id="dm-css-create-btn" class="btn btn-secondary" style="font-size:11px;padding:4px 12px">+ Create style.css</button></div></div>`;

  // ── Looks view ──
  if (dmCssPanelView === 'looks') {
    return `<div id="dm-css-panel">${tabBar}${renderLooksPanel()}<div style="display:flex;justify-content:flex-end;padding:0 8px 4px">${dirty}</div></div>`;
  }

  // ── Variables view ──
  if (dmCssPanelView === 'variables') {
    // When CSS exists but has no detected CSS variables, offer to convert
    const noVars = dmCssVars.light.length === 0;
    const convertBanner = noVars
      ? `<div style="background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.2);border-radius:6px;padding:10px 12px;margin-bottom:8px;font-size:11px;line-height:1.6;color:var(--text-secondary)">
           No CSS variables detected — this CSS uses hardcoded colors.<br>
           <button id="dm-css-convert-btn" class="btn btn-secondary" style="margin-top:6px;font-size:11px;padding:3px 10px">
             ✦ Convert to theme variables
           </button>
         </div>`
      : '';
    return `<div id="dm-css-panel">${tabBar}<div id="dm-css-vars-content" style="padding:6px 8px">${convertBanner}${renderVariablesPanel()}</div><div style="display:flex;justify-content:flex-end;padding:0 8px 4px">${dirty}</div></div>`;
  }

  // ── Rules view ──
  const fname = dmCssPath ? (dmCssPath.split('/').pop() ?? dmCssPath) : '';

  if (dmCssActiveRule !== null && dmCssActiveRule < dmCssParsed.length) {
    const rule = dmCssParsed[dmCssActiveRule];
    return `<div id="dm-css-panel">${tabBar}<div class="dm-css-header" style="padding:6px 8px"><button id="dm-css-back-btn" class="dm-css-back">${BACK_SVG}<code class="dm-css-sel-chip" title="${escapeHtml(rule.selector)}">${escapeHtml(rule.selector)}</code></button>${dirty}</div><div id="dm-css-props-list" style="padding:0 8px">${rule.props.map((p, pi) => renderRuleEditorRow(p.prop, p.value, dmCssActiveRule!, pi)).join('')}</div></div>`;
  }

  if (!dmCssParsed.length) return `<div id="dm-css-panel">${tabBar}<div class="dm-css-header" style="padding:6px 8px"><span class="pp-label" style="margin:0">Rules</span>${dirty}</div><div class="css-empty-msg" style="padding:8px">No editable rules found</div></div>`;

  return `<div id="dm-css-panel">${tabBar}<div class="dm-css-header" style="padding:6px 8px"><span class="pp-label" style="margin:0">Rules <span style="font-weight:400;font-family:monospace;font-size:9px;color:var(--text-dim);margin-left:4px">${escapeHtml(fname)}</span></span>${dirty}</div><div id="dm-css-rule-list" style="padding:0 8px">${dmCssParsed.map((rule, ri) => `<div class="dm-css-rule-item" data-rule-idx="${ri}"><code class="dm-css-rule-sel" title="${escapeHtml(rule.selector)}">${escapeHtml(rule.selector)}</code><span class="dm-css-rule-count">${rule.props.length}</span></div>`).join('')}</div></div>`;
}

function renderDmEmptyPanel(): string {
  return `
    <div class="pp-block-header"><span class="pp-block-type">Inspector</span></div>
    <div style="padding:16px 14px 0">
      <div style="background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:8px;padding:20px 14px;text-align:center">
        <div style="font-size:28px;margin-bottom:8px">👆</div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">
          Click any element to inspect styles.
        </div>
        <div style="margin-top:10px;font-size:11px;color:var(--text-dim)">
          Open <b style="color:var(--text-secondary)">&#123;&#125; CSS Rules</b> in the sidebar to edit the stylesheet.
        </div>
      </div>
    </div>`;
}

function renderDmInspectorPanel(sel: SelectedElement): string {
  const s = sel.styles;
  const bgHex   = cssColorToHex(s.backgroundColor);
  const fgHex   = cssColorToHex(s.color);
  const fsPx    = parsePxValue(s.fontSize);
  const lineH   = parseFloatValue(s.lineHeight);
  const radPx   = parsePxValue(s.borderRadius);
  const dispVal = s.display ?? 'block';
  const shortSel = sel.selector.length > 28 ? '…' + sel.selector.slice(-25) : sel.selector;

  const pad = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft];
  const mar = [s.marginTop,  s.marginRight,  s.marginBottom,  s.marginLeft];
  const padProps = ['padding-top','padding-right','padding-bottom','padding-left'];
  const marProps = ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'];

  const spacingInputs = (vals: string[], props: string[]) =>
    vals.map((v, i) =>
      `<input type="text" class="pp-input dm-style-input"
              value="${parsePxValue(v)}" placeholder="0"
              style="width:40px;text-align:center;padding:4px 2px"
              data-dm-prop="${props[i]}" data-unit="px">`,
    ).join('');

  const displayOpts = ['block','flex','inline','none'];

  const breadcrumbHtml = sel.breadcrumb.length
    ? `<div class="dm-breadcrumb">
        <span class="dm-bc-item" data-sel="body">body</span>
        ${sel.breadcrumb.map((b: BreadcrumbItem) =>
          `<span class="dm-bc-sep">›</span><span class="dm-bc-item" data-sel="${escapeHtml(b.selector)}" title="${escapeHtml(b.selector)}">${escapeHtml(b.label)}</span>`,
        ).join('')}
       </div>`
    : '';

  return `
    <div class="pp-block-header">
      <code style="font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;
                   white-space:nowrap;display:block;max-width:220px"
            title="${escapeHtml(sel.selector)}">${escapeHtml(shortSel)}</code>
    </div>
    ${breadcrumbHtml}

    <div class="pp-group">
      <label class="pp-label">Colors</label>
      <div class="pp-row">
        <input type="color" class="pp-color dm-style-input" value="${bgHex}" data-dm-prop="background-color">
        <span class="pp-color-label">Background</span>
      </div>
      <div class="pp-row">
        <input type="color" class="pp-color dm-style-input" value="${fgHex}" data-dm-prop="color">
        <span class="pp-color-label">Text Color</span>
      </div>
    </div>

    <div class="pp-group">
      <label class="pp-label">Typography</label>
      <div class="pp-row" style="gap:4px;margin-bottom:6px">
        <input type="number" class="pp-input dm-style-input" value="${fsPx}"
               style="width:60px" placeholder="16" data-dm-prop="font-size" data-unit="px">
        <span class="pp-color-label" style="flex-shrink:0">px font-size</span>
      </div>
      <div class="pp-row" style="gap:4px">
        <input type="text" class="pp-input dm-style-input" value="${escapeHtml(lineH)}"
               style="width:60px" placeholder="1.6" data-dm-prop="line-height">
        <span class="pp-color-label" style="flex-shrink:0">line-height</span>
      </div>
    </div>

    <div class="pp-group">
      <label class="pp-label">Spacing</label>
      <label class="pp-label" style="font-size:10px;margin-top:0;margin-bottom:4px;letter-spacing:0">Padding (T R B L)</label>
      <div class="pp-row" style="gap:3px">${spacingInputs(pad, padProps)}</div>
      <label class="pp-label" style="font-size:10px;margin-top:6px;margin-bottom:4px;letter-spacing:0">Margin (T R B L)</label>
      <div class="pp-row" style="gap:3px">${spacingInputs(mar, marProps)}</div>
    </div>

    <div class="pp-group">
      <label class="pp-label">Layout</label>
      <div class="pp-seg" style="margin-bottom:8px">
        ${displayOpts.map(d =>
          `<button class="pp-seg-btn dm-display-btn${dispVal === d ? ' active' : ''}" data-val="${d}">${d}</button>`,
        ).join('')}
      </div>
      <label class="pp-label" style="margin-top:2px">Border Radius: <span id="dm-radius-val">${radPx}</span>px</label>
      <input type="range" min="0" max="40" step="1" value="${radPx || 0}"
             class="pp-range" id="dm-border-radius" data-unit="px">
    </div>

    </div>`;
}

function bindDmPanelEvents(panel: HTMLElement): void {

  const selected = (coordinator.getDmSelected?.() ?? null) as SelectedElement | null;
  if (!selected) return;
  const selector = selected.selector;

  // Color pickers — throttled via rAF to avoid flooding postMessage on every frame
  panel.querySelectorAll<HTMLInputElement>('.dm-style-input[type="color"]').forEach(input => {
    let rafId: number | null = null;
    input.addEventListener('input', () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        coordinator.dmSetInlineStyle?.(selector, input.dataset.dmProp!, input.value);
      });
    });
  });

  // Number inputs
  panel.querySelectorAll<HTMLInputElement>('.dm-style-input[type="number"]').forEach(input => {
    input.addEventListener('change', () => {
      const val = input.dataset.unit === 'px' ? `${input.value}px` : input.value;
      coordinator.dmSetInlineStyle?.(selector, input.dataset.dmProp!, val);
    });
  });

  // Text inputs (spacing, line-height)
  panel.querySelectorAll<HTMLInputElement>('.dm-style-input[type="text"]').forEach(input => {
    input.addEventListener('change', () => {
      const val = input.dataset.unit === 'px' && input.value !== '' ? `${input.value}px` : input.value;
      coordinator.dmSetInlineStyle?.(selector, input.dataset.dmProp!, val);
    });
  });

  // Select inputs
  panel.querySelectorAll<HTMLSelectElement>('select.dm-style-input').forEach(sel => {
    sel.addEventListener('change', () => {
      coordinator.dmSetInlineStyle?.(selector, sel.dataset.dmProp!, sel.value);
    });
  });

  // Range (border-radius)
  const radiusRange = panel.querySelector<HTMLInputElement>('#dm-border-radius');
  const radiusVal   = panel.querySelector<HTMLElement>('#dm-radius-val');
  radiusRange?.addEventListener('input', () => {
    if (radiusVal) radiusVal.textContent = radiusRange.value;
    coordinator.dmSetInlineStyle?.(selector, 'border-radius', `${radiusRange.value}px`);
  });

  // Display segmented buttons
  panel.querySelectorAll<HTMLButtonElement>('.dm-display-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll<HTMLButtonElement>('.dm-display-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      coordinator.dmSetInlineStyle?.(selector, 'display', btn.dataset.val!);
    });
  });

  // Breadcrumb chips — click to highlight ancestor in canvas
  panel.querySelectorAll<HTMLElement>('.dm-bc-item[data-sel]').forEach(chip => {
    chip.addEventListener('click', () => {
      const sel2 = chip.dataset.sel!;
      if (sel2 === 'body') return;
      coordinator.dmHighlightSection?.(sel2);
    });
  });
}

// ── CSS value parsers ─────────────────────────────────────────────────

interface ShadowParsed { inset: boolean; x: number; y: number; blur: number; spread: number; color: string; }
function parseShadow(value: string): ShadowParsed | null {
  const first = value.split(/,(?![^(]*\))/)[0]?.trim() ?? '';
  if (!first) return null;
  const inset = /\binset\b/.test(first);
  const rest  = first.replace(/\binset\b/, '').trim();
  const colorRx = /#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)/;
  const colorM  = rest.match(colorRx);
  const color   = colorM?.[0] ?? 'rgba(0,0,0,0.2)';
  const nums    = rest.replace(colorRx, '').trim().split(/\s+/).map(n => parseFloat(n)).filter(n => !isNaN(n));
  if (nums.length < 2) return null;
  return { inset, x: nums[0]??0, y: nums[1]??0, blur: nums[2]??0, spread: nums[3]??0, color };
}

interface GradientParsed { angle: string; stops: { color: string; pos: string }[]; }
function parseLinearGradient(value: string): GradientParsed | null {
  const m = value.match(/linear-gradient\((.+)\)$/s);
  if (!m) return null;
  const parts: string[] = []; let depth = 0; let cur = '';
  for (const c of m[1]) {
    if (c === '(') depth++; else if (c === ')') depth--;
    if (c === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  if (parts.length < 2) return null;
  let angle = '180deg'; let start = 0;
  const first = parts[0]?.trim() ?? '';
  if (first.startsWith('to ') || /^-?[\d.]+deg$/.test(first)) { angle = first; start = 1; }
  const stops = parts.slice(start).map(s => {
    const sp = s.trim().split(/\s+(?=[\d%])/);
    return { color: sp[0]?.trim() ?? '', pos: sp[1]?.trim() ?? '' };
  });
  return { angle, stops };
}

interface BorderParsed { width: number; style: string; color: string; }
function parseBorder(value: string): BorderParsed | null {
  const m = value.match(/^([\d.]+)(?:px)?\s+(solid|dashed|dotted|double|none)\s+(.+)$/);
  if (!m) return null;
  return { width: parseFloat(m[1]??'1'), style: m[2]??'solid', color: m[3]?.trim()??'#000' };
}

interface TransitionParsed { prop: string; duration: number; unit: string; easing: string; }
function parseTransition(value: string): TransitionParsed | null {
  const parts = value.split(/\s+/);
  if (parts.length < 2) return null;
  const durStr = parts[1]??'0.3s';
  return { prop: parts[0]??'all', duration: parseFloat(durStr)||0.3, unit: durStr.endsWith('ms')?'ms':'s', easing: parts[2]??'ease' };
}

interface AnimationParsed { name: string; duration: number; unit: string; easing: string; delay: number; iter: string; }
function parseAnimation(value: string): AnimationParsed {
  if (!value || value === 'none') return { name:'none', duration:0.5, unit:'s', easing:'ease', delay:0, iter:'1' };
  const parts = value.split(/\s+/);
  const durStr = parts[1]??'0.5s';
  const delStr = parts[3]??'0s';
  return { name: parts[0]??'none', duration: parseFloat(durStr)||0.5, unit: durStr.endsWith('ms')?'ms':'s', easing: parts[2]??'ease', delay: parseFloat(delStr)||0, iter: parts[4]??'1' };
}

// ── Enhanced property controls ────────────────────────────────────────

function getPropControlHtmlEnhanced(prop: string, value: string, ri: number, pi: number): string {
  const ba = `data-rule="${ri}" data-prop="${pi}"`;

  // Font family → rich dropdown
  if (prop === 'font-family') {
    const FONTS = ['inherit','system-ui, sans-serif','Inter','Plus Jakarta Sans','Poppins','Montserrat','Lato','Open Sans','Roboto','Nunito','DM Sans','Figtree','Merriweather','Playfair Display','Georgia, serif','Space Grotesk','Raleway','Oswald','Bebas Neue','Fira Code, monospace','JetBrains Mono, monospace'];
    const cleanVal = value.replace(/['"]/g, '').trim();
    const inList   = FONTS.some(f => cleanVal.toLowerCase().startsWith(f.toLowerCase().split(',')[0]));
    return `<select class="pp-select css-prop-ctrl" ${ba} data-ctrl="select">
      ${FONTS.map(f => { const lbl = f.split(',')[0].trim(); const sel = cleanVal.toLowerCase().startsWith(lbl.toLowerCase()) ? ' selected' : ''; return `<option value="${f}"${sel}>${lbl}</option>`; }).join('')}
      ${!inList ? `<option value="${escapeHtml(cleanVal)}" selected>${escapeHtml(cleanVal)}</option>` : ''}
    </select>`;
  }

  // Shadow / glow builder
  if (prop === 'box-shadow' || prop === 'text-shadow') {
    const s = parseShadow(value);
    if (!s) return `<input type="text" class="pp-input css-prop-ctrl css-txt-mirror" value="${escapeHtml(value)}" ${ba} data-ctrl="text">`;
    const sHex = valueToHex(s.color) ?? '#000000';
    return `<div class="css-shadow-bld" ${ba} data-ctrl="shadow">
      <div class="css-ctrl-row" style="margin-bottom:4px">
        <input type="color" class="pp-color css-shd-col" value="${sHex}" title="Color">
        <input type="text" class="pp-input css-shd-coltxt" value="${escapeHtml(s.color)}" style="flex:1;min-width:0">
        ${prop==='box-shadow'?`<label class="pp-toggle" style="margin:0;gap:4px;flex-shrink:0;font-size:11px"><input type="checkbox" class="css-shd-inset"${s.inset?' checked':''}> inset</label>`:''}
      </div>
      <div class="css-shadow-grid">
        <div><label class="css-prop-name">X</label><input type="number" class="pp-input css-shd-x" value="${s.x}" style="width:100%"></div>
        <div><label class="css-prop-name">Y</label><input type="number" class="pp-input css-shd-y" value="${s.y}" style="width:100%"></div>
        <div><label class="css-prop-name">Blur</label><input type="number" class="pp-input css-shd-blur" value="${s.blur}" min="0" style="width:100%"></div>
        ${prop==='box-shadow'?`<div><label class="css-prop-name">Spread</label><input type="number" class="pp-input css-shd-spread" value="${s.spread}" style="width:100%"></div>`:'<div></div>'}
      </div>
    </div>`;
  }

  // Gradient builder (for background properties with gradient value)
  if ((prop === 'background' || prop === 'background-image' || prop === 'background-color') && value.includes('gradient')) {
    const g = parseLinearGradient(value);
    if (!g || g.stops.length < 2) return `<input type="text" class="pp-input css-prop-ctrl css-txt-mirror" value="${escapeHtml(value)}" ${ba} data-ctrl="text">`;
    const s1 = g.stops[0]!; const s2 = g.stops[g.stops.length - 1]!;
    const DIRS = ['to bottom','to right','to bottom right','to bottom left','135deg','45deg','90deg','0deg'];
    return `<div class="css-grad-bld" ${ba} data-ctrl="gradient">
      <select class="pp-select css-grad-dir" style="margin-bottom:6px;width:100%">
        ${DIRS.map(d => `<option value="${d}"${d===g.angle?' selected':''}>${d}</option>`).join('')}
        ${!DIRS.includes(g.angle)?`<option value="${escapeHtml(g.angle)}" selected>${escapeHtml(g.angle)}</option>`:''}
      </select>
      <div class="css-stop-row"><input type="color" class="pp-color css-stop-col" value="${valueToHex(s1.color)??'#000'}"><input type="range" min="0" max="100" value="${parseFloat(s1.pos)||0}" class="pp-range css-stop-pos" style="flex:1"><span class="css-stop-pct" style="font-size:10px;min-width:26px;text-align:right;color:var(--text-dim)">${s1.pos||'0%'}</span></div>
      <div class="css-stop-row"><input type="color" class="pp-color css-stop-col" value="${valueToHex(s2.color)??'#fff'}"><input type="range" min="0" max="100" value="${parseFloat(s2.pos)||100}" class="pp-range css-stop-pos" style="flex:1"><span class="css-stop-pct" style="font-size:10px;min-width:26px;text-align:right;color:var(--text-dim)">${s2.pos||'100%'}</span></div>
      <div class="css-grad-preview" style="height:14px;border-radius:3px;margin-top:6px;background:${escapeHtml(value)}"></div>
    </div>`;
  }

  // Border control
  if (/^border(-top|-right|-bottom|-left)?$/.test(prop) && !prop.includes('radius') && !prop.includes('image')) {
    const b = parseBorder(value);
    if (b) {
      const bHex = valueToHex(b.color) ?? '#000000';
      return `<div class="css-border-bld css-prop-ctrl" ${ba} data-ctrl="border"><div class="css-ctrl-row">
        <input type="number" class="pp-input css-brd-w" value="${b.width}" style="width:50px;text-align:right">
        <select class="pp-select css-brd-s" style="width:65px">${['none','solid','dashed','dotted','double'].map(s=>`<option value="${s}"${s===b.style?' selected':''}>${s}</option>`).join('')}</select>
        <input type="color" class="pp-color css-brd-c" value="${bHex}">
      </div></div>`;
    }
  }

  // Transition control
  if (prop === 'transition') {
    const t = parseTransition(value);
    const TP = ['all','opacity','transform','background','color','border','box-shadow','filter','width','height'];
    const EZ = ['ease','linear','ease-in','ease-out','ease-in-out'];
    return `<div class="css-prop-ctrl" ${ba} data-ctrl="transition"><div class="css-ctrl-row" style="margin-bottom:4px">
      <select class="pp-select css-tr-prop" style="flex:1">${TP.map(p=>`<option value="${p}"${(t?.prop??'all')===p?' selected':''}>${p}</option>`).join('')}</select>
    </div><div class="css-ctrl-row">
      <input type="number" class="pp-input css-tr-dur" value="${t?.duration??0.3}" min="0" step="0.1" style="width:55px">
      <select class="pp-select css-tr-unit" style="width:42px;padding:4px 2px"><option value="s"${(t?.unit??'s')==='s'?' selected':''}>s</option><option value="ms"${(t?.unit??'')!=='s'?' selected':''}>ms</option></select>
      <select class="pp-select css-tr-ease" style="flex:1">${EZ.map(e=>`<option value="${e}"${(t?.easing??'ease')===e?' selected':''}>${e}</option>`).join('')}</select>
    </div></div>`;
  }

  // Animation control
  if (prop === 'animation') {
    const a = parseAnimation(value);
    const PRESETS = ['none','fadeIn','fadeOut','slideUp','slideDown','slideLeft','slideRight','zoomIn','zoomOut','pulse','bounce','spin','shake','float'];
    const EZ = ['ease','linear','ease-in','ease-out','ease-in-out'];
    const ITERS = [['1','once'],['2','twice'],['3','3×'],['infinite','∞ loop']];
    return `<div class="css-prop-ctrl" ${ba} data-ctrl="animation"><div class="css-ctrl-row" style="margin-bottom:4px">
      <select class="pp-select css-anim-name" style="flex:1">${PRESETS.map(p=>`<option value="${p}"${a.name===p?' selected':''}>${p}</option>`).join('')}</select>
    </div><div class="css-ctrl-row" style="margin-bottom:4px">
      <input type="number" class="pp-input css-anim-dur" value="${a.duration}" min="0" step="0.1" style="width:55px">
      <select class="pp-select css-anim-unit" style="width:42px;padding:4px 2px"><option value="s"${a.unit==='s'?' selected':''}>s</option><option value="ms"${a.unit!=='s'?' selected':''}>ms</option></select>
      <select class="pp-select css-anim-ease" style="flex:1">${EZ.map(e=>`<option value="${e}"${a.easing===e?' selected':''}>${e}</option>`).join('')}</select>
    </div><div class="css-ctrl-row">
      <span class="css-prop-name" style="flex-shrink:0;margin-right:4px">delay</span>
      <input type="number" class="pp-input css-anim-del" value="${a.delay}" min="0" step="0.1" style="width:50px">
      <span class="css-prop-name" style="margin:0 4px;flex-shrink:0">repeat</span>
      <select class="pp-select css-anim-iter" style="flex:1">${ITERS.map(([v,l])=>`<option value="${v}"${a.iter===v?' selected':''}>${l}</option>`).join('')}</select>
    </div></div>`;
  }

  // Fall through to the existing getPropControlHtml
  return getPropControlHtml(prop, value, ri, pi);
}

// ── CSS panel event binding (nav + all control types) ─────────────────

function bindVariablesPanelEvents(cp: HTMLElement, navigateFn: () => void): void {
  const vc = cp.querySelector<HTMLElement>('#dm-css-vars-content');
  if (!vc) return;

  // Light/Dark mode tabs
  vc.querySelectorAll<HTMLElement>('.css-mode-tab').forEach(tab => {
    tab.addEventListener('click', () => { dmCssVarsDark = tab.dataset.mode === 'dark'; navigateFn(); });
  });

  // Color swatches — rAF-throttled to avoid flooding postMessage while dragging
  vc.querySelectorAll<HTMLInputElement>('.css-var-swatch, .css-var-ctrl[data-ctrl="color"]').forEach(input => {
    let rafId: number | null = null;
    input.addEventListener('input', () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const idx = parseInt(input.dataset.var ?? '-1'); const isDark = input.dataset.dark === '1';
        if (idx < 0) return;
        input.closest('.css-var-card')?.querySelectorAll<HTMLInputElement>('.css-txt-mirror').forEach(t => { t.value = input.value; });
        applyVarChange(idx, input.value, isDark);
      });
    });
  });

  // Text inputs
  vc.querySelectorAll<HTMLInputElement>('.css-var-ctrl[data-ctrl="text"]').forEach(input => {
    input.addEventListener('change', () => {
      const idx = parseInt(input.dataset.var ?? '-1'); const isDark = input.dataset.dark === '1';
      if (idx >= 0) applyVarChange(idx, input.value, isDark);
    });
  });

  // Number + unit selects
  vc.querySelectorAll<HTMLInputElement>('.css-var-ctrl[data-ctrl="number"]').forEach(input => {
    const row = input.closest('.css-ctrl-row');
    const unitSel = row?.querySelector<HTMLSelectElement>('.css-var-unit-sel');
    const isDark = input.dataset.dark === '1';
    const idx    = parseInt(input.dataset.var ?? '-1');
    const getVal = () => `${input.value}${unitSel?.value ?? 'px'}`;
    input.addEventListener('change', () => { if (idx >= 0) applyVarChange(idx, getVal(), isDark); });
    unitSel?.addEventListener('change', () => { if (idx >= 0) applyVarChange(idx, getVal(), isDark); });
  });

  // Select dropdowns (font-family, etc.)
  vc.querySelectorAll<HTMLSelectElement>('.css-var-ctrl[data-ctrl="select"]').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = parseInt(sel.dataset.var ?? '-1'); const isDark = sel.dataset.dark === '1';
      if (idx >= 0) applyVarChange(idx, sel.value, isDark);
    });
  });

  // Gradient builders
  vc.querySelectorAll<HTMLElement>('.css-grad-bld[data-var]').forEach(w => {
    const idx = parseInt(w.dataset.var ?? '-1'); const isDark = w.dataset.dark === '1';
    if (idx < 0) return;
    const rebuild = () => {
      const dir = w.querySelector<HTMLSelectElement>('.css-grad-dir')?.value ?? 'to bottom'; const stops: string[] = [];
      w.querySelectorAll<HTMLElement>('.css-stop-row').forEach(row => { const c = row.querySelector<HTMLInputElement>('.css-stop-col')?.value ?? '#000'; const p = row.querySelector<HTMLInputElement>('.css-stop-pos')?.value ?? '0'; stops.push(`${c} ${p}%`); });
      return `linear-gradient(${dir}, ${stops.join(', ')})`;
    };
    const update = () => { const val = rebuild(); const prev = w.querySelector<HTMLElement>('.css-grad-preview'); if (prev) prev.style.background = val; applyVarChange(idx, val, isDark); };
    w.querySelector('.css-grad-dir')?.addEventListener('change', update);
    w.querySelectorAll<HTMLInputElement>('.css-stop-col').forEach(c => c.addEventListener('input', update));
    w.querySelectorAll<HTMLInputElement>('.css-stop-pos').forEach((range, ri) => { range.addEventListener('input', () => { const pcts = w.querySelectorAll<HTMLElement>('.css-stop-pct'); if (pcts[ri]) pcts[ri]!.textContent = `${range.value}%`; update(); }); });
  });

  // Shadow builders (variable context)
  vc.querySelectorAll<HTMLElement>('.css-shadow-bld[data-var]').forEach(w => {
    const idx = parseInt(w.dataset.var ?? '-1'); const isDark = w.dataset.dark === '1';
    if (idx < 0) return;
    const getVal = () => `${w.querySelector<HTMLInputElement>('.css-shd-x')?.value??'0'}px ${w.querySelector<HTMLInputElement>('.css-shd-y')?.value??'0'}px ${w.querySelector<HTMLInputElement>('.css-shd-blur')?.value??'0'}px ${w.querySelector<HTMLInputElement>('.css-shd-spread')?.value??'0'}px ${w.querySelector<HTMLInputElement>('.css-shd-coltxt')?.value??'rgba(0,0,0,0.2)'}`;
    w.querySelector('.css-shd-col')?.addEventListener('input', () => { const hex = (w.querySelector<HTMLInputElement>('.css-shd-col'))!.value; const txt = w.querySelector<HTMLInputElement>('.css-shd-coltxt'); if (txt) txt.value = hex; applyVarChange(idx, getVal(), isDark); });
    w.querySelectorAll<HTMLElement>('.css-shd-coltxt,.css-shd-x,.css-shd-y,.css-shd-blur,.css-shd-spread').forEach(el => el.addEventListener('change', () => applyVarChange(idx, getVal(), isDark)));
  });

  // + Add type-specific variable buttons
  vc.querySelectorAll<HTMLElement>('[data-add-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      addVariable(btn.dataset.addType as CssVarType, undefined, undefined, btn.dataset.dark === '1');
      navigateFn();
    });
  });

  // + Add variable (generic)
  cp.querySelector<HTMLElement>('#css-add-var-btn')?.addEventListener('click', e => {
    const btn = e.currentTarget as HTMLElement;
    addVariable('other', undefined, undefined, btn.dataset.dark === '1');
    navigateFn();
  });

  // + Add dark mode
  cp.querySelector('#css-add-dark-btn')?.addEventListener('click', () => { addDarkModeToCSS(); navigateFn(); });

  // Generate palette
  cp.querySelector('#css-gen-palette-btn')?.addEventListener('click', () => {
    const primaryVar = dmCssVars.light.find(v => /primary/.test(v.name));
    if (primaryVar) {
      const hex = valueToHex(primaryVar.value);
      if (hex) { palettePreviewHex = hex; navigateFn(); }
    }
  });

  // Palette apply / dismiss
  cp.querySelector('.palette-apply')?.addEventListener('click', () => {
    if (palettePreviewHex) applyPalette(palettePreviewHex);
    navigateFn();
  });
  cp.querySelector('.palette-dismiss')?.addEventListener('click', () => { palettePreviewHex = null; navigateFn(); });

  // Design check
  cp.querySelector('#css-design-check-btn')?.addEventListener('click', () => {
    designCheckResults = checkDesignConsistency();
    navigateFn();
  });
}

/**
 * Collect the best CSS source for the active page.
 * Priority: already-loaded CSS file → <link rel="stylesheet"> in openTabs → inline <style> tags
 */
function gatherPageCss(): string {
  // 1. Already-loaded CSS file (covers "Convert to variables" path when file is open)
  if (dmCssContent.trim()) return dmCssContent;

  const page = visual.activePage;
  if (!page) return '';
  const htmlTab = state.openTabs.find(t => t.path === page.path);
  if (!htmlTab) return '';

  // 2. Linked external CSS via <link rel="stylesheet" href="...">
  const linkRe = /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi;
  let lm;
  while ((lm = linkRe.exec(htmlTab.content)) !== null) {
    const href = lm[1];
    const base = page.path.includes('/') ? page.path.slice(0, page.path.lastIndexOf('/') + 1) : '';
    const resolved = href.startsWith('/') || /^https?:/.test(href)
      ? href.replace(/^\//, '')
      : base + href;
    const cssTab = state.openTabs.find(t => t.path === resolved);
    if (cssTab?.content.trim()) return cssTab.content;
  }

  // 3. Inline <style> tags
  const styles: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let sm;
  while ((sm = styleRe.exec(htmlTab.content)) !== null) styles.push(sm[1]);
  return styles.join('\n\n');
}

async function runCssConversion(targetPath: string, navigateFn: () => void): Promise<void> {
  // Clear stale custom looks if the user switched repos since the last conversion
  const currentRepo = `${state.owner}/${state.repo}`;
  if (_customLooksRepo && _customLooksRepo !== currentRepo) _customLooks = [];
  _customLooksRepo = currentRepo;

  const sourceCss = gatherPageCss();
  const { convertCssToTheme } = await import('./css-theme-converter');

  if (!sourceCss.trim()) {
    const blank = `/* Site styles */\n\nbody {\n  font-family: system-ui, sans-serif;\n  margin: 0;\n}\n`;
    _applyConvertedCss(targetPath, blank);
    navigateFn();
    import('../ui/notifications').then(({ notify }) => notify('No CSS found — created blank style.css', 'info'));
    return;
  }

  const result = convertCssToTheme(sourceCss);

  if (result.stats.colorsReplaced === 0) {
    _applyConvertedCss(targetPath, result.convertedCss);
    navigateFn();
    import('../ui/notifications').then(({ notify }) =>
      notify('No colors found — saved CSS with empty theme block', 'info'));
    return;
  }

  // Upsert "Original" Look (prevent duplicates on repeated conversions)
  const origId = 'original-captured';
  const origLook: Look = {
    id:          origId,
    name:        'Original',
    emoji:       '◎',
    description: 'Colors captured from your imported CSS — click to revert',
    vars:        result.originalLook.vars,
  };
  const origIdx = _customLooks.findIndex(l => l.id === origId);
  if (origIdx >= 0) _customLooks[origIdx] = origLook;
  else _customLooks.unshift(origLook);

  _applyConvertedCss(targetPath, result.convertedCss);

  // Navigate to Looks tab so user immediately sees "Original" — single navigateFn call
  dmCssPanelView = 'looks';
  navigateFn();

  const { colorsReplaced, uniqueColors } = result.stats;
  import('../ui/notifications').then(({ notify }) =>
    notify(`Converted ${colorsReplaced} values (${uniqueColors} unique colors) → CSS variables. "Original" Look saved.`, 'success'));
}

/** Apply converted CSS to module state + open tab. Callers call navigateFn themselves. */
function _applyConvertedCss(path: string, css: string): void {
  dmCssPath    = path;
  dmCssContent = css;
  dmCssParsed  = parseCss(css);
  dmCssVars    = parseCssVariables(css);

  const existing = state.openTabs.find(t => t.path === path);
  if (existing) { existing.content = css; existing.dirty = true; }
  else state.openTabs.push({ path, content: css, sha: '', dirty: true, language: 'css' });

  if (!state.tree.some(t => t.path === path)) {
    state.tree.push({ path, type: 'blob', sha: '' });
  }

  coordinator.dmSetCssLive?.(css);
  visual.dirty = true;
  coordinator.updateVisualSaveBtn?.();
}

function bindCssPanelEvents(cp: HTMLElement, navigateFn: () => void): void {
  // "Create style.css" — extract & convert from page's existing CSS
  cp.querySelector<HTMLElement>('#dm-css-create-btn')?.addEventListener('click', () => {
    void runCssConversion('style.css', navigateFn);
  });

  // "Convert to theme variables" — for CSS files that exist but have no vars
  cp.querySelector<HTMLElement>('#dm-css-convert-btn')?.addEventListener('click', () => {
    if (dmCssPath) void runCssConversion(dmCssPath, navigateFn);
  });

  // Tab switching (Variables | Looks | Rules)
  cp.querySelectorAll<HTMLElement>('.css-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      dmCssPanelView = tab.dataset.tab as 'variables' | 'looks' | 'rules';
      dmCssActiveRule = null; // always return to list view when switching tabs
      navigateFn();
    });
  });

  // Looks panel events
  if (dmCssPanelView === 'looks') {
    ensureFontPairFontsLoaded();
    cp.querySelectorAll<HTMLElement>('.look-card').forEach(card => {
      card.addEventListener('click', () => {
        applyLook(card.dataset.lookId!);
        navigateFn();
      });
    });
    cp.querySelectorAll<HTMLElement>('.font-pair-card').forEach(card => {
      card.addEventListener('click', () => {
        const heading = card.dataset.heading;
        const body    = card.dataset.body;
        if (heading && body) applyFontPair(heading, body);
        navigateFn();
      });
    });
    return;
  }

  // Variables panel events (if visible)
  if (dmCssPanelView === 'variables') { bindVariablesPanelEvents(cp, navigateFn); return; }

  // Back → selector list
  cp.querySelector('#dm-css-back-btn')?.addEventListener('click', () => { dmCssActiveRule = null; navigateFn(); });

  // Rule item → drill in
  cp.querySelectorAll<HTMLElement>('.dm-css-rule-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.ruleIdx ?? '-1');
      if (idx >= 0) { dmCssActiveRule = idx; navigateFn(); }
    });
  });

  // Basic property controls
  cp.querySelectorAll<HTMLElement>('.css-prop-ctrl:not([data-ctrl="shadow"]):not([data-ctrl="gradient"]):not([data-ctrl="border"]):not([data-ctrl="transition"]):not([data-ctrl="animation"])').forEach(ctrl => {
    const ri = parseInt(ctrl.dataset.rule ?? '-1');
    const pi = parseInt(ctrl.dataset.prop ?? '-1');
    if (ri < 0 || pi < 0) return;
    const ct = ctrl.dataset.ctrl;
    if (ct === 'color') {
      ctrl.addEventListener('input', () => {
        const hex = (ctrl as HTMLInputElement).value;
        cp.querySelectorAll<HTMLInputElement>(`.css-txt-mirror[data-rule="${ri}"][data-prop="${pi}"]`).forEach(t => { t.value = hex; });
        applyCssPropChange(ri, pi, hex, cp);
      });
    } else if (ct === 'text') {
      ctrl.addEventListener('change', () => applyCssPropChange(ri, pi, (ctrl as HTMLInputElement).value, cp));
    } else if (ct === 'number') {
      const unitSel = ctrl.closest<HTMLElement>('.css-ctrl-row')?.querySelector<HTMLSelectElement>('.css-unit-sel');
      const getVal = () => `${(ctrl as HTMLInputElement).value}${unitSel?.value ?? 'px'}`;
      ctrl.addEventListener('change', () => applyCssPropChange(ri, pi, getVal(), cp));
      unitSel?.addEventListener('change', () => applyCssPropChange(ri, pi, getVal(), cp));
    } else if (ct === 'range') {
      const display = ctrl.closest<HTMLElement>('.css-ctrl-row')?.querySelector<HTMLElement>('.css-range-val');
      ctrl.addEventListener('input', () => {
        const v = (ctrl as HTMLInputElement).value;
        if (display) display.textContent = v;
        applyCssPropChange(ri, pi, v, cp);
      });
    } else if (ct === 'seg') {
      ctrl.addEventListener('click', () => {
        ctrl.closest<HTMLElement>('.css-ctrl-row')?.querySelectorAll('.css-seg').forEach(b => b.classList.remove('active'));
        ctrl.classList.add('active');
        applyCssPropChange(ri, pi, ctrl.dataset.val!, cp);
      });
    } else if (ct === 'select') {
      ctrl.addEventListener('change', () => applyCssPropChange(ri, pi, (ctrl as HTMLSelectElement).value, cp));
    }
  });

  // Shadow builder
  cp.querySelectorAll<HTMLElement>('[data-ctrl="shadow"]').forEach(w => {
    const ri = parseInt(w.dataset.rule ?? '-1'); const pi = parseInt(w.dataset.prop ?? '-1');
    if (ri < 0 || pi < 0) return;
    const isProp = (name: string) => !!(dmCssParsed[ri]?.props[pi]?.prop === name);
    const getVal = () => {
      const x = w.querySelector<HTMLInputElement>('.css-shd-x')?.value ?? '0';
      const y = w.querySelector<HTMLInputElement>('.css-shd-y')?.value ?? '0';
      const blur = w.querySelector<HTMLInputElement>('.css-shd-blur')?.value ?? '0';
      const spread = w.querySelector<HTMLInputElement>('.css-shd-spread')?.value ?? '0';
      const color = w.querySelector<HTMLInputElement>('.css-shd-coltxt')?.value ?? 'rgba(0,0,0,0.2)';
      const inset = w.querySelector<HTMLInputElement>('.css-shd-inset')?.checked ? 'inset ' : '';
      return isProp('text-shadow') ? `${inset}${x}px ${y}px ${blur}px ${color}` : `${inset}${x}px ${y}px ${blur}px ${spread}px ${color}`;
    };
    w.querySelector('.css-shd-col')?.addEventListener('input', () => {
      const hex = (w.querySelector<HTMLInputElement>('.css-shd-col'))!.value;
      const txt = w.querySelector<HTMLInputElement>('.css-shd-coltxt');
      if (txt) txt.value = hex;
      applyCssPropChange(ri, pi, getVal(), cp);
    });
    w.querySelectorAll<HTMLElement>('.css-shd-coltxt,.css-shd-x,.css-shd-y,.css-shd-blur,.css-shd-spread').forEach(el => {
      el.addEventListener('change', () => applyCssPropChange(ri, pi, getVal(), cp));
    });
    w.querySelector('.css-shd-inset')?.addEventListener('change', () => applyCssPropChange(ri, pi, getVal(), cp));
  });

  // Gradient builder
  cp.querySelectorAll<HTMLElement>('[data-ctrl="gradient"]').forEach(w => {
    const ri = parseInt(w.dataset.rule ?? '-1'); const pi = parseInt(w.dataset.prop ?? '-1');
    if (ri < 0 || pi < 0) return;
    const rebuild = () => {
      const dir = w.querySelector<HTMLSelectElement>('.css-grad-dir')?.value ?? 'to bottom';
      const stops: string[] = [];
      w.querySelectorAll<HTMLElement>('.css-stop-row').forEach(row => {
        const color = row.querySelector<HTMLInputElement>('.css-stop-col')?.value ?? '#000';
        const pos   = row.querySelector<HTMLInputElement>('.css-stop-pos')?.value ?? '0';
        stops.push(`${color} ${pos}%`);
      });
      return `linear-gradient(${dir}, ${stops.join(', ')})`;
    };
    const update = () => {
      const val = rebuild();
      const prev = w.querySelector<HTMLElement>('.css-grad-preview');
      if (prev) prev.style.background = val;
      applyCssPropChange(ri, pi, val, cp);
    };
    w.querySelector('.css-grad-dir')?.addEventListener('change', update);
    w.querySelectorAll<HTMLInputElement>('.css-stop-col').forEach(c => c.addEventListener('input', update));
    w.querySelectorAll<HTMLInputElement>('.css-stop-pos').forEach((range, idx) => {
      range.addEventListener('input', () => {
        const pcts = w.querySelectorAll<HTMLElement>('.css-stop-pct');
        if (pcts[idx]) pcts[idx]!.textContent = `${range.value}%`;
        update();
      });
    });
  });

  // Border builder
  cp.querySelectorAll<HTMLElement>('[data-ctrl="border"]').forEach(w => {
    const ri = parseInt(w.dataset.rule ?? '-1'); const pi = parseInt(w.dataset.prop ?? '-1');
    if (ri < 0 || pi < 0) return;
    const getVal = () => {
      const width = w.querySelector<HTMLInputElement>('.css-brd-w')?.value ?? '1';
      const style = w.querySelector<HTMLSelectElement>('.css-brd-s')?.value ?? 'solid';
      const color = w.querySelector<HTMLInputElement>('.css-brd-c')?.value ?? '#000';
      return `${width}px ${style} ${color}`;
    };
    w.querySelectorAll<HTMLElement>('.css-brd-w,.css-brd-s,.css-brd-c').forEach(el => {
      el.addEventListener('input', () => applyCssPropChange(ri, pi, getVal(), cp));
      el.addEventListener('change', () => applyCssPropChange(ri, pi, getVal(), cp));
    });
  });

  // Transition builder
  cp.querySelectorAll<HTMLElement>('[data-ctrl="transition"]').forEach(w => {
    const ri = parseInt(w.dataset.rule ?? '-1'); const pi = parseInt(w.dataset.prop ?? '-1');
    if (ri < 0 || pi < 0) return;
    const getVal = () => `${w.querySelector<HTMLSelectElement>('.css-tr-prop')?.value??'all'} ${w.querySelector<HTMLInputElement>('.css-tr-dur')?.value??'0.3'}${w.querySelector<HTMLSelectElement>('.css-tr-unit')?.value??'s'} ${w.querySelector<HTMLSelectElement>('.css-tr-ease')?.value??'ease'}`;
    w.querySelectorAll<HTMLElement>('.css-tr-prop,.css-tr-dur,.css-tr-unit,.css-tr-ease').forEach(el => el.addEventListener('change', () => applyCssPropChange(ri, pi, getVal(), cp)));
  });

  // Animation builder
  cp.querySelectorAll<HTMLElement>('[data-ctrl="animation"]').forEach(w => {
    const ri = parseInt(w.dataset.rule ?? '-1'); const pi = parseInt(w.dataset.prop ?? '-1');
    if (ri < 0 || pi < 0) return;
    const getVal = () => {
      const name = w.querySelector<HTMLSelectElement>('.css-anim-name')?.value ?? 'none';
      if (name === 'none') return 'none';
      const dur  = w.querySelector<HTMLInputElement>('.css-anim-dur')?.value ?? '0.5';
      const unit = w.querySelector<HTMLSelectElement>('.css-anim-unit')?.value ?? 's';
      const ease = w.querySelector<HTMLSelectElement>('.css-anim-ease')?.value ?? 'ease';
      const del  = parseFloat(w.querySelector<HTMLInputElement>('.css-anim-del')?.value ?? '0');
      const iter = w.querySelector<HTMLSelectElement>('.css-anim-iter')?.value ?? '1';
      return `${name} ${dur}${unit} ${ease}${del > 0 ? ` ${del}${unit}` : ''}${iter !== '1' ? ` ${iter}` : ''}`;
    };
    w.querySelectorAll<HTMLElement>('.css-anim-name,.css-anim-dur,.css-anim-unit,.css-anim-ease,.css-anim-del,.css-anim-iter').forEach(el => el.addEventListener('change', () => applyCssPropChange(ri, pi, getVal(), cp)));
  });

  // ── Link / Unlink buttons ────────────────────────────────────────────
  cp.querySelectorAll<HTMLElement>('.css-var-link-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ri = parseInt(btn.dataset.rule ?? '-1'); const pi = parseInt(btn.dataset.prop ?? '-1');
      if (ri < 0 || pi < 0) return;
      const rule = dmCssParsed[ri]; if (!rule) return;
      const entry = rule.props[pi]; if (!entry) return;
      const isLinked = /^var\(--/.test(entry.value.trim());

      if (isLinked) {
        // Unlink: resolve variable to its current value
        const varName = entry.value.match(/var\(--([^)]+)\)/)?.[1] ?? '';
        const variable = [...dmCssVars.light, ...dmCssVars.dark].find(v => v.name === `--${varName}`);
        applyCssPropChange(ri, pi, variable?.value ?? entry.value, cp);
        navigateFn();
      } else {
        // Link: show dropdown of matching variables
        const type = guessVarType(entry.prop, entry.value);
        const allVars = dmCssVars.light;
        const matching = allVars.filter(v => guessVarType(v.name, v.value) === type);
        const fallback = matching.length === 0 ? allVars : matching;
        if (!fallback.length) {
          addVariable(type, `--${entry.prop.split('-')[0]}`, entry.value);
          const newVar = dmCssVars.light[dmCssVars.light.length - 1];
          if (newVar) { applyCssPropChange(ri, pi, `var(${newVar.name})`, cp); navigateFn(); }
          return;
        }
        const row = btn.closest('.css-prop-row');
        if (!row) return;
        const ctrlWrapper = row.querySelector<HTMLElement>('[style*="flex:1;min-width:0"]');
        if (ctrlWrapper) {
          ctrlWrapper.innerHTML = `<div class="css-ctrl-row"><select class="pp-select css-link-sel" style="flex:1">${fallback.map(v => `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)} (${escapeHtml(v.value.slice(0, 18))})</option>`).join('')}</select><button class="pp-seg-btn css-link-ok" style="padding:4px 6px;flex-shrink:0">✓</button><button class="pp-seg-btn css-link-cancel" style="padding:4px 6px;flex-shrink:0">✕</button></div>`;
          ctrlWrapper.querySelector('.css-link-ok')?.addEventListener('click', () => {
            const sel = ctrlWrapper.querySelector<HTMLSelectElement>('.css-link-sel')?.value;
            if (sel) applyCssPropChange(ri, pi, `var(${sel})`, cp);
            navigateFn();
          });
          ctrlWrapper.querySelector('.css-link-cancel')?.addEventListener('click', () => navigateFn());
        }
      }
    });
  });
}

function applyCssPropChange(ri: number, pi: number, newVal: string, cssPanel: HTMLElement): void {
  if (ri >= dmCssParsed.length) return;
  const rule = dmCssParsed[ri];
  if (pi >= rule.props.length) return;
  const entry = rule.props[pi];
  const oldVal = entry.value;
  entry.value  = newVal;
  dmCssContent = updateCssValue(dmCssContent, rule.selector, entry.prop, oldVal, newVal);
  const dirtyEl = cssPanel.querySelector<HTMLElement>('#dm-css-dirty');
  if (dirtyEl) dirtyEl.style.display = 'inline';
  coordinator.dmSetCssLive?.(dmCssContent);
  if (dmCssTimer) clearTimeout(dmCssTimer);
  dmCssTimer = setTimeout(() => {
    if (dmCssPath) {
      const tab = state.openTabs.find(t => t.path === dmCssPath);
      if (tab) { tab.content = dmCssContent; tab.dirty = true; }
      import('../preview-sw-client').then(({ cacheFileInSW }) => cacheFileInSW(dmCssPath!, dmCssContent));
    } else if (visual.activePage) {
      visual.activePage.customCss = dmCssContent;
    }
    visual.dirty = true;
    coordinator.updateVisualSaveBtn?.();
  }, 500);
}

// ── Sidebar CSS panel ─────────────────────────────────────────────────

let _sidebarCssContainer: HTMLElement | null = null;

function _renderSidebarCss(): void {
  if (!_sidebarCssContainer) return;
  _sidebarCssContainer.innerHTML = renderDmCssPanel();
  const cp = _sidebarCssContainer.querySelector<HTMLElement>('#dm-css-panel');
  if (cp) bindCssPanelEvents(cp, _renderSidebarCss);
  // Update filename in header
  const fname = _sidebarCssContainer.closest('#panel-css')?.querySelector<HTMLElement>('#css-panel-filename');
  if (fname) {
    if (dmCssPath) fname.textContent = dmCssPath.split('/').pop() ?? dmCssPath;
    else if (dmCssContent) fname.textContent = 'Page Styles (inline)';
  }
}

export async function initSidebarCssPanel(container: HTMLElement): Promise<void> {
  _sidebarCssContainer = container;

  // Wire CSS undo restore — allows canvas.ts to call back into properties when
  // the user presses Ctrl+Z on a CSS snapshot
  import('./canvas').then(({ registerCssRestoreHandler }) => {
    registerCssRestoreHandler((restoredContent: string) => {
      dmCssContent = restoredContent;
      dmCssParsed  = parseCss(restoredContent);
      dmCssVars    = parseCssVariables(restoredContent);
      coordinator.dmSetCssLive?.(restoredContent);
      // Sync code tab or page.customCss
      if (dmCssPath) {
        const tab = state.openTabs.find(t => t.path === dmCssPath);
        if (tab) { tab.content = restoredContent; tab.dirty = true; }
        import('../preview-sw-client').then(({ cacheFileInSW }) => cacheFileInSW(dmCssPath!, restoredContent));
      } else if (visual.activePage) {
        visual.activePage.customCss = restoredContent;
        markVisualDirty();
      }
      _renderSidebarCss();
    });
  });

  // Re-sync if CSS was edited in code mode
  if (dmCssPath !== null) {
    const tab = state.openTabs.find(t => t.path === dmCssPath);
    if (tab && tab.content !== dmCssContent) {
      dmCssContent = tab.content;
      try {
        dmCssParsed = parseCss(tab.content);
        dmCssVars   = parseCssVariables(tab.content);
      } catch (e) {
        console.warn('[css-panel] Parse error after code-mode sync:', e);
      }
    }
    dmCssInitialized = true;
    _renderSidebarCss();
    return;
  }

  // Already initialized with inline CSS — just re-render (don't discard panel edits)
  // But if the user switched pages, the inline CSS belongs to a different page — re-load.
  if (dmCssInitialized && dmCssContent && dmCssPath === null) {
    if (dmCssPageId === visual.activePage?.id) {
      _renderSidebarCss();
      return;
    }
    // Page changed — reset so we fall through to first-load below
    dmCssInitialized = false;
    dmCssContent = '';
    dmCssParsed = [];
    dmCssVars = { light: [], dark: [], hasDarkMode: false, darkSelector: '' };
  }

  // First load
  const prioritized = ['css/style.css', 'style.css', 'assets/css/style.css', 'css/main.css', 'main.css'];
  let path: string | null = null; let content = '';
  const existing = state.openTabs.find(t => t.path.endsWith('.css'));
  if (existing) { path = existing.path; content = existing.content; }
  else {
    const treeFile = prioritized.map(p => state.tree.find(f => f.path === p)).find(Boolean) ?? state.tree.find(f => f.path.endsWith('.css'));
    if (treeFile) {
      try {
        const { readFile } = await import('../github');
        const file = await readFile(treeFile.path);
        state.openTabs.push({ path: treeFile.path, content: file.content, sha: file.sha, dirty: false, language: 'css' });
        path = treeFile.path; content = file.content;
      } catch { container.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--text-dim)">Could not load CSS file.</div>'; return; }
    }
  }

  // No external CSS file found — check if the page has extracted inline CSS
  if (!path) {
    const pageCss = visual.activePage?.customCss;
    if (pageCss !== undefined && pageCss.trim()) {
      content = pageCss;
      dmCssPageId = visual.activePage?.id ?? null;
    }
  }

  dmCssPath       = path;
  dmCssContent    = content;
  dmCssParsed     = content ? parseCss(content) : [];
  dmCssVars       = content ? parseCssVariables(content) : { light: [], dark: [], hasDarkMode: false, darkSelector: '' };
  // Reset navigation state for a fresh file load
  dmCssActiveRule = null;
  dmCssPanelView  = 'rules';
  dmCssVarsDark   = false;
  dmCssInitialized = true;
  _renderSidebarCss();
}

// ── Coordinator registration ───────────────────────────────────────────
// Called once from visual/index.ts init block to populate coordinator slots.

export function registerPropertiesCallbacks(): void {
  coordinator.renderProperties = renderProperties;
}

/**
 * Reset the CSS panel state so it re-initialises on next open.
 * Call after page conversion so the panel picks up freshly-extracted customCss
 * instead of returning early on the "already initialised" path.
 */
export function resetCssPanel(): void {
  dmCssInitialized = false;
  dmCssContent     = '';
  dmCssPath        = null;
  dmCssPageId      = null;
  dmCssParsed      = [];
  dmCssActiveRule  = null;
  dmCssPanelView   = 'rules';
  dmCssVarsDark    = false;
}
