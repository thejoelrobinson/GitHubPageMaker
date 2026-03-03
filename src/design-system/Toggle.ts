/* ============================================================
   Living Design 3.5 — Toggle / Switch Component
   ============================================================ */

import { uid } from '../utils';

export interface ToggleOptions {
  id?:          string;
  label:        string;
  description?: string;
  checked?:     boolean;
  disabled?:    boolean;
  labelPosition?: 'left' | 'right';
  onChange?:    (checked: boolean) => void;
}

if (!document.getElementById('ld-toggle-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-toggle-styles';
  s.textContent = `
    .ld-toggle {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      font-family: var(--ld-primitive-font-family-sans);
      user-select: none;
    }
    .ld-toggle--label-left { flex-direction: row-reverse; }
    .ld-toggle--disabled   { cursor: not-allowed; opacity: 0.5; }
    .ld-toggle__input {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }
    .ld-toggle__track {
      flex-shrink: 0;
      position: relative;
      width: 44px;
      height: 24px;
      border-radius: var(--ld-radius-pill);
      background: var(--ld-color-neutral-40);
      transition: background var(--ld-transition-fast);
    }
    .ld-toggle__thumb {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: white;
      box-shadow: var(--ld-shadow-sm);
      transition: transform var(--ld-transition-fast), box-shadow var(--ld-transition-fast);
    }
    /* Checked */
    .ld-toggle__input:checked ~ .ld-toggle__track {
      background: var(--ld-semantic-color-action-primary);
    }
    .ld-toggle__input:checked ~ .ld-toggle__track .ld-toggle__thumb {
      transform: translateX(20px);
    }
    /* Focus */
    .ld-toggle__input:focus-visible ~ .ld-toggle__track {
      box-shadow: 0 0 0 3px rgba(0, 113, 206, 0.25);
    }
    /* Hover */
    .ld-toggle:not(.ld-toggle--disabled):hover .ld-toggle__track {
      filter: brightness(0.9);
    }
    .ld-toggle__text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .ld-toggle__label {
      font-size: var(--ld-primitive-font-size-md);
      font-weight: var(--ld-primitive-font-weight-medium);
      color: var(--ld-semantic-color-text-primary);
      line-height: 1.5;
    }
    .ld-toggle__description {
      font-size: var(--ld-primitive-font-size-sm);
      color: var(--ld-semantic-color-text-secondary);
      line-height: 1.4;
    }
  `;
  document.head.appendChild(s);
}

export interface ToggleResult {
  root:    HTMLLabelElement;
  input:   HTMLInputElement;
  setChecked: (v: boolean) => void;
}

export function createToggle(opts: ToggleOptions): ToggleResult {
  const {
    id = `ld-toggle-${uid()}`,
    label, description, checked = false, disabled = false,
    labelPosition = 'right', onChange,
  } = opts;

  const wrapper = document.createElement('label');
  wrapper.htmlFor   = id;
  wrapper.className = [
    'ld-toggle',
    labelPosition === 'left' ? 'ld-toggle--label-left' : '',
    disabled ? 'ld-toggle--disabled' : '',
  ].filter(Boolean).join(' ');

  const input = document.createElement('input');
  input.type      = 'checkbox';
  input.id        = id;
  input.role      = 'switch';
  input.className = 'ld-toggle__input';
  input.checked   = checked;
  input.disabled  = disabled;
  input.setAttribute('aria-checked', String(checked));

  const track = document.createElement('span');
  track.className = 'ld-toggle__track';
  const thumb = document.createElement('span');
  thumb.className = 'ld-toggle__thumb';
  track.appendChild(thumb);

  const textWrap = document.createElement('span');
  textWrap.className = 'ld-toggle__text';

  const labelEl = document.createElement('span');
  labelEl.className   = 'ld-toggle__label';
  labelEl.textContent = label;
  textWrap.appendChild(labelEl);

  if (description) {
    const desc = document.createElement('span');
    desc.className   = 'ld-toggle__description';
    desc.textContent = description;
    textWrap.appendChild(desc);
  }

  input.addEventListener('change', () => {
    input.setAttribute('aria-checked', String(input.checked));
    onChange?.(input.checked);
  });

  wrapper.appendChild(input);
  wrapper.appendChild(track);
  wrapper.appendChild(textWrap);

  return {
    root: wrapper,
    input,
    setChecked: (v) => {
      input.checked = v;
      input.setAttribute('aria-checked', String(v));
    },
  };
}
