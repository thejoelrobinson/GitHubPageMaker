import type { Block, Page, Theme } from '../types';
import { renderBlock } from './blocks';
import { escapeHtml, stripMd } from '../utils';
import { state } from '../state';

// ── Section entrance animations ───────────────────────────────────────
//
// Nine popular patterns drawn from AOS, Animate.css and Framer Motion:
//   fade-up · fade-down · fade-in-left · fade-in-right · fade-in
//   zoom-in · zoom-out · flip-up · slide-up · blur-in
//
// Each animated block is wrapped in a <div data-wb-anim="…"> in the
// published HTML.  CSS holds the hidden initial state; the tiny
// IntersectionObserver script adds `.wb-anim-ready` on scroll-into-view,
// triggering the CSS transition.  The editor canvas never sees these
// wrappers — they are only emitted by generatePageHTML().

const SECTION_ANIM_CSS = `
/* overflow-x:clip clips horizontal overflow without creating a block formatting
   context, so position:sticky nav elements keep working correctly in all browsers. */
body{overflow-x:clip}
[data-wb-anim]{display:block}
/* Initial hidden state — only applied once .wb-anim-init is on <html>
   (set by JS below). This prevents a blank flash on first paint. */
html.wb-anim-init [data-wb-anim]:not(.wb-anim-ready){opacity:0}
html.wb-anim-init [data-wb-anim="fade-up"]:not(.wb-anim-ready){transform:translateY(44px)}
html.wb-anim-init [data-wb-anim="fade-down"]:not(.wb-anim-ready){transform:translateY(-44px)}
html.wb-anim-init [data-wb-anim="fade-in-left"]:not(.wb-anim-ready){transform:translateX(-44px)}
html.wb-anim-init [data-wb-anim="fade-in-right"]:not(.wb-anim-ready){transform:translateX(44px)}
html.wb-anim-init [data-wb-anim="zoom-in"]:not(.wb-anim-ready){transform:scale(.88)}
html.wb-anim-init [data-wb-anim="zoom-out"]:not(.wb-anim-ready){transform:scale(1.12)}
html.wb-anim-init [data-wb-anim="flip-up"]:not(.wb-anim-ready){transform:perspective(800px) rotateX(20deg);transform-origin:top center}
html.wb-anim-init [data-wb-anim="slide-up"]:not(.wb-anim-ready){transform:translateY(80px)}
html.wb-anim-init [data-wb-anim="blur-in"]:not(.wb-anim-ready){filter:blur(14px)}
[data-wb-anim].wb-anim-ready{opacity:1;transform:none;filter:none;transition:opacity var(--wb-dur,600ms) var(--wb-ease,ease),transform var(--wb-dur,600ms) var(--wb-ease,ease),filter var(--wb-dur,600ms) var(--wb-ease,ease);transition-delay:var(--wb-delay,0ms)}
@media(prefers-reduced-motion:reduce){[data-wb-anim]{opacity:1!important;transform:none!important;filter:none!important;transition:none!important}}`;

const SECTION_ANIM_SCRIPT = `<script>(function(){
  var els=document.querySelectorAll('[data-wb-anim]');
  if(!els.length)return;

  /* Fallback: no IntersectionObserver support → show everything immediately */
  if(!('IntersectionObserver' in window)){
    els.forEach(function(el){el.classList.add('wb-anim-ready')});
    return;
  }
  /* Reduced-motion: skip all animation, show immediately */
  if(window.matchMedia('(prefers-reduced-motion:reduce)').matches){
    els.forEach(function(el){el.classList.add('wb-anim-ready')});
    return;
  }

  /* Mark the document so CSS initial-hidden states activate.
     Elements already in the viewport get wb-anim-ready right now so they
     never flash invisible — only below-fold elements will animate on scroll. */
  document.documentElement.classList.add('wb-anim-init');
  var vh=window.innerHeight;
  var obs=new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting){e.target.classList.add('wb-anim-ready');obs.unobserve(e.target);}
    });
  },{threshold:0.08,rootMargin:'0px 0px -30px 0px'});

  els.forEach(function(el){
    /* Already fully above the fold → show immediately, no animation needed */
    var r=el.getBoundingClientRect();
    if(r.top<vh){el.classList.add('wb-anim-ready');}
    else{obs.observe(el);}
  });

  /* Safety net: if something prevents the IO from firing, show after 4s */
  setTimeout(function(){
    els.forEach(function(el){el.classList.add('wb-anim-ready')});
  },4000);
})();</script>`;

/** Wrap a block's rendered HTML with an entrance-animation container when animIn is set. */
function animWrap(block: Block, html: string): string {
  const anim = String(block.settings.animIn ?? '');
  if (!anim || anim === 'none') return html;
  const dur   = Number(block.settings.animDuration ?? 600);
  const delay = Number(block.settings.animDelay    ?? 0);
  const ease  = String(block.settings.animEasing   ?? 'ease');
  return `<div data-wb-anim="${escapeHtml(anim)}" style="--wb-dur:${dur}ms;--wb-delay:${delay}ms;--wb-ease:${escapeHtml(ease)}">${html}</div>`;
}

// ── Shared page CSS ────────────────────────────────────────────────────

const RESPONSIVE_NAV_CSS = `
.ws-hamburger{display:none!important}
@media(max-width:768px){
  .ws-nav-links{display:none;position:absolute;top:70px;left:0;right:0;background:inherit;flex-direction:column;gap:0;padding:12px 20px;box-shadow:0 4px 12px rgba(0,0,0,.1)}
  .ws-nav-links.open{display:flex!important}
  .ws-hamburger{display:flex!important}
}`;

const UTILITY_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{line-height:1.6;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto}
a{color:inherit}
@media(max-width:768px){
  [style*="grid-template-columns:repeat(3"],[style*="grid-template-columns:repeat(4"]{grid-template-columns:1fr!important}
  [style*="grid-template-columns:1.5fr"]{grid-template-columns:1fr!important}
  [style*="display:flex;gap:60px"]{flex-direction:column;gap:32px!important}
  [style*="padding:0 40px"]{padding:0 20px!important}
}`;

const NAV_SCRIPT = `<script>
(function(){
  var h=document.querySelector('.ws-hamburger');
  var l=document.querySelector('.ws-nav-links');
  if(h&&l)h.addEventListener('click',function(){l.classList.toggle('open')});
})();
</script>`;

function googleFontsUrl(theme: Theme): string {
  const fonts = new Set([theme.headingFont, theme.bodyFont]);
  const params = [...fonts]
    .map(f => `family=${encodeURIComponent(f)}:wght@300;400;500;600;700;800`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/** Strip characters that could break a CSS string value (single-quote, backslash, null). */
function safeCssString(s: string): string {
  return s.replace(/['\\]/g, '').replace(/\0/g, '');
}

function themeCSS(theme: Theme): string {
  return `:root{--primary:${theme.primary};--accent:${theme.accent};--text:${theme.text};--text-muted:${theme.textMuted};--bg:${theme.bg};--bg-alt:${theme.bgAlt};--font-heading:'${safeCssString(theme.headingFont)}',sans-serif;--font-body:'${safeCssString(theme.bodyFont)}',sans-serif;--radius:${theme.radius}px}
