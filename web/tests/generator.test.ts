import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateCSharp } from '../src/lib/generator';
import { createSample } from '../src/lib/samples';
import { toAst } from '../src/lib/graph';
import { registry } from '../src/lib/registry';
import type { AstNode, BehaviorTreeAst, Mode, NodeKind } from '../src/lib/types';

const leaf = (id: string, kind: NodeKind = 'Action', params: AstNode['params'] = {}): AstNode => ({
  id,
  kind,
  name: id,
  params: { ...registry[kind].defaults, ...params },
  disabled: false,
  children: [],
});
function allNodesAst(mode: Mode): BehaviorTreeAst {
  const leaves =
    mode === 'game'
      ? ['Condition', 'Action', 'Wait', 'BlackboardCheck', 'SetBlackboard']
      : [
          'Condition',
          'Action',
          'AsyncAction',
          'HttpRequest',
          'Delay',
          'Validate',
          'Transform',
          'Log',
          'SetContext',
          'ContextCheck',
        ];
  const children = leaves.map((kind, i) =>
    leaf(`leaf-${i}`, kind as NodeKind, {
      method: `Handle${kind}`,
      ...(kind.includes('Blackboard') || kind.includes('Context') ? { variable: 'flag' } : {}),
    }),
  );
  const decorators = [
    'Inverter',
    'Repeater',
    'Retry',
    'Timeout',
    ...(mode === 'game' ? ['Cooldown'] : ['ExceptionHandler']),
  ];
  decorators.forEach((kind, i) =>
    children.push({
      ...leaf(`decorator-${i}`, kind as NodeKind),
      children: [leaf(`wrapped-${i}`, 'Action', { method: 'Run' })],
    }),
  );
  const composites = [
    'Selector',
    'Sequence',
    'Parallel',
    ...(mode === 'game' ? ['RandomSelector', 'RandomSequence'] : []),
  ];
  composites.forEach((kind, i) =>
    children.push({
      ...leaf(`composite-${i}`, kind as NodeKind),
      children: [leaf(`child-${i}`, 'Action', { method: 'Run' })],
    }),
  );
  children.push({ ...leaf('disabled', 'Action', { method: 'NotRequired' }), disabled: true });
  return {
    mode,
    root: { ...leaf('top', 'Sequence'), children },
    variables: [
      { id: 'v', name: 'flag', type: 'bool', value: 'true' },
      { id: 'v2', name: 'position', type: 'Vector3', value: '[1,-2,3.5]' },
      { id: 'v3', name: 'health', type: 'float', value: '0xff' },
      { id: 'v4', name: 'count', type: 'int', value: '-2147483648' },
      { id: 'v5', name: 'label', type: 'string', value: 'a"b\n\\c\u0085\u2028\u2029after' },
    ],
    settings: {
      namespace: 'Generated.Tests',
      className: mode === 'game' ? 'AllGameNodes' : 'AllWorkflowNodes',
    },
  };
}

