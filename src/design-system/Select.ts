/* ============================================================
   Living Design 3.5 — Select / Dropdown Component
   ============================================================ */

import { uid } from '../utils';

export interface SelectOption {
  value:    string;
  label:    string;
  disabled?: boolean;
}

export interface SelectGroup {
  label:   string;
  options: SelectOption[];
}

export interface SelectOptions {
  id?:          string;
  name?:        string;
  label?:       string;
  placeholder?: string;
  options?:     SelectOption[];
  groups?:      SelectGroup[];
  value?:       string;
  helperText?:  string;
  errorText?:   string;
  disabled?:    boolean;
  required?:    boolean;
  onChange?:    (value: string) => void;
}

const CARET_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

if (!document.getElementById('ld-select-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-select-styles';
  s.textContent = `
    .ld-select-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-family: var(--ld-primitive-font-family-sans);
    }
    .ld-select-field__label {
      font-size: var(--ld-primitive-font-size-sm);
      font-weight: var(--ld-primitive-font-weight-bold);
      color: var(--ld-semantic-color-text-primary);
    }
    .ld-select-field__label--required::after {
      content: ' *';
      color: var(--ld-semantic-color-text-danger);
    }
    .ld-select-field__wrap {
      position: relative;
    }
    .ld-select-field__select {
      width: 100%;
      height: 44px;
      padding: 0 40px 0 14px;
      font-family: var(--ld-primitive-font-family-sans);
      font-size: var(--ld-primitive-font-size-md);
      color: var(--ld-semantic-color-text-primary);
      background: var(--ld-semantic-color-bg-primary);
      border: 1.5px solid var(--ld-semantic-color-border-default);
      border-radius: var(--ld-radius-md);
      outline: none;
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
      transition: border-color var(--ld-transition-fast), box-shadow var(--ld-transition-fast);
    }
    .ld-select-field__select:focus {
      border-color: var(--ld-semantic-color-border-focus);
      box-shadow: 0 0 0 3px rgba(0, 113, 206, 0.15);
    }
    .ld-select-field__select:disabled {
      background: var(--ld-semantic-color-bg-tertiary);
      color: var(--ld-semantic-color-text-disabled);
      cursor: not-allowed;
    }
    .ld-select-field--error .ld-select-field__select {
      border-color: var(--ld-semantic-color-border-error);
    }
    .ld-select-field__caret {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
      color: var(--ld-semantic-color-text-tertiary);
      display: flex;
      align-items: center;
    }
    .ld-select-field__helper {
      font-size: var(--ld-primitive-font-size-xs);
      color: var(--ld-semantic-color-text-secondary);
    }
    .ld-select-field__error {
      font-size: var(--ld-primitive-font-size-xs);
      color: var(--ld-semantic-color-text-danger);
    }
  `;
  document.head.appendChild(s);
}

export interface SelectResult {
  root:   HTMLDivElement;
  select: HTMLSelectElement;
}

export function createSelect(opts: SelectOptions): SelectResult {
  const {
    id = `ld-select-${uid()}`,
    name, label, placeholder, options = [], groups = [],
    value, helperText, errorText, disabled = false, required = false, onChange,
  } = opts;

  const isError = !!errorText;

  const root = document.createElement('div');
  root.className = `ld-select-field${isError ? ' ld-select-field--error' : ''}`;

  if (label) {
    const lbl = document.createElement('label');
    lbl.htmlFor   = id;
    lbl.className = `ld-select-field__label${required ? ' ld-select-field__label--required' : ''}`;
    lbl.textContent = label;
    root.appendChild(lbl);
  }

  const wrap = document.createElement('div');
  wrap.className = 'ld-select-field__wrap';

  const select = document.createElement('select');
  select.id       = id;
  select.className = 'ld-select-field__select';
  select.disabled  = disabled;
  select.required  = required;
  if (name) select.name = name;
  select.setAttribute('aria-invalid', String(isError));

  if (placeholder) {
    const opt = document.createElement('option');
    opt.value    = '';
    opt.disabled = true;
    opt.selected = !value;
    opt.textContent = placeholder;
    select.appendChild(opt);
  }

  // Flat options
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value    = o.value;
    opt.disabled = !!o.disabled;
    opt.selected = o.value === value;
    opt.textContent = o.label;
    select.appendChild(opt);
  }

  // Grouped options
  for (const g of groups) {
    const grp = document.createElement('optgroup');
    grp.label = g.label;
    for (const o of g.options) {
      const opt = document.createElement('option');
      opt.value    = o.value;
      opt.disabled = !!o.disabled;
      opt.selected = o.value === value;
      opt.textContent = o.label;
      grp.appendChild(opt);
    }
    select.appendChild(grp);
  }

  if (onChange) select.addEventListener('change', () => onChange(select.value));

  const caret = document.createElement('span');
  caret.className = 'ld-select-field__caret';
  caret.innerHTML = CARET_SVG;

  wrap.appendChild(select);
  wrap.appendChild(caret);
  root.appendChild(wrap);

  if (helperText && !isError) {
    const helper = document.createElement('p');
    helper.className   = 'ld-select-field__helper';
    helper.textContent = helperText;
    root.appendChild(helper);
  }

  if (isError && errorText) {
    const err = document.createElement('p');
    err.className   = 'ld-select-field__error';
    err.textContent = errorText;
    root.appendChild(err);
  }

  return { root, select };
}
