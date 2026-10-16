import { describe, expect, it } from 'vitest';
import { translateDiagnostic } from '../src/lib/diagnostic-translations';
import { createEmptyProject } from '../src/lib/workspace';
import { definitions } from '../src/lib/registry';
import { validateProject } from '../src/lib/validation';

describe('Japanese diagnostic presentation', () => {
  it('translates validation from a malformed project without changing its data', () => {
    const project = createEmptyProject('game', '');
    project.settings = { className: 'class', namespace: 'System.' };
    project.variables = [
      { id: 'v', name: 'not valid', type: 'bool', value: 'perhaps' },
      { id: 'v', name: 'not valid', type: 'bool', value: 'perhaps' },
    ];
    project.nodes.push(
      {
        id: 'action',
        kind: 'Action',
        name: '',
        position: { x: 0, y: 0 },
        params: { method: 'class', arguments: '{}' },
        disabled: false,
      },
      {
        id: 'check',
        kind: 'BlackboardCheck',
        name: 'Keep this English user name',
        position: { x: 0, y: 0 },
        params: { variable: 'Health', value: 1 },
        disabled: false,
      },
    );
    const before = structuredClone(project);
    const issues = validateProject(project);
    expect(issues.length).toBeGreaterThan(10);
    for (const issue of issues) expect(translateDiagnostic(issue.message)).toBeDefined();
    expect(project).toEqual(before);
    expect(issues.every((issue) => /^[A-Z_]+$/.test(issue.code))).toBe(true);
  });

  it('covers child-count and mode diagnostics from every current node definition', () => {
    for (const definition of definitions) {
      const project = createEmptyProject(definition.modes.includes('game') ? 'game' : 'workflow');
      if (definition.kind !== 'Root')
        project.nodes.push({
          id: 'test',
          kind: definition.kind,
          name: 'Test',
          position: { x: 0, y: 0 },
          params: { ...definition.defaults },
          disabled: false,
        });
      project.mode = definition.modes.includes('workflow') ? 'game' : 'workflow';
      for (const issue of validateProject(project))
        expect(translateDiagnostic(issue.message), issue.message).toBeDefined();
    }
  });

  it.each([
    ['Variable “Class / 日本語” must be a valid C# identifier.', 'Class / 日本語'],
    ['Variable “a”b\nRoot” is defined more than once.', 'a”b\nRoot'],
    ['Default value for “HP” is not a valid float.', 'HP'],
    ['Variable “targetPos” is not defined.', 'targetPos'],
    ['Handler “CheckStock” is used for incompatible return types.', 'CheckStock'],
    ['Handler CheckStock has conflicting return types.', 'CheckStock'],
    ['Undefined variable Order.Id.', 'Order.Id'],
    ['Invalid Vector3 value for targetPosition.', 'targetPosition'],
  ])('preserves names in %s', (input, name) => {
    const result = translateDiagnostic(input);
    expect(result).toContain(name);
    expect(result).not.toBe(input);
  });

  it.each([
    ['Seconds must be between 0.001 and 86400.', ['0.001', '86400']],
    ['Repeat count must be an integer between 1 and 10000.', ['1', '10000', '整数']],
    ['Projects support up to 2000 nodes.', ['2000', 'ノード']],
    ['Projects support up to 4000 connections.', ['4000', '接続']],
    ['Projects support up to 500 variables.', ['500', '変数']],
    ['Trees support up to 512 levels.', ['512', '階層']],
    ['A workspace supports up to 40 open projects.', ['40', 'プロジェクト']],
  ])('preserves bounds in %s', (input, values) => {
    const result = translateDiagnostic(input);
    for (const value of values) expect(result).toContain(value);
  });

  it.each([
    'Project files must be 5 MiB or smaller.',
    'Duplicate node IDs in project.',
    'Project must contain exactly one enabled Root.',
    'Duplicate connection IDs in project.',
    'Duplicate variable IDs in project.',
    'A connection references a missing node.',
    'The open workspace must be 20 MiB or smaller. Export your projects to keep a copy.',
    'Duplicate document IDs in workspace.',
    'The active document is missing from workspace.',
    'Saved workspace could not be restored. Your saved data has been preserved.',
    'Local storage is unavailable. Export JSON to save your project.',
    'Desktop file bridge is unavailable.',
    'Desktop file bridge could not be loaded.',
    'The desktop file operation timed out.',
    'The project could not be opened. Choose a readable UTF-8 JSON file.',
    'The file could not be saved. Choose another location and try again.',
    'Choose a project saved as UTF-8 JSON.',
    'The selected file is not a valid JSON project object.',
    'The file operation was cancelled.',
  ])('covers file/storage diagnostics: %s', (message) => {
    expect(translateDiagnostic(message)).toMatch(/[ぁ-んァ-ヶ一-龯]/);
  });

  it('translates operation wrappers while preserving unknown host or parser details', () => {
    expect(translateDiagnostic('Open failed: Project files must be 5 MiB or smaller.')).toBe(
      '開く操作に失敗しました: プロジェクトファイルは 5 MiB 以下にしてください。',
    );
    expect(translateDiagnostic('Save failed: Permission denied: /Volumes/My drive/tree.json')).toBe(
      '保存に失敗しました: Permission denied: /Volumes/My drive/tree.json',
    );
    expect(translateDiagnostic('Import failed: unexpected token at position 3')).toBe(
      '読み込みに失敗しました: unexpected token at position 3',
    );
  });

  it('translates known editor notifications and retains generated names and enum modes', () => {
    expect(translateDiagnostic('Generated OrderFactory.cs · 12 nodes · Workflow')).toBe(
      '生成: OrderFactory.cs · 12 ノード · ワークフロー',
    );
    expect(translateDiagnostic('Added Sequence')).toBe('追加: Sequence');
    expect(translateDiagnostic('Imported 日本語のファイル.json')).toBe(
      '読み込み: 日本語のファイル.json',
    );
    expect(translateDiagnostic('Saved File with English name.json.')).toContain(
      'File with English name.json.',
    );
    expect(translateDiagnostic('1 error needs attention.')).toBe(
      '1 件のエラーを確認してください。',
    );
    expect(translateDiagnostic('2 errors need attention.')).toBe(
      '2 件のエラーを確認してください。',
    );
    expect(translateDiagnostic('3 errors found.')).toBe('3 件のエラーがあります。');
    expect(translateDiagnostic('Validation: 3 errors, 2 warnings')).toBe(
      '検証: エラー 3 件、警告 2 件',
    );
  });

  it('translates generated simulation diagnostics without touching normal user logs', () => {
    expect(translateDiagnostic('[12] Tick 12: Running')).toBe('[12] ステップ 12: Running');
    expect(translateDiagnostic('[2] Attack: invalid mock result.')).toBe(
      '[2] Attack: モックの戻り値が不正です。',
    );
    expect(translateDiagnostic('[3] Blackboard check: undefined variable Health.')).toBe(
      '[3] Blackboard check: 変数 Health が定義されていません。',
    );
    expect(translateDiagnostic('[1] Invalid bool value for IsReady.')).toBe(
      '[1] IsReady の値は有効な bool ではありません。',
    );
    expect(translateDiagnostic('[1] Order completed.')).toBeUndefined();
    expect(translateDiagnostic('[1] Tree is valid.')).toBeUndefined();
    expect(translateDiagnostic('[1] Keep this user text: Success')).toBeUndefined();
  });

  it('translates joined AST diagnostics only when every complete line is known', () => {
    expect(translateDiagnostic('Root cannot have a parent.\nNode is not connected to Root.')).toBe(
      'Root に親ノードは設定できません。\nノードが Root に接続されていません。',
    );
    expect(translateDiagnostic('Root cannot have a parent.\nMy user text')).toBeUndefined();
  });

  it('leaves unknown messages, incomplete templates and prototype keys to the caller', () => {
    for (const message of [
      '',
      'constructor',
      'toString',
      'Root cannot have a parent. Additional user text',
      'MyNode requires 1 child.',
      'Example is unavailable in Game AI.',
      'Added My custom node',
      'Progress must be an integer between 1 and 4.',
      'Root',
      'Success',
      '{"code":"invalid_type","message":"custom user text"}',
    ])
      expect(translateDiagnostic(message)).toBeUndefined();
  });
});
