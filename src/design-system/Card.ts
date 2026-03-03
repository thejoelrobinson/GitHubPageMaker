/* ============================================================
   Living Design 3.5 — Card Component
   ============================================================ */

export type CardVariant  = 'elevated' | 'outlined' | 'filled';
export type CardPadding  = 'none' | 'sm' | 'md' | 'lg';

export interface CardOptions {
  variant?:  CardVariant;
  padding?:  CardPadding;
  interactive?: boolean;  // Adds hover/click styles
  header?:  { title: string; subtitle?: string; action?: HTMLElement };
  footer?:  HTMLElement;
  content?: HTMLElement | string;
  imgSrc?:  string;
  imgAlt?:  string;
  onClick?: () => void;
}

const PADDING_MAP: Record<CardPadding, string> = {
  none: '0',
  sm:   'var(--ld-space-3)',
  md:   'var(--ld-space-4) var(--ld-space-5)',
  lg:   'var(--ld-space-6) var(--ld-space-8)',
};

if (!document.getElementById('ld-card-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-card-styles';
  s.textContent = `
    .ld-card {
      font-family: var(--ld-primitive-font-family-sans);
      background: var(--ld-semantic-color-bg-primary);
      border-radius: var(--ld-radius-lg);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .ld-card--elevated {
      box-shadow: var(--ld-shadow-md);
      border: none;
    }
    .ld-card--outlined {
      border: 1.5px solid var(--ld-semantic-color-border-default);
      box-shadow: none;
    }
    .ld-card--filled {
      background: var(--ld-semantic-color-bg-secondary);
      border: none;
      box-shadow: none;
    }
    .ld-card--interactive {
      cursor: pointer;
      transition: box-shadow var(--ld-transition-normal), transform var(--ld-transition-normal);
    }
    .ld-card--interactive:hover {
      box-shadow: var(--ld-shadow-lg);
      transform: translateY(-2px);
    }
    .ld-card--interactive:focus-visible {
      outline: 2px solid var(--ld-semantic-color-border-focus);
      outline-offset: 2px;
    }
    .ld-card__img {
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      display: block;
      flex-shrink: 0;
    }
    .ld-card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ld-space-4);
    }
    .ld-card__header-text {}
    .ld-card__title {
      font-size: var(--ld-primitive-font-size-lg);
      font-weight: var(--ld-primitive-font-weight-bold);
      color: var(--ld-semantic-color-text-primary);
      margin: 0;
      line-height: 1.3;
    }
    .ld-card__subtitle {
      font-size: var(--ld-primitive-font-size-sm);
      color: var(--ld-semantic-color-text-secondary);
      margin: 4px 0 0;
    }
    .ld-card__content {
      flex: 1;
      color: var(--ld-semantic-color-text-secondary);
      font-size: var(--ld-primitive-font-size-md);
      line-height: var(--ld-primitive-line-height-normal);
    }
    .ld-card__footer {
      border-top: 1px solid var(--ld-semantic-color-border-default);
    }
    .ld-card__divider {
      border: none;
      border-top: 1px solid var(--ld-semantic-color-border-default);
      margin: 0;
    }
  `;
  document.head.appendChild(s);
}

export function createCard(opts: CardOptions): HTMLDivElement {
  const {
    variant = 'elevated', padding = 'md', interactive = false,
    header, footer, content, imgSrc, imgAlt = '', onClick,
  } = opts;

  const card = document.createElement('div');
  card.className = [
    'ld-card',
    `ld-card--${variant}`,
    interactive || onClick ? 'ld-card--interactive' : '',
  ].filter(Boolean).join(' ');

  if (interactive || onClick) {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    if (onClick) {
      card.addEventListener('click', onClick);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      });
    }
  }

  const pad = PADDING_MAP[padding];

  if (imgSrc) {
    const img = document.createElement('img');
    img.src       = imgSrc;
    img.alt       = imgAlt;
    img.className = 'ld-card__img';
    card.appendChild(img);
  }

  if (header) {
    const hdr = document.createElement('div');
    hdr.className   = 'ld-card__header';
    hdr.style.padding = pad;

    const textWrap = document.createElement('div');
    textWrap.className = 'ld-card__header-text';

    const titleEl = document.createElement('h3');
    titleEl.className   = 'ld-card__title';
    titleEl.textContent = header.title;
    textWrap.appendChild(titleEl);

    if (header.subtitle) {
      const sub = document.createElement('p');
      sub.className   = 'ld-card__subtitle';
      sub.textContent = header.subtitle;
      textWrap.appendChild(sub);
    }

    hdr.appendChild(textWrap);
    if (header.action) hdr.appendChild(header.action);
    card.appendChild(hdr);

    if (content) {
      const divider = document.createElement('hr');
      divider.className = 'ld-card__divider';
      card.appendChild(divider);
    }
  }

  if (content) {
    const body = document.createElement('div');
    body.className    = 'ld-card__content';
    body.style.padding = pad;
    if (typeof content === 'string') {
      body.textContent = content;
    } else {
      body.appendChild(content);
    }
    card.appendChild(body);
  }

  if (footer) {
    const footerWrap = document.createElement('div');
    footerWrap.className    = 'ld-card__footer';
    footerWrap.style.padding = pad;
    footerWrap.appendChild(footer);
    card.appendChild(footerWrap);
  }

  return card;
}
