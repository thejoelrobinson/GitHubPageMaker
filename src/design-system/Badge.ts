/* ============================================================
   Living Design 3.5 — Badge Component
   ============================================================ */

export type BadgeVariant = 'info' | 'success' | 'warning' | 'error' | 'neutral' | 'brand';
export type BadgeSize    = 'sm' | 'md';

export interface BadgeOptions {
  label:    string;
  variant?: BadgeVariant;
  size?:    BadgeSize;
  dot?:     boolean;   // Show status dot instead of text
  removable?: boolean; // Show × button
  onRemove?: () => void;
}

const VARIANT_MAP: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
  info:    { bg: 'var(--ld-color-blue-10)',   color: 'var(--ld-color-blue-100)',   border: 'var(--ld-color-blue-20)' },
  success: { bg: 'var(--ld-color-green-10)',  color: 'var(--ld-color-green-100)',  border: 'var(--ld-color-green-20)' },
  warning: { bg: 'var(--ld-color-yellow-10)', color: 'var(--ld-color-orange-100)', border: 'var(--ld-color-yellow-20)' },
  error:   { bg: 'var(--ld-color-red-10)',    color: 'var(--ld-color-red-100)',    border: 'var(--ld-color-red-20)' },
  neutral: { bg: 'var(--ld-color-neutral-05)', color: 'var(--ld-color-neutral-80)', border: 'var(--ld-color-neutral-20)' },
  brand:   { bg: 'var(--ld-color-navy-100)',  color: 'var(--ld-color-white)',      border: 'transparent' },
};

if (!document.getElementById('ld-badge-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-badge-styles';
  s.textContent = `
    .ld-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: var(--ld-primitive-font-family-sans);
      font-weight: var(--ld-primitive-font-weight-bold);
      letter-spacing: var(--ld-primitive-letter-spacing-wide);
      text-transform: uppercase;
      border-radius: var(--ld-radius-pill);
      border: 1.5px solid;
      white-space: nowrap;
      line-height: 1;
    }
    .ld-badge--sm {
      font-size: 10px;
      padding: 2px 8px;
    }
    .ld-badge--md {
      font-size: var(--ld-primitive-font-size-xs);
      padding: 4px 10px;
    }
    .ld-badge__dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }
    .ld-badge__remove {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      border: none;
      background: none;
      cursor: pointer;
      color: inherit;
      padding: 0;
      border-radius: 50%;
      opacity: 0.7;
      transition: opacity var(--ld-transition-fast);
      flex-shrink: 0;
    }
    .ld-badge__remove:hover { opacity: 1; }
  `;
  document.head.appendChild(s);
}

export function createBadge(opts: BadgeOptions): HTMLSpanElement {
  const { label, variant = 'neutral', size = 'md', dot = false, removable = false, onRemove } = opts;
  const v = VARIANT_MAP[variant];

  const badge = document.createElement('span');
  badge.className = `ld-badge ld-badge--${size}`;
  badge.setAttribute('style',
    `background: ${v.bg}; color: ${v.color}; border-color: ${v.border};`
  );
  badge.setAttribute('role', 'status');

  if (dot) {
    const dotEl = document.createElement('span');
    dotEl.className = 'ld-badge__dot';
    badge.appendChild(dotEl);
  }

  const text = document.createElement('span');
  text.textContent = label;
  badge.appendChild(text);

  if (removable) {
    const btn = document.createElement('button');
    btn.className = 'ld-badge__remove';
    btn.setAttribute('aria-label', `Remove ${label}`);
    btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;
    if (onRemove) btn.addEventListener('click', (e) => { e.stopPropagation(); onRemove(); });
    badge.appendChild(btn);
  }

  return badge;
}
