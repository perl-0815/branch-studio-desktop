import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/lib/types';
import type { Workspace } from '../src/lib/workspace';

const workspaceKey = 'branch-studio.workspace.v1';
const legacyKey = 'branch-studio.project.v1';

function tabs(page: Page) {
  return page.getByRole('tablist', { name: 'Project tabs', exact: true });
}

function tab(page: Page, name: string) {
  return tabs(page).getByRole('tab', { name, exact: true });
}

async function ready(page: Page) {
  await page.goto('/');
  await expect(tab(page, 'Sentinel AI')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('node-priority')).toBeVisible();
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
}

async function exportProject(page: Page): Promise<Project> {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save JSON', exact: true }).click();
  const download = await downloading;
  return JSON.parse(await readFile((await download.path())!, 'utf8')) as Project;
}

async function openProject(page: Page, project: unknown, name = 'project.json') {
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open JSON', exact: true }).click();
  await (
    await choosing
  ).setFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
}

async function workspace(page: Page): Promise<Workspace> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), workspaceKey);
}

async function generatedCode(page: Page) {
  await page.getByRole('button', { name: 'Generate C#', exact: true }).click();
  await page.getByRole('button', { name: 'C# code actions', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download C#', exact: true }).click();
  const download = await downloading;
  return readFile((await download.path())!, 'utf8');
}

async function zoom(page: Page) {
  return Number(
    (
      await page.getByRole('button', { name: 'Reset zoom to 100 percent', exact: true }).innerText()
    ).replace('%', ''),
  );
}

async function expectWithinViewport(control: Locator, width: number) {
  await expect(control).toBeInViewport();
  const bounds = (await control.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
}

test('the plus creates a blank tree and tab switching preserves independent edits, selection and Undo', async ({
  page,
}) => {
  await ready(page);
  await page.getByTestId('node-attack').click();
  await page.getByLabel('Node name', { exact: true }).fill('Guard attack');

  await page.getByRole('button', { name: 'New tree', exact: true }).click();
  await expect(tab(page, 'Untitled tree')).toHaveAttribute('aria-selected', 'true');
  const empty = await exportProject(page);
  expect(empty.mode).toBe('game');
  expect(empty.nodes.map((node) => node.kind)).toEqual(['Root']);
  expect(empty.edges).toEqual([]);

  await page.getByTestId('add-Action').click();
  await page.getByLabel('Node name', { exact: true }).fill('Second tree action');
  await tab(page, 'Sentinel AI').click();
  await expect(page.getByLabel('Node name', { exact: true })).toHaveValue('Guard attack');
  await expect(page.getByTestId('node-attack')).toHaveClass(/is-selected/);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Node name', { exact: true })).toHaveValue('Attack enemy');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByLabel('Node name', { exact: true })).toHaveValue('Guard attack');

  await tab(page, 'Untitled tree').click();
  await expect(page.getByLabel('Node name', { exact: true })).toHaveValue('Second tree action');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Node name', { exact: true })).toHaveValue('Action');
  await tab(page, 'Sentinel AI').click();
  await expect(page.getByLabel('Node name', { exact: true })).toHaveValue('Guard attack');
  expect((await exportProject(page)).nodes.find((node) => node.id === 'attack')!.name).toBe(
    'Guard attack',
  );
});

test('each tab keeps its mode and generated C# while new trees inherit the active mode', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'New tree', exact: true }).click();
  await page.getByLabel('Project mode').selectOption('workflow');
  await page.getByRole('button', { name: 'Samples', exact: true }).click();
  await page.getByRole('button', { name: 'Order processing', exact: true }).click();
  await expect(tab(page, 'Order Processing')).toHaveAttribute('aria-selected', 'true');
  const workflowCode = await generatedCode(page);
  expect(workflowCode).toContain('IWorkflowNode');
  expect(workflowCode).toContain('CancellationToken');

  await page.getByRole('button', { name: 'New tree', exact: true }).click();
  expect((await exportProject(page)).mode).toBe('workflow');
  await expect(page.getByTestId('add-AsyncAction')).toBeVisible();
  await expect(page.getByTestId('add-Wait')).toHaveCount(0);

  await tab(page, 'Sentinel AI').click();
  await expect(page.getByLabel('Project mode')).toHaveValue('game');
  await expect(page.getByTestId('node-priority')).toBeVisible();
  const gameCode = await generatedCode(page);
  expect(gameCode).toContain('IBehaviorNode');
  expect(gameCode).not.toContain('CancellationToken');
  await tab(page, 'Order Processing').click();
  await expect(page.getByLabel('Project mode')).toHaveValue('workflow');
  expect(await generatedCode(page)).toBe(workflowCode);
});

