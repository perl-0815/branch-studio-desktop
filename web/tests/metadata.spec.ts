import { expect, test } from '@playwright/test';

const origin = 'https://branch-studio.vercel.app';
const socialImage = `${origin}/social-preview.png`;

test('initial HTML exposes canonical social metadata and browser icons', async ({
  page,
  request,
}) => {
  const response = await request.get('/');
  expect(response.ok()).toBe(true);
  const head = (await response.text()).split('</head>')[0];
  // Link crawlers must receive these values before executing any editor JavaScript.
  expect(head).toContain('property="og:image"');
  expect(head).toContain('name="twitter:image"');
  expect(head).toContain(socialImage);
  await page.goto('/');
  await expect(page).toHaveTitle('Branch Studio — Behavior Tree Editor');
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    'content',
    'Branch Studio',
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', socialImage);
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    'content',
    /Branch Studio.+behavior tree.+C#/,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', socialImage);
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
  expect(new URL(canonical!).href).toBe(`${origin}/`);
  expect(new URL(ogUrl!).href).toBe(`${origin}/`);
  await expect(page.locator('link[rel="icon"][href="/favicon.svg"]')).toHaveAttribute(
    'type',
    'image/svg+xml',
  );
  await expect(page.locator('link[rel="icon"][href="/favicon.ico"]')).toHaveAttribute(
    'type',
    'image/x-icon',
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/apple-touch-icon.png',
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/site.webmanifest');
});

test('public branding assets are valid images with correct dimensions and MIME types', async ({
  request,
}) => {
  const images = [
    { path: '/apple-touch-icon.png', width: 180, height: 180 },
    { path: '/icon-192.png', width: 192, height: 192 },
    { path: '/icon-512.png', width: 512, height: 512 },
    { path: '/social-preview.png', width: 1200, height: 630 },
    { path: '/editor-preview.png' },
  ];
  const responses = await Promise.all(images.map((image) => request.get(image.path)));
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const response = responses[i];
    expect(response.ok(), image.path).toBe(true);
    expect(response.headers()['content-type'], image.path).toMatch(/^image\/png/);
    const png = await response.body();
    expect(png.subarray(0, 8).toString('hex'), image.path).toBe('89504e470d0a1a0a');
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    if (image.width) {
      expect(width, image.path).toBe(image.width);
      expect(height, image.path).toBe(image.height);
    } else {
      expect(width).toBeGreaterThanOrEqual(1200);
      expect(height).toBeGreaterThanOrEqual(700);
    }
  }
  const [svg, ico, manifest] = await Promise.all([
    request.get('/favicon.svg'),
    request.get('/favicon.ico'),
    request.get('/site.webmanifest'),
  ]);
  expect(svg.ok()).toBe(true);
  expect(svg.headers()['content-type']).toMatch(/^image\/svg\+xml/);
  expect(await svg.text()).toContain('<svg');
  expect(ico.ok()).toBe(true);
  expect(ico.headers()['content-type']).toMatch(/^image\/(x-icon|vnd\.microsoft\.icon)/);
  const container = await ico.body();
  expect(container.readUInt16LE(0)).toBe(0);
  expect(container.readUInt16LE(2)).toBe(1);
  expect(container.readUInt16LE(4)).toBeGreaterThan(0);
  expect(manifest.ok()).toBe(true);
  expect(manifest.headers()['content-type']).toMatch(/^application\/manifest\+json/);
  const identity = await manifest.json();
  expect(identity.name).toBe('Branch Studio');
  expect(identity.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }),
    ]),
  );
});
