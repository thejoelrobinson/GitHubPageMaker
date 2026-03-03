/* ============================================================
   Living Design 3.5 — Checkbox Component
   ============================================================ */

import { uid } from '../utils';

export type CheckboxState = 'unchecked' | 'checked' | 'indeterminate';

export interface CheckboxOptions {
  id?:           string;
  label:         string;
  description?:  string;
  checked?:      boolean;
  indeterminate?: boolean;
  disabled?:     boolean;
  name?:         string;
  value?:        string;
  onChange?:     (checked: boolean) => void;
}

if (!document.getElementById('ld-checkbox-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-checkbox-styles';
  s.textContent = `
    .ld-checkbox {
      display: inline-flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
      font-family: var(--ld-primitive-font-family-sans);
      user-select: none;
    }
    .ld-checkbox--disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .ld-checkbox__input {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
      pointer-events: none;
    }
    .ld-checkbox__box {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      border-radius: var(--ld-radius-sm);
      border: 2px solid var(--ld-semantic-color-border-default);
      background: var(--ld-semantic-color-bg-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 1px;
      transition:
        border-color var(--ld-transition-fast),
        background var(--ld-transition-fast),
        box-shadow var(--ld-transition-fast);
    }
    .ld-checkbox__box svg {
      opacity: 0;
      transition: opacity var(--ld-transition-fast);
    }
    /* Checked state */
    .ld-checkbox__input:checked ~ .ld-checkbox__box {
      background: var(--ld-semantic-color-action-primary);
      border-color: var(--ld-semantic-color-action-primary);
    }
    .ld-checkbox__input:checked ~ .ld-checkbox__box svg { opacity: 1; }
    /* Indeterminate state */
    .ld-checkbox__input:indeterminate ~ .ld-checkbox__box {
      background: var(--ld-semantic-color-action-primary);
      border-color: var(--ld-semantic-color-action-primary);
    }
    .ld-checkbox__input:indeterminate ~ .ld-checkbox__box svg { opacity: 1; }
    /* Focus */
    .ld-checkbox__input:focus-visible ~ .ld-checkbox__box {
      box-shadow: 0 0 0 3px rgba(0, 113, 206, 0.25);
      border-color: var(--ld-semantic-color-border-focus);
    }
    /* Hover (label hover) */
    .ld-checkbox:not(.ld-checkbox--disabled):hover .ld-checkbox__box {
      border-color: var(--ld-semantic-color-action-primary);
    }
    .ld-checkbox__text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .ld-checkbox__label {
      font-size: var(--ld-primitive-font-size-md);
      font-weight: var(--ld-primitive-font-weight-medium);
      color: var(--ld-semantic-color-text-primary);
      line-height: 1.5;
    }
    .ld-checkbox__description {
      font-size: var(--ld-primitive-font-size-sm);
      color: var(--ld-semantic-color-text-secondary);
      line-height: 1.4;
    }
  `;
  document.head.appendChild(s);
}

const CHECK_ICON = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
  <path d="M2 6l3.5 3.5L10 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const INDETERMINATE_ICON = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
  <path d="M2.5 6h7" stroke="white" stroke-width="2" stroke-linecap="round"/>
</svg>`;

export interface CheckboxResult {
  root:  HTMLLabelElement;
  input: HTMLInputElement;
  setChecked: (v: boolean) => void;
  setIndeterminate: (v: boolean) => void;
}

export function createCheckbox(opts: CheckboxOptions): CheckboxResult {
  const {
    id = `ld-cb-${uid()}`,
    label, description, checked = false, indeterminate = false,
    disabled = false, name, value, onChange,
  } = opts;

  const wrapper = document.createElement('label');
  wrapper.htmlFor   = id;
  wrapper.className = `ld-checkbox${disabled ? ' ld-checkbox--disabled' : ''}`;

  const input = document.createElement('input');
  input.type          = 'checkbox';
  input.id            = id;
  input.className     = 'ld-checkbox__input';
  input.checked       = checked;
  input.indeterminate = indeterminate;
  input.disabled      = disabled;
  if (name)  input.name  = name;
  if (value) input.value = value;

  const box = document.createElement('span');
  box.className = 'ld-checkbox__box';
  box.innerHTML = indeterminate ? INDETERMINATE_ICON : CHECK_ICON;

  const textWrap = document.createElement('span');
  textWrap.className = 'ld-checkbox__text';

  const labelEl = document.createElement('span');
  labelEl.className   = 'ld-checkbox__label';
  labelEl.textContent = label;
  textWrap.appendChild(labelEl);

  if (description) {
    const desc = document.createElement('span');
    desc.className   = 'ld-checkbox__description';
    desc.textContent = description;
    textWrap.appendChild(desc);
  }

  if (onChange) {
    input.addEventListener('change', () => onChange(input.checked));
  }

  wrapper.appendChild(input);
  wrapper.appendChild(box);
  wrapper.appendChild(textWrap);

  return {
    root: wrapper,
    input,
    setChecked: (v) => { input.checked = v; },
    setIndeterminate: (v) => {
      input.indeterminate = v;
      box.innerHTML = v ? INDETERMINATE_ICON : CHECK_ICON;
    },
  };
}
