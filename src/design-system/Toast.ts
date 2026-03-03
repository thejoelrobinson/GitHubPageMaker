/* ============================================================
   Living Design 3.5 — Toast / Snackbar Component
   ============================================================ */

export type ToastVariant = 'default' | 'info' | 'success' | 'warning' | 'error';
export type ToastPosition = 'top-right' | 'top-left' | 'top-center' | 'bottom-right' | 'bottom-left' | 'bottom-center';

export interface ToastOptions {
  message:    string;
  variant?:   ToastVariant;
  duration?:  number;      // ms, 0 = persistent
  position?:  ToastPosition;
  action?:    { label: string; onClick: () => void };
  onDismiss?: () => void;
}

const VARIANT_STYLES: Record<ToastVariant, { bg: string; color: string; icon?: string }> = {
  default: { bg: 'var(--ld-color-neutral-100)', color: 'var(--ld-color-white)' },
  info:    {
    bg: 'var(--ld-color-navy-100)', color: 'var(--ld-color-white)',
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M8 7v4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="5" r="0.75" fill="currentColor"/></svg>`,
  },
  success: {
    bg: 'var(--ld-color-green-100)', color: 'var(--ld-color-white)',
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M5 8.5l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  warning: {
    bg: 'var(--ld-color-orange-100)', color: 'var(--ld-color-white)',
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L14.93 14H1.07L8 1.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.5" r="0.75" fill="currentColor"/></svg>`,
  },
  error: {
    bg: 'var(--ld-color-red-100)', color: 'var(--ld-color-white)',
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  },
};

const POSITION_STYLES: Record<ToastPosition, string> = {
  'top-right':     'top: 20px; right: 20px;',
  'top-left':      'top: 20px; left: 20px;',
  'top-center':    'top: 20px; left: 50%; transform: translateX(-50%);',
  'bottom-right':  'bottom: 20px; right: 20px;',
  'bottom-left':   'bottom: 20px; left: 20px;',
  'bottom-center': 'bottom: 20px; left: 50%; transform: translateX(-50%);',
};

if (!document.getElementById('ld-toast-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-toast-styles';
  s.textContent = `
    .ld-toast-container {
      position: fixed;
      z-index: var(--ld-z-toast);
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }
    .ld-toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: var(--ld-radius-md);
      box-shadow: var(--ld-shadow-lg);
      min-width: 280px;
      max-width: 400px;
      font-family: var(--ld-primitive-font-family-sans);
      font-size: var(--ld-primitive-font-size-sm);
      font-weight: var(--ld-primitive-font-weight-medium);
      line-height: 1.4;
      animation: ld-toast-in var(--ld-duration-normal) var(--ld-easing-enter) both;
    }
    .ld-toast--out {
      animation: ld-toast-out var(--ld-duration-fast) var(--ld-easing-exit) both;
    }
    .ld-toast__icon { flex-shrink: 0; line-height: 0; }
    .ld-toast__message { flex: 1; }
    .ld-toast__action {
      flex-shrink: 0;
      background: none;
      border: none;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      font-weight: var(--ld-primitive-font-weight-bold);
      color: inherit;
      opacity: 0.8;
      padding: 0;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .ld-toast__action:hover { opacity: 1; }
    .ld-toast__dismiss {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      background: none;
      border: none;
      cursor: pointer;
      color: inherit;
      opacity: 0.6;
      padding: 0;
      line-height: 0;
    }
    .ld-toast__dismiss:hover { opacity: 1; }
    @keyframes ld-toast-in {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes ld-toast-out {
      from { opacity: 1; transform: translateY(0); }
      to   { opacity: 0; transform: translateY(-8px); }
    }
  `;
  document.head.appendChild(s);
}

// Container registry: one per position
const containers = new Map<ToastPosition, HTMLDivElement>();

function getContainer(position: ToastPosition): HTMLDivElement {
  if (containers.has(position)) return containers.get(position)!;
  const c = document.createElement('div');
  c.className = 'ld-toast-container';
  c.setAttribute('style', `position: fixed; z-index: var(--ld-z-toast); ${POSITION_STYLES[position]}`);
  document.body.appendChild(c);
  containers.set(position, c);
  return c;
}

export function showToast(opts: ToastOptions): () => void {
  const {
    message, variant = 'default', duration = 4000,
    position = 'bottom-right', action, onDismiss,
  } = opts;

  const v = VARIANT_STYLES[variant];
  const container = getContainer(position);

  const toast = document.createElement('div');
  toast.className = 'ld-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('style', `background: ${v.bg}; color: ${v.color};`);

  if (v.icon) {
    const iconEl = document.createElement('span');
    iconEl.className = 'ld-toast__icon';
    iconEl.innerHTML = v.icon;
    toast.appendChild(iconEl);
  }

  const msgEl = document.createElement('span');
  msgEl.className   = 'ld-toast__message';
  msgEl.textContent = message;
  toast.appendChild(msgEl);

  let timer: ReturnType<typeof setTimeout>;

  function removeFn() {
    clearTimeout(timer);
    toast.classList.add('ld-toast--out');
    setTimeout(() => { toast.remove(); onDismiss?.(); }, 150);
  }

  if (action) {
    const btn = document.createElement('button');
    btn.className   = 'ld-toast__action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { action.onClick(); removeFn(); });
    toast.appendChild(btn);
  }

  const dismiss = document.createElement('button');
  dismiss.className = 'ld-toast__dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1.5 1.5l11 11M12.5 1.5l-11 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;

  dismiss.addEventListener('click', removeFn);
  toast.appendChild(dismiss);
  container.appendChild(toast);

  if (duration > 0) timer = setTimeout(removeFn, duration);

  return removeFn;
}
