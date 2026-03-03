/* ============================================================
   Living Design 3.5 — Avatar Component
   ============================================================ */

export type AvatarSize    = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarVariant = 'circle' | 'rounded' | 'square';

export interface AvatarOptions {
  src?:       string;
  alt?:       string;
  name?:      string;   // Generates initials if no src
  size?:      AvatarSize;
  variant?:   AvatarVariant;
  status?:    'online' | 'offline' | 'away' | 'busy';
}

const SIZE_MAP: Record<AvatarSize, number> = {
  xs: 24, sm: 32, md: 40, lg: 56, xl: 72,
};

const STATUS_COLORS: Record<NonNullable<AvatarOptions['status']>, string> = {
  online:  '#007600',
  offline: '#adb0b5',
  away:    '#e07200',
  busy:    '#cc0000',
};

const AVATAR_BG = [
  '#0071ce', '#001e60', '#005aa3', '#007600',
  '#e07200', '#7b1fa2', '#c62828', '#00838f',
];

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function getBgColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_BG[Math.abs(hash) % AVATAR_BG.length];
}

if (!document.getElementById('ld-avatar-styles')) {
  const s = document.createElement('style');
  s.id = 'ld-avatar-styles';
  s.textContent = `
    .ld-avatar {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
      font-family: var(--ld-primitive-font-family-sans);
      font-weight: var(--ld-primitive-font-weight-bold);
      color: white;
      user-select: none;
    }
    .ld-avatar--circle  { border-radius: 50%; }
    .ld-avatar--rounded { border-radius: var(--ld-radius-md); }
    .ld-avatar--square  { border-radius: var(--ld-radius-sm); }
    .ld-avatar__img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .ld-avatar__status {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 25%;
      height: 25%;
      border-radius: 50%;
      border: 2px solid white;
    }
  `;
  document.head.appendChild(s);
}

export function createAvatar(opts: AvatarOptions): HTMLSpanElement {
  const { src, alt = '', name = '', size = 'md', variant = 'circle', status } = opts;
  const px = SIZE_MAP[size];

  const avatar = document.createElement('span');
  avatar.className = `ld-avatar ld-avatar--${variant}`;
  avatar.setAttribute('style', `width: ${px}px; height: ${px}px; font-size: ${Math.round(px * 0.36)}px;`);
  avatar.setAttribute('aria-label', alt || name || 'User avatar');

  if (src) {
    const img = document.createElement('img');
    img.src       = src;
    img.alt       = alt || name;
    img.className = 'ld-avatar__img';
    img.addEventListener('error', () => {
      img.remove();
      avatar.textContent = name ? getInitials(name) : '?';
      avatar.style.background = name ? getBgColor(name) : '#46464a';
    });
    avatar.appendChild(img);
  } else if (name) {
    avatar.textContent      = getInitials(name);
    avatar.style.background = getBgColor(name);
  } else {
    // Placeholder silhouette
    avatar.style.background = 'var(--ld-color-neutral-20)';
    avatar.innerHTML = `<svg width="${Math.round(px * 0.55)}" height="${Math.round(px * 0.55)}" viewBox="0 0 24 24" fill="var(--ld-color-neutral-60)">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>`;
  }

  if (status) {
    const dot = document.createElement('span');
    dot.className = 'ld-avatar__status';
    dot.style.background = STATUS_COLORS[status];
    avatar.appendChild(dot);
  }

  return avatar;
}

/* Avatar Group */
export interface AvatarGroupOptions {
  avatars: AvatarOptions[];
  max?:    number;
  size?:   AvatarSize;
}

export function createAvatarGroup(opts: AvatarGroupOptions): HTMLDivElement {
  const { avatars, max = 4, size = 'md' } = opts;
  const px = SIZE_MAP[size];
  const overlap = Math.round(px * 0.25);

  const group = document.createElement('div');
  group.style.cssText = `display: inline-flex; align-items: center;`;

  const visible = avatars.slice(0, max);
  const extra   = avatars.length - max;

  visible.forEach((av, i) => {
    const a = createAvatar({ ...av, size });
    a.style.marginLeft = i > 0 ? `-${overlap}px` : '0';
    a.style.boxShadow  = '0 0 0 2px white';
    group.appendChild(a);
  });

  if (extra > 0) {
    const more = createAvatar({ name: `+${extra}`, size });
    more.style.marginLeft  = `-${overlap}px`;
    more.style.boxShadow   = '0 0 0 2px white';
    more.style.background  = 'var(--ld-color-neutral-40)';
    more.style.fontSize    = `${Math.round(px * 0.28)}px`;
    more.textContent       = `+${extra}`;
    group.appendChild(more);
  }

  return group;
}
