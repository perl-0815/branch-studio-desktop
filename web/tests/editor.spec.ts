import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/lib/types';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('Rename project')).toHaveValue('Sentinel AI');
  await expect(page.getByTestId('node-priority')).toBeVisible();
}
async function exportProject(page: Page): Promise<Project> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save JSON', exact: true }).click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, 'utf8')) as Project;
}
async function importProject(page: Page, value: unknown, name = 'project.json') {
  await openProjectFile(page, {
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
}
async function openProjectFile(
  page: Page,
  file: string | { name: string; mimeType: string; buffer: Buffer },
) {
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open JSON', exact: true }).click();
  await (await choosing).setFiles(file);
}
async function downloadCode(page: Page) {
  await page.getByRole('button', { name: 'Generate C#', exact: true }).click();
  await page.getByRole('button', { name: 'C# code actions', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download C#', exact: true }).click();
  const download = await pending;
  return {
    name: download.suggestedFilename(),
    code: await readFile((await download.path())!, 'utf8'),
  };
}

test('library add, Inspector editing, undo and redo preserve the document', async ({ page }) => {
  await ready(page);
  await page.getByTestId('add-Action').click();
  await expect(page.getByLabel('Node name')).toHaveValue('Action');
  await page.getByLabel('Node name').fill('Flee danger');
  await expect(page.locator('.behavior-node.is-selected .node-name')).toHaveText('Flee danger');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Node name')).toHaveValue('Action');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByLabel('Node name')).toHaveValue('Flee danger');
  await page.getByRole('button', { name: 'Validate tree', exact: true }).click();
  await expect(page.locator('.problem-row').filter({ hasText: 'UNREACHABLE' })).toBeVisible();
  await page.getByRole('button', { name: 'C# code actions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download C#', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Copy C#', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Delete node', exact: true }).click();
  await expect(page.locator('.panel-empty')).toContainText('No problems detected');
});

test('child order controls exported C# and survives project round trip', async ({ page }) => {
  await ready(page);
  await page.getByTestId('node-priority').click();
  await page.getByRole('button', { name: 'Move Patrol up', exact: true }).click();
  await page.getByRole('button', { name: 'Move Patrol up', exact: true }).click();
  await expect(page.locator('.child-row').first()).toContainText('Patrol');
  const project = await exportProject(page);
  expect(
    project.edges
      .filter((e) => e.source === 'priority')
      .sort((a, b) => a.order - b.order)
      .map((e) => e.target),
  ).toEqual(['patrol', 'attack-sequence', 'chase-sequence']);
  const source = await downloadCode(page);
  expect(source.code.indexOf('handlers.Patrol')).toBeLessThan(
    source.code.indexOf('handlers.Attack'),
  );
  await importProject(page, project);
  expect(await exportProject(page)).toEqual(project);
});

test('quick add aliases and graph search work through the keyboard', async ({ page }) => {
  await ready(page);
  await page.locator('.workspace-path').click();
  await page.keyboard.press('Space');
  await page.getByLabel('Quick add node').fill('fallback');
  await expect(page.locator('.quick-results button')).toHaveCount(1);
  await page.getByLabel('Quick add node').press('Enter');
  await expect(page.getByLabel('Node name')).toHaveValue('Selector');
  await page.getByRole('button', { name: 'Find node', exact: true }).first().click();
  await page.getByLabel('Find existing node').fill('Patrol');
  await page.getByLabel('Find existing node').press('Enter');
  await expect(page.getByLabel('Node name')).toHaveValue('Patrol');
});

test('keyboard node movement is undoable', async ({ page }) => {
  await ready(page);
  const before = await exportProject(page);
  const node = page.locator('.react-flow__node[data-id="attack"]');
  await page.getByTestId('node-attack').click();
  await node.focus();
  await node.press('ArrowRight');
  const moved = await exportProject(page);
  expect(moved.nodes.find((n) => n.id === 'attack')!.position.x).toBeGreaterThan(
    before.nodes.find((n) => n.id === 'attack')!.position.x,
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await exportProject(page)).nodes).toEqual(before.nodes);
});

test('library drag and drop adds a node at the canvas drop location', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'New tree', exact: true }).click();
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  await page
    .getByTestId('add-Condition')
    .dragTo(page.locator('.react-flow__pane'), { targetPosition: { x: 220, y: 300 } });
  await expect(page.getByLabel('Node name')).toHaveValue('Condition');
  const project = await exportProject(page);
  expect(project.nodes).toHaveLength(2);
  expect(project.nodes.find((n) => n.kind === 'Condition')!.position).not.toEqual(
    project.nodes.find((n) => n.kind === 'Root')!.position,
  );
});

test('dragging a source handle to empty canvas opens connected quick add', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'New tree', exact: true }).click();
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  const source = page.getByTestId('node-root').locator('.react-flow__handle.source');
  await source.hover();
  const from = (await source.boundingBox())!;
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(pane.x + pane.width * 0.75, pane.y + pane.height - 140, { steps: 20 });
  await page.mouse.up();
  await page.getByLabel('Quick add node').fill('Sequence');
  await page.getByLabel('Quick add node').press('Enter');
  await expect(page.getByLabel('Node name')).toHaveValue('Sequence');
  const project = await exportProject(page);
  expect(project.nodes).toHaveLength(2);
  expect(project.edges).toHaveLength(1);
  expect(project.edges[0].source).toBe('root');
  expect(project.edges[0].target).toBe(project.nodes.find((n) => n.kind === 'Sequence')!.id);
});

