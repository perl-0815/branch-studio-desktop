import { beforeEach, describe, expect, it } from 'vitest';
import { autoLayout, canConnect, parseProject, toAst } from '../src/lib/graph';
import { createSample } from '../src/lib/samples';
import { useEditorStore } from '../src/lib/store';
import { validateProject } from '../src/lib/validation';
import type { Project } from '../src/lib/types';

const state = () => useEditorStore.getState();
const valid = () => createSample('game');
beforeEach(() => {
  useEditorStore.setState({ project: valid(), selectedIds: [], past: [], future: [] });
});
describe('graph model and AST', () => {
  it('ships valid samples in both modes', () => {
    for (const mode of ['game', 'workflow'] as const)
      expect(validateProject(createSample(mode))).toEqual([]);
  });
  it('rejects cycles, self connections, multiple parents, root parents, and leaf children', () => {
    const project = valid();
    expect(canConnect(project, 'priority', 'root')).toBe(false);
    expect(canConnect(project, 'attack-sequence', 'attack-sequence')).toBe(false);
    expect(canConnect(project, 'chase-sequence', 'attack')).toBe(false);
    expect(canConnect(project, 'attack', 'patrol')).toBe(false);
    // A disconnected composite may reconnect, but never to its descendant.
    project.edges = project.edges.filter((e) => e.target !== 'priority');
    expect(canConnect(project, 'attack-sequence', 'priority')).toBe(false);
  });
  it('creates an AST in explicit execution order independently of coordinates', () => {
    const project = valid();
    const original = toAst(project);
    project.nodes = project.nodes.map((n, i) => ({ ...n, position: { x: -i * 100, y: i * 70 } }));
    expect(toAst(project)).toEqual(original);
    expect(original.root.children.map((n) => n.id)).toEqual([
      'attack-sequence',
      'chase-sequence',
      'patrol',
    ]);
    expect(original.root.kind).toBe('Selector');
  });
  it('round trips every project property through JSON and schema validation', () => {
    const project = valid();
    expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
    expect(() => parseProject({ ...project, schemaVersion: 2 })).toThrow();
    expect(() => parseProject({ ...project, nodes: [...project.nodes, project.nodes[0]] })).toThrow(
      /Duplicate/,
    );
  });
  it('rejects malformed imports without modifying existing editor state', () => {
    const before = state().project;
    const broken = {
      ...before,
      edges: [{ id: 'broken', source: 'missing', target: 'root', order: 0 }],
    } as Project;
    expect(() => state().loadProject(broken)).toThrow(/missing/);
    expect(state().project).toBe(before);
    expect(state().past).toHaveLength(0);
  });
  it('rejects unrepairable Root imports transactionally', () => {
    const before = state().project;
    const root = before.nodes.find((node) => node.kind === 'Root')!;
    const invalid = [
      {
        ...before,
        nodes: before.nodes.filter((node) => node.kind !== 'Root'),
        edges: before.edges.filter((edge) => edge.source !== root.id),
      },
      { ...before, nodes: [...before.nodes, { ...root, id: 'second-root' }] },
      {
        ...before,
        nodes: before.nodes.map((node) =>
          node.kind === 'Root' ? { ...node, disabled: true } : node,
        ),
      },
    ];
    for (const project of invalid) {
      expect(() => state().loadProject(project)).toThrow(/exactly one enabled Root/);
      expect(state().project).toBe(before);
      expect(state().past).toHaveLength(0);
    }
  });
  it('blocks invalid code generation and reports disconnected node and semantic errors', () => {
    const project = valid();
    project.nodes.find((n) => n.id === 'attack')!.params.method = 'class';
    project.edges = project.edges.filter((e) => e.target !== 'patrol');
    const codes = validateProject(project).map((i) => i.code);
    expect(codes).toContain('METHOD_NAME');
    expect(codes).toContain('UNREACHABLE');
    expect(() => toAst(project)).toThrow();
  });
  it('validates variables, arguments, durations and shared handler signatures', () => {
    const project = valid();
    project.variables[0].value = 'not-a-boolean';
    project.nodes.find((n) => n.id === 'attack')!.params = {
      method: 'IsEnemyVisible',
      arguments: '[{}]',
    };
    const codes = validateProject(project).map((i) => i.code);
    expect(codes).toContain('VARIABLE_VALUE');
    expect(codes).toContain('ARGUMENTS');
    expect(codes).toContain('HANDLER_CONFLICT');
  });
  it('rejects names that would collide with generated C# members', () => {
    const project = valid();
    project.settings.className = 'Create';
    expect(validateProject(project).some((i) => i.code === 'CLASS_NAME')).toBe(true);
    project.settings.className = 'SentinelBehavior';
    project.nodes.find((n) => n.id === 'attack')!.params.method = 'ISentinelBehaviorHandlers';
    expect(validateProject(project).some((i) => i.code === 'METHOD_NAME')).toBe(true);
    project.settings = { namespace: 'BranchStudio', className: 'Workflow' };
    expect(validateProject(project).some((i) => i.code === 'CLASS_NAME')).toBe(true);
    project.settings = { namespace: 'BranchStudio', className: 'Contracts' };
    expect(validateProject(project).some((i) => i.code === 'CLASS_NAME')).toBe(true);
    project.settings = { namespace: 'BranchStudio.Contracts', className: 'NodeStatus' };
    expect(validateProject(project).some((i) => i.code === 'CLASS_NAME')).toBe(true);
    project.settings = {
      namespace: 'BranchStudio.Contracts.WorkflowResult.Nested',
      className: 'Factory',
    };
    expect(validateProject(project).some((i) => i.code === 'NAMESPACE')).toBe(true);
    project.settings = { namespace: 'System.Collections', className: 'Generic' };
    expect(validateProject(project).some((i) => i.code === 'NAMESPACE')).toBe(true);
  });
  it('lays out forests deterministically without mutating the project or execution order', () => {
    const project = valid();
    const before = JSON.stringify(project);
    const first = autoLayout(project);
    expect(autoLayout(first)).toEqual(first);
    expect(JSON.stringify(project)).toBe(before);
    expect(toAst(first)).toEqual(toAst(project));
  });
});
describe('transactional editor operations', () => {
  it('deletes a mixed node and unrelated edge selection as one undoable operation', () => {
    const before = state().project;
    const unrelated = before.edges.find((e) => e.source === 'priority' && e.target === 'patrol')!;
    state().select(['attack']);
    state().removeSelected([unrelated.id]);
    expect(state().project.nodes.some((n) => n.id === 'attack')).toBe(false);
    expect(state().project.edges.some((e) => e.id === unrelated.id)).toBe(false);
    expect(state().past).toHaveLength(1);
    state().undo();
    expect(state().project).toEqual(before);
  });
  it('disconnects multiple selected nodes atomically', () => {
    const before = state().project;
    state().disconnectNode(['attack-sequence', 'chase-sequence']);
    expect(
      state().project.edges.some(
        (e) =>
          ['attack-sequence', 'chase-sequence'].includes(e.source) ||
          ['attack-sequence', 'chase-sequence'].includes(e.target),
      ),
    ).toBe(false);
    expect(state().past).toHaveLength(1);
    state().undo();
    expect(state().project).toEqual(before);
  });
  it('adds and connects a node and preserves structural undo/redo', () => {
    const id = state().addNode('Action', { x: 10, y: 20 }, 'priority')!;
    expect(state().project.nodes.find((n) => n.id === id)).toBeDefined();
    expect(state().project.edges.find((e) => e.target === id)?.source).toBe('priority');
    expect(state().past).toHaveLength(1);
    state().undo();
    expect(state().project.nodes.some((n) => n.id === id)).toBe(false);
    state().redo();
    expect(state().project.nodes.some((n) => n.id === id)).toBe(true);
    expect(state().connect('chase-sequence', id)).toBe(false);
  });
  it('stores one history entry per drag and restores the exact positions', () => {
    const before = state().project;
    state().beginMove();
    state().moveNodes({ attack: { x: 200, y: 200 } });
    state().moveNodes({ attack: { x: 300, y: 400 } });
    expect(state().past).toHaveLength(0);
    state().endMove();
    expect(state().past).toHaveLength(1);
    state().undo();
    expect(state().project).toEqual(before);
    state().redo();
    expect(state().project.nodes.find((n) => n.id === 'attack')?.position).toEqual({
      x: 300,
      y: 400,
    });
  });
  it('records keyboard-style position changes without drag lifecycle events', () => {
    const before = state().project;
    state().moveNodes({ attack: { x: 300, y: 400 } }, false);
    expect(state().past).toHaveLength(1);
    state().undo();
    expect(state().project).toEqual(before);
  });
  it('reorders children explicitly and retains that order after save and restore', () => {
    state().reorderChildren('priority', ['patrol', 'chase-sequence', 'attack-sequence']);
    const restored = parseProject(JSON.parse(JSON.stringify(state().project)));
    expect(toAst(restored).root.children.map((n) => n.id)).toEqual([
      'patrol',
      'chase-sequence',
      'attack-sequence',
    ]);
    state().undo();
    expect(toAst(state().project).root.children[0].id).toBe('attack-sequence');
  });
  it('appends after imported sparse child order values', () => {
    const project = valid();
    project.edges = project.edges.map((e) =>
      e.source === 'priority' ? { ...e, order: 10 + e.order * 10 } : e,
    );
    state().loadProject(project);
    const added = state().addNode('Action', { x: 0, y: 0 }, 'priority');
    expect(toAst(state().project).root.children.at(-1)?.id).toBe(added);
  });
  it('copies subgraphs with fresh IDs and preserved internal child order', () => {
    state().select(['attack-sequence', 'visible-attack', 'in-range', 'attack']);
    const before = state().project;
    state().copy();
    state().paste({ x: 100, y: 100 });
    const pasted = state().project.nodes.filter(
      (n) => !before.nodes.some((old) => old.id === n.id),
    );
    expect(pasted).toHaveLength(4);
    expect(new Set(state().project.nodes.map((n) => n.id)).size).toBe(state().project.nodes.length);
    const parent = pasted.find((n) => n.kind === 'Sequence')!;
    const order = state()
      .project.edges.filter((e) => e.source === parent.id)
      .sort((a, b) => a.order - b.order)
      .map((e) => pasted.find((n) => n.id === e.target)?.params.method);
    expect(order).toEqual(['IsEnemyVisible', 'IsWithinAttackRange', 'Attack']);
  });
  it('protects Root and removes only selected nodes and related connections', () => {
    const before = state().project.nodes.length;
    state().select(['root']);
    state().duplicate();
    state().removeSelected();
    expect(state().project.nodes).toHaveLength(before);
    state().updateNode('root', { disabled: true });
    expect(state().project.nodes.find((n) => n.id === 'root')?.disabled).toBe(false);
    const imported = valid();
    imported.nodes[0].disabled = true;
    expect(validateProject(imported).some((i) => i.code === 'ROOT_DISABLED')).toBe(true);
    state().removeNodes(['attack']);
    expect(state().project.nodes.some((n) => n.id === 'attack')).toBe(false);
    expect(state().project.edges.some((e) => e.source === 'attack' || e.target === 'attack')).toBe(
      false,
    );
    state().undo();
    expect(state().project.nodes).toHaveLength(before);
  });
  it('preserves nodes, parameters, and connections across a mode switch', () => {
    const before = state().project;
    state().setMode('workflow');
    expect(state().project.nodes).toEqual(before.nodes);
    expect(state().project.edges).toEqual(before.edges);
    const wait = state().addNode('Delay', { x: 0, y: 0 });
    expect(wait).toBeDefined();
    state().setMode('game');
    expect(
      validateProject(state().project).some(
        (i) => i.code === 'MODE_UNSUPPORTED' && i.nodeId === wait,
      ),
    ).toBe(true);
    expect(state().project.nodes.some((n) => n.id === wait)).toBe(true);
  });
});