test('rapid rename and tab changes survive immediate reload with both documents and the active tab', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'New tree', exact: true }).click();
  await page.getByLabel('Rename project').fill('Billing workflow');
  await tab(page, 'Sentinel AI').click();
  await page.getByLabel('Rename project').fill('Stealth AI');
  await tab(page, 'Billing workflow').click();
  await page.getByLabel('Rename project').fill('Billing workflow revised');
  await tab(page, 'Stealth AI').click();
  await page.reload();

  await expect(tab(page, 'Stealth AI')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'Billing workflow revised')).toBeVisible();
  await expect(tabs(page).getByRole('tab')).toHaveCount(2);
  await expect(page.getByTestId('node-priority')).toBeVisible();
  await tab(page, 'Billing workflow revised').click();
  expect((await exportProject(page)).nodes.map((node) => node.kind)).toEqual(['Root']);
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  const saved = await workspace(page);
  expect(saved.documents.map((document) => document.project.name)).toEqual([
    'Stealth AI',
    'Billing workflow revised',
  ]);
  expect(
    saved.documents.find((document) => document.id === saved.activeDocumentId)!.project.name,
  ).toBe('Billing workflow revised');
});

test('canvas zoom is restored independently for each tab and after reopening the workspace', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Reset zoom to 100 percent', exact: true }).click();
  await expect.poll(() => zoom(page)).toBe(100);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(() => zoom(page)).toBe(83);
  const firstZoom = await zoom(page);

  await page.getByRole('button', { name: 'New tree', exact: true }).click();
  await page.getByRole('button', { name: 'Reset zoom to 100 percent', exact: true }).click();
  await expect.poll(() => zoom(page)).toBe(100);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(() => zoom(page)).toBe(120);
  const secondZoom = await zoom(page);

  await tab(page, 'Sentinel AI').click();
  await expect.poll(() => zoom(page)).toBe(firstZoom);
  await tab(page, 'Untitled tree').click();
  await expect.poll(() => zoom(page)).toBe(secondZoom);
  await page.reload();
  await expect(tab(page, 'Untitled tree')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => zoom(page)).toBe(secondZoom);
  await tab(page, 'Sentinel AI').click();
  await expect.poll(() => zoom(page)).toBe(firstZoom);
});

test('opening JSON adds a tab and a failed import preserves every open document', async ({
  page,
}) => {
  await ready(page);
  const original = await exportProject(page);
  const imported = { ...original, name: 'Imported sentry' };
  await openProject(page, imported);
  await expect(tab(page, 'Imported sentry')).toHaveAttribute('aria-selected', 'true');
  await expect(tabs(page).getByRole('tab')).toHaveCount(2);
  expect(await exportProject(page)).toEqual(imported);
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  const beforeInvalid = await workspace(page);
  await openProject(page, { ...imported, schemaVersion: 999 }, 'invalid.json');
  await expect(page.getByRole('status')).toContainText('Import failed');
  await expect(tabs(page).getByRole('tab')).toHaveCount(2);
  await expect(tab(page, 'Imported sentry')).toHaveAttribute('aria-selected', 'true');
  expect(await exportProject(page)).toEqual(imported);
  expect(await workspace(page)).toEqual(beforeInvalid);
  await tab(page, 'Sentinel AI').click();
  expect(await exportProject(page)).toEqual(original);
});

test('project tabs support keyboard activation and the plus creates uniquely named trees', async ({
  page,
}) => {
  await ready(page);
  const plus = page.getByRole('button', { name: 'New tree', exact: true });
  await plus.focus();
  await plus.press('Enter');
  await expect(tab(page, 'Untitled tree')).toHaveAttribute('aria-selected', 'true');
  await plus.focus();
  await plus.press('Space');
  await expect(tab(page, 'Untitled tree 2')).toHaveAttribute('aria-selected', 'true');
  await expect(tabs(page).getByRole('tab')).toHaveCount(3);

  const first = tab(page, 'Sentinel AI');
  const second = tab(page, 'Untitled tree');
  const third = tab(page, 'Untitled tree 2');
  await third.focus();
  await third.press('ArrowLeft');
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await second.press('Home');
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await first.press('End');
  await expect(third).toBeFocused();
  await expect(third).toHaveAttribute('aria-selected', 'true');
  await third.press('ArrowRight');
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute('aria-selected', 'true');
  for (const projectTab of [first, second, third]) {
    const controls = await projectTab.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    await expect(page.locator(`[id="${controls}"]`)).toHaveCount(1);
  }
  await page.getByRole('button', { name: 'Samples', exact: true }).click();
  await expect(page.getByRole('button', { name: 'New empty tree', exact: true })).toHaveCount(0);
});

