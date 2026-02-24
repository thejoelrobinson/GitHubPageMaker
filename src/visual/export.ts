import type { Block, Page, Theme } from '../types';
import { renderBlock } from './blocks';
import { escapeHtml } from '../utils';
import { state } from '../state';

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

function themeCSS(theme: Theme): string {
  return `:root{
  --primary:${theme.primary};
  --accent:${theme.accent};
  --text:${theme.text};
  --text-muted:${theme.textMuted};
  --bg:${theme.bg};
  --bg-alt:${theme.bgAlt};
  --font-heading:'${theme.headingFont}',sans-serif;
  --font-body:'${theme.bodyFont}',sans-serif;
  --radius:${theme.radius}px;
}
body{font-family:var(--font-body);color:var(--text);background:var(--bg)}`;
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
[data-block-id]:hover{outline-color:rgba(99,102,241,.4)}
[data-block-id].wb-sel{outline-color:#6366f1}
.wb-controls{position:absolute;top:8px;right:8px;z-index:9998;display:flex;gap:3px;opacity:0;transition:opacity .15s;background:rgba(15,23,42,.88);border-radius:6px;padding:3px 5px;pointer-events:auto}
[data-block-id]:hover .wb-controls,[data-block-id].wb-sel .wb-controls{opacity:1}
.wbc{width:26px;height:26px;border:none;background:none;color:rgba(255,255,255,.75);cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;transition:all .1s;padding:0}
.wbc:hover{background:rgba(255,255,255,.15);color:#fff}
.wbc.del:hover{background:rgba(244,67,71,.25);color:#f88}
.wbc:disabled{opacity:.3;cursor:not-allowed}
.wb-add{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;border:none;background:rgba(99,102,241,.08);padding:0;height:0;overflow:hidden;cursor:pointer;color:#6366f1;font-size:12px;font-weight:600;font-family:system-ui,-apple-system,sans-serif;transition:height .15s,opacity .15s;opacity:0}
[data-block-id]:hover .wb-add{height:32px;opacity:1}
[data-field]{cursor:text}
[data-field]:hover{background:rgba(99,102,241,.06);border-radius:2px}
[data-field][contenteditable=true]{outline:2px solid #6366f1!important;outline-offset:2px;border-radius:2px;cursor:text}
.wb-toolbar{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;background:#1e293b;border:1px solid #334155;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.4);display:none;align-items:center;gap:2px;padding:4px 6px}
.wb-toolbar.show{display:flex}
.wbt{width:28px;height:26px;border-radius:4px;border:none;background:none;color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;transition:all .15s;font-family:system-ui}
.wbt:hover{background:#334155;color:#e2e8f0}
.wbt-done{background:#6366f1;color:white;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;font-weight:500;font-family:system-ui}
.wb-sep{width:1px;height:16px;background:#334155;margin:0 2px}
[data-wb-highlighted]{outline:3px solid rgba(99,102,241,.7)!important;outline-offset:2px}
[data-wb-hovering]{outline:2px dashed rgba(99,102,241,.45)!important;outline-offset:3px}
body.wb-inspect *{cursor:crosshair!important}
body.wb-inspect [data-wb-hovering]{outline:2px solid rgba(37,99,235,.85)!important;outline-offset:2px;background:rgba(37,99,235,.06)!important}
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
    if(inspectMode){
      e.preventDefault(); // block link navigation / text cursor
      // Move highlight from hover state to click-selected state
      document.querySelectorAll('[data-wb-hovering]').forEach(function(hv){hv.removeAttribute('data-wb-hovering');});
      document.querySelectorAll('[data-wb-highlighted]').forEach(function(hl){hl.removeAttribute('data-wb-highlighted');});
    }
    var target=e.target;
    if(!target||!target.tagName)return;
    if(target.id&&target.id.startsWith('wb-'))return;
    if(target.closest&&target.closest('[id^="wb-"]'))return;
    var cs=window.getComputedStyle(target);
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

  // ── Hover: notify parent + element-level highlight in inspect mode ───
  document.addEventListener('mouseover',function(e){
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
      document.designMode=inspectMode?'off':'on';
      document.body.classList.toggle('wb-inspect',inspectMode);
      if(!inspectMode){
        document.querySelectorAll('[data-wb-hovering]').forEach(function(hv){hv.removeAttribute('data-wb-hovering');});
      }
    }
  });

} else {
  // ══════════════════════════════════════════════
  // BLOCK MODE — page built with the visual editor
  // Only [data-field] elements are editable.
  // ══════════════════════════════════════════════
  var curField=null,curBid=null;

  // Track custom block currently in inline-edit mode
  var customEditEl = null, customEditBid = null;

  document.addEventListener('click',function(e){
    if(e.target.closest('.wb-controls')||e.target.closest('.wb-add'))return;

    // ── Custom-block inline editing ─────────────────────────────────
    // Clicking a text node inside a custom (raw-HTML) block's .wb-inner
    // makes just that block's content editable, preserving block controls.
    if(!e.target.closest('[data-field][contenteditable=true]')){
      var inner=e.target.closest('.wb-inner');
      if(inner){
        var customBlk=inner.closest('[data-block-type="custom"]');
        if(customBlk){
          endCustomEdit();
          customEditEl=inner; customEditBid=customBlk.dataset.blockId;
          inner.contentEditable='true'; inner.focus();
          if(toolbar)toolbar.classList.add('show');
          doSel(customBlk.dataset.blockId);
          e.stopPropagation();
          return;
        }
      }
    }

    // ── Standard block-field editing ────────────────────────────────
    if(e.target.closest('[data-field][contenteditable=true]'))return;
    var field=e.target.closest('[data-field]');
    if(field){var blk=field.closest('[data-block-id]');if(blk){doSel(blk.dataset.blockId);doEdit(field,blk.dataset.blockId);e.stopPropagation();return;}}
    var blk=e.target.closest('[data-block-id]');
    if(blk){doEnd();endCustomEdit();doSel(blk.dataset.blockId);e.stopPropagation();return;}
    doEnd();endCustomEdit();doDeSel();
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
  function doEdit(field,bid){
    if(curField&&curField!==field)doEnd();
    curField=field;curBid=bid;
    field.contentEditable='true';field.focus();
    var r=document.createRange();r.selectNodeContents(field);
    var s=window.getSelection();if(s){s.removeAllRanges();s.addRange(r);}
    if(toolbar)toolbar.classList.add('show');
    P.postMessage({type:'wb:editStart',blockId:bid,field:field.dataset.field},'*');
  }
  function doEnd(){
    if(!curField)return;
    var f=curField,bid=curBid;
    curField=null;curBid=null;
    f.contentEditable='false';
    if(toolbar)toolbar.classList.remove('show');
    if(bid)P.postMessage({type:'wb:textSave',blockId:bid,field:f.dataset.field,value:f.innerText.trim()},'*');

  }
  if(toolbar){
    toolbar.addEventListener('click',function(e){
      var cmd=e.target.closest('[data-cmd]');
      if(cmd){
        if(cmd.dataset.cmd==='link'){var u=prompt('URL:');if(u)document.execCommand('createLink',false,u);}
        else document.execCommand(cmd.dataset.cmd);
        if(curField)curField.focus();return;
      }
      if(e.target.classList.contains('wbt-done'))doEnd();
    });
  }
  window.addEventListener('message',function(e){
    if(!e.data)return;
    if(e.data.type==='wb:select')doSel(e.data.id);
    if(e.data.type==='wb:deselect')doDeSel();
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){doEnd();endCustomEdit();}});
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
  const addSvg  = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/></svg>`;

  return `<div data-block-id="${id}" data-block-type="${escapeHtml(block.type)}" style="position:relative">
  <div class="wb-controls">
    <button class="wbc" onclick="window.parent._moveBlock('${id}',-1)" title="Move Up" ${isFirst ? 'disabled' : ''}>${upSvg}</button>
    <button class="wbc" onclick="window.parent._moveBlock('${id}',1)" title="Move Down" ${isLast ? 'disabled' : ''}>${downSvg}</button>
    <button class="wbc" onclick="window.parent._duplicateBlock('${id}')" title="Duplicate">${dupSvg}</button>
    <button class="wbc del" onclick="window.parent._deleteBlock('${id}')" title="Delete">${delSvg}</button>
  </div>
  <div class="wb-inner">${renderBlock(block, theme, true)}</div>
  <button class="wb-add" onclick="window.parent._addBlockHere('${id}')">${addSvg} Add Section</button>
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
  const blocksHtml = page.blocks.map((b, idx) =>
    editing ? editingBlockWrapper(b, theme, idx, total) : renderBlock(b, theme, false),
  ).join('\n');

  const editingStyles = editing ? `<style id="${WB_STYLE_ID}">${EDITING_CSS}</style>` : '';
  const editingBody   = editing ? `${EDITING_TOOLBAR_HTML}${EDITING_SCRIPT}` : '';

  // ── Preserved-head path ───────────────────────────────────────────
  // When the page was converted from raw HTML, we keep the original <head>
  // so the user's CSS links, meta tags, favicon, etc. survive unchanged.
  if (page.preservedHead) {
    // Inject editing layer into the preserved head when in editing mode
    const headExtra = editingStyles;
    return `<!DOCTYPE html>
<html lang="en">
<head>
${page.preservedHead}
${headExtra}
</head>
<body>
${blocksHtml}
${editingBody}
</body>
</html>`;
  }

  // ── Theme-generated head path (default for builder-created pages) ──
  const pageTitle = page.isHome ? siteName : `${page.title} — ${siteName}`;
  const depth = page.path.split('/').length - 1;
  const base  = depth > 0 ? '../'.repeat(depth) : './';

  const emptyPlaceholder = editing && !page.blocks.length
    ? `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;color:#64748b;font-family:system-ui;gap:12px">
        <div style="font-size:15px">This page is empty</div>
        <button onclick="window.parent._addBlockHere(null)" style="background:#6366f1;color:#fff;border:none;border-radius:6px;padding:10px 22px;font-size:13px;cursor:pointer;font-weight:600">+ Add First Section</button>
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
</style>
<base href="${base}">
</head>
<body>
${emptyPlaceholder}${blocksHtml}
${editingBody}
${NAV_SCRIPT}
</body>
</html>`;
}

