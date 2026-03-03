// ── Visual Coordinator ─────────────────────────────────────────────────
// Typed slot registry that breaks the canvas ↔ properties ↔ pages
// static-import cycle.  All slots are null until the owning module
// registers its callbacks (called once from visual/index.ts init block).
//
// Zero imports from canvas / properties / pages — this file must remain
// dependency-free so it can be imported by all three without forming a cycle.

export interface VisualCoordinator {
  // canvas provides — others call:
  rerenderBlock:          ((blockId: string) => void) | null;
  applyThemeToCanvas:     (() => void) | null;
  renderCanvas:           ((afterLoad?: () => void) => void) | null;
  updateVisualSaveBtn:    (() => void) | null;
  syncActivePageCodeTab:  (() => void) | null;
  previewBlockAnimation:  ((blockId: string, animIn: string, dur: number, delay: number, ease: string) => void) | null;
  dmSetInlineStyle:       ((selector: string, prop: string, val: string) => void) | null;
  dmHighlightSection:     ((selector: string) => void) | null;
  dmSetCssLive:           ((css: string) => void) | null;
  getDmSelected:          (() => unknown) | null;
  updateBlockValue:       ((blockId: string, key: string, value: string | boolean | number) => void) | null;
  deselectBlock:          (() => void) | null;
  // properties provides — canvas calls:
  renderProperties:       (() => void) | null;
  // pages provides — canvas calls:
  renderSectionList:      (() => void) | null;
}

export const coordinator: VisualCoordinator = {
  rerenderBlock:         null,
  applyThemeToCanvas:    null,
  renderCanvas:          null,
  updateVisualSaveBtn:   null,
  syncActivePageCodeTab: null,
  previewBlockAnimation: null,
  dmSetInlineStyle:      null,
  dmHighlightSection:    null,
  dmSetCssLive:          null,
  getDmSelected:         null,
  updateBlockValue:      null,
  deselectBlock:         null,
  renderProperties:      null,
  renderSectionList:     null,
};
