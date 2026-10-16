import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/lib/types';

const appearanceKey = 'branch-studio.appearance.v1';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('node-priority')).toBeVisible();
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
}

async function japanese(page: Page) {
  await page.getByRole('button', { name: 'Appearance settings', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Appearance', exact: true })
    .getByLabel('Language')
    .selectOption('ja');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  return page.getByRole('dialog', { name: '表示設定', exact: true });
}

async function exportProject(page: Page, japanese = false): Promise<Project> {
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: japanese ? 'JSONを保存' : 'Save JSON', exact: true })
    .click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, 'utf8')) as Project;
}

async function downloadCode(page: Page, japanese = false) {
  await page
    .getByRole('button', { name: japanese ? 'C#を生成' : 'Generate C#', exact: true })
    .click();
  await page
    .getByRole('button', { name: japanese ? 'C#の出力操作' : 'C# code actions', exact: true })
    .click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: japanese ? 'C#を保存' : 'Download C#', exact: true })
    .click();
  const download = await pending;
  return readFile((await download.path())!, 'utf8');
}

async function withinViewport(control: Locator, width: number) {
  await expect(control).toBeInViewport();
  const box = (await control.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
}

test('language changes persist without changing exported JSON, C#, selection or edit history', async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByTestId('node-attack').click();
  await page.getByLabel('Node name', { exact: true }).fill('Guard attack');
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  const project = await exportProject(page);
  const code = await downloadCode(page);
  const before = await page.evaluate(() => ({
    workspace: localStorage.getItem('branch-studio.workspace.v1'),
    viewport: document.querySelector('.react-flow__viewport')?.getAttribute('style'),
  }));

  const dialog = await japanese(page);
  await expect(dialog.getByLabel('言語')).toHaveValue('ja');
  await expect(dialog.getByLabel('UIの文字サイズ')).toHaveValue('100');
  await dialog.getByRole('button', { name: '完了', exact: true }).focus();
  await page.keyboard.press('ControlOrMeta+z');
  await dialog.getByRole('button', { name: '完了', exact: true }).click();
  await expect(page.getByLabel('ノード名', { exact: true })).toHaveValue('Guard attack');
  await expect(page.getByTestId('node-attack')).toHaveClass(/is-selected/);
  expect(
    await page.evaluate(() => ({
      workspace: localStorage.getItem('branch-studio.workspace.v1'),
      viewport: document.querySelector('.react-flow__viewport')?.getAttribute('style'),
    })),
  ).toEqual(before);
  expect(await exportProject(page, true)).toEqual(project);
  expect(await downloadCode(page, true)).toBe(code);

  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(page.getByLabel('ノード名', { exact: true })).toHaveValue('Attack enemy');
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await expect(page.getByLabel('ノード名', { exact: true })).toHaveValue('Guard attack');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.locator('.status-save')).toHaveText('すべての変更を保存済み');
  expect(await exportProject(page, true)).toEqual(project);
  expect(await downloadCode(page, true)).toBe(code);
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), appearanceKey),
  ).toMatchObject({ language: 'ja' });

  await page.getByRole('button', { name: '表示設定', exact: true }).click();
  await dialog.getByLabel('言語').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page
    .getByRole('dialog', { name: 'Appearance', exact: true })
    .getByRole('button', { name: 'Done', exact: true })
    .click();
  expect(await exportProject(page)).toEqual(project);
});

