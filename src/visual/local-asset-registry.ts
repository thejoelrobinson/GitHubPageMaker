/**
 * In-memory map of repo-relative asset paths → data URLs.
 *
 * Populated by the asset wizard when images are extracted from uploaded
 * documents. Allows the editor canvas to display newly imported images
 * instantly, without waiting for GitHub CDN propagation after upload.
 *
 * Registry entries survive the lifetime of the browser tab so the editor
 * keeps working after the wizard closes.
 */

const _registry = new Map<string, string>(); // "assets/foo.jpg" → "data:image/jpeg;base64,..."

export function registerLocalAsset(path: string, mediaType: string, base64: string): void {
  _registry.set(path, `data:${mediaType};base64,${base64}`);
}

export function getLocalAssets(): ReadonlyMap<string, string> {
  return _registry;
}

/**
 * Replace all occurrences of registered asset paths in an HTML string with
 * their inline data URLs. Handles both attribute srcs and CSS url() values.
 *
 * Safe to call with an empty registry — returns the string unchanged.
 */
export function substituteLocalAssets(html: string): string {
  if (!_registry.size) return html;
  let result = html;
  for (const [path, dataUrl] of _registry) {
    // src="assets/..." and href="assets/..."
    result = result.split(`="${path}"`).join(`="${dataUrl}"`);
    // url('assets/...') — inline CSS background
    result = result.split(`url('${path}')`).join(`url('${dataUrl}')`);
    result = result.split(`url("${path}")`).join(`url("${dataUrl}")`);
  }
  return result;
}
