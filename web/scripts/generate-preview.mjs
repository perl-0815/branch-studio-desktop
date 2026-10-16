import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const publicPath = (name) => resolve(projectRoot, 'public', name);
const reuseScreenshot = process.argv.includes('--reuse-screenshot');
const sourceUrl = process.env.PREVIEW_URL || 'http://localhost:3100';
const browser = await chromium.launch();
try {
  if (!reuseScreenshot) {
    // A fresh context captures only the bundled example, never a user's saved tree.
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    await page.goto(sourceUrl);
    await page.getByRole('button', { name: 'Generate C#', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Fit view', exact: true }).click();
    await page.getByTestId('node-attack-sequence').click();
    await page.waitForFunction(() =>
      document.querySelector('.monaco-editor .view-lines')?.textContent?.includes('SequenceNode'),
    );
    await page.waitForFunction(() =>
      document.querySelector('.status-save')?.textContent?.includes('All changes saved'),
    );
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(1590, 990);
    await page.screenshot({ path: publicPath('editor-preview.png'), animations: 'disabled' });
    await context.close();
  }
  const html = (await readFile(resolve(projectRoot, 'scripts/social-preview.html'), 'utf8'))
    .replace(
      '{{ICON_DATA_URL}}',
      `data:image/svg+xml;base64,${(await readFile(publicPath('favicon.svg'))).toString('base64')}`,
    )
    .replace(
      '{{SCREENSHOT_DATA_URL}}',
      `data:image/png;base64,${(await readFile(publicPath('editor-preview.png'))).toString('base64')}`,
    );
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete && image.naturalWidth > 0),
  );
  await page.screenshot({ path: publicPath('social-preview.png'), animations: 'disabled' });
  console.log(
    'Created public/editor-preview.png (1600×1000) and public/social-preview.png (1200×630).',
  );
} finally {
  await browser.close();
}
