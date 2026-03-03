import { state } from './state';
import { encodeRepoPath } from './github';
import { escapeHtml, escapeAttr, fileIconSvg } from './utils';

// ── Previewable file detection ─────────────────────────────────────────

const PREVIEW_IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','svg','webp','ico','avif','bmp']);
const PREVIEW_VIDEO_EXTS = new Set(['mp4','webm','ogv','mov']);
const PREVIEW_AUDIO_EXTS = new Set(['mp3','wav','ogg','flac','m4a']);

/** Returns 'image', 'video', 'audio', or null */
export function isPreviewable(path: string): 'image' | 'video' | 'audio' | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (PREVIEW_IMAGE_EXTS.has(ext)) return 'image';
  if (PREVIEW_VIDEO_EXTS.has(ext)) return 'video';
  if (PREVIEW_AUDIO_EXTS.has(ext)) return 'audio';
  return null;
}

const PREVIEW_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon',
  avif: 'image/avif', bmp: 'image/bmp',
  mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4',
};

/** Track blob URLs so we can revoke old ones and avoid leaks. */
const _previewBlobUrls = new Map<string, string>();

/** Dedup in-flight blob loads — prevents concurrent loads for the same path
 *  from revoking each other's blob URLs mid-load. */
const _previewLoading = new Map<string, Promise<string>>();

/**
 * Load a binary file from IDB cache or GitHub API and return a blob: URL
 * suitable for <img>/<video>/<audio> src in the main page.
 * Deduplicates concurrent calls for the same path.
 */
export async function loadPreviewBlobUrl(path: string): Promise<string> {
  const inflight = _previewLoading.get(path);
  if (inflight) return inflight;

  const promise = _loadPreviewBlobUrlInner(path).finally(() => {
    _previewLoading.delete(path);
  });
  _previewLoading.set(path, promise);
  return promise;
}

async function _loadPreviewBlobUrlInner(path: string): Promise<string> {
  // Revoke previous blob URL for this path
  const prev = _previewBlobUrls.get(path);
  if (prev) URL.revokeObjectURL(prev);

  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const mime = PREVIEW_MIME[ext] ?? 'application/octet-stream';

  // 0. Local import with base64 content already in memory — no fetch needed
  const localTab = state.openTabs.find(t => t.path === path && t.isBinary && t.isLocalImport);
  if (localTab) {
    const bytes = Uint8Array.from(atob(localTab.content), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    _previewBlobUrls.set(path, url);
    return url;
  }

  // 1. Try IndexedDB cache (background sync likely already cached it)
  try {
    const { getCachedFile } = await import('./repo-cache');
    const cached = await getCachedFile(state.owner, state.repo, state.branch, path);
    if (cached?.content != null) {
      // Text files (SVG, etc.) are stored as UTF-8 strings — use TextEncoder
      // to preserve multi-byte characters. Binary files were decoded with
      // atob() and are safe for charCodeAt-based conversion.
      const bytes = cached.isText
        ? new TextEncoder().encode(cached.content)
        : Uint8Array.from(cached.content, c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      _previewBlobUrls.set(path, url);
      return url;
    }
  } catch { /* IDB unavailable */ }

  // 2. Fetch raw binary from GitHub API
  const res = await fetch(
    `https://api.github.com/repos/${state.owner}/${state.repo}/contents/${encodeRepoPath(path)}?ref=${state.branch}`,
    { headers: { Authorization: `Bearer ${state.token}`, Accept: 'application/vnd.github.raw+json' } },
  );
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  const url = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: mime }));
  _previewBlobUrls.set(path, url);
  return url;
}

// ── Sidebar file preview ───────────────────────────────────────────────

