/* ============================================================
   Living Design 3.5 — Divider Component
   ============================================================ */

export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerVariant     = 'default' | 'strong' | 'subtle';

export interface DividerOptions {
  orientation?: DividerOrientation;
  variant?:     DividerVariant;
  label?:       string;   // Inline label (e.g. "or")
  spacing?:     'sm' | 'md' | 'lg';
}

const COLOR_MAP: Record<DividerVariant, string> = {
  default: 'var(--ld-semantic-color-border-default)',
  strong:  'var(--ld-semantic-color-border-strong)',
  subtle:  'var(--ld-color-neutral-10)',
};

if (!document.getElementById('ld-divider-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-divider-styles';
  s.textContent = `
    .ld-divider {
      border: none;
      flex-shrink: 0;
    }
    .ld-divider--horizontal {
      width: 100%;
      border-top-width: 1px;
      border-top-style: solid;
    }
    .ld-divider--vertical {
      height: 100%;
      align-self: stretch;
      border-left-width: 1px;
      border-left-style: solid;
    }
    /* Label variant */
    .ld-divider-labeled {
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: var(--ld-primitive-font-family-sans);
    }
    .ld-divider-labeled__line {
      flex: 1;
      border: none;
      border-top: 1px solid;
    }
    .ld-divider-labeled__text {
      font-size: var(--ld-primitive-font-size-sm);
      color: var(--ld-semantic-color-text-tertiary);
      white-space: nowrap;
    }
  `;
  document.head.appendChild(s);
}

const SPACING_MAP = { sm: '8px', md: '16px', lg: '24px' } as const;

export function createDivider(opts: DividerOptions = {}): HTMLElement {
  const { orientation = 'horizontal', variant = 'default', label, spacing = 'md' } = opts;
  const color = COLOR_MAP[variant];
  const sp    = SPACING_MAP[spacing];

  if (label && orientation === 'horizontal') {
    const wrapper = document.createElement('div');
    wrapper.className = 'ld-divider-labeled';
    wrapper.setAttribute('style', `margin: ${sp} 0;`);
    wrapper.setAttribute('role', 'separator');

    const lineL = document.createElement('span');
    lineL.className = 'ld-divider-labeled__line';
    lineL.setAttribute('style', `border-color: ${color};`);

    const text = document.createElement('span');
    text.className   = 'ld-divider-labeled__text';
    text.textContent = label;

    const lineR = lineL.cloneNode() as HTMLSpanElement;

    wrapper.appendChild(lineL);
    wrapper.appendChild(text);
    wrapper.appendChild(lineR);
    return wrapper;
  }

  const hr = document.createElement('hr');
  hr.className = `ld-divider ld-divider--${orientation}`;
  hr.setAttribute('style', `border-color: ${color}; margin: ${orientation === 'horizontal' ? `${sp} 0` : `0 ${sp}`};`);
  return hr;
}
