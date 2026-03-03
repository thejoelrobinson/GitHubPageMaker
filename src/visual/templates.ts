import { visual, DEFAULT_THEME } from '../state';
import { generatePageHTML } from './export';
import { escapeHtml, titleToPath } from '../utils';
import type { Theme, Page } from '../types';
import { newBlock } from './blocks';

// ── Types ────────────────────────────────────────────────────────────

export interface PageTemplate {
  id: string;
  name: string;
  category: 'portfolio' | 'business' | 'creative' | 'landing' | 'restaurant' | 'personal' | 'report';
  emoji: string;
  description: string;
  theme: Partial<Theme>;
  blocks: Array<{ type: string; content?: Record<string, unknown>; settings?: Record<string, unknown> }>;
}

// ── Template definitions ─────────────────────────────────────────────

const portfolioTemplate: PageTemplate = {
  id: 'portfolio',
  name: 'Creative Portfolio',
  category: 'portfolio',
  emoji: '🎨',
  description: 'A dark, modern portfolio for creatives and designers',
  theme: {
    primary: '#0f172a',
    accent: '#6366f1',
    text: '#e2e8f0',
    textMuted: '#94a3b8',
    bg: '#0f172a',
    bgAlt: '#1e293b',
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'DM Sans',
    radius: '8',
  },
  blocks: [
    { type: 'nav', content: { logo: 'Studio', showCta: false } },
    { type: 'hero', content: { heading: 'Design that\nmoves people.', subheading: 'Crafting visual experiences that connect brands with the people they serve.', btn1Text: 'View Work', btn1Link: '#work', showBtn2: false }, settings: { align: 'left', height: 'large' } },
    { type: 'gallery', content: { heading: 'Selected Work' } },
    { type: 'stats', content: { heading: 'By the numbers', stat1: '120+', stat1Label: 'Projects', stat2: '8', stat2Label: 'Years', stat3: '40+', stat3Label: 'Clients' } },
    { type: 'cta', content: { heading: 'Ready to build something great?', subheading: "Let's talk about your project.", btnText: 'Get in Touch', btnLink: '#contact' } },
    { type: 'footer', content: { logo: 'Studio', tagline: '© 2025 Studio. All rights reserved.' } },
  ],
};

const agencyTemplate: PageTemplate = {
  id: 'agency',
  name: 'Professional Agency',
  category: 'business',
  emoji: '💼',
  description: 'Clean and corporate for agencies and consultancies',
  theme: {
    primary: '#0f172a',
    accent: '#0078d4',
    text: '#1e293b',
    textMuted: '#64748b',
    bg: '#ffffff',
    bgAlt: '#f8fafc',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    radius: '6',
  },
  blocks: [
    { type: 'nav', content: { logo: 'Agency', showCta: true, ctaText: 'Contact Us', ctaLink: '#contact' } },
    { type: 'hero', content: { heading: 'We grow businesses through digital excellence', subheading: 'Strategy, design, and technology working together to accelerate your growth.', btn1Text: 'Our Work', btn1Link: '#work', btn2Text: 'Learn More', btn2Link: '#about', showBtn2: true } },
    { type: 'features', content: { heading: 'What we do', feat1Title: 'Brand Strategy', feat1Text: 'We develop brands that resonate with your audience and stand apart from the competition.', feat2Title: 'Digital Design', feat2Text: 'Beautiful, functional interfaces that convert visitors into customers.', feat3Title: 'Development', feat3Text: 'Fast, scalable web applications built on modern technology stacks.' } },
    { type: 'stats', content: { heading: 'Our track record', stat1: '200+', stat1Label: 'Clients', stat2: '98%', stat2Label: 'Satisfaction', stat3: '$50M+', stat3Label: 'Revenue Generated' } },
    { type: 'testimonial', content: { quote: 'Working with this agency transformed our business. They delivered exceptional results beyond our expectations.', author: 'Sarah Chen', role: 'CEO, TechVentures' } },
    { type: 'cta', content: { heading: 'Ready to grow your business?', subheading: 'Schedule a free strategy session with our team.', btnText: 'Book a Call', btnLink: '#contact' } },
    { type: 'footer', content: { logo: 'Agency', tagline: '© 2025 Agency. All rights reserved.' } },
  ],
};

