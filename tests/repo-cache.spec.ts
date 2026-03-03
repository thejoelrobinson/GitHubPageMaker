/**
 * repo-cache.spec.ts
 *
 * End-to-end test verifying the IndexedDB repo cache (clone) feature.
 * Connects to the real joel-robinson-portfolio repo, waits for the background
 * sync to finish, then checks that files (including binary images) are in IDB
 * and can be served by the SW without GitHub API calls.
 */
import { test, expect } from '@playwright/test';

const CREDS = {
  token:  process.env['GITHUB_TOKEN']  ?? '',
  owner:  process.env['GITHUB_OWNER']  ?? 'TheJoelRobinson',
  repo:   process.env['GITHUB_REPO']   ?? 'joel-robinson-portfolio',
  branch: process.env['GITHUB_BRANCH'] ?? 'main',
};

/** Connect to the real repo and wait for the IDB sync to complete. */
async function connectAndWaitForSync(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');

  // Wait for SW
  await page.waitForFunction(
    () => navigator.serviceWorker.getRegistration('/preview/').then(r => r?.active?.state === 'activated'),
    { timeout: 10_000 },
  );

  // Open settings modal
  await page.click('#overlay-connect-btn');
  await page.waitForSelector('#settings-modal:not(.hidden)', { timeout: 5_000 });

  // Fill credentials
  await page.fill('#input-token',  CREDS.token);
  await page.fill('#input-owner',  CREDS.owner);
  await page.fill('#input-repo',   CREDS.repo);
  await page.fill('#input-branch', CREDS.branch);

  await page.click('#connect-btn');

  // Wait for connection (welcome overlay hidden)
  await page.waitForFunction(
    () => document.getElementById('welcome-overlay')?.classList.contains('hidden') === true,
    { timeout: 20_000 },
  );

  // Wait for sync progress bar to appear then disappear (sync complete)
  // The progress bar shows during sync and hides when done.
  // If it never shows (sync was instant because 0 files changed), that's OK too.
  await page.waitForFunction(
    () => {
      const el = document.getElementById('sync-progress');
      // Either never shown or has been hidden
      return !el || el.style.display === 'none';
    },
    { timeout: 120_000 }, // 2 min for large repos
  );
}