test('Japanese search, mock labels and diagnostics retain canonical node kinds and enum values', async ({
  page,
}) => {
  await ready(page);
  const dialog = await japanese(page);
  await dialog.getByRole('button', { name: '完了', exact: true }).click();
  const search = page.getByLabel('ノードライブラリを検索', { exact: true });
  await search.fill('条件');
  await expect(page.getByTestId('add-Condition')).toContainText('条件');
  await expect(page.locator('.library-node')).toHaveCount(1);
  await search.clear();

  await page.locator('.workspace-path').click();
  await page.keyboard.press('Space');
  const quick = page.getByLabel('ノードをクイック追加', { exact: true });
  await quick.fill('反転');
  await expect(page.locator('.quick-results button')).toHaveCount(1);
  await quick.press('Enter');
  const added = await exportProject(page, true);
  expect(added.nodes.at(-1)?.kind).toBe('Inverter');
  await page.getByRole('button', { name: 'ノードを削除', exact: true }).click();

  await page.getByTestId('node-attack').click();
  const mock = page.getByRole('combobox', { name: 'モックの結果', exact: true });
  for (const [label, value] of [
    ['失敗', 'Failure'],
    ['実行中', 'Running'],
    ['成功', 'Success'],
  ]) {
    await mock.selectOption({ label });
    await expect(mock).toHaveValue(value);
    expect(
      (await exportProject(page, true)).nodes.find((node) => node.id === 'attack')!.params.mock,
    ).toBe(value);
  }
  await page
    .locator('.workspace-bar')
    .getByRole('button', { name: 'プロジェクト設定', exact: true })
    .click();
  await page.getByLabel('クラス名', { exact: true }).fill('9InvalidClass');
  await page.getByRole('button', { name: 'ツリーを検証', exact: true }).click();
  await expect(
    page
      .locator('.problem-row')
      .filter({ hasText: 'クラス名には有効な C# 識別子を指定してください。' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'C#の出力操作', exact: true }).click();
  await expect(page.getByRole('button', { name: 'C#を保存', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  expect((await exportProject(page, true)).settings.className).toBe('9InvalidClass');
});

test('Japanese settings and core actions fit smaller desktop windows at maximum text sizes', async ({
  page,
}) => {
  await ready(page);
  const dialog = await japanese(page);
  await dialog.getByLabel('UIの文字サイズ').selectOption('150');
  await dialog.getByLabel('コードの文字サイズ').selectOption('24');
  for (const viewport of [
    { width: 1000, height: 800 },
    { width: 800, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    await withinViewport(dialog.getByLabel('言語'), viewport.width);
    await withinViewport(dialog.getByRole('button', { name: '完了', exact: true }), viewport.width);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await dialog.getByRole('button', { name: '完了', exact: true }).click();
    for (const name of [
      'JSONを開く',
      'JSONを保存',
      'C#を生成',
      'シミュレーションを実行',
      'C#の出力操作',
      '新しいツリー',
      '表示設定',
    ]) {
      await withinViewport(page.getByRole('button', { name, exact: true }), viewport.width);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await page
        .locator('.inspector-tabs')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.getByRole('button', { name: 'キーボードショートカット', exact: true }).click();
    const shortcuts = page.getByRole('dialog', { name: 'キーボードショートカット', exact: true });
    await expect(shortcuts.getByText('複数選択', { exact: true })).toBeVisible();
    await expect(shortcuts.getByText('Shift + クリック / ドラッグ', { exact: true })).toBeVisible();
    await shortcuts
      .getByRole('button', { name: 'ショートカット一覧を閉じる', exact: true })
      .click();
    await page.getByRole('button', { name: '表示設定', exact: true }).click();
  }
});

test('legacy and unsupported language preferences fall back to English while preserving font choices and the tree', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Rename project').fill('Language migration tree');
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  const original = await exportProject(page);
  for (const preferences of [
    { textScale: 125, codeFontSize: 18 },
    { textScale: 150, codeFontSize: 24, language: 'unknown' },
  ]) {
    await page.evaluate(
      ({ key, preferences }) => localStorage.setItem(key, JSON.stringify(preferences)),
      { key: appearanceKey, preferences },
    );
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByLabel('Rename project')).toHaveValue('Language migration tree');
    await expect(page.locator('.monaco-editor .view-lines')).toHaveCSS(
      'font-size',
      `${preferences.codeFontSize}px`,
    );
    await expect(page.locator('.library-node').first()).toHaveCSS(
      'font-size',
      `${(11 * preferences.textScale) / 100}px`,
    );
    await page.getByRole('button', { name: 'Appearance settings', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Appearance', exact: true });
    await expect(dialog.getByLabel('Language')).toHaveValue('en');
    await expect(dialog.getByLabel('UI text size')).toHaveValue(String(preferences.textScale));
    await expect(dialog.getByLabel('Code font size')).toHaveValue(String(preferences.codeFontSize));
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    expect(await exportProject(page)).toEqual(original);
  }
});