test('duplicate, copy, paste, delete and undo work through editor shortcuts', async ({ page }) => {
  await ready(page);
  const initial = await exportProject(page);
  await page.getByTestId('node-patrol').click();
  await page.keyboard.press('ControlOrMeta+d');
  let project = await exportProject(page);
  expect(project.nodes).toHaveLength(initial.nodes.length + 1);
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  project = await exportProject(page);
  expect(project.nodes).toHaveLength(initial.nodes.length + 2);
  expect(new Set(project.nodes.map((n) => n.id)).size).toBe(project.nodes.length);
  await page.keyboard.press('Delete');
  expect((await exportProject(page)).nodes).toHaveLength(initial.nodes.length + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await exportProject(page)).nodes).toHaveLength(initial.nodes.length + 2);
});

test('one undo restores a mixed selection of a node and an unrelated edge', async ({ page }) => {
  await ready(page);
  const before = await exportProject(page);
  await page.getByTestId('node-attack').click();
  const edge = page.locator(
    '.react-flow__edge[data-id="e-priority-patrol"] .react-flow__edge-path',
  );
  const point = await edge.evaluate((element) => {
    const path = element as SVGPathElement;
    const local = path.getPointAtLength(path.getTotalLength() / 2);
    const screen = new DOMPoint(local.x, local.y).matrixTransform(path.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  await page.keyboard.down('Shift');
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('node-attack')).toHaveClass(/is-selected/);
  await expect(page.locator('.react-flow__edge[data-id="e-priority-patrol"]')).toHaveClass(
    /selected/,
  );
  await page.keyboard.press('Delete');
  const removed = await exportProject(page);
  expect(removed.nodes.some((n) => n.id === 'attack')).toBe(false);
  expect(removed.edges.some((e) => e.id === 'e-priority-patrol')).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportProject(page)).toEqual(before);
});

test('mobile file and execution groups remain visible and usable at 390 pixels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const files = page.getByRole('group', { name: 'Project files', exact: true });
  await expect(files.getByRole('button', { name: 'Open JSON', exact: true })).toBeVisible();
  await expect(files.getByRole('button', { name: 'Save JSON', exact: true })).toBeVisible();
  await expect(files.getByRole('button', { name: 'Open JSON', exact: true })).toContainText('Open');
  await expect(files.getByRole('button', { name: 'Save JSON', exact: true })).toContainText('Save');
  await expect(
    page
      .getByRole('group', { name: 'Simulation', exact: true })
      .getByRole('button', { name: 'Run simulation', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate C#', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'C# code actions', exact: true })).toContainText(
    'Export C#',
  );
  for (const name of [
    'Open JSON',
    'Save JSON',
    'Run simulation',
    'Generate C#',
    'C# code actions',
  ]) {
    const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
  }
  const project = await exportProject(page);
  await importProject(page, { ...project, name: 'Mobile workspace' });
  await expect(page.getByLabel('Rename project')).toHaveValue('Mobile workspace');
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  await expect(page.getByLabel('Quick add node')).toBeVisible();
  await page.getByLabel('Quick add node').press('Escape');
  await page.getByRole('button', { name: 'Generate C#', exact: true }).click();
  await expect(page.locator('.code-file-bar')).toContainText('SentinelBehavior.cs');
});

test('project files, execution, and C# exports have distinct toolbar groups', async ({
  page,
  context,
}) => {
  await ready(page);
  const files = page.getByRole('group', { name: 'Project files', exact: true });
  const code = page.getByRole('group', { name: 'Code and simulation', exact: true });
  const simulation = code.getByRole('group', { name: 'Simulation', exact: true });
  await expect(files.getByRole('button')).toHaveCount(2);
  for (const name of ['Run simulation', 'Step simulation', 'Reset simulation'])
    await expect(simulation.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(code.getByRole('button', { name: 'Validate tree', exact: true })).toBeVisible();
  await expect(code.getByRole('button', { name: 'Generate C#', exact: true })).toBeVisible();
  await expect(code.getByRole('button', { name: /^(Open JSON|Save JSON)$/ })).toHaveCount(0);
  const generate = (await code
    .getByRole('button', { name: 'Generate C#', exact: true })
    .boundingBox())!;
  for (const name of ['Run simulation', 'Step simulation', 'Reset simulation', 'Validate tree']) {
    const box = (await code.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(generate.x);
  }
  await expect(
    page
      .locator('.graph-area')
      .getByRole('button', { name: /^(Run simulation|Step simulation|Reset simulation)$/ }),
  ).toHaveCount(0);
  await expect(
    page.locator('.bottom-tabs').getByRole('button', { name: /^(Copy C#|Download C#)$/ }),
  ).toHaveCount(0);
  await code.getByRole('button', { name: 'C# code actions', exact: true }).click();
  const menu = code.locator('.dropdown-menu');
  await expect(menu.locator('button, a')).toHaveCount(3);
  await expect(menu.getByRole('button', { name: 'Copy C#', exact: true })).toBeEnabled();
  await expect(menu.getByRole('button', { name: 'Download C#', exact: true })).toBeEnabled();
  await expect(menu.getByRole('link', { name: 'Download C# runtime', exact: true })).toBeVisible();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await menu.getByRole('button', { name: 'Copy C#', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('ISentinelBehaviorHandlers');
  const codeActions = code.getByRole('button', { name: 'C# code actions', exact: true });
  if ((await codeActions.getAttribute('aria-expanded')) !== 'true') await codeActions.click();
  const downloading = page.waitForEvent('download');
  await code.getByRole('link', { name: 'Download C# runtime', exact: true }).click();
  const runtime = await downloading;
  expect(runtime.suggestedFilename()).toBe('BranchStudio.Game.cs');
  expect(await readFile((await runtime.path())!, 'utf8')).toContain('interface IBehaviorNode');
});

test('project settings and interaction shortcuts are discoverable beside the project', async ({
  page,
}) => {
  await ready(page);
  await page.getByTestId('node-attack').click();
  const settings = page
    .locator('.workspace-bar')
    .getByRole('button', { name: 'Project settings', exact: true });
  await expect(settings).toContainText('Project settings');
  await settings.click();
  await expect(page.getByLabel('Namespace', { exact: true })).toHaveValue('Game.AI');
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
  await expect(dialog.getByText('Multi-select', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Shift + click / drag', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Pan canvas', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Scroll / middle drag', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close shortcuts', exact: true }).click();
});

test('JSON import is transactional and local autosave survives reload', async ({ page }) => {
  await ready(page);
  await page.getByLabel('Rename project').fill('Persistent sentry');
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  const before = await exportProject(page);
  await importProject(page, { ...before, schemaVersion: 999 }, 'invalid.json');
  await expect(page.getByRole('status')).toContainText('Import failed');
  expect(await exportProject(page)).toEqual(before);
  await page.reload();
  await expect(page.getByLabel('Rename project')).toHaveValue('Persistent sentry');
  expect(await exportProject(page)).toEqual(before);
});

test('downloaded project resumes unchanged in a browser with independent storage', async ({
  browser,
}) => {
  const options = {
    baseURL: String(test.info().project.use.baseURL),
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
  };
  const contextA = await browser.newContext(options);
  const contextB = await browser.newContext(options);
  try {
    const pageA = await contextA.newPage();
    await ready(pageA);
    const baseline = await exportProject(pageA);
    await pageA.getByLabel('Rename project').fill('Portable sentry');
    await pageA.getByTestId('node-priority').click();
    await pageA.getByRole('button', { name: 'Move Patrol up', exact: true }).click();
    await pageA.getByTestId('node-attack').click();
    await pageA.getByLabel('Handler method', { exact: true }).fill('AttackTarget');
    await pageA
      .getByLabel('Arguments · JSON array', { exact: true })
      .fill('["aggressive", 5, true]');
    const attack = pageA.locator('.react-flow__node[data-id="attack"]');
    await attack.focus();
    await attack.press('ArrowRight');
    await pageA.getByRole('button', { name: 'Blackboard', exact: true }).click();
    await pageA
      .locator('.variable')
      .filter({ hasText: 'health' })
      .locator('.variable-heading button')
      .first()
      .click();
    await pageA.getByLabel('Default value', { exact: true }).fill('85.5');
    await pageA.getByRole('button', { name: 'Project settings', exact: true }).click();
    await pageA.getByLabel('Namespace', { exact: true }).fill('Portable.Game.AI');
    await pageA.getByLabel('Class name', { exact: true }).fill('PortableSentry');
    await expect(pageA.locator('.status-save')).toHaveText('All changes saved');
    const codeA = await downloadCode(pageA);
    const downloading = pageA.waitForEvent('download');
    await pageA.getByRole('button', { name: 'Save JSON', exact: true }).click();
    const file = await downloading;
    const path = (await file.path())!;
    const expected = JSON.parse(await readFile(path, 'utf8')) as Project;
    expect(expected.nodes.find((n) => n.id === 'attack')!.params.arguments).toBe(
      '["aggressive", 5, true]',
    );
    expect(expected.nodes.find((n) => n.id === 'attack')!.position.x).toBeGreaterThan(
      baseline.nodes.find((n) => n.id === 'attack')!.position.x,
    );
    expect(expected.variables.find((v) => v.name === 'health')!.value).toBe('85.5');
    expect(expected.settings).toEqual({
      namespace: 'Portable.Game.AI',
      className: 'PortableSentry',
    });
    expect(expected.edges.find((e) => e.target === 'patrol')!.order).toBe(1);
    expect((await contextB.storageState()).origins).toEqual([]);
    const pageB = await contextB.newPage();
    await ready(pageB);
    await openProjectFile(pageB, path);
    await expect(pageB.getByLabel('Rename project')).toHaveValue('Portable sentry');
    await expect(pageB.locator('.status-save')).toHaveText('All changes saved');
    expect(await exportProject(pageB)).toEqual(expected);
    expect((await downloadCode(pageB)).code).toBe(codeA.code);
    await pageB.reload();
    await expect(pageB.getByLabel('Rename project')).toHaveValue('Portable sentry');
    expect(await exportProject(pageB)).toEqual(expected);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('latest edit survives an immediate reload before the autosave debounce', async ({ page }) => {
  await ready(page);
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  await page.getByLabel('Rename project').fill('Saved on navigation');
  await page.reload();
  await expect(page.getByLabel('Rename project')).toHaveValue('Saved on navigation');
});

test('corrupt local data is preserved until a valid import resumes autosave', async ({ page }) => {
  const key = 'branch-studio.project.v1';
  const corrupt = '{ damaged project';
  await page.addInitScript(({ key, corrupt }) => localStorage.setItem(key, corrupt), {
    key,
    corrupt,
  });
  await ready(page);
  await expect(page.locator('.status-save')).toHaveText('Local save unavailable');
  await page.getByLabel('Rename project').fill('Pending recovery');
  // Outlast the autosave debounce to verify that recovery data is protected.
  await page.waitForTimeout(800);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(corrupt);
  const valid = await exportProject(page);
  await importProject(page, { ...valid, name: 'Recovered workspace' });
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  await page.getByLabel('Rename project').fill('Recovered and saved');
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('branch-studio.workspace.v1')!),
  );
  expect(
    stored.documents.find((document: { id: string }) => document.id === stored.activeDocumentId)
      .project.name,
  ).toBe('Recovered and saved');
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(corrupt);
});

test('mode switching retains incompatible nodes and settings and reports the problem', async ({
  page,
}) => {
  await ready(page);
  await page.getByTestId('add-Wait').click();
  const before = await exportProject(page);
  await page.getByLabel('Project mode').selectOption('workflow');
  const switched = await exportProject(page);
  expect(switched.nodes).toEqual(before.nodes);
  expect(switched.edges).toEqual(before.edges);
  expect(switched.settings).toEqual(before.settings);
  await page.getByRole('button', { name: 'Validate tree', exact: true }).click();
  await expect(page.locator('.problem-row').filter({ hasText: 'MODE_UNSUPPORTED' })).toContainText(
    'Wait',
  );
  await page.getByLabel('Project mode').selectOption('game');
  await expect(page.locator('.problem-row').filter({ hasText: 'MODE_UNSUPPORTED' })).toHaveCount(0);
});

test('Workflow sample generates typed asynchronous C# and simulates without a backend', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Samples', exact: true }).click();
  await page.getByRole('button', { name: 'Order processing', exact: true }).click();
  await expect(page.getByLabel('Project mode')).toHaveValue('workflow');
  await expect(page.getByRole('button', { name: 'Step simulation', exact: true })).toBeEnabled();
  const source = await downloadCode(page);
  expect(source.name).toBe('OrderWorkflow.cs');
  expect(source.code).toContain('IWorkflowNode');
  expect(source.code).toContain('CancellationToken');
  expect(source.code).toContain('HttpRequestNode');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run simulation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Step simulation', exact: true }).click();
  await expect(page.locator('.simulation-result')).toContainText('Success');
  await expect(page.locator('.behavior-node.state-Success').first()).toBeVisible();
  await expect(page.locator('.console-output')).toContainText('Completed');
  await page.getByRole('button', { name: 'Reset simulation', exact: true }).click();
  await expect(page.locator('.simulation-result')).toHaveCount(0);
});

test('dragging handles connects a valid tree and blocks a second parent', async ({ page }) => {
  await ready(page);
  const project: Project = {
    schemaVersion: 1,
    name: 'Connection test',
    mode: 'game',
    settings: { namespace: 'Tests.AI', className: 'ConnectionBehavior' },
    variables: [],
    nodes: [
      {
        id: 'root',
        kind: 'Root',
        name: 'Root',
        position: { x: 240, y: 0 },
        params: {},
        disabled: false,
      },
      {
        id: 'sequence',
        kind: 'Sequence',
        name: 'Main sequence',
        position: { x: 0, y: 170 },
        params: {},
        disabled: false,
      },
      {
        id: 'other',
        kind: 'Sequence',
        name: 'Other sequence',
        position: { x: 480, y: 170 },
        params: {},
        disabled: false,
      },
      {
        id: 'action',
        kind: 'Action',
        name: 'Target action',
        position: { x: 0, y: 400 },
        params: { method: 'PerformAction', arguments: '', mock: 'Success' },
        disabled: false,
      },
    ],
    edges: [{ id: 'root-sequence', source: 'root', target: 'sequence', order: 0 }],
  };
  await importProject(page, project);
  await expect(page.getByTestId('node-action')).toBeVisible();
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  const drag = async (parent: string, child: string) => {
    await page.getByTestId(`node-${parent}`).locator('.react-flow__handle.source').hover();
    const from = await page
      .getByTestId(`node-${parent}`)
      .locator('.react-flow__handle.source')
      .boundingBox();
    const to = await page
      .getByTestId(`node-${child}`)
      .locator('.react-flow__handle.target')
      .boundingBox();
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 20 });
    await page.mouse.up();
  };
  await drag('sequence', 'action');
  let exported = await exportProject(page);
  expect(exported.edges.some((e) => e.source === 'sequence' && e.target === 'action')).toBe(true);
  await drag('other', 'action');
  exported = await exportProject(page);
  expect(exported.edges.filter((e) => e.target === 'action')).toHaveLength(1);
  await importProject(page, {
    ...project,
    edges: [{ id: 'sequence-other', source: 'sequence', target: 'other', order: 0 }],
  });
  await expect(page.locator('.status-save')).toHaveText('All changes saved');
  await drag('other', 'sequence');
  expect((await exportProject(page)).edges).toEqual([
    { id: 'sequence-other', source: 'sequence', target: 'other', order: 0 },
  ]);
});
