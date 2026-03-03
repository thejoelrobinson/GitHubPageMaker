/* ============================================================
   Living Design 3.5 — Tabs Component
   ============================================================ */

export type TabsVariant = 'underline' | 'pill' | 'bordered';

export interface Tab {
  id:       string;
  label:    string;
  content:  HTMLElement | string;
  disabled?: boolean;
  badge?:   string;  // e.g. "3" for a count badge
}

export interface TabsOptions {
  tabs:       Tab[];
  activeId?:  string;
  variant?:   TabsVariant;
  onChange?:  (id: string) => void;
  fullWidth?: boolean;
}

if (!document.getElementById('ld-tabs-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-tabs-styles';
  s.textContent = `
    .ld-tabs {
      font-family: var(--ld-primitive-font-family-sans);
      display: flex;
      flex-direction: column;
    }
    .ld-tabs__list {
      display: flex;
      list-style: none;
      margin: 0;
      padding: 0;
      gap: 0;
    }
    .ld-tabs__list--full .ld-tabs__tab { flex: 1; justify-content: center; }

    /* Underline variant */
    .ld-tabs--underline .ld-tabs__list {
      border-bottom: 2px solid var(--ld-semantic-color-border-default);
    }
    .ld-tabs--underline .ld-tabs__tab {
      padding: 10px 16px;
      margin-bottom: -2px;
      border-bottom: 2px solid transparent;
      border-radius: 0;
    }
    .ld-tabs--underline .ld-tabs__tab--active {
      color: var(--ld-semantic-color-action-primary);
      border-bottom-color: var(--ld-semantic-color-action-primary);
    }

    /* Pill variant */
    .ld-tabs--pill .ld-tabs__list {
      background: var(--ld-semantic-color-bg-secondary);
      border-radius: var(--ld-radius-pill);
      padding: 4px;
      gap: 2px;
    }
    .ld-tabs--pill .ld-tabs__tab {
      padding: 8px 18px;
      border-radius: var(--ld-radius-pill);
    }
    .ld-tabs--pill .ld-tabs__tab--active {
      background: var(--ld-semantic-color-bg-primary);
      box-shadow: var(--ld-shadow-sm);
      color: var(--ld-semantic-color-text-primary);
    }

    /* Bordered variant */
    .ld-tabs--bordered .ld-tabs__list {
      gap: 4px;
    }
    .ld-tabs--bordered .ld-tabs__tab {
      padding: 10px 18px;
      border: 1.5px solid var(--ld-semantic-color-border-default);
      border-radius: var(--ld-radius-md) var(--ld-radius-md) 0 0;
      margin-bottom: -1px;
      border-bottom-color: transparent;
    }
    .ld-tabs--bordered .ld-tabs__tab--active {
      background: var(--ld-semantic-color-bg-primary);
      border-color: var(--ld-semantic-color-border-default);
      border-bottom-color: var(--ld-semantic-color-bg-primary);
      color: var(--ld-semantic-color-action-primary);
    }

    /* Shared tab button */
    .ld-tabs__tab {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: none;
      border: none;
      cursor: pointer;
      font-family: var(--ld-primitive-font-family-sans);
      font-size: var(--ld-primitive-font-size-md);
      font-weight: var(--ld-primitive-font-weight-medium);
      color: var(--ld-semantic-color-text-secondary);
      white-space: nowrap;
      transition: color var(--ld-transition-fast), background var(--ld-transition-fast);
    }
    .ld-tabs__tab:hover:not(:disabled):not(.ld-tabs__tab--active) {
      color: var(--ld-semantic-color-text-primary);
    }
    .ld-tabs__tab:focus-visible {
      outline: 2px solid var(--ld-semantic-color-border-focus);
      outline-offset: 2px;
      border-radius: var(--ld-radius-sm);
    }
    .ld-tabs__tab:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .ld-tabs__badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      background: var(--ld-color-neutral-20);
      color: var(--ld-semantic-color-text-secondary);
      border-radius: var(--ld-radius-pill);
      font-size: 11px;
      font-weight: var(--ld-primitive-font-weight-bold);
    }
    .ld-tabs__tab--active .ld-tabs__badge {
      background: var(--ld-color-blue-20);
      color: var(--ld-color-blue-100);
    }
    .ld-tabs__panel {
      display: none;
      padding: 20px 0;
    }
    .ld-tabs__panel--active { display: block; }
  `;
  document.head.appendChild(s);
}

export interface TabsInstance {
  root:    HTMLDivElement;
  setTab:  (id: string) => void;
  getTab:  () => string;
}

export function createTabs(opts: TabsOptions): TabsInstance {
  const { tabs, activeId, variant = 'underline', onChange, fullWidth = false } = opts;

  let currentId = activeId ?? tabs[0]?.id;

  const root = document.createElement('div');
  root.className = `ld-tabs ld-tabs--${variant}`;

  const list = document.createElement('ul');
  list.className = `ld-tabs__list${fullWidth ? ' ld-tabs__list--full' : ''}`;
  list.setAttribute('role', 'tablist');

  const panels: HTMLDivElement[] = [];
  const buttons: HTMLButtonElement[] = [];

  function activate(id: string) {
    currentId = id;
    buttons.forEach(b => {
      const active = b.dataset.id === id;
      b.classList.toggle('ld-tabs__tab--active', active);
      b.setAttribute('aria-selected', String(active));
      b.setAttribute('tabindex', active ? '0' : '-1');
    });
    panels.forEach(p => {
      p.classList.toggle('ld-tabs__panel--active', p.dataset.id === id);
      p.hidden = p.dataset.id !== id;
    });
    onChange?.(id);
  }

  tabs.forEach(tab => {
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');

    const btn = document.createElement('button');
    btn.id            = `ld-tab-${tab.id}`;
    btn.className     = `ld-tabs__tab${tab.id === currentId ? ' ld-tabs__tab--active' : ''}`;
    btn.dataset.id    = tab.id;
    btn.disabled      = !!tab.disabled;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `ld-panel-${tab.id}`);
    btn.setAttribute('aria-selected',  String(tab.id === currentId));
    btn.setAttribute('tabindex',       tab.id === currentId ? '0' : '-1');

    btn.textContent = tab.label;

    if (tab.badge) {
      const badge = document.createElement('span');
      badge.className   = 'ld-tabs__badge';
      badge.textContent = tab.badge;
      btn.appendChild(badge);
    }

    btn.addEventListener('click', () => activate(tab.id));
    btn.addEventListener('keydown', (e) => {
      const visibleTabs = tabs.filter(t => !t.disabled);
      const idx = visibleTabs.findIndex(t => t.id === tab.id);
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        activate(visibleTabs[(idx + 1) % visibleTabs.length].id);
        buttons.find(b => b.dataset.id === currentId)?.focus();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        activate(visibleTabs[(idx - 1 + visibleTabs.length) % visibleTabs.length].id);
        buttons.find(b => b.dataset.id === currentId)?.focus();
      }
    });

    buttons.push(btn);
    li.appendChild(btn);
    list.appendChild(li);

    const panel = document.createElement('div');
    panel.id          = `ld-panel-${tab.id}`;
    panel.className   = `ld-tabs__panel${tab.id === currentId ? ' ld-tabs__panel--active' : ''}`;
    panel.dataset.id  = tab.id;
    panel.hidden      = tab.id !== currentId;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `ld-tab-${tab.id}`);
    if (typeof tab.content === 'string') {
      panel.textContent = tab.content;
    } else {
      panel.appendChild(tab.content);
    }
    panels.push(panel);
  });

  root.appendChild(list);
  panels.forEach(p => root.appendChild(p));

  return {
    root,
    setTab: activate,
    getTab: () => currentId,
  };
}
