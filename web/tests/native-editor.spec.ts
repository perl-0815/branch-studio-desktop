import { test, expect, type Page } from '@playwright/test';
import { createSample } from '../src/lib/samples';
import { readFile } from 'node:fs/promises';

type RawRequest = {
  type: string;
  requestId: string;
  fileName?: string;
  content?: string;
  mimeType?: string;
};
async function installNativeHost(page: Page) {
  const project = createSample('workflow');
  project.name = 'Native order project';
  await page.addInitScript(
    ({ content }) => {
      const requests: RawRequest[] = [];
      const reply = (message: unknown) =>
        setTimeout(
          () =>
            window.dispatchEvent(
              new CustomEvent('HybridWebViewMessageReceived', {
                detail: { message: JSON.stringify(message) },
              }),
            ),
          0,
        );
      Object.assign(window, {
        __nativeRequests: requests,
        __nextOpen: { content, fileName: 'native-order.json' },
        HybridWebView: {
          SendRawMessage(raw: string) {
            const request = JSON.parse(raw) as RawRequest;
            requests.push(request);
            if (request.type === 'saveFile')
              reply({
                type: 'fileSaved',
                requestId: request.requestId,
                fileName: request.fileName,
              });
            else {
              const next = (
                window as unknown as {
                  __nextOpen: { content?: string; fileName?: string; cancelled?: boolean };
                }
              ).__nextOpen;
              if (next.cancelled)
                reply({
                  type: 'operationFailed',
                  requestId: request.requestId,
                  operation: 'openProject',
                  code: 'cancelled',
                  message: 'Cancelled',
                  cancelled: true,
                });
              else
                reply({
                  type: 'projectOpened',
                  requestId: request.requestId,
                  fileName: next.fileName,
                  content: next.content,
                });
            }
          },
        },
      });
    },
    { content: JSON.stringify(project) },
  );
  return project;
}
async function requests(page: Page) {
  return page.evaluate(
    () => (window as unknown as { __nativeRequests: RawRequest[] }).__nativeRequests,
  );
}

test('native picker and saver handle JSON, generated C#, and runtime without browser downloads', async ({
  page,
}) => {
  const project = await installNativeHost(page);
  let downloads = 0;
  let choosers = 0;
  page.on('download', () => downloads++);
  page.on('filechooser', () => choosers++);
  await page.goto('/');
  await expect(page.getByLabel('Rename project')).toBeVisible();
  await page.getByRole('button', { name: 'Open JSON', exact: true }).click();
  await expect(page.getByLabel('Rename project')).toHaveValue(project.name);
  await page.getByRole('button', { name: 'Save JSON', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved Native-order-project.json');
  const json = (await requests(page)).find((r) => r.type === 'saveFile')!;
  expect(json.mimeType).toBe('application/json');
  expect(JSON.parse(json.content!)).toEqual(project);
  await page.getByRole('button', { name: 'C# code actions', exact: true }).click();
  await page.getByRole('button', { name: 'Download C#', exact: true }).click();
  await expect
    .poll(async () => (await requests(page)).filter((r) => r.type === 'saveFile').length)
    .toBe(2);
  expect((await requests(page)).at(-1)).toMatchObject({
    fileName: 'OrderWorkflow.cs',
    mimeType: 'text/plain',
  });
  expect((await requests(page)).at(-1)!.content).toContain('IOrderWorkflowHandlers');
  await page.getByRole('button', { name: 'C# code actions', exact: true }).click();
  await page.getByRole('link', { name: 'Download C# runtime', exact: true }).click();
  await expect
    .poll(async () => (await requests(page)).filter((r) => r.type === 'saveFile').length)
    .toBe(3);
  expect((await requests(page)).at(-1)).toMatchObject({
    fileName: 'BranchStudio.Workflow.cs',
    mimeType: 'text/plain',
  });
  expect((await requests(page)).at(-1)!.content).toContain('interface IWorkflowNode');
  expect(downloads).toBe(0);
  expect(choosers).toBe(0);
});

test('cancelled and invalid native imports preserve the current editable project', async ({
  page,
}) => {
  await installNativeHost(page);
  await page.goto('/');
  await expect(page.getByLabel('Rename project')).toBeVisible();
  await page.getByLabel('Rename project').fill('Keep my edits');
  await page.evaluate(() => Object.assign(window, { __nextOpen: { cancelled: true } }));
  await page.getByRole('button', { name: 'Open JSON', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save JSON', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Rename project')).toHaveValue('Keep my edits');
  await page.evaluate(() =>
    Object.assign(window, { __nextOpen: { fileName: 'broken.json', content: '{invalid' } }),
  );
  await page.getByRole('button', { name: 'Open JSON', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Open failed');
  await expect(page.getByLabel('Rename project')).toHaveValue('Keep my edits');
  await expect(page.getByRole('button', { name: 'Save JSON', exact: true })).toBeEnabled();
});

test('ordinary browser keeps file chooser and download behavior without requesting the MAUI script', async ({
  page,
}) => {
  let frameworkRequests = 0;
  page.on('request', (req) => {
    if (req.url().includes('/_framework/')) frameworkRequests++;
  });
  await page.goto('/');
  await expect(page.getByLabel('Rename project')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open JSON', exact: true }).click();
  const sample = createSample('game');
  sample.name = 'Browser import';
  await (
    await chooser
  ).setFiles({
    name: 'tree.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(sample)),
  });
  await expect(page.getByLabel('Rename project')).toHaveValue(sample.name);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save JSON', exact: true }).click();
  const file = await download;
  expect(JSON.parse(await readFile((await file.path())!, 'utf8'))).toEqual(sample);
  expect(frameworkRequests).toBe(0);
});
