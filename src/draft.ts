/**
 * draft.ts
 *
 * Manages the "Save locally" / "Publish to GitHub" separation.
 *
 * SAVE   → writes to localStorage instantly; no network call; survives refresh.
 * PUBLISH → pushes HTML + state.json to GitHub (separate explicit action).
 *
 * Auto-save fires 5 seconds after any edit so the user never loses work.
 */

import { saveLocalDraft, state } from './state';
import { debounce } from './utils';

// ── Auto-save (debounced) ─────────────────────────────────────────────

const AUTO_SAVE_MS = 5_000;

export const debounceAutoSave = debounce(() => {
  if (!state.connected) return;
  saveLocalDraft();
  setDraftIndicator('saved');
}, AUTO_SAVE_MS);

// ── Manual save ───────────────────────────────────────────────────────

export function performLocalSave(): void {
  debounceAutoSave.cancel();
  saveLocalDraft();
  setDraftIndicator('saved');
}

// ── Status indicator ──────────────────────────────────────────────────

type DraftStatus = 'saved' | 'unsaved' | 'published';

export function setDraftIndicator(status: DraftStatus): void {
  const el = document.getElementById('draft-status');
  if (!el) return;

  el.className = `draft-status draft-status--${status}`;

  switch (status) {
    case 'saved':
      el.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg> Saved`;
      // Fade to neutral after 3 s
      setTimeout(() => {
        const e = document.getElementById('draft-status');
        if (e?.classList.contains('draft-status--saved')) {
          e.className = 'draft-status draft-status--idle';
          e.textContent = '';
        }
      }, 3000);
      break;
    case 'unsaved':
      el.innerHTML = `<span class="draft-dot"></span> Unsaved`;
      break;
    case 'published':
      el.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z"/></svg> Published`;
      setTimeout(() => {
        const e = document.getElementById('draft-status');
        if (e?.classList.contains('draft-status--published')) {
          e.className = 'draft-status draft-status--idle';
          e.textContent = '';
        }
      }, 4000);
      break;
  }
}

export function markUnsaved(): void {
  setDraftIndicator('unsaved');
}
