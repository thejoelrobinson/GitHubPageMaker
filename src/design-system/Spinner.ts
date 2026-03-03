/* ============================================================
   Living Design 3.5 — Spinner / Loading Indicator
   ============================================================ */

export type SpinnerSize    = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type SpinnerVariant = 'default' | 'inverse' | 'brand';

export interface SpinnerOptions {
  size?:    SpinnerSize;
  variant?: SpinnerVariant;
  label?:   string;   // Accessible label (default: "Loading…")
}

const SIZE_MAP: Record<SpinnerSize, number> = {
  xs: 16, sm: 20, md: 28, lg: 40, xl: 56,
};

const COLOR_MAP: Record<SpinnerVariant, string> = {
  default: 'var(--ld-semantic-color-action-primary)',
  inverse: 'var(--ld-color-white)',
  brand:   'var(--ld-color-yellow-100)',
};

if (!document.getElementById('ld-spinner-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-spinner-styles';
  s.textContent = `
    @keyframes ld-spin {
      to { transform: rotate(360deg); }
    }
    .ld-spinner {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-family: var(--ld-primitive-font-family-sans);
    }
    .ld-spinner__svg {
      animation: ld-spin 0.65s linear infinite;
      flex-shrink: 0;
    }
    .ld-spinner__label {
      font-size: var(--ld-primitive-font-size-sm);
      color: var(--ld-semantic-color-text-secondary);
    }
  `;
  document.head.appendChild(s);
}

export function createSpinner(opts: SpinnerOptions = {}): HTMLSpanElement {
  const { size = 'md', variant = 'default', label = 'Loading…' } = opts;
  const px     = SIZE_MAP[size];
  const color  = COLOR_MAP[variant];
  const stroke = px <= 20 ? 2 : px <= 32 ? 2.5 : 3;
  const r      = (px / 2) - stroke * 1.5;
  const circ   = 2 * Math.PI * r;

  const wrapper = document.createElement('span');
  wrapper.className = 'ld-spinner';
  wrapper.setAttribute('role', 'status');
  wrapper.setAttribute('aria-label', label);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width',  String(px));
  svg.setAttribute('height', String(px));
  svg.setAttribute('viewBox', `0 0 ${px} ${px}`);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ld-spinner__svg');

  // Track
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('cx', String(px / 2));
  track.setAttribute('cy', String(px / 2));
  track.setAttribute('r',  String(r));
  track.setAttribute('stroke', color);
  track.setAttribute('stroke-width', String(stroke));
  track.setAttribute('opacity', '0.2');
  svg.appendChild(track);

  // Arc
  const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  arc.setAttribute('cx', String(px / 2));
  arc.setAttribute('cy', String(px / 2));
  arc.setAttribute('r',  String(r));
  arc.setAttribute('stroke', color);
  arc.setAttribute('stroke-width', String(stroke));
  arc.setAttribute('stroke-dasharray', `${circ * 0.7} ${circ * 0.3}`);
  arc.setAttribute('stroke-linecap', 'round');
  svg.appendChild(arc);

  wrapper.appendChild(svg);

  if (label && size !== 'xs') {
    // sr-only span so label is never visible (already accessible via aria-label)
    const srOnly = document.createElement('span');
    srOnly.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
    srOnly.textContent = label;
    wrapper.appendChild(srOnly);
  }

  return wrapper;
}

/* Convenience: full-page overlay loader */
export interface OverlayOptions {
  label?: string;
  blur?:  boolean;
}

export function showOverlay(opts: OverlayOptions = {}): () => void {
  const { label = 'Loading…', blur = false } = opts;

  const overlay = document.createElement('div');
  overlay.setAttribute('style', `
    position: fixed; inset: 0;
    background: rgba(255,255,255,0.7);
    ${blur ? 'backdrop-filter: blur(4px);' : ''}
    display: flex; align-items: center; justify-content: center;
    z-index: var(--ld-z-overlay);
  `);
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');

  const spinner = createSpinner({ size: 'xl', label });
  overlay.appendChild(spinner);
  document.body.appendChild(overlay);

  return () => overlay.remove();
}
