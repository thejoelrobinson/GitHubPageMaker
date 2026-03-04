/**
 * download.ts
 *
 * Assembles the current site into a ZIP and triggers a browser download.
 *
 * File collection — three tiers, in priority order:
 *   1. Visual pages with blocks  → generatePageHTML() (synchronous, no network)
 *   2. Open code tabs            → state.openTabs (already in memory)
 *   3. Remaining repo tree files → IDB cache, then GitHub API fallback
 *
 * Binary files (images, fonts, etc.) are stored as atob()-decoded byte strings
 * in openTabs / CachedFile.content.  They are converted to Uint8Array via
 * charCodeAt() before being passed to fflate, and stored uncompressed (level 0)
 * since their formats are already compressed.
 */

import { strToU8, zipSync, type Zippable } from 'fflate';
import { state, visual } from './state';
import { generatePageHTML } from './visual/export';
import { getCachedFile, withConcurrencyLimit } from './repo-cache';
import { readFileRaw } from './github';
import { notify } from './ui/notifications';

const MAX_CONCURRENT = 6;
const MAX_ASSET_FILES = 500; // sanity cap for very large repos

/** Convert an atob()-style byte string to Uint8Array. */
function byteStringToU8(str: string): Uint8Array {
  const u8 = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i);
  return u8;
}

export async function downloadSiteZip(): Promise<void> {
  const btn = document.getElementById('action-download-btn') as HTMLButtonElement | null;
  const origHTML = btn?.innerHTML ?? '';
  if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }

  try {
    const files: Zippable = {};

    // ── Tier 1: Block-based visual pages (synchronous) ────────────────
    const handledPaths = new Set<string>();

    for (const page of visual.pages) {
      if (page.blocks.length > 0) {
        const html = generatePageHTML(page, visual.theme, visual.siteName, visual.siteDesc);
        files[page.path] = strToU8(html);
        handledPaths.add(page.path);
      }
    }

    // ── Tier 2: Open code tabs (already in memory) ────────────────────
    for (const tab of state.openTabs) {
      if (handledPaths.has(tab.path)) continue;
      files[tab.path] = tab.isBinary
        ? [byteStringToU8(tab.content), { level: 0 }]
        : strToU8(tab.content);
      handledPaths.add(tab.path);
    }

    // ── Tier 3: Remaining repo files (IDB → GitHub API) ───────────────
    if (state.connected) {
      const remaining = state.tree
        .filter(f =>
          f.type === 'blob' &&
          !f.path.startsWith('.wb/') &&
          !handledPaths.has(f.path),
        )
        .slice(0, MAX_ASSET_FILES);

      const total = remaining.length;
      let done = 0;

      const tasks = remaining.map(({ path }) => async () => {
        try {
          let content: string;
          let isText: boolean;

          const cached = await getCachedFile(state.owner, state.repo, state.branch, path);
          if (cached && cached.sha === state.fileShas[path]) {
            content = cached.content;
            isText  = cached.isText;
          } else {
            const raw = await readFileRaw(path);
            content  = raw.content;
            isText   = raw.isText;
          }

          files[path] = isText
            ? strToU8(content)
            : [byteStringToU8(content), { level: 0 }];
        } catch {
          // Skip inaccessible files — don't abort the whole ZIP
        }
        done++;
        if (btn && total > 0) btn.textContent = `${Math.round((done / total) * 100)}%`;
      });

      await withConcurrencyLimit(tasks, MAX_CONCURRENT);

      if (remaining.length === MAX_ASSET_FILES && state.tree.filter(f => f.type === 'blob' && !f.path.startsWith('.wb/')).length > MAX_ASSET_FILES) {
        notify(`Large repo — ZIP includes first ${MAX_ASSET_FILES} assets`, 'warning');
      }
    }

    // ── Tier 4: Pending uploads (staged locally, not yet on GitHub) ────
    for (const upload of visual.pendingUploads) {
      if (handledPaths.has(upload.path)) continue;
      files[upload.path] = [byteStringToU8(atob(upload.base64)), { level: 0 }];
    }

    if (Object.keys(files).length === 0) {
      notify('Nothing to download — create or open some files first', 'info');
      return;
    }

    // ── Build ZIP and trigger download ────────────────────────────────
    const zipData = zipSync(files);
    const blob    = new Blob([zipData.buffer as ArrayBuffer], { type: 'application/zip' });
    const url     = URL.createObjectURL(blob);
    const name    = (state.repo || visual.siteName.replace(/\s+/g, '-').toLowerCase() || 'site')
      .replace(/[^a-z0-9_.-]/gi, '-');

    const a = document.createElement('a');
    a.href     = url;
    a.download = `${name}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    notify(`Downloaded ${Object.keys(files).length} file${Object.keys(files).length === 1 ? '' : 's'}`, 'success');
  } catch (e) {
    notify('Download failed: ' + (e as Error).message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
  }
}