describe('C# generator', () => {
  it.each(['game', 'workflow'] as const)(
    'generates deterministic %s source with typed handler interfaces',
    (mode) => {
      const ast = toAst(createSample(mode));
      const first = generateCSharp(ast);
      expect(generateCSharp(structuredClone(ast))).toEqual(first);
      expect(first.code).toContain(`public interface I${ast.settings.className}Handlers`);
      expect(first.code).toContain(
        mode === 'game' ? 'IBehaviorNode Create' : 'IWorkflowNode Create',
      );
      expect(first.code).not.toContain('TODO');
      expect(first.code).not.toContain('new ActionNode("');
    },
  );

  it('retains explicit child order and maps exact constructor lines', () => {
    const ast = allNodesAst('game');
    ast.root.children = [
      leaf('a', 'Action', { method: 'First' }),
      leaf('b', 'Action', { method: 'Second' }),
    ];
    const { code, ranges } = generateCSharp(ast);
    const lines = code.split('\n');
    expect(code.indexOf('handlers.First')).toBeLessThan(code.indexOf('handlers.Second'));
    expect(lines[ranges.a.startLine - 1]).toContain('handlers.First');
    expect(ranges.a.startLine).toBe(ranges.a.endLine);
    expect(ranges.top.startLine).toBeLessThan(ranges.a.startLine);
    expect(lines[ranges.top.endLine - 1].trim()).toBe(');');
  });

  it('escapes primitive arguments and skips disabled subtrees', () => {
    const ast = allNodesAst('game');
    ast.root.children = [
      leaf('a', 'Action', {
        method: 'First',
        arguments: JSON.stringify(['quotes"\\\n', 42, true, null]),
      }),
      {
        ...leaf('disabled', 'Sequence'),
        disabled: true,
        children: [leaf('skip', 'Action', { method: 'Skip' })],
      },
    ];
    const { code, ranges } = generateCSharp(ast);
    expect(code).toContain('42d, true, null');
    expect(code).toContain('ConstantNode(global::BranchStudio.Contracts.NodeStatus.Success)');
    expect(code).not.toContain('Skip(');
    expect(ranges.skip).toBeUndefined();
  });

  it('rejects handler return-type conflicts and nonprimitive arguments', () => {
    const ast = allNodesAst('game');
    ast.root.children = [
      leaf('a', 'Action', { method: 'Same' }),
      leaf('b', 'Condition', { method: 'Same' }),
    ];
    expect(() => generateCSharp(ast)).toThrow('conflicting');
    ast.root.children = [leaf('a', 'Action', { method: 'Run', arguments: '[{}]' })];
    expect(() => generateCSharp(ast)).toThrow('primitive');
  });

  it('ships self-contained runtime bundles built from canonical contracts and tested sources', () => {
    const contracts = readFileSync('src/generated/contracts.generated.cs', 'utf8').trim();
    for (const target of ['Game', 'Workflow']) {
      const bundle = readFileSync(`public/runtime/BranchStudio.${target}.cs`, 'utf8');
      const runtime = readFileSync(
        `runtime/BranchStudio.Runtime/BranchStudio.${target}.cs`,
        'utf8',
      ).trim();
      expect(bundle).toContain(runtime);
      expect(bundle).toContain(contracts);
    }
  });

  const dotnet = process.env.DOTNET_PATH ?? 'dotnet';
  const available = spawnSync(dotnet, ['--version'], { encoding: 'utf8' }).status === 0;
  it.skipIf(!available)(
    'compiles sample factories and every supported node against actual runtime',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'branch-studio-generated-'));
      try {
        for (const mode of ['game', 'workflow'] as const) {
          const modeDir = join(dir, mode);
          mkdirSync(modeDir);
          const runtime = resolve(
            `public/runtime/BranchStudio.${mode === 'game' ? 'Game' : 'Workflow'}.cs`,
          ).replace(/&/g, '&amp;');
          writeFileSync(
            join(modeDir, 'Generated.csproj'),
            `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>${mode === 'game' ? 'netstandard2.1' : 'net8.0'}</TargetFramework><LangVersion>${mode === 'game' ? '9.0' : '12.0'}</LangVersion><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup><ItemGroup><Compile Include="${runtime}" /></ItemGroup></Project>`,
          );
          writeFileSync(
            join(modeDir, `${mode}-sample.cs`),
            generateCSharp(toAst(createSample(mode))).code,
          );
          writeFileSync(join(modeDir, `${mode}-all.cs`), generateCSharp(allNodesAst(mode)).code);
          const shadow = allNodesAst(mode);
          shadow.settings = { namespace: `Generated.${mode}`, className: 'NodeStatus' };
          writeFileSync(join(modeDir, `${mode}-shadow.cs`), generateCSharp(shadow).code);
          const result = spawnSync(
            dotnet,
            ['build', join(modeDir, 'Generated.csproj'), '--nologo'],
            {
              encoding: 'utf8',
              timeout: 120000,
              env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1' },
            },
          );
          expect(result.status, `${mode}: ${result.stdout}\n${result.stderr}`).toBe(0);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    150000,
  );
});
