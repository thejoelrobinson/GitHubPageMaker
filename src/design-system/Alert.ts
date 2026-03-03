/* ============================================================
   Living Design 3.5 — Alert / Banner Component
   ============================================================ */

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertOptions {
  title?:      string;
  message:     string;
  variant?:    AlertVariant;
  dismissible?: boolean;
  onDismiss?:  () => void;
  action?:     { label: string; onClick: () => void };
}

const ICONS: Record<AlertVariant, string> = {
  info: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/>
    <path d="M10 9v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="10" cy="6.5" r="1" fill="currentColor"/>
  </svg>`,
  success: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/>
    <path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  warning: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M10 2L18.66 17H1.34L10 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M10 8v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="10" cy="14.5" r="0.75" fill="currentColor"/>
  </svg>`,
  error: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/>
    <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,
};

const VARIANT_STYLES: Record<AlertVariant, { bg: string; border: string; color: string }> = {
  info:    { bg: 'var(--ld-color-blue-10)',   border: 'var(--ld-color-blue-40)',   color: 'var(--ld-color-blue-100)' },
  success: { bg: 'var(--ld-color-green-10)',  border: 'var(--ld-color-green-20)',  color: 'var(--ld-color-green-100)' },
  warning: { bg: 'var(--ld-color-yellow-10)', border: 'var(--ld-color-yellow-20)', color: 'var(--ld-color-orange-100)' },
  error:   { bg: 'var(--ld-color-red-10)',    border: 'var(--ld-color-red-20)',    color: 'var(--ld-color-red-100)' },
};

if (!document.getElementById('ld-alert-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-alert-styles';
  s.textContent = `
    .ld-alert {
      display: flex;
      gap: 12px;
      padding: 14px 16px;
      border-radius: var(--ld-radius-md);
      border: 1.5px solid;
      font-family: var(--ld-primitive-font-family-sans);
    }
    .ld-alert__icon {
      flex-shrink: 0;
      margin-top: 1px;
    }
    .ld-alert__body {
      flex: 1;
      min-width: 0;
    }
    .ld-alert__title {
      font-size: var(--ld-primitive-font-size-md);
      font-weight: var(--ld-primitive-font-weight-bold);
      color: var(--ld-semantic-color-text-primary);
      margin: 0 0 4px;
      line-height: 1.4;
    }
    .ld-alert__message {
      font-size: var(--ld-primitive-font-size-sm);
      color: var(--ld-semantic-color-text-secondary);
      margin: 0;
      line-height: 1.5;
    }
    .ld-alert__action {
      display: inline-block;
      margin-top: 10px;
      font-size: var(--ld-primitive-font-size-sm);
      font-weight: var(--ld-primitive-font-weight-bold);
      color: inherit;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .ld-alert__dismiss {
      flex-shrink: 0;
      display: flex;
      align-items: flex-start;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--ld-semantic-color-text-tertiary);
      padding: 2px;
      border-radius: var(--ld-radius-sm);
      transition: color var(--ld-transition-fast), background var(--ld-transition-fast);
      line-height: 0;
    }
    .ld-alert__dismiss:hover {
      color: var(--ld-semantic-color-text-primary);
      background: rgba(0, 0, 0, 0.05);
    }
  `;
  document.head.appendChild(s);
}

export function createAlert(opts: AlertOptions): HTMLDivElement {
  const { title, message, variant = 'info', dismissible = false, onDismiss, action } = opts;
  const v = VARIANT_STYLES[variant];

  const alert = document.createElement('div');
  alert.className = `ld-alert`;
  alert.setAttribute('role', variant === 'error' ? 'alert' : 'status');
  alert.setAttribute('style',
    `background: ${v.bg}; border-color: ${v.border}; color: ${v.color};`
  );

  // Icon
  const iconWrap = document.createElement('span');
  iconWrap.className = 'ld-alert__icon';
  iconWrap.innerHTML = ICONS[variant];
  alert.appendChild(iconWrap);

  // Body
  const body = document.createElement('div');
  body.className = 'ld-alert__body';

  if (title) {
    const titleEl = document.createElement('p');
    titleEl.className   = 'ld-alert__title';
    titleEl.textContent = title;
    body.appendChild(titleEl);
  }

  const msgEl = document.createElement('p');
  msgEl.className   = 'ld-alert__message';
  msgEl.textContent = message;
  body.appendChild(msgEl);

  if (action) {
    const btn = document.createElement('button');
    btn.className   = 'ld-alert__action';
    btn.textContent = action.label;
    btn.addEventListener('click', action.onClick);
    body.appendChild(btn);
  }

  alert.appendChild(body);

  // Dismiss
  if (dismissible) {
    const dismiss = document.createElement('button');
    dismiss.className = 'ld-alert__dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;
    dismiss.addEventListener('click', () => {
      alert.remove();
      onDismiss?.();
    });
    alert.appendChild(dismiss);
  }

  return alert;
}