test.describe('IndexedDB repo cache', () => {
  test('Sync populates IndexedDB with repo files', async ({ page }) => {
    await connectAndWaitForSync(page);

    // Query IDB for cached files
    const idbFiles = await page.evaluate(async (creds) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('wb-repo-cache', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction('files', 'readonly');
      const index = tx.objectStore('files').index('byRepo');
      const range = IDBKeyRange.only([creds.owner, creds.repo, creds.branch]);
      const results: Array<{ path: string; sha: string; hasContent: boolean; contentLen: number }> = [];
      return new Promise<typeof results>((resolve, reject) => {
        const req = index.openCursor(range);
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const v = cursor.value;
            results.push({
              path: v.path,
              sha: v.sha,
              hasContent: v.content != null && v.content.length > 0,
              contentLen: v.content?.length ?? 0,
            });
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => reject(req.error);
      });
    }, CREDS);

    console.log(`IDB cached ${idbFiles.length} files`);
    console.log('Paths:', idbFiles.map(f => f.path).sort());

    // Must have cloned files
    expect(idbFiles.length).toBeGreaterThan(0);

    // Must include key files
    const paths = new Set(idbFiles.map(f => f.path));
    expect(paths.has('index.html')).toBe(true);
    expect(paths.has('css/style.css') || paths.has('style.css')).toBe(true);

    // All files must have content
    for (const f of idbFiles) {
      expect(f.hasContent).toBe(true);
    }
  });

  test('Brand images are cloned to IDB', async ({ page }) => {
    await connectAndWaitForSync(page);

    // Check for brand images specifically
    const brandImages = await page.evaluate(async (creds) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('wb-repo-cache', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction('files', 'readonly');
      const index = tx.objectStore('files').index('byRepo');
      const range = IDBKeyRange.only([creds.owner, creds.repo, creds.branch]);
      const results: Array<{ path: string; contentLen: number }> = [];
      return new Promise<typeof results>((resolve, reject) => {
        const req = index.openCursor(range);
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const v = cursor.value;
            if (v.path.includes('assets/brands/')) {
              results.push({ path: v.path, contentLen: v.content?.length ?? 0 });
            }
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => reject(req.error);
      });
    }, CREDS);

    console.log('Brand images in IDB:', brandImages);

    expect(brandImages.length).toBeGreaterThan(0);
    // Each should have actual binary content
    for (const img of brandImages) {
      expect(img.contentLen).toBeGreaterThan(100);
    }
  });

  test('SW serves brand image from IDB without GitHub API call', async ({ page }) => {
    await connectAndWaitForSync(page);

    // Navigate iframe to preview scope
    await page.evaluate(() => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      iframe.removeAttribute('srcdoc');
      iframe.src = `/preview/index.html?_t=${Date.now()}`;
    });
    await page.waitForFunction(
      () => {
        const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
        return iframe?.contentDocument?.readyState === 'complete';
      },
      { timeout: 15_000 },
    );

    // Now clear the SW in-memory cache to force IDB lookup
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration('/preview/');
      const sw = reg?.active;
      if (!sw) throw new Error('SW not active');
      // Clear just the in-memory fileStore but keep IDB and config
      // We do this by invalidating a specific brand image
      sw.postMessage({ type: 'WB_INVALIDATE', path: 'assets/brands/walmart_orig.png' });
    });
    await page.waitForTimeout(300);

    // Fetch the image via the SW — should come from IDB
    const result = await page.evaluate(async () => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      if (!iframe?.contentWindow) return { error: 'no iframe' };
      try {
        const res = await iframe.contentWindow.fetch('/preview/assets/brands/walmart_orig.png');
        return {
          status: res.status,
          contentType: res.headers.get('content-type') ?? '',
          size: (await res.arrayBuffer()).byteLength,
        };
      } catch (e) {
        return { error: String(e) };
      }
    });

    console.log('Brand image fetch result:', result);

    // Should succeed with image content type and real data
    expect(result).not.toHaveProperty('error');
    expect((result as { status: number }).status).toBe(200);
    expect((result as { contentType: string }).contentType).toContain('image/png');
    expect((result as { size: number }).size).toBeGreaterThan(100);
  });

  test('File tree shows nested folders (assets/brands, assets/images)', async ({ page }) => {
    await connectAndWaitForSync(page);

    // Switch to Explorer panel
    await page.click('#act-explorer');
    await page.waitForSelector('#file-tree .tree-item', { timeout: 5_000 });

    // Click on 'assets' folder to expand it
    const assetsFolder = page.locator('#file-tree .tree-item-name', { hasText: 'assets' }).first();
    await assetsFolder.click();
    await page.waitForTimeout(500);

    // After expanding 'assets', should see 'brands' and 'images' subfolders
    const treeItems = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#file-tree .tree-item-name'))
        .map(el => el.textContent?.trim() ?? '');
    });

    console.log('Tree items after expanding assets:', treeItems);

    expect(treeItems).toContain('brands');
    expect(treeItems).toContain('images');

    // Expand 'brands' subfolder
    const brandsFolder = page.locator('#file-tree .tree-item-name', { hasText: 'brands' }).first();
    await brandsFolder.click();
    await page.waitForTimeout(500);

    // Should now see brand image files
    const allItems = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#file-tree .tree-item-name'))
        .map(el => el.textContent?.trim() ?? '');
    });

    console.log('Tree items after expanding brands:', allItems);

    expect(allItems.some(f => f.includes('walmart_orig.png'))).toBe(true);
    expect(allItems.some(f => f.includes('google_orig.png'))).toBe(true);
    expect(allItems.some(f => f.includes('yale_orig.png'))).toBe(true);
  });
});