const FILE_TYPE_LABELS: Record<string, string> = {
  html: 'HTML Document', css: 'CSS Stylesheet', js: 'JavaScript',
  ts: 'TypeScript', json: 'JSON', md: 'Markdown', svg: 'SVG Image',
  png: 'PNG Image', jpg: 'JPEG Image', jpeg: 'JPEG Image', gif: 'GIF Image',
  webp: 'WebP Image', ico: 'Icon', avif: 'AVIF Image', bmp: 'Bitmap Image',
  mp4: 'MP4 Video', webm: 'WebM Video', ogv: 'Ogg Video', mov: 'QuickTime Video',
  mp3: 'MP3 Audio', wav: 'WAV Audio', ogg: 'Ogg Audio', flac: 'FLAC Audio',
  m4a: 'M4A Audio', txt: 'Text File', xml: 'XML Document', yaml: 'YAML',
  yml: 'YAML', toml: 'TOML', sh: 'Shell Script', py: 'Python',
};

let _sidebarPreviewPath: string | null = null;

export function showSidebarPreview(path: string): void {
  _sidebarPreviewPath = path;
  const panel = document.getElementById('sidebar-preview')!;
  const nameEl = document.getElementById('sidebar-preview-name')!;
  const contentEl = document.getElementById('sidebar-preview-content')!;

  panel.classList.remove('hidden');
  const fileName = path.split('/').pop() ?? path;
  nameEl.textContent = fileName;

  // Highlight in tree
  document.querySelectorAll<HTMLElement>('.tree-item.previewing').forEach(el => el.classList.remove('previewing'));
  document.querySelector<HTMLElement>(`.tree-item[data-path="${CSS.escape(path)}"]`)?.classList.add('previewing');

  const previewType = isPreviewable(path);
  if (previewType) {
    contentEl.innerHTML = '<span style="font-size:11px;color:var(--text-dim)">Loading\u2026</span>';
    loadPreviewBlobUrl(path).then(blobUrl => {
      if (_sidebarPreviewPath !== path) return;
      if (previewType === 'image') {
        contentEl.innerHTML = `<img src="${blobUrl}" alt="${escapeAttr(fileName)}">`;
      } else if (previewType === 'video') {
        contentEl.innerHTML = `<video src="${blobUrl}" controls></video>`;
      } else {
        contentEl.innerHTML = `<audio src="${blobUrl}" controls></audio>`;
      }
      // Make sidebar preview image/video draggable onto the canvas
      if (previewType === 'image' || previewType === 'video') {
        const mediaEl = contentEl.querySelector('img, video') as HTMLElement | null;
        if (mediaEl) {
          (mediaEl as HTMLImageElement | HTMLVideoElement).draggable = true;
          mediaEl.addEventListener('dragstart', (ev) => {
            (ev as DragEvent).dataTransfer!.setData('application/x-wb-asset', JSON.stringify({ path, type: previewType }));
            (ev as DragEvent).dataTransfer!.effectAllowed = 'copy';
          });
        }
      }
    }).catch(() => {
      if (_sidebarPreviewPath !== path) return;
      contentEl.innerHTML = `<span style="font-size:11px;color:var(--red)">Failed to load</span>`;
    });
  } else {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const label = FILE_TYPE_LABELS[ext] ?? (ext ? ext.toUpperCase() + ' File' : 'File');
    contentEl.innerHTML = `<div class="sp-file-info">${fileIconSvg(fileName)}<span>${escapeHtml(fileName)}</span><span class="sp-file-type">${escapeHtml(label)}</span></div>`;
  }
}

export function hideSidebarPreview(): void {
  document.getElementById('sidebar-preview')!.classList.add('hidden');
  document.querySelectorAll<HTMLElement>('.tree-item.previewing').forEach(el => el.classList.remove('previewing'));
  _sidebarPreviewPath = null;
}

export function getSidebarPreviewPath(): string | null {
  return _sidebarPreviewPath;
}

/** Revoke all cached blob URLs and clear state — call on logout to avoid memory leaks. */
export function clearPreviewBlobUrls(): void {
  for (const url of _previewBlobUrls.values()) URL.revokeObjectURL(url);
  _previewBlobUrls.clear();
  _previewLoading.clear();
  _sidebarPreviewPath = null;
}
