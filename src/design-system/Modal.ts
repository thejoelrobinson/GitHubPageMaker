/* ============================================================
   Living Design 3.5 — Modal / Dialog Component
   ============================================================ */

export type ModalSize = 'sm' | 'md' | 'lg' | 'fullscreen';

export interface ModalOptions {
  title:        string;
  subtitle?:    string;
  content:      HTMLElement | string;
  size?:        ModalSize;
  closable?:    boolean;   // Show × button
  footer?:      HTMLElement;
  onClose?:     () => void;
  onOpen?:      () => void;
  closeOnBackdrop?: boolean;
  closeOnEsc?:  boolean;
}

const SIZE_MAP: Record<ModalSize, string> = {
  sm:         'max-width: 400px;',
  md:         'max-width: 560px;',
  lg:         'max-width: 800px;',
  fullscreen: 'max-width: 100%; width: 100%; height: 100%; border-radius: 0; margin: 0;',
};

if (!document.getElementById('ld-modal-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-modal-styles';
  s.textContent = `
    .ld-modal-backdrop {
      position: fixed;
      inset: 0;
      background: var(--ld-semantic-color-bg-overlay);
      z-index: var(--ld-z-modal);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      animation: ld-fade-in var(--ld-duration-normal) var(--ld-easing-enter) both;
    }
    .ld-modal {
      background: var(--ld-semantic-color-bg-primary);
      border-radius: var(--ld-radius-xl);
      box-shadow: var(--ld-shadow-xl);
      width: 100%;
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 48px);
      animation: ld-modal-in var(--ld-duration-normal) var(--ld-easing-enter) both;
      font-family: var(--ld-primitive-font-family-sans);
      overflow: hidden;
    }
    .ld-modal__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--ld-space-4);
      padding: var(--ld-space-6) var(--ld-space-6) var(--ld-space-4);
      flex-shrink: 0;
    }
    .ld-modal__title {
      font-size: var(--ld-primitive-font-size-xl);
      font-weight: var(--ld-primitive-font-weight-bold);
      color: var(--ld-semantic-color-text-primary);
      margin: 0;
      line-height: 1.3;
    }
    .ld-modal__subtitle {
      font-size: var(--ld-primitive-font-size-sm);
      color: var(--ld-semantic-color-text-secondary);
      margin: 6px 0 0;
    }
    .ld-modal__close {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      background: none;
      cursor: pointer;
      color: var(--ld-semantic-color-text-tertiary);
      border-radius: var(--ld-radius-md);
      transition: color var(--ld-transition-fast), background var(--ld-transition-fast);
      margin-top: -4px;
    }
    .ld-modal__close:hover {
      color: var(--ld-semantic-color-text-primary);
      background: var(--ld-semantic-color-bg-tertiary);
    }
    .ld-modal__close:focus-visible {
      outline: 2px solid var(--ld-semantic-color-border-focus);
      outline-offset: 2px;
    }
    .ld-modal__divider {
      border: none;
      border-top: 1px solid var(--ld-semantic-color-border-default);
      margin: 0;
      flex-shrink: 0;
    }
    .ld-modal__body {
      flex: 1;
      overflow-y: auto;
      padding: var(--ld-space-6);
      font-size: var(--ld-primitive-font-size-md);
      color: var(--ld-semantic-color-text-secondary);
      line-height: var(--ld-primitive-line-height-normal);
    }
    .ld-modal__footer {
      flex-shrink: 0;
      border-top: 1px solid var(--ld-semantic-color-border-default);
      padding: var(--ld-space-4) var(--ld-space-6);
      display: flex;
      justify-content: flex-end;
      gap: var(--ld-space-3);
    }
    @keyframes ld-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes ld-modal-in {
      from { opacity: 0; transform: translateY(12px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes ld-fade-out {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
    @keyframes ld-modal-out {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to   { opacity: 0; transform: translateY(8px) scale(0.98); }
    }
    .ld-modal-backdrop--closing {
      animation: ld-fade-out var(--ld-duration-fast) var(--ld-easing-exit) both;
    }
    .ld-modal--closing {
      animation: ld-modal-out var(--ld-duration-fast) var(--ld-easing-exit) both;
    }
  `;
  document.head.appendChild(s);
}

export interface ModalInstance {
  open:  () => void;
  close: () => void;
  backdrop: HTMLDivElement | null;
}

export function createModal(opts: ModalOptions): ModalInstance {
  const {
    title, subtitle, content, size = 'md',
    closable = true, footer, onClose, onOpen,
    closeOnBackdrop = true, closeOnEsc = true,
  } = opts;

  let backdrop: HTMLDivElement | null = null;

  function close() {
    if (!backdrop) return;
    const dialog = backdrop.querySelector('.ld-modal') as HTMLElement;
    backdrop.classList.add('ld-modal-backdrop--closing');
    dialog?.classList.add('ld-modal--closing');
    setTimeout(() => {
      backdrop?.remove();
      backdrop = null;
      onClose?.();
    }, 150);
  }

  function open() {
    if (backdrop) return;

    backdrop = document.createElement('div');
    backdrop.className = 'ld-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'ld-modal-title');

    if (closeOnBackdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
      });
    }

    const dialog = document.createElement('div');
    dialog.className = `ld-modal`;
    dialog.setAttribute('style', SIZE_MAP[size]);

    // Header
    const header = document.createElement('div');
    header.className = 'ld-modal__header';

    const titleWrap = document.createElement('div');
    const titleEl = document.createElement('h2');
    titleEl.id          = 'ld-modal-title';
    titleEl.className   = 'ld-modal__title';
    titleEl.textContent = title;
    titleWrap.appendChild(titleEl);

    if (subtitle) {
      const sub = document.createElement('p');
      sub.className   = 'ld-modal__subtitle';
      sub.textContent = subtitle;
      titleWrap.appendChild(sub);
    }
    header.appendChild(titleWrap);

    if (closable) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'ld-modal__close';
      closeBtn.setAttribute('aria-label', 'Close dialog');
      closeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
      </svg>`;
      closeBtn.addEventListener('click', close);
      header.appendChild(closeBtn);
    }
    dialog.appendChild(header);

    const hr = document.createElement('hr');
    hr.className = 'ld-modal__divider';
    dialog.appendChild(hr);

    // Body
    const body = document.createElement('div');
    body.className = 'ld-modal__body';
    if (typeof content === 'string') {
      body.textContent = content;
    } else {
      body.appendChild(content);
    }
    dialog.appendChild(body);

    // Footer
    if (footer) {
      const footerWrap = document.createElement('div');
      footerWrap.className = 'ld-modal__footer';
      footerWrap.appendChild(footer);
      dialog.appendChild(footerWrap);
    }

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    // Focus trap
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable[0]?.focus();

    // Esc to close
    if (closeOnEsc) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', handler); }
      };
      document.addEventListener('keydown', handler);
    }

    onOpen?.();
  }

  return { open, close, get backdrop() { return backdrop; } };
}