test('the add button stays visible beside overflowing long project tabs at maximum text size', async ({
  page,
}) => {
  await ready(page);
  for (let index = 1; index <= 8; index++) {
    await page.getByRole('button', { name: 'New tree', exact: true }).click();
    await page
      .getByLabel('Rename project')
      .fill(`Very long project ${index} with detailed behavior and processing rules`);
  }
  await page.getByRole('button', { name: 'Appearance settings', exact: true }).click();
  const appearance = page.getByRole('dialog', { name: 'Appearance', exact: true });
  await appearance.getByLabel('UI text size').selectOption('150');
  await appearance.getByRole('button', { name: 'Done', exact: true }).click();
  await page.setViewportSize({ width: 800, height: 600 });

  const plus = page.getByRole('button', { name: 'New tree', exact: true });
  await expectWithinViewport(plus, 800);
  const last = tabs(page).getByRole('tab').last();
  await expect(last).toBeInViewport();
  const first = tab(page, 'Sentinel AI');
  await last.focus();
  await last.press('Home');
  await expect(first).toBeFocused();
  await expect(first).toBeInViewport();
  await expectWithinViewport(plus, 800);
  await plus.click();
  await expect(tabs(page).getByRole('tab')).toHaveCount(10);
  await expect(tabs(page).getByRole('tab').last()).toHaveAttribute('aria-selected', 'true');
  await expectWithinViewport(plus, 800);
});

test('switching or creating a tab stops simulation and clears its visual state', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause simulation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New tree', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run simulation', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause simulation', exact: true })).toHaveCount(0);
  await expect(page.locator('.simulation-result')).toHaveCount(0);
  await expect(
    page.locator(
      '.behavior-node.state-Running, .behavior-node.state-Success, .behavior-node.state-Failure',
    ),
  ).toHaveCount(0);
  await tab(page, 'Sentinel AI').click();
  await expect(page.getByRole('button', { name: 'Run simulation', exact: true })).toBeVisible();
  await expect(page.locator('.simulation-result')).toHaveCount(0);
  await expect(
    page.locator(
      '.behavior-node.state-Running, .behavior-node.state-Success, .behavior-node.state-Failure',
    ),
  ).toHaveCount(0);
});

test('the legacy single-project save migrates once without overwriting the recovery copy', async ({
  page,
}) => {
  await ready(page);
  const project = { ...(await exportProject(page)), name: 'Legacy sentry' };
  const legacy = JSON.stringify(project);
  await page.addInitScript(
    ({ workspaceKey, legacyKey, legacy }) => {
      if (sessionStorage.getItem('project-tabs-legacy-seeded')) return;
      localStorage.removeItem(workspaceKey);
      localStorage.setItem(legacyKey, legacy);
      sessionStorage.setItem('project-tabs-legacy-seeded', 'true');
    },
    { workspaceKey, legacyKey, legacy },
  );
  await page.reload();
  await expect(tab(page, 'Legacy sentry')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  expect((await workspace(page)).documents.map((document) => document.project)).toEqual([project]);
  expect(await page.evaluate((key) => localStorage.getItem(key), legacyKey)).toBe(legacy);

  await page.getByRole('button', { name: 'New tree', exact: true }).click();
  await page.getByLabel('Rename project').fill('Workspace version');
  await page.reload();
  await expect(tab(page, 'Workspace version')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'Legacy sentry')).toBeVisible();
  await expect(tabs(page).getByRole('tab')).toHaveCount(2);
  expect(await page.evaluate((key) => localStorage.getItem(key), legacyKey)).toBe(legacy);
});

