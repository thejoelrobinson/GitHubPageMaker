/**
 * Premium HTML renderer — CSS/JS constants + TypeScript schema-to-HTML builder.
 *
 * Zero imports from other visual/ modules — purely typed data-in, HTML-out.
 * Used by both cloud-llm.ts (assembly wrapper) and browser-llm.ts (full renderer).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type SectionType = 'impact-cards' | 'stats-highlight' | 'two-col' | 'text' | 'closing';

export interface HeroFields {
  orgLine: string;         // e.g. "People Tech & Services"
  highlightPhrase: string; // 3-5 words for gradient span
  tagline: string;         // ≤12 words
  prose: string;           // 1-2 sentences
  imagePath?: string;      // first image path
}

export interface ImpactCard {
  title: string;
  stat?: string;   // e.g. "300K" — optional numeric highlight
  desc: string;    // 15-20 words
}

export interface EnrichedSection {
  index: number;
  heading: string;
  sectionId: string;       // kebab-case anchor
  type: SectionType;
  badge: string;           // 2-3 word pill label
  lead: string;            // ≤18 word sentence
  cards: ImpactCard[];     // only for 'impact-cards'
  sectionStats: Array<{ value: string; label: string }>;
  paragraphs: string[];
  quote?: string;
  imagePath?: string;      // primary image (two-col media or photo-item)
  photoGrid?: string[];    // additional images shown as a photo-grid
}

export interface EnrichedSchema {
  pageTitle: string;
  hero: HeroFields;
  sections: EnrichedSection[];
  globalStats: Array<{ value: string; label: string }>;
  navLinks: Array<{ text: string; href: string }>;
}

// ── CSS/JS constants ──────────────────────────────────────────────────────────

/** Minified design system CSS injected into every premium page. */
export const PREMIUM_CSS = `:root{--primary:#041f41;--primary-90:rgba(4,31,65,0.92);--accent:#0071ce;--accent-light:#1a8fe8;--highlight:#06f27b;--white:#fff;--gray-50:#f8f9fa;--gray-200:#e2e4e8;--gray-600:#4a5060;--gray-800:#2d3240;--font:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;--m:3rem;--g:1.5rem;--xs:.5rem;--sm:1rem;--md:1.5rem;--lg:2.5rem;--xl:4rem;--2xl:6rem;--r-sm:6px;--r-md:12px;--r-lg:20px;--sh-sm:0 1px 3px rgba(0,0,0,.06);--sh-md:0 4px 16px rgba(0,0,0,.08);--sh-lg:0 8px 30px rgba(0,0,0,.12);--t-xs:.75rem;--t-sm:.85rem;--t-base:1rem;--t-lg:clamp(1.05rem,1.5vw,1.15rem);--t-xl:clamp(1.15rem,2vw,1.35rem);--t-2xl:clamp(1.35rem,2.2vw,1.65rem);--t-3xl:clamp(1.85rem,4vw,2.75rem);--t-5xl:clamp(2.4rem,5.5vw,4rem);--t-stat:clamp(2.25rem,4vw,3rem);--t-mk:clamp(80px,12vw,160px);--ease:cubic-bezier(.25,.1,.25,1)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:var(--font);font-size:17px;line-height:1.6;color:var(--gray-800);background:var(--white);overflow-x:hidden;-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%;height:auto}a{color:var(--accent);text-decoration:none}strong{font-weight:700}
.container{max-width:1140px;margin:0 auto;padding:0 var(--m)}
.skip-link{position:absolute;top:-100%;left:1rem;z-index:9999;padding:.75rem 1.25rem;background:var(--primary);color:var(--white);font-size:var(--t-sm);font-weight:600;border-radius:var(--r-sm);text-decoration:none}.skip-link:focus{top:1rem}
.sticky-nav{position:fixed;top:0;left:0;right:0;z-index:1000;transform:translateY(-100%);opacity:0;transition:transform .5s var(--ease),opacity .5s var(--ease)}.sticky-nav.visible{transform:translateY(0);opacity:1}
.sticky-nav__bar{background:var(--primary-90);backdrop-filter:blur(16px) saturate(1.4);position:relative}.scroll-progress{position:absolute;bottom:0;left:0;width:0%;height:2px;background:linear-gradient(90deg,var(--accent),var(--highlight))}
.sticky-nav__inner{display:flex;align-items:center;gap:var(--md);padding:.6rem var(--md);max-width:1140px;margin:0 auto;overflow-x:auto;scrollbar-width:none}.sticky-nav__inner::-webkit-scrollbar{display:none}
.sticky-nav__brand{display:flex;align-items:center;gap:.5rem;flex-shrink:0}.sticky-nav__brand-text{font-weight:700;font-size:var(--t-sm);color:var(--white);letter-spacing:.04em}
.sticky-nav__links{display:flex;gap:.2rem;list-style:none;margin-left:auto}.sticky-nav__link{color:rgba(255,255,255,.88);font-size:var(--t-sm);font-weight:600;padding:.35rem .85rem;border-radius:100px;white-space:nowrap;transition:color .3s,background .3s}.sticky-nav__link:hover{color:var(--white);background:rgba(255,255,255,.07)}.sticky-nav__link.active{color:var(--white);background:var(--accent)}
.hero{position:relative;min-height:100vh;display:flex;flex-direction:column;justify-content:center;background:var(--primary);color:var(--white);overflow:hidden}
.hero__bg{position:absolute;inset:0;z-index:0}.hero__bg img{width:100%;height:100%;object-fit:cover;object-position:center;opacity:.4}
.hero__overlay{position:absolute;inset:0;z-index:1;background:linear-gradient(to right,rgba(4,31,65,.92) 0%,rgba(4,31,65,.75) 40%,rgba(4,31,65,.35) 70%,transparent 100%),linear-gradient(to bottom,rgba(4,31,65,.1) 0%,transparent 25%,transparent 65%,rgba(4,31,65,.9) 100%)}
.hero__content{position:relative;z-index:2;padding:var(--xl) var(--m);max-width:1140px;margin:0 auto;width:100%}
.hero__org{font-size:var(--t-sm);font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:var(--highlight);margin-bottom:.6rem;opacity:0;animation:fade-up .8s .5s ease forwards}
.hero-title{font-size:var(--t-5xl);font-weight:300;line-height:1.05;letter-spacing:-.01em;opacity:0;animation:fade-up .8s .7s ease forwards}
.hero-title .highlight{font-weight:500;background:linear-gradient(135deg,var(--highlight),var(--accent-light));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero__tagline{font-size:var(--t-lg);margin-top:var(--sm);color:rgba(255,255,255,.9);opacity:0;animation:fade-up .8s .9s ease forwards}
.hero__divider{width:48px;height:2px;background:var(--highlight);margin:var(--md) 0;opacity:0;animation:fade-up .8s 1.1s ease forwards}
.hero__prose{max-width:640px;font-size:var(--t-base);line-height:1.7;color:rgba(255,255,255,.85);opacity:0;animation:fade-up .8s 1.3s ease forwards}.hero__prose strong{color:var(--white)}
.hero__scroll-cue{position:absolute;bottom:2rem;left:50%;transform:translateX(-50%);z-index:2;display:flex;flex-direction:column;align-items:center;gap:.5rem;color:rgba(255,255,255,.8);font-size:var(--t-xs);letter-spacing:.2em;text-transform:uppercase;font-weight:600}
.scroll-line{width:1px;height:32px;background:rgba(255,255,255,.2);position:relative;overflow:hidden}.scroll-line::after{content:'';position:absolute;top:-100%;left:0;width:100%;height:100%;background:var(--highlight);animation:scroll-drop 2.5s ease-in-out infinite}
.section{position:relative;padding:var(--2xl) 0}.section--dark{background:var(--primary);color:var(--white)}.section--deep{background:#021530;color:var(--white)}.section--gray{background:var(--gray-50)}.section--light{background:var(--white)}
.section-marker{position:absolute;top:2rem;right:2rem;font-size:var(--t-mk);font-weight:700;line-height:1;color:var(--primary);opacity:.04;pointer-events:none;user-select:none}.section--dark .section-marker,.section--deep .section-marker{color:var(--white);opacity:.03}
h2{font-size:var(--t-3xl);font-weight:500;line-height:1.2;color:var(--primary)}.section--dark h2,.section--deep h2{color:var(--white)}
h3{font-size:var(--t-xl);font-weight:700;color:var(--primary)}.section--dark h3,.section--deep h3{color:var(--white)}
.lead{font-size:var(--t-lg);line-height:1.6;color:var(--gray-600);margin:var(--xs) 0 var(--sm)}.section--dark .lead,.section--deep .lead{color:rgba(255,255,255,.9)}
.section__header{margin-bottom:var(--lg)}
.pillar-badge{display:inline-block;font-size:var(--t-xs);font-weight:700;padding:.3rem .85rem;border-radius:100px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.75rem;color:var(--white);background:var(--accent)}
.stats-row{display:flex;flex-wrap:wrap;gap:var(--g);margin:var(--sm) 0 var(--lg)}
.stat-inline{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:var(--md) var(--lg);background:var(--primary);border-radius:var(--r-md);min-width:140px}
.section--light .stat-inline,.section--gray .stat-inline{border:1px solid var(--gray-200)}.section--dark .stat-inline,.section--deep .stat-inline{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}
.stat-inline__number{font-size:var(--t-stat);font-weight:300;color:var(--highlight);line-height:1.1;letter-spacing:-.02em}
.stat-inline__label{font-size:var(--t-sm);color:rgba(255,255,255,.9);font-weight:500;margin-top:.4rem}.section--light .stat-inline__label,.section--gray .stat-inline__label{color:var(--gray-600)}
.impact-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:var(--g);margin:var(--sm) 0 var(--lg)}.impact-cards--3{grid-template-columns:repeat(3,1fr)}.impact-cards--2{grid-template-columns:repeat(2,1fr)}
.impact-card{background:var(--white);border-radius:var(--r-md);padding:var(--md);border-left:3px solid var(--highlight);box-shadow:var(--sh-sm);transition:box-shadow .3s}.impact-card:hover{box-shadow:var(--sh-md)}
.section--dark .impact-card,.section--deep .impact-card{background:rgba(255,255,255,.06);border-left-color:var(--highlight)}
.impact-card__stat{font-size:var(--t-2xl);font-weight:700;color:var(--accent);line-height:1.1;margin-bottom:.25rem}.section--dark .impact-card__stat,.section--deep .impact-card__stat{color:var(--highlight)}
.impact-card__label{font-size:var(--t-sm);font-weight:600;color:var(--gray-600);margin-bottom:.5rem}.section--dark .impact-card__label,.section--deep .impact-card__label{color:rgba(255,255,255,.9)}
.impact-card__desc{font-size:var(--t-sm);line-height:1.6;color:var(--gray-800)}.section--dark .impact-card__desc,.section--deep .impact-card__desc{color:rgba(255,255,255,.85)}
.two-col{display:grid;grid-template-columns:1fr;gap:var(--lg);align-items:start;margin-bottom:var(--lg)}.two-col__media img{width:100%;height:420px;object-fit:cover;border-radius:var(--r-lg)}
@media(min-width:768px){.two-col{grid-template-columns:1fr 1fr}.two-col--reverse .two-col__media{order:-1}.two-col--wide{grid-template-columns:1.5fr 1fr}}
.emphasis-block{margin:var(--sm) 0 var(--lg);font-size:var(--t-lg);line-height:1.6;color:var(--gray-600)}.emphasis-block em{font-style:normal;font-weight:700;color:var(--primary)}.section--dark .emphasis-block,.section--deep .emphasis-block{color:rgba(255,255,255,.9)}.section--dark .emphasis-block em,.section--deep .emphasis-block em{color:var(--white)}
.editorial-quote{position:relative;margin:var(--sm) 0 var(--lg);padding:var(--md) var(--lg);max-width:720px}.editorial-quote__mark{position:absolute;left:-1rem;top:-1rem;font-size:clamp(80px,12vw,140px);font-weight:700;line-height:1;color:var(--highlight);opacity:.15;font-family:Georgia,serif;pointer-events:none}.editorial-quote__text{font-size:var(--t-2xl);font-weight:300;line-height:1.3;color:var(--primary);position:relative;z-index:1}.section--dark .editorial-quote__text,.section--deep .editorial-quote__text{color:var(--white)}
.footer{background:#021530;color:rgba(255,255,255,.7);padding:var(--xl) 0 var(--md)}.footer__inner{display:grid;grid-template-columns:1.5fr 1fr;gap:var(--xl);margin-bottom:var(--lg)}.footer__brand{font-size:1.1rem;font-weight:700;color:var(--white);margin-bottom:var(--xs)}.footer__tagline{font-size:var(--t-sm);line-height:1.6}.footer__copyright{border-top:1px solid rgba(255,255,255,.08);padding-top:var(--md);text-align:center;font-size:var(--t-sm)}
@media(max-width:767px){:root{--m:1.5rem;--2xl:4rem}.impact-cards--3,.impact-cards--2{grid-template-columns:1fr}.two-col--wide{grid-template-columns:1fr}.footer__inner{grid-template-columns:1fr}.sticky-nav__links{display:none}}
@keyframes fade-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes scroll-drop{0%{top:-100%}40%{top:100%}100%{top:100%}}
.reveal{opacity:0;transform:translateY(24px);transition:opacity .7s var(--ease),transform .7s var(--ease)}.reveal.visible{opacity:1;transform:none}
.reveal--left{opacity:0;transform:translateX(-24px);transition:opacity .7s var(--ease),transform .7s var(--ease)}.reveal--left.visible{opacity:1;transform:none}
.reveal--right{opacity:0;transform:translateX(24px);transition:opacity .7s var(--ease),transform .7s var(--ease)}.reveal--right.visible{opacity:1;transform:none}
.reveal--delay-1{transition-delay:.1s}.reveal--delay-2{transition-delay:.2s}.reveal--delay-3{transition-delay:.3s}
.photo-item{border-radius:var(--r-lg);overflow:hidden;cursor:pointer;transition:transform .4s var(--ease);opacity:0;transform:scale(.95)}.photo-item.visible{opacity:1;transform:scale(1);transition:opacity .8s var(--ease),transform .8s var(--ease)}.photo-item:hover{transform:translateY(-3px)}.photo-item img{width:100%;height:320px;object-fit:cover;object-position:center;transition:transform .6s var(--ease);display:block}.photo-item:hover img{transform:scale(1.04)}
.photo-grid{display:grid;gap:var(--g);margin:var(--sm) 0 var(--lg);grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.photo-grid--2col{grid-template-columns:repeat(2,1fr)}.photo-grid--3col{grid-template-columns:repeat(3,1fr)}
.closing__photo{position:relative;width:100%;max-height:400px;overflow:hidden}.closing__photo img{width:100%;height:400px;object-fit:cover;object-position:center 30%;display:block}.closing__photo::after{content:'';position:absolute;inset:0;background:linear-gradient(to bottom,transparent 0%,var(--primary) 100%)}
@media(max-width:767px){.photo-grid--2col,.photo-grid--3col{grid-template-columns:1fr}.photo-item img{height:220px}}`;

