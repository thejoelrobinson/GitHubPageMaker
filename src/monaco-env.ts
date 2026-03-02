// ── Monaco Web Worker Configuration ──────────────────────────────────
//
// This file MUST be the first import in main.ts.
// Monaco checks for MonacoEnvironment.getWorker lazily (on first editor
// creation), but the import order still matters because module-level
// side effects run in import order.
//
// Each `?worker&inline` query tells Vite to bundle that worker's source
// as an inline blob URL, so no separate files are needed — works with
// vite-plugin-singlefile and file:// loading alike.

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline';
import JsonWorker   from 'monaco-editor/esm/vs/language/json/json.worker?worker&inline';
import CssWorker    from 'monaco-editor/esm/vs/language/css/css.worker?worker&inline';
import HtmlWorker   from 'monaco-editor/esm/vs/language/html/html.worker?worker&inline';
import TsWorker     from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker&inline';

// Guard: Monaco's StandardKeyboardEvent constructor calls e.getModifierState()
// which only exists on real KeyboardEvent instances. In Chromium, DragEvents
// and PointerEvents can be incorrectly routed through keydown listeners (e.g.
// when dragging files into the window or interacting with file-picker inputs).
// This capture-phase listener runs before Monaco's body listener and stops any
// event that lacks getModifierState so Monaco never sees it.
document.addEventListener(
  'keydown',
  (e) => {
    if (typeof (e as KeyboardEvent).getModifierState !== 'function') {
      e.stopImmediatePropagation();
    }
  },
  true, // capture phase — fires before Monaco's bubble-phase listener
);

window.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string): Worker {
    if (label === 'json')                                    return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less')  return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript')    return new TsWorker();
    return new EditorWorker();
  },
};