const productTemplate: PageTemplate = {
  id: 'product',
  name: 'Product Landing',
  category: 'landing',
  emoji: '🚀',
  description: 'Conversion-focused layout for SaaS and products',
  theme: {
    primary: '#1e1b4b',
    accent: '#7c3aed',
    text: '#1e293b',
    textMuted: '#64748b',
    bg: '#ffffff',
    bgAlt: '#f5f3ff',
    headingFont: 'Poppins',
    bodyFont: 'Inter',
    radius: '10',
  },
  blocks: [
    { type: 'nav', content: { logo: 'Product', showCta: true, ctaText: 'Start Free', ctaLink: '#signup' } },
    { type: 'hero', content: { heading: 'Ship faster, stress less', subheading: "The all-in-one platform that lets your team move fast without breaking things.", btn1Text: 'Start for Free', btn1Link: '#signup', btn2Text: 'See Demo', btn2Link: '#demo', showBtn2: true } },
    { type: 'features', content: { heading: 'Everything you need', feat1Title: 'Lightning Fast', feat1Text: 'Built for performance from day one. Pages load in under 200ms on average.', feat2Title: 'Team-Ready', feat2Text: 'Collaboration tools built in. Invite your team and work together seamlessly.', feat3Title: 'Secure by Default', feat3Text: "Enterprise-grade security without the enterprise-grade complexity." } },
    { type: 'pricing', content: { heading: 'Simple pricing', subheading: "Start free, upgrade when you're ready." } },
    { type: 'testimonial', content: { quote: "This product cut our deployment time from days to hours. It's now an essential part of our workflow.", author: 'Alex Rivera', role: 'CTO, StartupXYZ' } },
    { type: 'cta', content: { heading: 'Start your free trial today', subheading: 'No credit card required. Cancel anytime.', btnText: 'Get Started Free', btnLink: '#signup' } },
    { type: 'footer', content: { logo: 'Product', tagline: '© 2025 Product Inc. All rights reserved.' } },
  ],
};

const restaurantTemplate: PageTemplate = {
  id: 'restaurant',
  name: 'Restaurant',
  category: 'restaurant',
  emoji: '🍽️',
  description: 'Warm and inviting for restaurants and cafes',
  theme: {
    primary: '#1a0a00',
    accent: '#c0392b',
    text: '#2c1810',
    textMuted: '#8b6355',
    bg: '#fffdf9',
    bgAlt: '#fef9f0',
    headingFont: 'Playfair Display',
    bodyFont: 'Lato',
    radius: '4',
  },
  blocks: [
    { type: 'nav', content: { logo: 'La Maison', showCta: true, ctaText: 'Reserve', ctaLink: '#reserve' } },
    { type: 'hero', content: { heading: 'A culinary experience to remember', subheading: 'Fresh ingredients, traditional techniques, modern inspiration.', btn1Text: 'Reserve a Table', btn1Link: '#reserve', btn2Text: 'View Menu', btn2Link: '#menu', showBtn2: true } },
    { type: 'split', content: { heading: 'Our Story', text: 'Founded in 2010, La Maison has been serving the finest seasonal cuisine in an atmosphere that balances elegance with warmth. Our chef draws inspiration from classic French tradition with a modern twist.', imageUrl: '', btnText: '', btnLink: '' }, settings: { imageRight: false } },
    { type: 'features', content: { heading: 'Why our guests return', feat1Title: 'Seasonal Menu', feat1Text: 'We change our menu with the seasons to use the freshest local ingredients.', feat2Title: 'Private Dining', feat2Text: 'Host your special occasions in our beautifully appointed private dining room.', feat3Title: 'Award-Winning Wine', feat3Text: 'Our sommelier curates a world-class selection from boutique vineyards.' } },
    { type: 'gallery', content: { heading: 'Our Dishes' } },
    { type: 'cta', content: { heading: 'Reserve your table', subheading: 'Dinner service Tuesday through Sunday, 6pm–10pm.', btnText: 'Make a Reservation', btnLink: '#reserve' } },
    { type: 'footer', content: { logo: 'La Maison', tagline: '© 2025 La Maison. 123 Main Street, City.' } },
  ],
};

