/* ============================================================
   Living Design 3.5 — Input Component
   ============================================================ */

import { uid } from '../utils';

export type InputType = 'text' | 'email' | 'password' | 'number' | 'search' | 'tel' | 'url';
export type InputState = 'default' | 'error' | 'success' | 'disabled';

export interface InputOptions {
  id?:          string;
  name?:        string;
  type?:        InputType;
  label?:       string;
  placeholder?: string;
  value?:       string;
  helperText?:  string;
  errorText?:   string;
  state?:       InputState;
  required?:    boolean;
  maxLength?:   number;
  prefixIcon?:  string;   // SVG string
  suffixIcon?:  string;   // SVG string
  onChange?:    (value: string) => void;
}

if (!document.getElementById('ld-input-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-input-styles';
  s.textContent = `
    .ld-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-family: var(--ld-primitive-font-family-sans);
    }
    .ld-field__label {
      font-size: var(--ld-primitive-font-size-sm);
      font-weight: var(--ld-primitive-font-weight-bold);
      color: var(--ld-semantic-color-text-primary);
      line-height: 1.4;
    }
    .ld-field__label--required::after {
      content: ' *';
      color: var(--ld-semantic-color-text-danger);
    }
    .ld-field__wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .ld-field__input {
      width: 100%;
      height: 44px;
      padding: 0 14px;
      font-family: var(--ld-primitive-font-family-sans);
      font-size: var(--ld-primitive-font-size-md);
      font-weight: var(--ld-primitive-font-weight-regular);
      color: var(--ld-semantic-color-text-primary);
      background: var(--ld-semantic-color-bg-primary);
      border: 1.5px solid var(--ld-semantic-color-border-default);
      border-radius: var(--ld-radius-md);
      outline: none;
      transition: border-color var(--ld-transition-fast), box-shadow var(--ld-transition-fast);
      -webkit-appearance: none;
    }
    .ld-field__input::placeholder {
      color: var(--ld-semantic-color-text-tertiary);
    }
    .ld-field__input:focus {
      border-color: var(--ld-semantic-color-border-focus);
      box-shadow: 0 0 0 3px rgba(0, 113, 206, 0.15);
    }
    .ld-field__input:disabled {
      background: var(--ld-semantic-color-bg-tertiary);
      color: var(--ld-semantic-color-text-disabled);
      cursor: not-allowed;
      border-color: var(--ld-semantic-color-border-default);
    }
    .ld-field--error .ld-field__input {
      border-color: var(--ld-semantic-color-border-error);
    }
    .ld-field--error .ld-field__input:focus {
      box-shadow: 0 0 0 3px rgba(204, 0, 0, 0.15);
    }
    .ld-field--success .ld-field__input {
      border-color: var(--ld-semantic-color-border-success);
    }
    .ld-field__input--has-prefix { padding-left: 40px; }
    .ld-field__input--has-suffix { padding-right: 40px; }
    .ld-field__icon {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      color: var(--ld-semantic-color-text-tertiary);
      pointer-events: none;
      display: flex;
      align-items: center;
    }
    .ld-field__icon--prefix { left: 12px; }
    .ld-field__icon--suffix { right: 12px; }
    .ld-field__helper {
      font-size: var(--ld-primitive-font-size-xs);
      color: var(--ld-semantic-color-text-secondary);
      line-height: 1.4;
    }
    .ld-field__error {
      font-size: var(--ld-primitive-font-size-xs);
      color: var(--ld-semantic-color-text-danger);
      line-height: 1.4;
      display: flex;
      align-items: center;
      gap: 4px;
    }
  `;
  document.head.appendChild(s);
}

const ERROR_ICON = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
  <circle cx="7" cy="7" r="6.5" stroke="currentColor" stroke-width="1.5"/>
  <path d="M7 4v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="7" cy="10" r="0.75" fill="currentColor"/>
</svg>`;

export interface InputResult {
  root:  HTMLDivElement;
  input: HTMLInputElement;
}

export function createInput(opts: InputOptions): InputResult {
  const {
    id = `ld-input-${uid()}`,
    name, type = 'text', label, placeholder, value = '',
    helperText, errorText, state = 'default',
    required = false, maxLength, prefixIcon, suffixIcon, onChange,
  } = opts;

  const root = document.createElement('div');
  const isError   = state === 'error' || !!errorText;
  const isSuccess = state === 'success';
  root.className  = `ld-field${isError ? ' ld-field--error' : ''}${isSuccess ? ' ld-field--success' : ''}`;

  if (label) {
    const lbl = document.createElement('label');
    lbl.htmlFor   = id;
    lbl.className = `ld-field__label${required ? ' ld-field__label--required' : ''}`;
    lbl.textContent = label;
    root.appendChild(lbl);
  }

  const wrap = document.createElement('div');
  wrap.className = 'ld-field__wrap';

  if (prefixIcon) {
    const iconWrap = document.createElement('span');
    iconWrap.className = 'ld-field__icon ld-field__icon--prefix';
    iconWrap.innerHTML = prefixIcon;
    wrap.appendChild(iconWrap);
  }

  const input = document.createElement('input');
  input.type = type;
  input.id   = id;
  if (name)        input.name        = name;
  if (placeholder) input.placeholder = placeholder;
  if (maxLength)   input.maxLength   = maxLength;
  if (required)    input.required    = true;
  input.value    = value;
  input.disabled = state === 'disabled';
  input.className = [
    'ld-field__input',
    prefixIcon ? 'ld-field__input--has-prefix' : '',
    suffixIcon ? 'ld-field__input--has-suffix' : '',
  ].filter(Boolean).join(' ');
  input.setAttribute('aria-invalid', String(isError));
  if (isError && errorText) input.setAttribute('aria-describedby', `${id}-error`);
  if (helperText)            input.setAttribute('aria-describedby', `${id}-helper`);

  if (onChange) input.addEventListener('input', () => onChange(input.value));
  wrap.appendChild(input);

  if (suffixIcon) {
    const iconWrap = document.createElement('span');
    iconWrap.className = 'ld-field__icon ld-field__icon--suffix';
    iconWrap.innerHTML = suffixIcon;
    wrap.appendChild(iconWrap);
  }

  root.appendChild(wrap);

  if (helperText && !isError) {
    const helper = document.createElement('p');
    helper.id          = `${id}-helper`;
    helper.className   = 'ld-field__helper';
    helper.textContent = helperText;
    root.appendChild(helper);
  }

  if (isError && errorText) {
    const err = document.createElement('p');
    err.id          = `${id}-error`;
    err.className   = 'ld-field__error';
    err.innerHTML   = ERROR_ICON + `<span>${errorText}</span>`;
    root.appendChild(err);
  }

  return { root, input };
}