body{font-family:var(--font-body);color:var(--text);background:var(--bg);line-height:1.6}
h1,h2,h3,h4,h5,h6{font-family:var(--font-heading);color:var(--primary);line-height:1.2}
a{color:var(--accent);text-decoration:none}
small,figcaption,caption{color:var(--text-muted);font-size:.875em}
blockquote{border-left:3px solid var(--accent);color:var(--text-muted);padding-left:1em;font-style:italic;margin:1em 0}
code,kbd,samp{background:var(--bg-alt);border-radius:calc(var(--radius) / 2);padding:.1em .35em}
pre{background:var(--bg-alt);border-radius:var(--radius);padding:1em;overflow-x:auto}
pre code{background:none;padding:0}
th{font-family:var(--font-heading);color:var(--primary)}
td{color:var(--text)}
mark{background:var(--accent);color:#fff}
hr{border:none;border-top:1px solid var(--bg-alt);margin:1.5em 0}
button,[type=button],[type=submit],[type=reset]{font-family:var(--font-body);border-radius:var(--radius);cursor:pointer}
input:not([type=range]):not([type=checkbox]):not([type=radio]),select,textarea{font-family:var(--font-body);border-radius:var(--radius);color:var(--text);background:var(--bg)}
input:focus,select:focus,textarea:focus{outline-color:var(--accent)}`;
}

// ── In-iframe editing layer ─────────────────────────────────────────────

// IDs used to identify injected editing-layer elements so they can be
// stripped from the HTML before saving to the code editor / code tab.
export const WB_STYLE_ID   = 'wb-editing-css';
export const WB_SCRIPT_ID  = 'wb-editing-script';
export const WB_BASE_ID    = 'wb-base-tag';
// wb-toolbar already has id="wb-toolbar" in EDITING_TOOLBAR_HTML.

/** CSS injected into the editing iframe */
export const EDITING_CSS = `
[data-block-id]{position:relative;outline:2px solid transparent;outline-offset:-2px;transition:outline-color .15s;cursor:default}
[data-block-id]:hover{outline-color:rgba(0,120,212,.4)}
[data-block-id].wb-sel{outline-color:#0078d4}
.wb-controls{position:absolute;top:8px;right:8px;z-index:9998;display:flex;gap:3px;opacity:0;transition:opacity .15s;background:rgba(15,23,42,.88);border-radius:6px;padding:3px 5px;pointer-events:auto}
[data-block-id]:hover .wb-controls,[data-block-id].wb-sel .wb-controls{opacity:1}
.wbc{width:26px;height:26px;border:none;background:none;color:rgba(255,255,255,.75);cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;transition:all .1s;padding:0}
.wbc:hover{background:rgba(255,255,255,.15);color:#fff}
.wbc.del:hover{background:rgba(244,67,71,.25);color:#f88}
.wbc:disabled{opacity:.3;cursor:not-allowed}
.wbc.grip{cursor:grab;touch-action:none}
.wbc.grip:active{cursor:grabbing}
.wb-drag-over-before::before{content:'';display:block;height:3px;background:#0078d4;border-radius:2px;margin:0 16px;box-shadow:0 0 8px rgba(0,120,212,.6)}
.wb-drag-over-after::after{content:'';display:block;height:3px;background:#0078d4;border-radius:2px;margin:0 16px;box-shadow:0 0 8px rgba(0,120,212,.6)}
[data-wb-dragging]{opacity:.35;outline:2px dashed rgba(0,120,212,.5)!important}
.wb-add{position:relative;display:flex;align-items:center;justify-content:center;gap:6px;width:100%;border:none;background:transparent;padding:0;height:10px;overflow:visible;cursor:pointer;color:#0078d4;font-size:12px;font-weight:600;font-family:system-ui,-apple-system,sans-serif;transition:height .15s,background .12s;z-index:5}
.wb-add::before{content:'';position:absolute;top:50%;left:10%;right:10%;height:2px;background:rgba(0,120,212,.25);border-radius:2px;transform:translateY(-50%);transition:opacity .15s}
.wb-add .wb-add-label{display:none;white-space:nowrap}
.wb-add .wb-add-plus{display:none;width:20px;height:20px;border-radius:50%;background:#0078d4;color:#fff;font-size:14px;line-height:20px;text-align:center;flex-shrink:0}
.wb-add:hover,.wb-add:focus{height:38px;background:rgba(0,120,212,.07)}
.wb-add:hover::before,.wb-add:focus::before{opacity:0}
.wb-add:hover .wb-add-label,.wb-add:focus .wb-add-label{display:block}
.wb-add:hover .wb-add-plus,.wb-add:focus .wb-add-plus{display:flex;align-items:center;justify-content:center}
body.wb-interact .wb-add{display:none!important}
[data-field]{cursor:text;outline:1px dashed rgba(0,120,212,.3);outline-offset:2px;border-radius:2px}
[data-field]:hover{background:rgba(0,120,212,.08);outline-color:rgba(0,120,212,.6)}
[data-field]:focus,[data-field]:focus-within{outline:2px solid #0078d4!important;outline-offset:2px;border-radius:2px;background:rgba(0,120,212,.04);cursor:text}
.wb-toolbar{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;background:#1a1a1d;border:1px solid #383840;border-radius:7px;box-shadow:0 4px 20px rgba(0,0,0,.5);display:none;align-items:center;gap:2px;padding:4px 6px}
.wb-toolbar.show{display:flex}
.wbt{width:28px;height:26px;border-radius:4px;border:none;background:none;color:#8d8d9c;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;transition:all .15s;font-family:system-ui}
.wbt:hover{background:#2d2d33;color:#dcdce2}
.wbt-done{background:#0078d4;color:white;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;font-weight:500;font-family:system-ui}
.wb-sep{width:1px;height:16px;background:#383840;margin:0 2px}
[data-wb-highlighted]{outline:3px solid rgba(0,120,212,.7)!important;outline-offset:2px}
[data-wb-hovering]{outline:2px dashed rgba(0,120,212,.45)!important;outline-offset:3px}
body.wb-inspect *{cursor:crosshair!important}
body.wb-inspect [data-field]{cursor:text!important}
body.wb-inspect [data-wb-hovering]{outline:2px solid rgba(0,120,212,.85)!important;outline-offset:2px;background:rgba(0,120,212,.06)!important}
body.wb-interact [data-block-id]{outline:none!important;cursor:auto!important;transition:none!important}
body.wb-interact [data-block-id]:hover{outline:none!important}
body.wb-interact [data-block-id].wb-sel{outline:none!important}
body.wb-interact [data-wb-hovering]{outline:none!important;background:inherit!important}
body.wb-interact [data-wb-highlighted]{outline:none!important}
body.wb-interact .wb-controls{display:none!important;pointer-events:none!important}
body.wb-interact .wb-add{display:none!important}
body.wb-interact .wb-toolbar{display:none!important}
body.wb-interact #wb-elem-toolbar{display:none!important}
body.wb-interact #wb-ctx-menu{display:none!important}
body.wb-interact [data-field]{cursor:inherit!important;pointer-events:none!important;background:none!important;outline:none!important}
body.wb-interact [data-field]:hover{background:none!important}
body.wb-interact [data-field][contenteditable]{outline:none!important;background:none!important}
body.wb-interact *{cursor:auto!important}
body.wb-interact a,body.wb-interact button,body.wb-interact input,body.wb-interact select,body.wb-interact textarea,[data-wb-interact] a,[data-wb-interact] button{cursor:pointer!important;pointer-events:auto!important}
[data-wb-placeholder]:empty::before {
  content: attr(data-wb-placeholder);
  color: rgba(148,163,184,.5);
  font-style: italic;
  pointer-events: none;
  display: block;
}
.wb-img-empty {
  min-height: 80px;
  border: 2px dashed rgba(0,120,212,.3)!important;
  position: relative;
}
.wb-img-empty::after {
  content: 'Drop an image here';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(0,120,212,.6);
  font-size: 13px;
  font-family: system-ui, sans-serif;
  pointer-events: none;
}
body.wb-image-drag-over { outline: 3px dashed rgba(0,120,212,.5)!important; }
body.wb-image-drag-over img { outline: 4px dashed rgba(0,120,212,.8)!important; outline-offset: 3px; }
[data-drop-field].wb-drop-target { outline: 3px dashed rgba(0,120,212,.7)!important; outline-offset: 3px; }
[data-drop-field].wb-drop-active { outline: 3px solid #0078d4!important; outline-offset: 3px; background: rgba(0,120,212,.08)!important; }
body.wb-media-drag-over [data-drop-field] { outline: 2px dashed rgba(0,120,212,.4)!important; outline-offset: 2px; }
.wb-block-drop-before::before {
  content:''; display:block; height:4px; background:#0078d4; border-radius:2px;
  margin:0 20px; box-shadow:0 0 8px rgba(0,120,212,.5);
  animation:wb-drop-pulse .8s ease-in-out infinite alternate;
}
.wb-block-drop-after::after {
  content:''; display:block; height:4px; background:#0078d4; border-radius:2px;
  margin:0 20px; box-shadow:0 0 8px rgba(0,120,212,.5);
  animation:wb-drop-pulse .8s ease-in-out infinite alternate;
}
@keyframes wb-drop-pulse { from{opacity:.6} to{opacity:1} }
body.wb-block-drop-empty {
  outline:3px dashed rgba(0,120,212,.5)!important; outline-offset:-3px;
}
body.wb-block-drop-empty::after {
  content:'Drop element here'; display:flex; align-items:center; justify-content:center;
  min-height:200px; color:rgba(0,120,212,.7); font-size:16px; font-weight:600;
  font-family:system-ui,sans-serif;
}
/* ── Animation preview (fired by wb:replayAnim) ──────────────────────
   Uses data-wb-anim-preview so it never clashes with published data-wb-anim.
   CSS custom props --wb-anim-dur/delay/ease are set inline by the JS handler. */
[data-wb-anim-preview]:not(.wb-anim-ready){opacity:0!important;outline:none!important}
[data-wb-anim-preview="fade-up"]:not(.wb-anim-ready){transform:translateY(44px)}
[data-wb-anim-preview="fade-down"]:not(.wb-anim-ready){transform:translateY(-44px)}
[data-wb-anim-preview="fade-in-left"]:not(.wb-anim-ready){transform:translateX(-44px)}
[data-wb-anim-preview="fade-in-right"]:not(.wb-anim-ready){transform:translateX(44px)}
[data-wb-anim-preview="zoom-in"]:not(.wb-anim-ready){transform:scale(.88)}
[data-wb-anim-preview="zoom-out"]:not(.wb-anim-ready){transform:scale(1.12)}
[data-wb-anim-preview="flip-up"]:not(.wb-anim-ready){transform:perspective(800px) rotateX(20deg);transform-origin:top center}
[data-wb-anim-preview="slide-up"]:not(.wb-anim-ready){transform:translateY(80px)}
[data-wb-anim-preview="blur-in"]:not(.wb-anim-ready){filter:blur(14px)}
[data-wb-anim-preview].wb-anim-ready{
  opacity:1!important;transform:none!important;filter:none!important;
  transition:opacity var(--wb-anim-dur,600ms) var(--wb-anim-ease,ease),
             transform var(--wb-anim-dur,600ms) var(--wb-anim-ease,ease),
             filter var(--wb-anim-dur,600ms) var(--wb-anim-ease,ease);
  transition-delay:var(--wb-anim-delay,0ms);
}
`;

/** Editing toolbar HTML injected at start of <body> */
export const EDITING_TOOLBAR_HTML = `
<div id="wb-toolbar" class="wb-toolbar">
  <button class="wbt" data-cmd="bold" title="Bold"><b>B</b></button>
  <button class="wbt" data-cmd="italic" title="Italic"><i>I</i></button>
  <button class="wbt" data-cmd="underline" title="Underline"><u>U</u></button>
  <div class="wb-sep"></div>
  <button class="wbt" data-cmd="link" title="Link">
    <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13"><path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 2 2 0 0 0 2.83 0l2.5-2.5a2 2 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a2 2 0 0 1 2.83 0l1.25 1.25a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018L4.855 13.975a.5.5 0 0 0-.707 0 .5.5 0 0 0 0 .707l1.25 1.25a.75.75 0 1 1-1.06 1.06l-1.25-1.25a2 2 0 0 1 0-2.83Z"/></svg>
  </button>
  <div class="wb-sep"></div>
  <button class="wbt-done">Done</button>
</div>`;

/** Script injected into the editing iframe.
 *  Detects whether the page uses our block system or is raw HTML and
 *  activates the appropriate editing mode.
 *
 *  BLOCK MODE  (page has [data-block-id] elements)
 *    – Click a [data-field] element to edit its text inline
 *    – Block controls (↑↓ ⧉ 🗑) manage sections
 *
 *  DESIGN MODE (raw HTML page from the repo, no blocks)
 *    – document.designMode = 'on' — the whole page is editable
 *    – Any click puts the cursor in place; type to change text
 *    – Changes are serialised and sent to the parent as wb:htmlChange
 *    – Floating toolbar provides Bold / Italic / Underline / Link
 */
export const EDITING_SCRIPT = `
<script id="wb-editing-script">
(function(){
'use strict';
var P=window.parent;
var toolbar=document.getElementById('wb-toolbar');

// Height reporter (used by both modes)
// Height is now controlled by CSS on the parent — no resize messages needed.

// ── Detect editing mode ───────────────────────────────────────────
var hasBlocks = document.querySelectorAll('[data-block-id]').length > 0;

if(!hasBlocks){
  // ══════════════════════════════════════════════
  // DESIGN MODE — raw HTML from the repo
  // The entire document is editable. Changes are
  // serialised back to the parent on every edit.
  // ══════════════════════════════════════════════
  document.designMode = 'on';

  // Strip editing-layer elements so the code editor receives clean HTML.
  var WB_IDS = ['wb-editing-css','wb-editing-script','wb-toolbar','wb-base-tag'];
  function cleanHtmlForSync(){
    var clone = document.documentElement.cloneNode(true);
    WB_IDS.forEach(function(id){
      var el = clone.querySelector && clone.querySelector('#'+id);
      if(el && el.parentNode) el.parentNode.removeChild(el);
    });
    return clone.outerHTML;
  }

  // Debounced serialiser — fires 600 ms after the last change
  var saveTimer = null;
  function scheduleCapture(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){
      P.postMessage({type:'wb:htmlChange', html:cleanHtmlForSync()},'*');
    }, 600);
  }

  // Capture any content change
  document.addEventListener('input', scheduleCapture);

  // Show the toolbar while text is selected
  document.addEventListener('selectionchange', function(){
    var sel = window.getSelection();
    var hasSelection = sel && !sel.isCollapsed;
    if(toolbar) toolbar.classList.toggle('show', !!hasSelection);
  });

  // Toolbar commands (execCommand works fine in designMode)
  if(toolbar){
    toolbar.addEventListener('mousedown', function(e){
      // Prevent toolbar click from losing the current selection
      e.preventDefault();
    });
    toolbar.addEventListener('click', function(e){
      var cmd = e.target.closest('[data-cmd]');
      if(cmd){
        if(cmd.dataset.cmd === 'link'){
          var u = prompt('URL:');
          if(u) document.execCommand('createLink', false, u);
        } else {
          document.execCommand(cmd.dataset.cmd);
        }
        scheduleCapture();
      }
    });
  }

  // ── Tool mode (declare before first use in click/hover handlers) ─────
  var inspectMode=false;
  var interactMode=false;
  var hoverSectionIdx=-2;

  // ── DOM structure helpers (Design Mode Inspector) ─────────────────
  function buildSelector(el){
    var tag=el.tagName.toLowerCase();
    if(el.id&&!el.id.startsWith('wb-'))return tag+'#'+el.id;
    var classes=Array.prototype.filter.call(el.classList,function(c){return !c.startsWith('wb-');});
    if(classes.length)return tag+'.'+classes[0];
    return tag;
  }

  function inferSectionLabel(el,index){
    var tag=el.tagName.toLowerCase();
    if(tag==='nav')return 'Navigation';
    if(tag==='header')return 'Header';
    if(tag==='footer')return 'Footer';
    if(tag==='main')return 'Main';
    if(tag==='aside')return 'Sidebar';
    if(el.id){
      return el.id.replace(/[-_]/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});
    }
    var cls=el.className&&typeof el.className==='string'?el.className.toLowerCase():'';
    if(cls.indexOf('hero')>-1)return 'Hero';
    if(cls.indexOf('preloader')>-1||cls.indexOf('loader')>-1)return 'Preloader';
    if(cls.indexOf('nav')>-1)return 'Navigation';
    if(cls.indexOf('footer')>-1)return 'Footer';
    if(cls.indexOf('banner')>-1)return 'Banner';
    if(cls.indexOf('feature')>-1)return 'Features';
    if(cls.indexOf('about')>-1)return 'About';
    if(cls.indexOf('contact')>-1)return 'Contact';
    if(cls.indexOf('service')>-1)return 'Services';
    if(cls.indexOf('team')>-1)return 'Team';
    if(cls.indexOf('testimonial')>-1)return 'Testimonials';
    if(cls.indexOf('gallery')>-1)return 'Gallery';
    if(cls.indexOf('brand')>-1)return 'Brands';
    if(cls.indexOf('stat')>-1)return 'Stats';
    if(cls.indexOf('cta')>-1||cls.indexOf('call-to-action')>-1)return 'Call to Action';
    return 'Section '+(index+1);
  }

  function sendDomStructure(){
    if(!document.body){P.postMessage({type:'wb:domStructure',sections:[]},'*');return;}
    var children=document.body.children;
    var sections=[];
    var idx=0;
    for(var i=0;i<children.length;i++){
      var el=children[i];
      var tag=el.tagName;
      if(el.id&&el.id.startsWith('wb-'))continue;
      if(tag==='SCRIPT'||tag==='STYLE')continue;
      sections.push({
        index:idx,
        tag:tag.toLowerCase(),
        id:el.id||'',
        classes:el.className&&typeof el.className==='string'?el.className:'',
        label:inferSectionLabel(el,idx),
        selector:buildSelector(el)
      });
      idx++;
    }
    P.postMessage({type:'wb:domStructure',sections:sections},'*');
  }
  sendDomStructure();

  // ── Content placeholders ────────────────────────────────────────────
  (function addPlaceholders(){
    var textSelectors = ['h1','h2','h3','h4','p','span','a']; // Use JS check instead of :has() (not universally supported)
    textSelectors.forEach(function(sel){
      document.querySelectorAll(sel).forEach(function(el){
        // For spans: only add placeholder if the span has no child elements (pure text container)
        if(sel==='span' && el.children.length>0) return;
        if(!el.textContent.trim() && !el.dataset.wbPlaceholder) {
          var tag = el.tagName.toLowerCase();
          var hint = tag==='h1'?'Click to write your main heading'
                   : tag==='h2'?'Click to write a subheading'
                   : tag==='h3'||tag==='h4'?'Click to write a heading'
                   : tag==='p'?'Click to write a paragraph'
                   : tag==='a'?'Add link text'
                   : 'Click to add text';
          el.setAttribute('data-wb-placeholder', hint);
        }
      });
    });
    document.querySelectorAll('img').forEach(function(img){
      if(!img.src || img.src.endsWith('#') || img.naturalWidth===0) {
        img.classList.add('wb-img-empty');
      }
    });
  })();

  // ── Shared helper: find which section-list index an element belongs to ─
  function getSectionIndexFor(el){
    var sectionIndex=-1;
    var cur=el;
    while(cur&&cur!==document.body){
      if(cur.parentElement===document.body){
        var ch=document.body.children;
        var si=0;
        for(var j=0;j<ch.length;j++){
          var child=ch[j];
          if(child.id&&child.id.startsWith('wb-'))continue;
          if(child.tagName==='SCRIPT'||child.tagName==='STYLE')continue;
          if(child===cur){sectionIndex=si;break;}
          si++;
        }
        break;
      }
      cur=cur.parentElement;
    }
    return sectionIndex;
  }

  // ── Breadcrumb: DOM path from body to el ─────────────────────────────
  function getBreadcrumb(el){
    var crumbs=[];
    var cur=el;
    while(cur&&cur.parentElement&&cur!==document.body){
      var tag=cur.tagName.toLowerCase();
      var seg=tag;
      if(cur.id&&!cur.id.startsWith('wb-'))seg=tag+'#'+cur.id;
      else{
        var cls=Array.prototype.filter.call(cur.classList,function(c){return !c.startsWith('wb-');});
        if(cls.length)seg=tag+'.'+cls[0];
      }
      crumbs.unshift({tag:tag,label:seg,selector:buildSelector(cur)});
      cur=cur.parentElement;
    }
    return crumbs;
  }

  // ── Click: select element and send computed styles + breadcrumb ───────
  document.addEventListener('click',function(e){
    if(interactMode) return; // Interact mode: clicks are fully natural
    if(inspectMode){
      // Move highlight from hover state to click-selected state
      document.querySelectorAll('[data-wb-hovering]').forEach(function(hv){hv.removeAttribute('data-wb-hovering');});
      document.querySelectorAll('[data-wb-highlighted]').forEach(function(hl){hl.removeAttribute('data-wb-highlighted');});
    }
    var target=e.target;
    if(!target||!target.tagName)return;
    if(target.id&&target.id.startsWith('wb-'))return;
    if(target.closest&&target.closest('[id^="wb-"]'))return;
    var cs=window.getComputedStyle(target);
    if(inspectMode) showElemToolbar(target, cs);
    P.postMessage({
      type:'wb:elementSelect',
      selector:buildSelector(target),
      tagName:target.tagName.toLowerCase(),
      id:target.id||'',
      classes:target.className&&typeof target.className==='string'?target.className:'',
      inlineStyle:target.getAttribute('style')||'',
      sectionIndex:getSectionIndexFor(target),
      breadcrumb:getBreadcrumb(target),
      styles:{
        backgroundColor:cs.backgroundColor,
        color:cs.color,
        fontSize:cs.fontSize,
        fontFamily:cs.fontFamily,
        paddingTop:cs.paddingTop,
        paddingRight:cs.paddingRight,
        paddingBottom:cs.paddingBottom,
        paddingLeft:cs.paddingLeft,
        marginTop:cs.marginTop,
        marginRight:cs.marginRight,
        marginBottom:cs.marginBottom,
        marginLeft:cs.marginLeft,
        borderRadius:cs.borderRadius,
        lineHeight:cs.lineHeight,
        display:cs.display
      }
    },'*');
  });

  // ── Helper: convert rgb() to hex ──────────────────────────────────────
  function cssRgbToHex(rgb) {
    if(!rgb||rgb==='transparent') return null;
    var m = rgb.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if(!m) return null;
    return '#' + [m[1],m[2],m[3]].map(function(n){ return (+n).toString(16).padStart(2,'0'); }).join('');
  }

  // ── Floating element toolbar (appears on click in inspect mode) ─────
  var wbElemToolbar = null;
  function removeElemToolbar(){
    if(wbElemToolbar&&wbElemToolbar.parentNode) wbElemToolbar.parentNode.removeChild(wbElemToolbar);
    wbElemToolbar = null;
  }
  function showElemToolbar(target, cs) {
    removeElemToolbar();
    var rect = target.getBoundingClientRect();
    if(rect.width < 2 || rect.height < 2) return;
    var toolbar = document.createElement('div');
    toolbar.id = 'wb-elem-toolbar'; // ID ensures stripEditingArtifacts cleans it on save
    toolbar.className = 'wb-elem-toolbar';
    toolbar.style.cssText = 'position:fixed;z-index:10000;background:#1e293b;border:1px solid #334155;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.5);padding:4px 6px;display:flex;align-items:center;gap:4px;pointer-events:auto;font-family:system-ui,-apple-system,sans-serif';

    var bgHex = cssRgbToHex(cs.backgroundColor)||'#ffffff';
    var fgHex = cssRgbToHex(cs.color)||'#000000';
    var sel   = buildSelector(target);

    toolbar.innerHTML = [
      '<label title="Background color" style="display:flex;align-items:center;gap:3px;cursor:pointer">',
      '  <span style="font-size:10px;color:#94a3b8">BG</span>',
      '  <input type="color" value="'+bgHex+'" style="width:22px;height:22px;border-radius:3px;border:1px solid #475569;cursor:pointer;padding:1px;background:none" class="wbet-bg-color">',
      '</label>',
      '<div style="width:1px;height:16px;background:#334155"></div>',
      '<label title="Text color" style="display:flex;align-items:center;gap:3px;cursor:pointer">',
      '  <span style="font-size:10px;color:#94a3b8">T</span>',
      '  <input type="color" value="'+fgHex+'" style="width:22px;height:22px;border-radius:3px;border:1px solid #475569;cursor:pointer;padding:1px;background:none" class="wbet-fg-color">',
      '</label>',
      '<div style="width:1px;height:16px;background:#334155"></div>',
      '<span style="font-size:10px;color:#94a3b8">Pad</span>',
      '<input type="range" min="0" max="80" step="4" value="'+Math.round(parseFloat(cs.paddingTop))+'" style="width:60px;accent-color:#0078d4;cursor:pointer" class="wbet-padding">',
      '<div style="width:1px;height:16px;background:#334155"></div>',
      '<button title="Delete this section" style="width:26px;height:26px;border-radius:4px;border:none;background:none;color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .1s;font-size:14px" class="wbet-delete">X</button>',
      '<button title="Close toolbar" style="width:22px;height:22px;border-radius:4px;border:none;background:none;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px" class="wbet-close">x</button>',
    ].join('');

    var toolbarH = 38;
    var top = rect.top > toolbarH + 8 ? rect.top - toolbarH - 8 : rect.bottom + 4;
    var left = Math.max(4, Math.min(rect.left, window.innerWidth - 300));
    toolbar.style.top = top + 'px';
    toolbar.style.left = left + 'px';
    document.body.appendChild(toolbar);
    wbElemToolbar = toolbar;

    toolbar.querySelector('.wbet-bg-color').addEventListener('input', function(ev){
      P.postMessage({ type:'wb:setInlineStyle', selector:sel, property:'background-color', value:ev.target.value }, '*');
    });
    toolbar.querySelector('.wbet-fg-color').addEventListener('input', function(ev){
      P.postMessage({ type:'wb:setInlineStyle', selector:sel, property:'color', value:ev.target.value }, '*');
    });
    toolbar.querySelector('.wbet-padding').addEventListener('input', function(ev){
      P.postMessage({ type:'wb:setInlineStyle', selector:sel, property:'padding', value:ev.target.value+'px' }, '*');
    });
    var delBtn = toolbar.querySelector('.wbet-delete');
    delBtn.onmouseenter = function(){ delBtn.style.background='rgba(244,67,71,.2)'; delBtn.style.color='#f88'; };
    delBtn.onmouseleave = function(){ delBtn.style.background=''; delBtn.style.color='#94a3b8'; };
    delBtn.addEventListener('click', function(){
      removeElemToolbar();
      P.postMessage({ type:'wb:contextAction', action:'deleteSection', selector:sel }, '*');
    });
    var closeBtn = toolbar.querySelector('.wbet-close');
    closeBtn.onmouseenter = function(){ closeBtn.style.color='#94a3b8'; };
    closeBtn.onmouseleave = function(){ closeBtn.style.color='#64748b'; };
    closeBtn.addEventListener('click', removeElemToolbar);
  }

  // ── Right-click context menu (inspect mode only) ────────────────────
  var wbCtxMenu = null;
  function removeCtxMenu(){
    if(wbCtxMenu && wbCtxMenu.parentNode) wbCtxMenu.parentNode.removeChild(wbCtxMenu);
    wbCtxMenu = null;
  }
  document.addEventListener('contextmenu', function(e){
    if(!inspectMode) return;
    e.preventDefault();
    removeCtxMenu();
    var target = e.target;
    if(!target||!target.tagName) return;
    var isImg = target.tagName==='IMG' || target.closest('img');
    var menu = document.createElement('div');
    menu.id = 'wb-ctx-menu'; // ID ensures stripEditingArtifacts cleans it on save
    menu.className = 'wb-ctx-menu';
    menu.style.cssText = 'position:fixed;z-index:10001;background:#1e293b;border:1px solid #334155;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.5);padding:4px;min-width:160px;font-family:system-ui,-apple-system,sans-serif';
    menu.style.left = Math.min(e.clientX, window.innerWidth-170)+'px';
    menu.style.top  = Math.min(e.clientY, window.innerHeight-200)+'px';
    var items = [
      { icon:'Edit', label:'Edit Text', action:'editText' },
      { icon:'Paint', label:'Change Background', action:'changeBackground' },
    ];
    if(isImg) items.splice(1, 0, { icon:'Img', label:'Replace Image', action:'replaceImage' });
    items.push({ sep: true });
    items.push({ icon:'Copy', label:'Copy Section', action:'copySection' });
    items.push({ icon:'Del', label:'Delete Section', action:'deleteSection' });
    items.push({ sep: true });
    items.push({ icon:'Find', label:'Inspect in Panel', action:'inspectPanel' });
    items.forEach(function(item){
      if(item.sep) {
        var sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:#334155;margin:3px 0';
        menu.appendChild(sep); return;
      }
      var btn = document.createElement('div');
      btn.style.cssText = 'padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;color:#cbd5e1;display:flex;align-items:center;gap:8px;transition:background .1s';
      btn.innerHTML = '<span style="font-size:10px;opacity:.7">'+item.icon+'</span><span>'+item.label+'</span>';
      btn.onmouseenter = function(){btn.style.background='#334155'; btn.style.color='#e2e8f0';};
      btn.onmouseleave = function(){btn.style.background=''; btn.style.color='#cbd5e1';};
      btn.onclick = function(){
        removeCtxMenu();
        P.postMessage({ type:'wb:contextAction', action:item.action, selector:buildSelector(target), tagName:target.tagName.toLowerCase() }, '*');
      };
      menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    wbCtxMenu = menu;
  });
  document.addEventListener('click', function(){ removeCtxMenu(); });
  document.addEventListener('scroll', function(){ removeCtxMenu(); }, true);

  // ── Image drag/drop from OS ─────────────────────────────────────────
  document.addEventListener('dragover', function(e){
    if(!e.dataTransfer||!e.dataTransfer.types||!Array.prototype.includes.call(e.dataTransfer.types,'Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    document.body.classList.add('wb-image-drag-over');
  });
  document.addEventListener('dragleave', function(e){
    if(!e.relatedTarget || e.relatedTarget===document.documentElement) {
      document.body.classList.remove('wb-image-drag-over');
    }
  });
  document.addEventListener('drop', function(e){
    document.body.classList.remove('wb-image-drag-over');
    if(!e.dataTransfer||!e.dataTransfer.files||!e.dataTransfer.files.length) return;
    var file = e.dataTransfer.files[0];
    if(!file||!file.type.startsWith('image/')) return;
    e.preventDefault();
    var nearestImg = null;
    var minDist = Infinity;
    document.querySelectorAll('img').forEach(function(img){
      var r = img.getBoundingClientRect();
      var cx = r.left+r.width/2; var cy = r.top+r.height/2;
      var dist = Math.hypot(e.clientX-cx, e.clientY-cy);
      if(dist < minDist){ minDist=dist; nearestImg=img; }
    });
    var reader = new FileReader();
    reader.onload = function(ev){
      var base64 = ev.target.result.split(',')[1];
      P.postMessage({
        type: 'wb:imageUpload',
        base64: base64,
        filename: file.name,
        mimeType: file.type,
        targetSelector: nearestImg ? buildSelector(nearestImg) : null
      }, '*');
    };
    reader.readAsDataURL(file);
  });

  // ── Hover: notify parent + element-level highlight in inspect mode ───
  document.addEventListener('mouseover',function(e){
    if(interactMode) return; // Interact mode: no editor hover feedback
    var target=e.target;
    if(!target||!target.tagName)return;
    if(target.id&&target.id.startsWith('wb-'))return;
    if(target.closest&&target.closest('[id^="wb-"]'))return;
    if(inspectMode){
      document.querySelectorAll('[data-wb-hovering]').forEach(function(hv){hv.removeAttribute('data-wb-hovering');});
      target.setAttribute('data-wb-hovering','1');
    }
    var idx=getSectionIndexFor(target);
    if(idx!==hoverSectionIdx){
      hoverSectionIdx=idx;
      P.postMessage({type:'wb:elementHover',sectionIndex:idx},'*');
    }
  });
  document.addEventListener('mouseleave',function(){
    hoverSectionIdx=-2;
    if(inspectMode){
      document.querySelectorAll('[data-wb-hovering]').forEach(function(hv){hv.removeAttribute('data-wb-hovering');});
    }
    P.postMessage({type:'wb:elementHoverEnd'},'*');
  });

  // ── Handle inspector messages from the builder parent ─────────────────
  window.addEventListener('message',function(e){
    if(!e.data)return;
    var d=e.data;
    var dmEl,dmTarget,dmPrev,dmNext,dmFrom,dmTo,dmNx;
    if(d.type==='wb:setInlineStyle'){
      dmEl=document.querySelector(d.selector);
      if(dmEl){
        dmEl.style[d.property.replace(/-([a-z])/g,function(m,c){return c.toUpperCase();})] = d.value;
        scheduleCapture();
      }
    }
    if(d.type==='wb:highlightSection'){
      document.querySelectorAll('[data-wb-highlighted]').forEach(function(hl){hl.removeAttribute('data-wb-highlighted');});
      dmTarget=document.querySelector(d.selector);
      if(dmTarget){
        dmTarget.setAttribute('data-wb-highlighted','1');
        dmTarget.scrollIntoView({behavior:'smooth',block:'nearest'});
      }
    }
    if(d.type==='wb:hoverSection'){
      document.querySelectorAll('[data-wb-hovering]').forEach(function(hv){hv.removeAttribute('data-wb-hovering');});
      dmEl=document.querySelector(d.selector);
      if(dmEl)dmEl.setAttribute('data-wb-hovering','1');
    }
    if(d.type==='wb:unhoverSection'){
      document.querySelectorAll('[data-wb-hovering]').forEach(function(hv){hv.removeAttribute('data-wb-hovering');});
    }
    if(d.type==='wb:moveSection'){
      dmEl=document.querySelector(d.selector);
      if(!dmEl)return;
      if(d.direction==='up'){
        dmPrev=dmEl.previousElementSibling;
        while(dmPrev&&((dmPrev.id&&dmPrev.id.startsWith('wb-'))||dmPrev.tagName==='SCRIPT'||dmPrev.tagName==='STYLE')){
          dmPrev=dmPrev.previousElementSibling;
        }
        if(dmPrev)dmPrev.parentNode.insertBefore(dmEl,dmPrev);
      } else {
        dmNext=dmEl.nextElementSibling;
        while(dmNext&&((dmNext.id&&dmNext.id.startsWith('wb-'))||dmNext.tagName==='SCRIPT'||dmNext.tagName==='STYLE')){
          dmNext=dmNext.nextElementSibling;
        }
        if(dmNext)dmNext.parentNode.insertBefore(dmNext,dmEl);
      }
      scheduleCapture();
      sendDomStructure();
    }
    if(d.type==='wb:reorderSection'){
      dmFrom=document.querySelector(d.fromSelector);
      dmTo=document.querySelector(d.toSelector);
      if(!dmFrom||!dmTo||dmFrom===dmTo)return;
      if(d.position==='before'){
        dmTo.parentNode.insertBefore(dmFrom,dmTo);
      } else {
        dmNx=dmTo.nextSibling;
        if(dmNx)dmTo.parentNode.insertBefore(dmFrom,dmNx);
        else dmTo.parentNode.appendChild(dmFrom);
      }
      scheduleCapture();
      sendDomStructure();
    }
    if(d.type==='wb:deleteSection'){
      dmEl=document.querySelector(d.selector);
      if(dmEl&&dmEl.parentNode){
        dmEl.parentNode.removeChild(dmEl);
        scheduleCapture();
        sendDomStructure();
      }
    }
    if(d.type==='wb:setCssLive'){
      var liveStyle=document.getElementById('wb-css-live');
      if(!liveStyle){
        liveStyle=document.createElement('style');
        liveStyle.id='wb-css-live';
        document.head.appendChild(liveStyle);
      }
      liveStyle.textContent=d.css;
    }
    if(d.type==='wb:setInspectMode'){
      inspectMode=!!d.active;
      if(!interactMode){
        // designMode stays 'on' — text is always editable unless in Preview (interact) mode
        document.body.classList.toggle('wb-inspect',inspectMode);
      }
      if(!inspectMode){
        document.querySelectorAll('[data-wb-hovering]').forEach(function(hv){hv.removeAttribute('data-wb-hovering');});
        removeElemToolbar();
        removeCtxMenu();
      }
    }
    if(d.type==='wb:setInteractMode'){
      interactMode=!!d.active;
      document.body.classList.toggle('wb-interact',interactMode);
      if(interactMode){
        // Exit any editing state cleanly
        document.designMode='off';
        document.body.classList.remove('wb-inspect');
        document.querySelectorAll('[data-wb-hovering]').forEach(function(el){el.removeAttribute('data-wb-hovering');});
        document.querySelectorAll('[data-wb-highlighted]').forEach(function(el){el.removeAttribute('data-wb-highlighted');});
        document.querySelectorAll('.wb-sel').forEach(function(el){el.classList.remove('wb-sel');});
        removeElemToolbar();
        removeCtxMenu();
      } else {
        // Leaving Preview — restore text editing and inspect overlays
        document.designMode='on';
        document.body.classList.toggle('wb-inspect',inspectMode);
      }
    }
    if(d.type==='wb:duplicateSection'){
      dmEl=document.querySelector(d.selector);
      if(dmEl&&dmEl.parentNode){
        var cloned=dmEl.cloneNode(true);
        dmEl.parentNode.insertBefore(cloned,dmEl.nextSibling);
        scheduleCapture();
        sendDomStructure();
      }
    }
    if(d.type==='wb:setImgSrc'){
      var imgEl = d.selector ? document.querySelector(d.selector) : document.querySelector('img');
      if(imgEl) {
        imgEl.src = d.src;
        imgEl.classList.remove('wb-img-empty');
        scheduleCapture();
      }
    }
  });

} else {
  // ══════════════════════════════════════════════
  // BLOCK MODE — page built with the visual editor
  // All [data-field] elements are always editable.
  // ══════════════════════════════════════════════
  var customEditEl = null, customEditBid = null;

  // Convert an editable element's innerHTML back to markdown for storage.
  // Handles bold/italic from both typing and toolbar (execCommand may emit <b>/<i>).
  function htmlToMd(html){
    return html
      .replace(/<strong>([\s\S]*?)<\/strong>/gi,'**$1**')
      .replace(/<b>([\s\S]*?)<\/b>/gi,'**$1**')
      .replace(/<em>([\s\S]*?)<\/em>/gi,'*$1*')
      .replace(/<i>([\s\S]*?)<\/i>/gi,'*$1*')
      .replace(/<br\s*\/?>/gi,'\n')
      .replace(/<\/p>/gi,'\n').replace(/<p[^>]*>/gi,'')
      .replace(/<\/div>/gi,'\n').replace(/<div[^>]*>/gi,'')
      .replace(/<[^>]+>/g,'')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
      .replace(/\n{3,}/g,'\n\n')
      .trim();
  }

  // Make every [data-field] immediately contenteditable so clicking
  // places the caret naturally — no click-to-activate needed.
  // Rendered HTML (bold/italic) is kept as-is so users see formatted text.
  function activateFields(){
    document.querySelectorAll('[data-field]').forEach(function(f){
      if(f.contentEditable==='true')return;
      f.contentEditable='true';
      // Ensure the element is keyboard-focusable in all browsers (Safari requires
      // tabIndex on non-interactive elements even when contentEditable is set).
      if(!f.hasAttribute('tabindex'))f.setAttribute('tabindex','0');
    });
  }
  function deactivateFields(){
    document.querySelectorAll('[data-field]').forEach(function(f){f.contentEditable='false';});
  }
  activateFields();

  // Save a field whenever it loses focus — convert innerHTML back to markdown
  document.addEventListener('blur',function(e){
    var f=e.target;
    if(!f||!f.dataset||!f.dataset.field)return;
    var bid=f.dataset.blockId;
    if(bid)P.postMessage({type:'wb:textSave',blockId:bid,field:f.dataset.field,value:htmlToMd(f.innerHTML)},'*');
  },true);

  document.addEventListener('click',function(e){
    if(interactMode) return;
    if(e.target.closest('.wb-controls')||e.target.closest('.wb-add'))return;

    // Custom-block inline editing (raw HTML blocks)
    var inner=e.target.closest('.wb-inner');
    if(inner&&!e.target.closest('[data-field]')){
      var customBlk=inner.closest('[data-block-type="custom"]');
      if(customBlk){
        endCustomEdit();
        customEditEl=inner;customEditBid=customBlk.dataset.blockId;
        inner.contentEditable='true';inner.focus();
        if(toolbar)toolbar.classList.add('show');
        doSel(customBlk.dataset.blockId);
        e.stopPropagation();
        return;
      }
    }

    // Place caret at click position — don't preventDefault so the browser also
    // handles cursor placement naturally (prevents Safari/Chrome cursor loss).
    var field=e.target.closest('[data-field]');
    if(field){
      field.focus();
      var sel=window.getSelection();
      if(sel){
        var range=null;
        if(document.caretRangeFromPoint){
          range=document.caretRangeFromPoint(e.clientX,e.clientY);
        }else if(document.caretPositionFromPoint){
          var cpos=document.caretPositionFromPoint(e.clientX,e.clientY);
          if(cpos){range=document.createRange();range.setStart(cpos.offsetNode,cpos.offset);range.collapse(true);}
        }
        if(range){sel.removeAllRanges();sel.addRange(range);}
      }
    }

    // Select the block for the properties panel
    var blk=e.target.closest('[data-block-id]');
    if(blk){doSel(blk.dataset.blockId);e.stopPropagation();return;}
    endCustomEdit();doDeSel();
  });

  function endCustomEdit(){
    if(!customEditEl)return;
    var el=customEditEl,bid=customEditBid;
    customEditEl=null;customEditBid=null;
    el.contentEditable='false';
    if(toolbar)toolbar.classList.remove('show');
    if(bid)P.postMessage({type:'wb:customHtmlSave',blockId:bid,html:el.innerHTML},'*');
  }

  function doSel(id){
    document.querySelectorAll('[data-block-id].wb-sel').forEach(function(el){el.classList.remove('wb-sel');});
    var el=document.querySelector('[data-block-id="'+id+'"]');
    if(el)el.classList.add('wb-sel');
    P.postMessage({type:'wb:select',id:id},'*');
  }
  function doDeSel(){
    document.querySelectorAll('[data-block-id].wb-sel').forEach(function(el){el.classList.remove('wb-sel');});
    P.postMessage({type:'wb:deselect'},'*');
  }

  window.addEventListener('message',function(e){
    if(!e.data)return;
    if(e.data.type==='wb:select'){
      document.querySelectorAll('[data-block-id].wb-sel').forEach(function(b){b.classList.remove('wb-sel');});
      var selEl=document.querySelector('[data-block-id="'+e.data.id+'"]');
      if(selEl)selEl.classList.add('wb-sel');
    }
    if(e.data.type==='wb:deselect'){
      document.querySelectorAll('[data-block-id].wb-sel').forEach(function(b){b.classList.remove('wb-sel');});
    }
    if(e.data.type==='wb:setInteractMode'){
      interactMode=!!e.data.active;
      document.body.classList.toggle('wb-interact',interactMode);
      if(interactMode){endCustomEdit();deactivateFields();}
      else{activateFields();}
    }
    if(e.data.type==='wb:replayAnim'){
      var animEl=document.querySelector('[data-block-id="'+e.data.blockId+'"]');
      if(!animEl||!e.data.animIn||e.data.animIn==='none')return;
      var animDur=Number(e.data.duration)||600;
      var animDelay=Number(e.data.delay)||0;
      var animEase=e.data.ease||'ease';
      // Cancel any in-progress preview first
      animEl.removeAttribute('data-wb-anim-preview');
      animEl.classList.remove('wb-anim-ready');
      animEl.style.removeProperty('--wb-anim-dur');
      animEl.style.removeProperty('--wb-anim-delay');
      animEl.style.removeProperty('--wb-anim-ease');
      // Scroll block into view before playing
      animEl.scrollIntoView({behavior:'smooth',block:'center'});
      // Set CSS custom props, then attach the initial-state attribute
      animEl.style.setProperty('--wb-anim-dur',animDur+'ms');
      animEl.style.setProperty('--wb-anim-delay',animDelay+'ms');
      animEl.style.setProperty('--wb-anim-ease',animEase);
      animEl.setAttribute('data-wb-anim-preview',e.data.animIn);
      // Two rAFs: first forces a style recalc, second starts the transition
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          animEl.classList.add('wb-anim-ready');
          setTimeout(function(){
            animEl.removeAttribute('data-wb-anim-preview');
            animEl.classList.remove('wb-anim-ready');
            animEl.style.removeProperty('--wb-anim-dur');
            animEl.style.removeProperty('--wb-anim-delay');
            animEl.style.removeProperty('--wb-anim-ease');
          },animDur+animDelay+350);
        });
      });
    }
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){
      if(dragBlockId) cancelDrag();
      if(document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.field){
        document.activeElement.blur();
      }
      endCustomEdit();
      doDeSel();
    }
  });

  // ── Drag-to-reorder (mouse-based, within-iframe) ─────────────────
  var dragBlockId=null,dragEl=null,dragDropTarget=null,dragInsertBefore=false;

  window._startBlockDrag=function(e,id){
    e.preventDefault();
    // Guard against stale state from previous incomplete drag
    if(dragBlockId)cancelDrag();
    dragBlockId=id;
    dragEl=document.querySelector('[data-block-id="'+id+'"]');
    if(dragEl)dragEl.setAttribute('data-wb-dragging','1');
    // Remove before re-adding to prevent listener accumulation
    document.removeEventListener('mousemove',onDragMove);
    document.removeEventListener('mouseup',onDragEnd);
    document.addEventListener('mousemove',onDragMove);
    document.addEventListener('mouseup',onDragEnd);
  };

  function clearDragHighlights(){
    document.querySelectorAll('.wb-drag-over-before,.wb-drag-over-after').forEach(function(el){
      el.classList.remove('wb-drag-over-before','wb-drag-over-after');
    });
  }

  function cancelDrag(){
    clearDragHighlights();
    if(dragEl){dragEl.removeAttribute('data-wb-dragging');}
    dragBlockId=null;dragEl=null;dragDropTarget=null;
    document.removeEventListener('mousemove',onDragMove);
    document.removeEventListener('mouseup',onDragEnd);
  }

  function onDragMove(e){
    if(!dragBlockId)return;
    clearDragHighlights();
    var blocks=Array.from(document.querySelectorAll('[data-block-id]'));
    var target=null,before=false;
    for(var i=0;i<blocks.length;i++){
      var b=blocks[i];
      if(b.getAttribute('data-block-id')===dragBlockId)continue;
      var r=b.getBoundingClientRect();
      if(e.clientY>=r.top&&e.clientY<=r.bottom){
        target=b;before=(e.clientY<r.top+r.height/2);break;
      }
    }
    if(target){
      dragDropTarget=target.getAttribute('data-block-id');
      dragInsertBefore=before;
      target.classList.add(before?'wb-drag-over-before':'wb-drag-over-after');
    } else {
      dragDropTarget=null;
    }
  }

  function onDragEnd(){
    if(dragBlockId&&dragDropTarget){
      P.postMessage({type:'wb:blockReorder',fromId:dragBlockId,toId:dragDropTarget,insertBefore:dragInsertBefore},'*');
    }
    cancelDrag();
  }
}
})();
</script>`;

// ── Block wrapper for editing mode ─────────────────────────────────────

function editingBlockWrapper(block: Block, theme: Theme, idx: number, total: number): string {
  const id = escapeHtml(block.id);
  const isFirst = idx === 0;
  const isLast  = idx === total - 1;

  const upSvg   = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3.47 7.78a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1-1.06 1.06L8.75 4.56v8.19a.75.75 0 0 1-1.5 0V4.56L4.53 7.78a.75.75 0 0 1-1.06 0Z"/></svg>`;
  const downSvg = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M12.53 8.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L2.97 9.28a.75.75 0 0 1 1.06-1.06l2.72 2.72V2.75a.75.75 0 0 1 1.5 0v8.19l2.72-2.72a.75.75 0 0 1 1.06 0Z"/></svg>`;
  const dupSvg  = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>`;
  const delSvg  = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.559a.75.75 0 1 0-1.492.142l.94 9.48A1.75 1.75 0 0 0 5.688 17.5h4.624a1.75 1.75 0 0 0 1.744-1.319l.94-9.48a.75.75 0 0 0-1.492-.142l-.94 9.48a.25.25 0 0 1-.249.188H5.688a.25.25 0 0 1-.249-.188l-.943-9.479Z"/></svg>`;
  const gripSvg = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/></svg>`;

  return `<div data-block-id="${id}" data-block-type="${escapeHtml(block.type)}" style="position:relative">
  <div class="wb-controls">
    <button class="wbc grip" data-drag-id="${id}" title="Drag to reorder" onmousedown="window._startBlockDrag(event,'${id}')">${gripSvg}</button>
    <button class="wbc" onclick="window.parent._moveBlock('${id}',-1)" title="Move Up" ${isFirst ? 'disabled' : ''}>${upSvg}</button>
    <button class="wbc" onclick="window.parent._moveBlock('${id}',1)" title="Move Down" ${isLast ? 'disabled' : ''}>${downSvg}</button>
    <button class="wbc" onclick="window.parent._duplicateBlock('${id}')" title="Duplicate">${dupSvg}</button>
    <button class="wbc del" onclick="window.parent._deleteBlock('${id}')" title="Delete">${delSvg}</button>
  </div>
  <div class="wb-inner">${renderBlock(block, theme, true)}</div>
  <button class="wb-add" onclick="window.parent._addBlockHere('${id}')"><span class="wb-add-plus">+</span><span class="wb-add-label">Add Section</span></button>
</div>`;
}

// ── Public API ─────────────────────────────────────────────────────────

/** Full HTML for publishing to GitHub Pages */
export function generatePageHTML(
  page: Page,
  theme: Theme,
  siteName: string,
  siteDesc: string,
): string {
  return buildPageHTML(page, theme, siteName, siteDesc, false);
}

/** Full HTML for the in-app iframe canvas (includes editing overlay) */
export function generateEditingPageHTML(
  page: Page,
  theme: Theme,
  siteName: string,
  siteDesc: string,
): string {
  return buildPageHTML(page, theme, siteName, siteDesc, true);
}

/**
 * Inject the editing layer (CSS + toolbar + script) into arbitrary HTML
 * that was loaded from the repo. Also injects a <base> tag so that all
 * relative URLs (stylesheets, images, scripts) resolve against the repo's
 * raw content on GitHub — fixing the "CSS doesn't display" problem when
 * the iframe has a null origin from srcdoc rendering.
 */
export function injectEditingLayer(html: string, pagePath?: string): string {
  // Build a <base> that points to the raw GitHub content directory.
  // raw.githubusercontent.com serves public repo files with permissive CORS,
  // so relative assets load correctly even inside an srcdoc iframe.
  let baseTag = '';
  if (
    pagePath &&
    state.owner && state.repo && state.branch &&
    !/<base[\s>]/i.test(html)   // only add if the HTML doesn't already have one
  ) {
    const dir = pagePath.includes('/')
      ? pagePath.split('/').slice(0, -1).join('/') + '/'
      : '';
    const rawBase =
      `https://raw.githubusercontent.com/${state.owner}/${state.repo}/${state.branch}/${dir}`;
    baseTag = `<base id="${WB_BASE_ID}" href="${rawBase}">`;
  }

  const editingHead = `${baseTag}<style id="${WB_STYLE_ID}">${EDITING_CSS}</style>`;
  const editingBody = `${EDITING_TOOLBAR_HTML}${EDITING_SCRIPT}`;

  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${editingHead}</head>`);
  } else if (/<head>/i.test(html)) {
    html = html.replace(/<head>/i, `<head>${editingHead}`);
  } else {
    html = editingHead + html;
  }

  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${editingBody}</body>`);
  } else {
    html = html + editingBody;
  }

  return html;
}

// ── Internal builder ───────────────────────────────────────────────────

function buildPageHTML(
  page: Page,
  theme: Theme,
  siteName: string,
  siteDesc: string,
  editing: boolean,
): string {
  const total     = page.blocks.length;
  const hasAnims  = !editing && page.blocks.some(
    b => b.settings.animIn && b.settings.animIn !== 'none',
  );
  const blocksHtml = page.blocks.map((b, idx) =>
    editing ? editingBlockWrapper(b, theme, idx, total) : animWrap(b, renderBlock(b, theme, false)),
  ).join('\n');

  const editingStyles = editing ? `<style id="${WB_STYLE_ID}">${EDITING_CSS}</style>` : '';
  const editingBody   = editing ? `${EDITING_TOOLBAR_HTML}${EDITING_SCRIPT}` : '';

  // ── Preserved-head path ───────────────────────────────────────────
  // When the page was converted from raw HTML, we keep the original <head>
  // so the user's CSS links, meta tags, favicon, etc. survive unchanged.
  if (page.preservedHead) {
    // Inject editing layer into the preserved head when in editing mode
    const headExtra = editingStyles + (hasAnims ? `<style>${SECTION_ANIM_CSS}</style>` : '');
    return `<!DOCTYPE html>
<html lang="en">
<head>
${page.preservedHead}
${headExtra}
</head>
<body>
${blocksHtml}
${editingBody}
${hasAnims ? SECTION_ANIM_SCRIPT : ''}
</body>
</html>`;
  }

  // ── Theme-generated head path (default for builder-created pages) ──
  const pageTitle = page.isHome ? stripMd(siteName) : `${stripMd(page.title)} — ${stripMd(siteName)}`;
  const depth = page.path.split('/').length - 1;
  const base  = depth > 0 ? '../'.repeat(depth) : './';

  const emptyPlaceholder = editing && !page.blocks.length
    ? `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;color:#64748b;font-family:system-ui;gap:12px">
        <div style="font-size:15px">This page is empty</div>
        <button onclick="window.parent._addBlockHere(null)" style="background:#0078d4;color:#fff;border:none;border-radius:6px;padding:10px 22px;font-size:13px;cursor:pointer;font-weight:600">+ Add First Section</button>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${pageTitle}</title>
<meta name="description" content="${escapeHtml(siteDesc || page.description || '')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${googleFontsUrl(theme)}" rel="stylesheet">
${editingStyles}
<style>
${UTILITY_CSS}
${RESPONSIVE_NAV_CSS}
${themeCSS(theme)}
${hasAnims ? SECTION_ANIM_CSS : ''}
</style>
<base href="${base}">
</head>
<body>
${emptyPlaceholder}${blocksHtml}
${editingBody}
${NAV_SCRIPT}
${hasAnims ? SECTION_ANIM_SCRIPT : ''}
</body>
</html>`;
}

