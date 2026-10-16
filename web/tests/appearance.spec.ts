import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('node-priority')).toBeVisible();
  await expect(page.locator('.monaco-editor .view-lines')).toBeVisible();
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
}

test('appearance updates UI and code independently, persists, and leaves the tree and viewport intact', async ({
  page,
}) => {
  await ready(page);
  await page.getByTestId('node-priority').click();
  await page.getByLabel('Rename project').fill('My readable tree');
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  const before = await page.evaluate(() => ({
    project: localStorage.getItem('branch-studio.workspace.v1'),
    viewport: document.querySelector('.react-flow__viewport')?.getAttribute('style'),
    selected: document.querySelector('.react-flow__node.selected')?.getAttribute('data-id'),
  }));
  const opener = page.getByRole('button', { name: 'Appearance settings', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Appearance', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('UI text size').selectOption('150');
  await expect(page.locator('.library-node').first()).toHaveCSS('font-size', '16.5px');
  await expect(page.locator('.node-name').first()).toHaveCSS('font-size', '16.5px');
  await expect(page.locator('.monaco-editor .view-lines')).toHaveCSS('font-size', '12px');
  await dialog.getByLabel('Code font size').selectOption('24');
  await expect(page.locator('.monaco-editor .view-lines')).toHaveCSS('font-size', '24px');
  await expect(page.locator('.monaco-editor .view-lines')).toHaveCSS('line-height', '40px');
  await dialog.getByRole('button', { name: 'Done', exact: true }).focus();
  await page.keyboard.press('Delete');
  await page.keyboard.press('ControlOrMeta+z');
  await dialog.getByLabel('UI text size').focus();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect(
    await page.evaluate(() => ({
      project: localStorage.getItem('branch-studio.workspace.v1'),
      viewport: document.querySelector('.react-flow__viewport')?.getAttribute('style'),
      selected: document.querySelector('.react-flow__node.selected')?.getAttribute('data-id'),
    })),
  ).toEqual(before);
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();

  await page.reload();
  await expect(page.getByLabel('Rename project')).toHaveValue('My readable tree');
  await expect(page.locator('.library-node').first()).toHaveCSS('font-size', '16.5px');
  await expect(page.locator('.monaco-editor .view-lines')).toHaveCSS('font-size', '24px');
  await opener.click();
  await expect(dialog.getByLabel('UI text size')).toHaveValue('150');
  await expect(dialog.getByLabel('Code font size')).toHaveValue('24');
  await dialog.getByRole('button', { name: 'Reset defaults', exact: true }).click();
  await expect(dialog.getByLabel('UI text size')).toHaveValue('100');
  await expect(dialog.getByLabel('Code font size')).toHaveValue('12');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.library-node').first()).toHaveCSS('font-size', '11px');
  await expect(page.locator('.monaco-editor .view-lines')).toHaveCSS('font-size', '12px');
});

test('unreadable and out-of-range appearance preferences never prevent opening a project', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Rename project').fill('Recovered tree');
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  for (const value of ['{broken', JSON.stringify({ textScale: 900, codeFontSize: -4 })]) {
    await page.evaluate(
      (value) => localStorage.setItem('branch-studio.appearance.v1', value),
      value,
    );
    await page.reload();
    await expect(page.getByLabel('Rename project')).toHaveValue('Recovered tree');
    await expect(page.locator('.library-node').first()).toHaveCSS('font-size', '11px');
    await expect(page.locator('.monaco-editor .view-lines')).toHaveCSS('font-size', '12px');
  }
});

test('appearance remains usable when local preferences cannot be saved', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'branch-studio.appearance.v1') throw new Error('Storage unavailable');
      return setItem.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Appearance settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Appearance', exact: true });
  await dialog.getByLabel('UI text size').selectOption('125');
  await expect(dialog.getByRole('status')).toHaveText(
    'Applied for this session. Local save is unavailable.',
  );
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.library-node').first()).toHaveCSS('font-size', '13.75px');
  await expect(page.getByTestId('node-priority')).toBeVisible();
});

test('maximum text sizes keep appearance controls and main actions usable in smaller windows', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Appearance settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Appearance', exact: true });
  await dialog.getByLabel('UI text size').selectOption('150');
  await dialog.getByLabel('Code font size').selectOption('24');
  for (const viewport of [
    { width: 1000, height: 800 },
    { width: 800, height: 600 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeInViewport();
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    if (viewport.width >= 800) {
      expect((await page.locator('.center-workspace').boundingBox())!.width).toBeGreaterThanOrEqual(
        300,
      );
      await page
        .locator('.bottom-tabs')
        .getByRole('button', { name: 'Console', exact: true })
        .click();
      await page
        .locator('.bottom-tabs')
        .getByRole('button', { name: 'C# Preview', exact: true })
        .click();
      await page.getByRole('button', { name: 'Collapse output panel', exact: true }).click();
      await page.getByRole('button', { name: 'Expand output panel', exact: true }).click();
    }
    for (const name of [
      'Open JSON',
      'Save JSON',
      'Generate C#',
      'Run simulation',
      'C# code actions',
    ]) {
      const action = page.getByRole('button', { name, exact: true });
      await expect(action).toBeInViewport();
      const bounds = (await action.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    }
    await page.getByRole('button', { name: 'Appearance settings', exact: true }).click();
  }
});