/** Scroll, sticky-nav, and IntersectionObserver reveal script. */
export const PREMIUM_JS = `(function(){var nav=document.querySelector('.sticky-nav'),bar=document.querySelector('.scroll-progress'),secs=Array.from(document.querySelectorAll('section[id]')),links=Array.from(document.querySelectorAll('.sticky-nav__link'));function onScroll(){var s=window.scrollY,t=document.documentElement.scrollHeight-window.innerHeight;if(bar)bar.style.width=(t>0?s/t*100:0).toFixed(1)+'%';if(nav)nav.classList.toggle('visible',s>80);var cur='';secs.forEach(function(sec){if(sec.getBoundingClientRect().top<=120)cur=sec.id});links.forEach(function(a){a.classList.toggle('active',a.getAttribute('href')==='#'+cur)})}window.addEventListener('scroll',onScroll,{passive:true});var obs=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)e.target.classList.add('visible')})},{threshold:.1,rootMargin:'0px 0px -60px 0px'});document.querySelectorAll('.reveal,.reveal--left,.reveal--right,.photo-item').forEach(function(el){obs.observe(el)})})();`;

// ── HTML assembly wrapper ─────────────────────────────────────────────────────

/**
 * Wraps a raw HTML body string (from Gemini or TypeScript renderer) with full
 * DOCTYPE, head, PREMIUM_CSS, and injects PREMIUM_JS before </body>.
 */
