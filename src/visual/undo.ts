// ── Undo / Redo history ─────────────────────────────────────────────

export interface UndoSnapshot {
  type: 'blocks' | 'html' | 'css';
  pageId: string;
  data: string;      // state BEFORE action — restored by undo()
  redoData?: string; // state AFTER action — restored by redo(); if absent, redo is a no-op
  label: string;     // "Delete section", "Edit text", "Change color"
}

const MAX = 50;
let history: UndoSnapshot[] = [];
let cursor = -1; // points to "current" snapshot; -1 = nothing

export function pushUndo(snap: UndoSnapshot): void {
  // Truncate any forward history beyond cursor
  history = history.slice(0, cursor + 1);
  history.push(snap);
  // Cap at MAX — drop oldest entries
  if (history.length > MAX) {
    history = history.slice(history.length - MAX);
  }
  cursor = history.length - 1;
}

export function undo(): UndoSnapshot | null {
  if (cursor < 0) return null;
  const snap = history[cursor];
  cursor--;
  return snap;
}

export function redo(): UndoSnapshot | null {
  if (cursor >= history.length - 1) return null;
  cursor++;
  return history[cursor];
}

export function canUndo(): boolean {
  return cursor >= 0;
}

export function canRedo(): boolean {
  return cursor < history.length - 1;
}

export function getUndoLabel(): string | null {
  return history[cursor]?.label ?? null;
}

export function getRedoLabel(): string | null {
  return history[cursor + 1]?.label ?? null;
}

export function clearHistory(): void {
  history = [];
  cursor = -1;
}
