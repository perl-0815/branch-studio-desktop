import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  modes,
  nodeCategories,
  nodeDefinitions,
  nodeKinds,
  schemaVersion,
  statuses,
  validationSeverities,
  variableTypes,
} from '../src/generated/contracts.generated';
import { definitions, registry } from '../src/lib/registry';
import { createSample } from '../src/lib/samples';
import { canConnect, parseProject, toAst } from '../src/lib/graph';
import { generateCSharp } from '../src/lib/generator';

function stable(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b, 'en'))
            .map(([key, value]) => [key, stable(value)]),
        )
      : value;
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

describe('generated C# contracts integration', () => {
  it('covers every shared node kind exactly once with compatible metadata', () => {
    expect(definitions.map((definition) => definition.kind)).toEqual([...nodeKinds]);
    expect(new Set(definitions.map((definition) => definition.kind)).size).toBe(nodeKinds.length);
    for (const definition of definitions) {
      expect(nodeCategories).toContain(definition.category);
      for (const mode of definition.modes) expect(modes).toContain(mode);
      expect(registry[definition.kind]).toBe(definition);
    }
    expect(statuses).toEqual(['Idle', 'Running', 'Success', 'Failure']);
    expect(validationSeverities).toEqual(['error', 'warning']);
  });
  it('adapts unlimited composites without weakening leaf/decorator limits', () => {
    for (const definition of nodeDefinitions)
      expect(registry[definition.kind].maxChildren).toBe(definition.maxChildren ?? Infinity);
    const project = createSample('game');
    const action = structuredClone(project.nodes.find((node) => node.kind === 'Action')!);
    action.id = 'available';
    project.nodes.push(action);
    expect(canConnect(project, 'priority', 'available')).toBe(true);
    expect(canConnect(project, 'root', 'available')).toBe(false);
    expect(canConnect(project, 'attack', 'available')).toBe(false);
  });
  it('keeps the C# catalog parameter order used by the Inspector', () => {
    expect(Object.keys(registry.Action.defaults)).toEqual(['method', 'arguments', 'mock']);
    expect(Object.keys(registry.HttpRequest.defaults)).toEqual([
      'method',
      'httpMethod',
      'url',
      'headers',
      'timeout',
      'credentialEnv',
      'mock',
    ]);
  });
  it('does not let edits to editor-side defaults mutate canonical metadata', () => {
    const original = nodeDefinitions.find((definition) => definition.kind === 'Action')!;
    const adapted = registry.Action;
    const originalMethod = adapted.defaults.method;
    try {
      adapted.defaults.method = 'ChangedForEditor';
      expect(original.defaults.method).toBe(originalMethod);
    } finally {
      adapted.defaults.method = originalMethod;
    }
    expect(adapted.defaults).not.toBe(original.defaults);
    expect(adapted.modes).not.toBe(original.modes);
  });
  it('accepts generated variable types through the existing JSON API and keeps wire strings unchanged', () => {
    for (const mode of modes) {
      const sample = createSample(mode);
      expect(sample.schemaVersion).toBe(schemaVersion);
      expect(parseProject(JSON.parse(JSON.stringify(sample)))).toEqual(sample);
      for (const type of variableTypes) {
        const variable = {
          id: 'shared-type',
          name: 'sharedType',
          type,
          value:
            type === 'bool'
              ? 'true'
              : type === 'Vector3'
                ? '[0,0,0]'
                : type === 'string'
                  ? 'text'
                  : '1',
        };
        expect(parseProject({ ...sample, variables: [variable] }).variables[0].type).toBe(type);
      }
    }
  });
  it('retains the pre-refactor catalog and sample code apart from canonical enum namespaces', () => {
    expect(hash(JSON.stringify(stable(definitions)))).toBe(
      'd640a191b087948318fd30a28e63e2c2f9cbb17a25e4bfd68cea14baa7f5911a',
    );
    const sampleCode = (mode: (typeof modes)[number]) =>
      generateCSharp(toAst(createSample(mode))).code.replaceAll(
        `global::BranchStudio.Contracts.${mode === 'game' ? 'NodeStatus' : 'WorkflowResult'}`,
        `global::BranchStudio.${mode === 'game' ? 'Game.NodeStatus' : 'Workflow.WorkflowResult'}`,
      );
    expect(hash(sampleCode('game'))).toBe(
      '84e75c184a75a1bac77a3712ecf793cdca44ba2cb9c22717c6c472756de3360d',
    );
    expect(hash(sampleCode('workflow'))).toBe(
      'fef248f3f0e94fae8c410d2efa397466fbe068b304c13f5b36950cc8b7ae5f46',
    );
  });
});
