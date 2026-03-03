/* ============================================================
   Living Design 3.5 — Button Component
   ============================================================ */

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghost';
export type ButtonSize    = 'sm' | 'md' | 'lg';

export interface ButtonOptions {
  label:     string;
  variant?:  ButtonVariant;
  size?:     ButtonSize;
  disabled?: boolean;
  loading?:  boolean;
  icon?:     string;       // SVG string prepended before label
  iconEnd?:  string;       // SVG string appended after label
  fullWidth?: boolean;
  type?:     'button' | 'submit' | 'reset';
  onClick?:  (e: MouseEvent) => void;
}

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'padding: 6px 12px; font-size: var(--ld-primitive-font-size-sm); gap: 4px; min-height: 32px;',
  md: 'padding: 10px 20px; font-size: var(--ld-primitive-font-size-md); gap: 6px; min-height: 40px;',
  lg: 'padding: 14px 28px; font-size: var(--ld-primitive-font-size-lg); gap: 8px; min-height: 52px;',
};

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'background: var(--ld-semantic-color-action-primary); color: var(--ld-color-white); border: 2px solid transparent;',
  secondary:
    'background: transparent; color: var(--ld-semantic-color-action-primary); border: 2px solid var(--ld-semantic-color-action-primary);',
  tertiary:
    'background: transparent; color: var(--ld-semantic-color-action-primary); border: 2px solid transparent;',
  danger:
    'background: var(--ld-semantic-color-action-danger); color: var(--ld-color-white); border: 2px solid transparent;',
  ghost:
    'background: transparent; color: var(--ld-semantic-color-text-primary); border: 2px solid var(--ld-semantic-color-border-default);',
};

// Only the background value — applied via btn.style.background to avoid
// clobbering unrelated inline styles set by the caller.
const HOVER_BG: Record<ButtonVariant, string> = {
  primary:   'var(--ld-semantic-color-action-primary-hover)',
  secondary: 'var(--ld-semantic-color-action-secondary-hover)',
  tertiary:  'var(--ld-semantic-color-action-secondary-hover)',
  danger:    'var(--ld-semantic-color-action-danger-hover)',
  ghost:     'var(--ld-semantic-color-bg-secondary)',
};

const SPINNER_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
  style="animation: ld-spin 0.7s linear infinite; flex-shrink: 0;">
  <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-dasharray="28" stroke-dashoffset="10"/>
</svg>`;

if (!document.getElementById('ld-button-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-button-styles';
  s.textContent = `
    @keyframes ld-spin {
      to { transform: rotate(360deg); }
    }
    .ld-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: var(--ld-primitive-font-family-sans);
      font-weight: var(--ld-primitive-font-weight-bold);
      letter-spacing: 0.01em;
      border-radius: var(--ld-radius-pill);
      cursor: pointer;
      text-decoration: none;
      transition: background var(--ld-transition-fast), color var(--ld-transition-fast),
                  border-color var(--ld-transition-fast), box-shadow var(--ld-transition-fast),
                  transform var(--ld-transition-fast);
      user-select: none;
      white-space: nowrap;
      vertical-align: middle;
      line-height: 1;
    }
    .ld-btn:focus-visible {
      outline: 2px solid var(--ld-semantic-color-border-focus);
      outline-offset: 2px;
    }
    .ld-btn:active:not(:disabled) {
      transform: scale(0.98);
    }
    .ld-btn:disabled,
    .ld-btn[aria-disabled="true"] {
      background: var(--ld-semantic-color-action-disabled-bg) !important;
      color: var(--ld-semantic-color-action-disabled-text) !important;
      border-color: transparent !important;
      cursor: not-allowed;
      pointer-events: none;
    }
    .ld-btn--full { width: 100%; }
    .ld-btn svg { flex-shrink: 0; }
  `;
  document.head.appendChild(s);
}

export function createButton(opts: ButtonOptions): HTMLButtonElement {
  const {
    label, variant = 'primary', size = 'md', disabled = false,
    loading = false, icon, iconEnd, fullWidth = false,
    type = 'button', onClick,
  } = opts;

  const btn = document.createElement('button');
  btn.type = type;
  btn.className = `ld-btn${fullWidth ? ' ld-btn--full' : ''}`;
  btn.disabled   = disabled || loading;
  btn.setAttribute('aria-disabled', String(disabled || loading));
  btn.setAttribute('aria-busy', String(loading));

  btn.setAttribute('style', SIZE_STYLES[size] + VARIANT_STYLES[variant]);
  // Capture base background after setAttribute so we can restore it precisely.
  const baseBg = btn.style.background;

  btn.innerHTML = [
    loading ? SPINNER_SVG : (icon ?? ''),
    `<span>${label}</span>`,
    iconEnd ?? '',
  ].join('');

  // Hover: only mutate background so caller-applied inline styles are preserved.
  btn.addEventListener('mouseenter', () => {
    if (!btn.disabled) btn.style.background = HOVER_BG[variant];
  });
  btn.addEventListener('mouseleave', () => {
    if (!btn.disabled) btn.style.background = baseBg;
  });

  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}