const personalTemplate: PageTemplate = {
  id: 'personal',
  name: 'Personal',
  category: 'personal',
  emoji: '👤',
  description: 'Clean and personal for blogs and portfolios',
  theme: {
    primary: '#0f172a',
    accent: '#0891b2',
    text: '#334155',
    textMuted: '#64748b',
    bg: '#ffffff',
    bgAlt: '#f0f9ff',
    headingFont: 'Merriweather',
    bodyFont: 'Open Sans',
    radius: '6',
  },
  blocks: [
    { type: 'nav', content: { logo: 'Jane Doe', showCta: false } },
    { type: 'hero', content: { heading: "Hi, I'm Jane.\nI write about design and tech.", subheading: 'Product designer at Acme Co. Writing about creativity, systems thinking, and building things that matter.', btn1Text: 'Read My Writing', btn1Link: '#writing', showBtn2: false }, settings: { align: 'left' } },
    { type: 'features', content: { heading: 'Things I care about', feat1Title: 'Design Systems', feat1Text: 'Building scalable, consistent design at the intersection of craft and engineering.', feat2Title: 'User Research', feat2Text: 'Understanding people deeply to create products that genuinely help them.', feat3Title: 'Writing', feat3Text: 'Clear thinking made visible. I write weekly about design, tech, and creativity.' } },
    { type: 'testimonial', content: { quote: "Jane has a rare ability to see both the big picture and the details. She's one of the best designers I've worked with.", author: 'Mark Thompson', role: 'VP Product, Acme Co' } },
    { type: 'cta', content: { heading: "Let's connect", subheading: "Whether it's a project, a collaboration, or just a chat.", btnText: 'Get in Touch', btnLink: 'mailto:jane@example.com' } },
    { type: 'footer', content: { logo: 'Jane Doe', tagline: '© 2025 Jane Doe. Made with care.' } },
  ],
};

// ── Template collection ──────────────────────────────────────────────

export const TEMPLATES: PageTemplate[] = [
  portfolioTemplate,
  agencyTemplate,
  productTemplate,
  restaurantTemplate,
  personalTemplate,
];

export function getTemplateById(id: string): PageTemplate | undefined {
  return TEMPLATES.find(t => t.id === id);
}

/** Build a thumbnail SVG preview of a template using its theme colors. */
export function templateThumbnailSvg(template: PageTemplate): string {
  const bg   = template.theme.bg   ?? '#ffffff';
  const prim = template.theme.accent ?? '#6366f1';
  const text = template.theme.text  ?? '#000000';

  return `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="80" fill="${bg}"/>
    <rect x="0" y="0" width="120" height="12" fill="${prim}" opacity="0.9"/>
    <rect x="10" y="20" width="60" height="6" rx="3" fill="${text}" opacity="0.8"/>
    <rect x="10" y="30" width="40" height="4" rx="2" fill="${text}" opacity="0.4"/>
    <rect x="10" y="42" width="100" height="20" rx="4" fill="${prim}" opacity="0.15"/>
    <rect x="10" y="68" width="100" height="4" rx="2" fill="${text}" opacity="0.2"/>
  </svg>`;
}

// ── Apply template to active page ────────────────────────────────────

export function applyTemplate(template: PageTemplate, targetPageId?: string): void {
  // Resolve or create the target page
  let page: Page | null = null;
  if (targetPageId) {
    page = visual.pages.find(p => p.id === targetPageId) ?? null;
  }

  const doApply = (resolvedPage: Page) => {
    // Apply theme
    const mergedTheme: Theme = { ...DEFAULT_THEME, ...template.theme };
    Object.assign(visual.theme, mergedTheme);

    // Create blocks from the template definition
    resolvedPage.blocks = [];
    const fullTheme: Theme = { ...DEFAULT_THEME, ...template.theme };
    for (const blockDef of template.blocks) {
      const block = newBlock(blockDef.type, fullTheme);
      if (blockDef.content) {
        Object.assign(block.content, blockDef.content);
      }
      if (blockDef.settings) {
        Object.assign(block.settings, blockDef.settings);
      }
      resolvedPage.blocks.push(block);
    }

    resolvedPage.dirty = true;
    visual.dirty = true;

    // Refresh UI — use dynamic imports to avoid circular deps
    import('./pages').then(({ switchPage, renderPageList, renderSectionList }) => {
      switchPage(resolvedPage.id);
      renderPageList();
      renderSectionList();
    });
    import('./canvas').then(({ renderCanvas, applyThemeToCanvas }) => {
      renderCanvas();
      applyThemeToCanvas();
    });
    import('./properties').then(({ renderProperties }) => renderProperties());
    import('../ui/notifications').then(({ notify }) => {
      notify(`Template "${template.name}" applied!`, 'success');
    });
  };

  if (page) {
    doApply(page);
  } else {
    // Create a new page for the template
    import('./pages').then(({ addEmptyPage }) => {
      const newPage = addEmptyPage(template.name, titleToPath(template.name, visual.pages.filter(p => p.isHome).length === 0));
      if (visual.pages.filter(p => p.isHome).length === 1 && newPage === visual.pages[visual.pages.length - 1]) {
        newPage.isHome = visual.pages.length === 1;
      }
      doApply(newPage);
    });
  }
}

