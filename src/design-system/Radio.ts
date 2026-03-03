/* ============================================================
   Living Design 3.5 — Radio Button Component
   ============================================================ */

export interface RadioOption {
  value:        string;
  label:        string;
  description?: string;
  disabled?:    boolean;
}

export interface RadioGroupOptions {
  name:      string;
  options:   RadioOption[];
  value?:    string;       // Selected value
  label?:    string;       // Group label
  layout?:   'vertical' | 'horizontal';
  onChange?: (value: string) => void;
}

if (!document.getElementById('ld-radio-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-radio-styles';
  s.textContent = `
    .ld-radio-group {
      font-family: var(--ld-primitive-font-family-sans);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ld-radio-group__label {
      font-size: var(--ld-primitive-font-size-sm);
      font-weight: var(--ld-primitive-font-weight-bold);
      color: var(--ld-semantic-color-text-primary);
      margin-bottom: 8px;
    }
    .ld-radio-group--horizontal .ld-radio-group__options {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 16px;
    }
    .ld-radio-group__options {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .ld-radio {
      display: inline-flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
      user-select: none;
    }
    .ld-radio--disabled { cursor: not-allowed; opacity: 0.5; }
    .ld-radio__input {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }
    .ld-radio__circle {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      border-radius: 50%;
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
    .ld-radio__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: white;
      opacity: 0;
      transform: scale(0);
      transition: opacity var(--ld-transition-fast), transform var(--ld-transition-fast);
    }
    .ld-radio__input:checked ~ .ld-radio__circle {
      border-color: var(--ld-semantic-color-action-primary);
      background: var(--ld-semantic-color-action-primary);
    }
    .ld-radio__input:checked ~ .ld-radio__circle .ld-radio__dot {
      opacity: 1;
      transform: scale(1);
    }
    .ld-radio__input:focus-visible ~ .ld-radio__circle {
      box-shadow: 0 0 0 3px rgba(0, 113, 206, 0.25);
      border-color: var(--ld-semantic-color-border-focus);
    }
    .ld-radio:not(.ld-radio--disabled):hover .ld-radio__circle {
      border-color: var(--ld-semantic-color-action-primary);
    }
    .ld-radio__text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .ld-radio__label {
      font-size: var(--ld-primitive-font-size-md);
      font-weight: var(--ld-primitive-font-weight-medium);
      color: var(--ld-semantic-color-text-primary);
      line-height: 1.5;
    }
    .ld-radio__description {
      font-size: var(--ld-primitive-font-size-sm);
      color: var(--ld-semantic-color-text-secondary);
      line-height: 1.4;
    }
  `;
  document.head.appendChild(s);
}

export interface RadioGroupResult {
  root:     HTMLFieldSetElement;
  getValue: () => string | null;
  setValue: (v: string) => void;
}

export function createRadioGroup(opts: RadioGroupOptions): RadioGroupResult {
  const { name, options, value, label, layout = 'vertical', onChange } = opts;

  const fieldset = document.createElement('fieldset');
  fieldset.className = [
    'ld-radio-group',
    layout === 'horizontal' ? 'ld-radio-group--horizontal' : '',
  ].filter(Boolean).join(' ');
  fieldset.style.border  = 'none';
  fieldset.style.padding = '0';
  fieldset.style.margin  = '0';

  if (label) {
    const legend = document.createElement('legend');
    legend.className   = 'ld-radio-group__label';
    legend.textContent = label;
    fieldset.appendChild(legend);
  }

  const optionsList = document.createElement('div');
  optionsList.className = 'ld-radio-group__options';

  const inputs: HTMLInputElement[] = [];

  for (const opt of options) {
    const id = `ld-radio-${name}-${opt.value}`;

    const lbl = document.createElement('label');
    lbl.htmlFor   = id;
    lbl.className = `ld-radio${opt.disabled ? ' ld-radio--disabled' : ''}`;

    const input = document.createElement('input');
    input.type     = 'radio';
    input.id       = id;
    input.name     = name;
    input.value    = opt.value;
    input.checked  = opt.value === value;
    input.disabled = !!opt.disabled;
    input.className = 'ld-radio__input';

    if (onChange) {
      input.addEventListener('change', () => {
        if (input.checked) onChange(input.value);
      });
    }
    inputs.push(input);

    const circle = document.createElement('span');
    circle.className = 'ld-radio__circle';
    const dot = document.createElement('span');
    dot.className = 'ld-radio__dot';
    circle.appendChild(dot);

    const textWrap = document.createElement('span');
    textWrap.className = 'ld-radio__text';

    const labelEl = document.createElement('span');
    labelEl.className   = 'ld-radio__label';
    labelEl.textContent = opt.label;
    textWrap.appendChild(labelEl);

    if (opt.description) {
      const desc = document.createElement('span');
      desc.className   = 'ld-radio__description';
      desc.textContent = opt.description;
      textWrap.appendChild(desc);
    }

    lbl.appendChild(input);
    lbl.appendChild(circle);
    lbl.appendChild(textWrap);
    optionsList.appendChild(lbl);
  }

  fieldset.appendChild(optionsList);

  return {
    root: fieldset,
    getValue: () => inputs.find(i => i.checked)?.value ?? null,
    setValue: (v) => {
      inputs.forEach(i => { i.checked = i.value === v; });
    },
  };
}