test('closing an inactive tree can be cancelled and discarded without changing the remaining tree', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'New tree', exact: true }).click();
  await page.getByTestId('add-Action').click();
  await page.getByLabel('Node name', { exact: true }).fill('Keep this action');
  const remaining = await exportProject(page);
  const closeOriginal = page.getByRole('button', { name: 'Close Sentinel AI', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Close tree', exact: true });

  await closeOriginal.click();
  await expect(dialog).toContainText('Sentinel AI');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(tabs(page).getByRole('tab')).toHaveCount(2);
  await expect(tab(page, 'Untitled tree')).toHaveAttribute('aria-selected', 'true');
  await closeOriginal.click();
  await dialog.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(closeOriginal).toBeFocused();
  await expect(tabs(page).getByRole('tab')).toHaveCount(2);

  await closeOriginal.click();
  await dialog.getByRole('button', { name: 'Close without saving', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(tab(page, 'Sentinel AI')).toHaveCount(0);
  await expect(tab(page, 'Untitled tree')).toHaveAttribute('aria-selected', 'true');
  await expect(tabs(page).getByRole('tab')).toHaveCount(1);
  await expect(tabs(page).getByRole('button', { name: /^Close / })).toHaveCount(0);
  expect(await exportProject(page)).toEqual(remaining);
  await page.reload();
  await expect(tab(page, 'Untitled tree')).toHaveAttribute('aria-selected', 'true');
  await expect(tabs(page).getByRole('tab')).toHaveCount(1);
  expect(await exportProject(page)).toEqual(remaining);
});

test('save JSON and close exports the targeted inactive tree and its file reopens losslessly', async ({
  page,
}) => {
  await ready(page);
  await page.getByTestId('node-attack').click();
  await page.getByLabel('Node name', { exact: true }).fill('Saved before closing');
  const expected = await exportProject(page);
  await page.getByRole('button', { name: 'New tree', exact: true }).click();
  await page.getByRole('button', { name: 'Close Sentinel AI', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Close tree', exact: true });
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save JSON and close', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('Sentinel-AI.json');
  const path = (await download.path())!;
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(expected);
  await expect(dialog).not.toBeVisible();
  await expect(tab(page, 'Sentinel AI')).toHaveCount(0);
  await expect(tab(page, 'Untitled tree')).toHaveAttribute('aria-selected', 'true');
  expect((await exportProject(page)).nodes.map((node) => node.kind)).toEqual(['Root']);

  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open JSON', exact: true }).click();
  await (await choosing).setFiles(path);
  await expect(tab(page, 'Sentinel AI')).toHaveAttribute('aria-selected', 'true');
  await expect(tabs(page).getByRole('tab')).toHaveCount(2);
  expect(await exportProject(page)).toEqual(expected);
});

test('a cancelled native save keeps the close dialog and every tree open', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      HybridWebView: {
        SendRawMessage(raw: string) {
          const request = JSON.parse(raw) as { type: string; requestId: string; content: string };
          if (request.type !== 'saveFile') return;
          Object.assign(window, { __cancelledSave: JSON.parse(request.content) });
          setTimeout(
            () =>
              window.dispatchEvent(
                new CustomEvent('HybridWebViewMessageReceived', {
                  detail: {
                    message: JSON.stringify({
                      type: 'operationFailed',
                      requestId: request.requestId,
                      operation: 'saveFile',
                      code: 'cancelled',
                      message: 'Cancelled',
                      cancelled: true,
                    }),
                  },
                }),
              ),
            0,
          );
        },
      },
    });
  });
  let downloads = 0;
  page.on('download', () => downloads++);
  await ready(page);
  await page.getByRole('button', { name: 'New tree', exact: true }).click();
  await page.getByRole('button', { name: 'Close Sentinel AI', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Close tree', exact: true });
  await dialog.getByRole('button', { name: 'Save JSON and close', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('The tree is still open. JSON was not saved.');
  await expect(dialog).toBeVisible();
  await expect(tabs(page).getByRole('tab')).toHaveCount(2);
  await expect(tab(page, 'Untitled tree')).toHaveAttribute('aria-selected', 'true');
  expect(downloads).toBe(0);
  const savedProject = await page.evaluate(
    () => (window as unknown as { __cancelledSave: Project }).__cancelledSave,
  );
  expect(savedProject.name).toBe('Sentinel AI');
  expect(savedProject.nodes.some((node) => node.id === 'priority')).toBe(true);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await tab(page, 'Sentinel AI').click();
  await expect(page.getByTestId('node-priority')).toBeVisible();
});

test('rapid tab changes during a zoom animation do not apply another trees viewport', async ({
  page,
}) => {
  await ready(page);
  const resetZoom = page.getByRole('button', { name: 'Reset zoom to 100 percent', exact: true });
  await resetZoom.click();
  await expect.poll(() => zoom(page)).toBe(100);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(() => zoom(page)).toBe(83);
  await page.getByRole('button', { name: 'New tree', exact: true }).click();
  await resetZoom.click();
  await expect.poll(() => zoom(page)).toBe(100);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(() => zoom(page)).toBe(120);
  const first = tab(page, 'Sentinel AI');
  const second = tab(page, 'Untitled tree');
  await first.click();
  await expect.poll(() => zoom(page)).toBe(83);

  // Mouse clicks avoid the locator stability wait so A → B → A overlaps the 150 ms animation.
  const reset = (await resetZoom.boundingBox())!;
  const a = (await first.boundingBox())!;
  const b = (await second.boundingBox())!;
  await page.mouse.click(reset.x + reset.width / 2, reset.y + reset.height / 2);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.click(a.x + a.width / 2, a.y + a.height / 2);
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(async () => {
      const value = await zoom(page);
      return value >= 83 && value <= 100;
    })
    .toBe(true);
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  await second.click();
  await expect.poll(() => zoom(page)).toBe(120);
  await first.click();
  await expect
    .poll(async () => {
      const value = await zoom(page);
      return value >= 83 && value <= 100;
    })
    .toBe(true);
});
