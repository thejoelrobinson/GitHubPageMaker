/**
 * real-repo.spec.ts
 *
 * End-to-end test using the REAL joel-robinson-portfolio GitHub repo.
 * Verifies the full connection → asset-caching → CSS-rendering pipeline.
 *
 * Run with:  npm run test:e2e -- -g "Real repo"
 */
import { test, expect } from '@playwright/test';

// Set these via environment variables or replace before running:
//   GITHUB_TOKEN=ghp_... GITHUB_OWNER=TheJoelRobinson npx playwright test tests/real-repo.spec.ts
const CREDS = {
  token:  process.env['GITHUB_TOKEN']  ?? '',
  owner:  process.env['GITHUB_OWNER']  ?? 'TheJoelRobinson',
  repo:   process.env['GITHUB_REPO']   ?? 'joel-robinson-portfolio',
  branch: process.env['GITHUB_BRANCH'] ?? 'main',
};

/** Connect to the real repo via the UI and wait for Visual mode to render. */
async function connectAndLoad(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');

  // Wait for SW
  await page.waitForFunction(
    () => navigator.serviceWorker.getRegistration('/preview/').then(r => r?.active?.state === 'activated'),
    { timeout: 10_000 },
  );

  // Open settings modal via welcome overlay
  await page.click('#overlay-connect-btn');
  await page.waitForSelector('#settings-modal:not(.hidden)', { timeout: 5_000 });

  // Fill credentials
  await page.fill('#input-token',  CREDS.token);
  await page.fill('#input-owner',  CREDS.owner);
  await page.fill('#input-repo',   CREDS.repo);
  await page.fill('#input-branch', CREDS.branch);

  await page.click('#connect-btn');

  // Wait for Visual area to become visible (welcome overlay dismissed)
  await page.waitForFunction(
    () => !document.getElementById('welcome-overlay')?.classList.contains('hidden'),
    { timeout: 20_000 },
  );
  // Actually wait for it to be HIDDEN (connection succeeded)
  await page.waitForFunction(
    () => document.getElementById('welcome-overlay')?.classList.contains('hidden') === true,
    { timeout: 20_000 },
  );

  // Wait for the iframe to have a non-loading body
  await page.waitForFunction(
    () => {
      const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
      const doc    = iframe?.contentDocument;
      if (!doc || doc.readyState !== 'complete') return false;
      // Not the LOADING_HTML spinner (which has a very simple structure)
      return (doc.body?.children?.length ?? 0) > 2;
    },
    { timeout: 30_000 },
  );
}

test('Real repo — CSS renders correctly (dark background #0a0a0f)', async ({ page }) => {
  await connectAndLoad(page);

  // Give CSS time to fully apply
  await page.waitForTimeout(3000);

  const result = await page.evaluate(() => {
    const iframe = document.getElementById('vis-iframe') as HTMLIFrameElement;
    const doc    = iframe?.contentDocument;
    const win    = iframe?.contentWindow;
    if (!doc || !win) return { error: 'no iframe' };
    return {
      bgColor:  win.getComputedStyle(doc.body).backgroundColor,
      title:    doc.title,
      hasNav:   !!doc.querySelector('.nav'),
      hasHero:  !!doc.querySelector('.hero'),
      iframeSrc: (document.getElementById('vis-iframe') as HTMLIFrameElement)?.src ?? '',
    };
  });

  console.log('Render result:', result);

  // CSS must be applied — dark background, not plain white
  expect(result.bgColor).not.toBe('rgb(255, 255, 255)');
  expect(result.bgColor).toBe('rgb(10, 10, 15)'); // #0a0a0f from style.css

  expect(result.hasNav).toBe(true);
  expect(result.hasHero).toBe(true);
  expect(result.title).toContain('Joel');

  await page.screenshot({ path: 'tests/screenshots/real-repo-full.png' });
});

test('Real repo — Explorer panel shows all repo files', async ({ page }) => {
  await connectAndLoad(page);

  // Switch to Explorer panel
  await page.click('#act-explorer');
  await page.waitForSelector('#file-tree .tree-item', { timeout: 5_000 });

  const files = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#file-tree .tree-item-name'))
      .map(el => el.textContent?.trim() ?? '');
  });

  console.log('Files in tree:', files);

  // Must show HTML and CSS files
  expect(files.some(f => f.includes('index.html'))).toBe(true);
  expect(files.some(f => f.includes('style.css') || f === 'css')).toBe(true);
});

test('Real repo — pages panel shows Home page', async ({ page }) => {
  await connectAndLoad(page);

  // Switch to Pages panel
  await page.click('#act-pages');
  await page.waitForSelector('.pl-item', { timeout: 5_000 });

  const pages = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.pl-item .pl-title'))
      .map(el => el.textContent?.trim() ?? ''),
  );

  console.log('Visual pages:', pages);
  expect(pages.length).toBeGreaterThan(0);
  expect(pages.some(p => p === 'Home' || p.toLowerCase().includes('home'))).toBe(true);
});