// ── Internal helper used by initTemplateGallery ───────────────────────

function applyTemplateToCurrentPage(template: PageTemplate): void {
  const page = visual.activePage;
  if (!page) return;
  applyTemplate(template, page.id);
}

// ── Template Gallery ─────────────────────────────────────────────────

export function initTemplateGallery(): void {
  const grid = document.getElementById('template-grid');
  if (!grid) return;

  grid.innerHTML = TEMPLATES.map(t => `
    <div class="template-card" data-template-id="${t.id}"
      style="cursor:pointer;border:2px solid var(--border);border-radius:8px;overflow:hidden;transition:all .15s"
      onmouseover="this.style.borderColor='#6366f1';this.style.transform='translateY(-2px)'"
      onmouseout="this.style.borderColor='var(--border)';this.style.transform=''">
      <div style="aspect-ratio:16/10;overflow:hidden;background:var(--bg-mid)">${templateThumbnailSvg(t)}</div>
      <div style="padding:8px 10px">
        <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:2px">${t.emoji} ${escapeHtml(t.name)}</div>
        <div style="font-size:11px;color:var(--text-dim)">${escapeHtml(t.description)}</div>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll<HTMLElement>('.template-card').forEach(card => {
    card.addEventListener('click', () => {
      const template = getTemplateById(card.dataset.templateId!);
      if (!template) return;
      applyTemplateToCurrentPage(template);
      document.getElementById('template-gallery-modal')?.classList.add('hidden');
    });
  });
}

export function showTemplateGallery(): void {
  document.getElementById('template-gallery-modal')?.classList.remove('hidden');
}

// ── Setup Wizard ─────────────────────────────────────────────────────

export function showSetupWizard(): void {
  document.getElementById('setup-wizard-modal')?.classList.remove('hidden');

  const browseBtn = document.getElementById('wizard-browse-templates');
  if (browseBtn) {
    browseBtn.onclick = () => {
      document.getElementById('setup-wizard-modal')?.classList.add('hidden');
      showTemplateGallery();
    };
  }
}

// ── Preview as Visitor ───────────────────────────────────────────────

export function initPreviewButton(): void {
  const previewBtn = document.getElementById('vis-preview-btn');
  const overlay = document.getElementById('preview-overlay');
  const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement | null;
  const closeBtn = document.getElementById('preview-close-btn');

  if (!previewBtn || !overlay || !iframe) return;

  let lastBlobUrl: string | null = null;

  previewBtn.addEventListener('click', () => {
    const page = visual.activePage;
    if (!page) return;

    // Revoke previous blob URL to prevent memory leak
    if (lastBlobUrl) { URL.revokeObjectURL(lastBlobUrl); lastBlobUrl = null; }

    let previewUrl: string;
    if (page.blocks.length > 0) {
      const html = generatePageHTML(page, visual.theme, visual.siteName, visual.siteDesc);
      const blob = new Blob([html], { type: 'text/html' });
      previewUrl = URL.createObjectURL(blob);
      lastBlobUrl = previewUrl; // Track for revocation
    } else {
      previewUrl = `/preview/${page.path}?_wb=${Date.now()}`;
    }

    iframe.src = previewUrl;
    overlay.style.display = 'flex';
    // ESC key closes overlay
    const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeOverlay(); };
    document.addEventListener('keydown', escHandler, { once: true });

    function closeOverlay() {
      if (overlay) overlay.style.display = 'none';
      if (iframe)  iframe.src = 'about:blank';
      if (lastBlobUrl) { URL.revokeObjectURL(lastBlobUrl); lastBlobUrl = null; }
      document.removeEventListener('keydown', escHandler);
    }

    if (closeBtn) {
      // Re-wire close button each open to capture the current escHandler
      closeBtn.onclick = closeOverlay;
    }
  });
}