export function assemblePremiumPage(body: string, pageTitle: string): string {
  // Strip any accidental markdown fences
  let cleaned = body.trim()
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  // If already a complete HTML document, return as-is
  if (/^<!doctype/i.test(cleaned)) {
    return cleaned;
  }

  // Extract <body>...</body> if full <html> without DOCTYPE
  if (/^<html/i.test(cleaned)) {
    const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    cleaned = bodyMatch ? `<body>${bodyMatch[1]}</body>` : `<body>\n${cleaned}\n</body>`;
  }

  // Wrap bare content in <body> if missing
  if (!cleaned.startsWith('<body')) {
    cleaned = `<body>\n${cleaned}\n</body>`;
  }

  // Inject JS before </body>
  cleaned = cleaned.replace(/<\/body>\s*$/i, `<script>${PREMIUM_JS}</script>\n</body>`);

  const safeTitle = escHtml(pageTitle);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<style>
${PREMIUM_CSS}
</style>
</head>
${cleaned}
</html>`;
}

// ── TypeScript HTML renderer ──────────────────────────────────────────────────

function escHtml(s: string): string {
  // Strip markdown bold/italic markers that leak in from DOCX extraction
  // (e.g. **Associate ****Engagement** → Associate Engagement)
  const stripped = s
    .replace(/\*{4}/g, '')              // **** → '' (adjacent bold runs)
    .replace(/\*\*(.+?)\*\*/gs, '$1')   // **bold** → bold
    .replace(/\*([^*]+)\*/g, '$1')      // *italic* → italic
    .replace(/\*+/g, '');              // dangling asterisks → ''
  return stripped
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sectionBg(sec: EnrichedSection, displayIndex: number, total: number): string {
  if (sec.type === 'closing') return 'section--dark';
  // stats-highlight without an image keeps its dark treatment; with an image it joins the rotation
  if (sec.type === 'stats-highlight' && !sec.imagePath && !(sec.photoGrid?.length)) {
    return 'section--dark';
  }
  if (displayIndex === 0) return 'section--gray';
  if (displayIndex === 1) return 'section--light';
  if (displayIndex === 2 && total > 2) return 'section--dark';
  return displayIndex % 2 === 0 ? 'section--gray' : 'section--light';
}

function renderSectionHeader(sec: EnrichedSection): string {
  const parts: string[] = [];
  if (sec.badge) {
    parts.push(`<div class="pillar-badge">${escHtml(sec.badge)}</div>`);
  }
  parts.push(`<h2>${escHtml(sec.heading)}</h2>`);
  if (sec.lead) {
    parts.push(`<p class="lead">${escHtml(sec.lead)}</p>`);
  }
  return `<div class="section__header">\n${parts.join('\n')}\n</div>`;
}

function renderPhotoBlock(sec: EnrichedSection): string {
  const all = [
    ...(sec.imagePath ? [sec.imagePath] : []),
    ...(sec.photoGrid ?? []),
  ];
  if (all.length === 0) return '';

  if (all.length === 1) {
    return `<div class="photo-item reveal" style="max-width:900px;margin:var(--md) auto 0">
  <img src="${escHtml(all[0])}" alt="${escHtml(sec.heading)}" loading="lazy">
</div>`;
  }

  const colClass = all.length >= 3 ? 'photo-grid--3col' : 'photo-grid--2col';
  const items = all.map(p =>
    `  <div class="photo-item"><img src="${escHtml(p)}" alt="${escHtml(sec.heading)}" loading="lazy"></div>`
  ).join('\n');
  return `<div class="photo-grid ${colClass} reveal--stagger" style="margin-top:var(--md)">
${items}
</div>`;
}

function renderEditorialQuote(quote: string): string {
  return `<div class="editorial-quote">
  <div class="editorial-quote__mark">\u201c</div>
  <div class="editorial-quote__text">${escHtml(quote)}</div>
</div>`;
}

function renderImpactCards(sec: EnrichedSection, bg: string): string {
  if (sec.cards.length === 0) return renderText(sec, bg);
  const countClass = sec.cards.length >= 3 ? 'impact-cards--3' : 'impact-cards--2';
  const cardHtml = sec.cards.map((c, j) => {
    const delay = j < 3 ? ` reveal--delay-${j + 1}` : '';
    const stat  = c.stat ? `\n    <div class="impact-card__stat">${escHtml(c.stat)}</div>` : '';
    return `  <div class="impact-card reveal${delay}">${stat}
    <div class="impact-card__label">${escHtml(c.title)}</div>
    <div class="impact-card__desc">${escHtml(c.desc)}</div>
  </div>`;
  }).join('\n');

  const markerNum = String(sec.index + 1).padStart(2, '0');
  const quoteHtml = sec.quote ? renderEditorialQuote(sec.quote) : '';
  const photoHtml = renderPhotoBlock(sec);

  return `<section class="section ${bg}" id="${escHtml(sec.sectionId)}">
  <div class="section-marker">${markerNum}</div>
  <div class="container">
    ${renderSectionHeader(sec)}
    <div class="impact-cards ${countClass}">
${cardHtml}
    </div>
    ${quoteHtml}
    ${photoHtml}
  </div>
</section>`;
}

function renderStatsHighlight(sec: EnrichedSection, bg: string): string {
  const markerNum = String(sec.index + 1).padStart(2, '0');
  const statsHtml = sec.sectionStats.map((st, j) => {
    const delay = j < 3 ? ` reveal--delay-${j + 1}` : '';
    return `  <div class="stat-inline reveal${delay}">
    <div class="stat-inline__number">${escHtml(st.value)}</div>
    <div class="stat-inline__label">${escHtml(st.label)}</div>
  </div>`;
  }).join('\n');

  const parasHtml = sec.paragraphs.map(p =>
    `    <p class="reveal">${escHtml(p)}</p>`
  ).join('\n');

  const photoHtml = renderPhotoBlock(sec);

  return `<section class="section ${bg}" id="${escHtml(sec.sectionId)}">
  <div class="section-marker">${markerNum}</div>
  <div class="container">
    ${renderSectionHeader(sec)}
    <div class="stats-row">
${statsHtml}
    </div>
${parasHtml}
    ${photoHtml}
  </div>
</section>`;
}

function renderTwoCol(sec: EnrichedSection, bg: string): string {
  const markerNum  = String(sec.index + 1).padStart(2, '0');
  const reverseClass = sec.index % 2 !== 0 ? ' two-col--reverse' : '';
  const parasHtml  = sec.paragraphs.map(p => `      <p class="reveal">${escHtml(p)}</p>`).join('\n');
  const quoteHtml  = sec.quote ? renderEditorialQuote(sec.quote) : '';
  const imgHtml    = sec.imagePath
    ? `<img src="${escHtml(sec.imagePath)}" alt="${escHtml(sec.heading)}">`
    : '';

  return `<section class="section ${bg}" id="${escHtml(sec.sectionId)}">
  <div class="section-marker">${markerNum}</div>
  <div class="container">
    ${renderSectionHeader(sec)}
    <div class="two-col${reverseClass}">
      <div class="two-col__content">
${parasHtml}
        ${quoteHtml}
      </div>
      <div class="two-col__media reveal--right">${imgHtml}</div>
    </div>
  </div>
</section>`;
}

function renderText(sec: EnrichedSection, bg: string): string {
  const markerNum = String(sec.index + 1).padStart(2, '0');
  const parasHtml = sec.paragraphs.map(p => `    <p class="reveal">${escHtml(p)}</p>`).join('\n');
  const quoteHtml = sec.quote ? renderEditorialQuote(sec.quote) : '';
  const photoHtml = renderPhotoBlock(sec);

  return `<section class="section ${bg}" id="${escHtml(sec.sectionId)}">
  <div class="section-marker">${markerNum}</div>
  <div class="container">
    ${renderSectionHeader(sec)}
${parasHtml}
    ${quoteHtml}
    ${photoHtml}
  </div>
</section>`;
}

function renderClosing(sec: EnrichedSection): string {
  const markerNum = String(sec.index + 1).padStart(2, '0');
  const parasHtml = sec.paragraphs.map(p => `    <p class="reveal">${escHtml(p)}</p>`).join('\n');
  const photoHtml = sec.imagePath
    ? `<div class="closing__photo"><img src="${escHtml(sec.imagePath)}" alt="${escHtml(sec.heading)}" loading="lazy"></div>\n`
    : '';

  return `<section class="section section--dark" id="${escHtml(sec.sectionId)}">
${photoHtml}  <div class="section-marker">${markerNum}</div>
  <div class="container" style="text-align:center;position:relative;z-index:1">
    <h2 class="reveal">${escHtml(sec.heading)}</h2>
${parasHtml}
  </div>
</section>`;
}

function renderNav(schema: EnrichedSchema): string {
  const links = schema.navLinks.map(l =>
    `      <li><a class="sticky-nav__link" href="${escHtml(l.href)}">${escHtml(l.text)}</a></li>`
  ).join('\n');

  return `<a class="skip-link" href="#main">Skip to content</a>
<nav class="sticky-nav" aria-label="Page navigation">
  <div class="sticky-nav__bar">
    <div class="scroll-progress"></div>
    <div class="sticky-nav__inner">
      <div class="sticky-nav__brand">
        <span class="sticky-nav__brand-text">${escHtml(schema.pageTitle)}</span>
      </div>
      <ul class="sticky-nav__links">
${links}
      </ul>
    </div>
  </div>
</nav>`;
}

function renderHero(schema: EnrichedSchema): string {
  const h    = schema.hero;
  const img  = h.imagePath
    ? `\n  <div class="hero__bg"><img src="${escHtml(h.imagePath)}" alt=""></div>\n  <div class="hero__overlay"></div>`
    : '';

  // Split title: everything before highlightPhrase + the phrase
  const titleText     = escHtml(schema.pageTitle);
  const highlightText = escHtml(h.highlightPhrase);
  const titleHtml     = titleText.includes(highlightText)
    ? titleText.replace(highlightText, `<span class="highlight">${highlightText}</span>`)
    : `${titleText} <span class="highlight">${highlightText}</span>`;

  return `<section class="hero" id="main">${img}
  <div class="hero__content">
    <p class="hero__org">${escHtml(h.orgLine)}</p>
    <h1 class="hero-title">${titleHtml}</h1>
    <p class="hero__tagline">${escHtml(h.tagline)}</p>
    <div class="hero__divider"></div>
    <div class="hero__prose"><p>${escHtml(h.prose)}</p></div>
  </div>
  <div class="hero__scroll-cue"><div class="scroll-line"></div><span>Scroll</span></div>
</section>`;
}

function renderGlobalStats(schema: EnrichedSchema): string {
  if (schema.globalStats.length < 2) return '';
  const statsHtml = schema.globalStats.map((st, i) => {
    const delay = i < 3 ? ` reveal--delay-${i + 1}` : '';
    return `  <div class="stat-inline reveal${delay}">
    <div class="stat-inline__number">${escHtml(st.value)}</div>
    <div class="stat-inline__label">${escHtml(st.label)}</div>
  </div>`;
  }).join('\n');

  return `<section class="section section--dark">
  <div class="container">
    <div class="stats-row">
${statsHtml}
    </div>
  </div>
</section>`;
}

function renderFooter(schema: EnrichedSchema): string {
  const year = new Date().getFullYear();
  return `<footer class="footer">
  <div class="container">
    <div class="footer__inner">
      <div>
        <div class="footer__brand">${escHtml(schema.pageTitle)}</div>
        <p class="footer__tagline">${escHtml(schema.hero.tagline)}</p>
      </div>
    </div>
    <div class="footer__copyright">&copy; ${year} ${escHtml(schema.pageTitle)}</div>
  </div>
</footer>`;
}

/**
 * Render a full premium HTML page body from an EnrichedSchema.
 * Returns a complete <!DOCTYPE html> string.
 */
export function buildPremiumFromSchema(schema: EnrichedSchema): string {
  const total = schema.sections.length;
  const parts: string[] = [];

  parts.push(renderNav(schema));
  parts.push(renderHero(schema));

  const globalStatsHtml = renderGlobalStats(schema);
  if (globalStatsHtml) parts.push(globalStatsHtml);

  schema.sections.forEach((sec, displayIndex) => {
    const bg = sectionBg(sec, displayIndex, total);
    switch (sec.type) {
      case 'impact-cards':
        parts.push(renderImpactCards(sec, bg));
        break;
      case 'stats-highlight':
        parts.push(renderStatsHighlight(sec, bg));
        break;
      case 'two-col':
        parts.push(renderTwoCol(sec, bg));
        break;
      case 'closing':
        parts.push(renderClosing(sec));
        break;
      default:
        parts.push(renderText(sec, bg));
    }
  });

  parts.push(renderFooter(schema));

  const bodyHtml = `<body>\n${parts.join('\n\n')}\n</body>`;
  return assemblePremiumPage(bodyHtml, schema.pageTitle);
}
