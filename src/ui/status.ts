export function setStatusSync(msg: string): void {
  const el = document.getElementById('status-sync-text');
  if (el) el.textContent = msg;
}

export function updateStatusLang(lang: string): void {
  const el = document.getElementById('status-lang');
  if (!el) return;
  const pretty = lang
    .replace('javascript', 'JavaScript')
    .replace('typescript', 'TypeScript');
  el.textContent = pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

export function updateSaveButton(openTabs: { dirty: boolean }[]): void {
  const dirty = openTabs.filter(t => t.dirty);
  const btn  = document.getElementById('action-push-btn') as HTMLButtonElement | null;
  const stat = document.getElementById('status-changes');
  if (btn) btn.classList.toggle('has-changes', dirty.length > 0);
  if (stat) stat.textContent = dirty.length > 0 ? `${dirty.length} unsaved` : 'No changes';
}
