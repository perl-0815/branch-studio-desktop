import { beforeEach, describe, expect, it } from 'vitest';
import { parseProject } from '../src/lib/graph';
import { createSample } from '../src/lib/samples';
import { MAX_PROJECT_BYTES } from '../src/lib/project-limits';
import { useEditorStore } from '../src/lib/store';
import {
  createEmptyProject,
  MAX_WORKSPACE_BYTES,
  MAX_WORKSPACE_DOCUMENTS,
  parseWorkspace,
  parseWorkspaceText,
  serializeWorkspace,
  snapshotWorkspace,
  type Workspace,
} from '../src/lib/workspace';

const state = () => useEditorStore.getState();
const savedWorkspace = (): Workspace => ({
  schemaVersion: 1,
  activeDocumentId: 'game-document',
  documents: [{ id: 'game-document', project: createSample('game') }],
});

beforeEach(() => state().hydrateWorkspace(savedWorkspace()));

describe('project document sessions', () => {
  it('creates empty trees with exactly one enabled Root in either mode', () => {
    for (const mode of ['game', 'workflow'] as const) {
      const project = createEmptyProject(mode, 'New tree');
      expect(parseProject(project)).toEqual(project);
      expect(project.mode).toBe(mode);
      expect(project.name).toBe('New tree');
      expect(project.nodes).toHaveLength(1);
      expect(project.nodes[0]).toMatchObject({ kind: 'Root', disabled: false });
      expect(project.edges).toEqual([]);
      expect(project.variables).toEqual([]);
    }
  });

  it('keeps parameters, names, selections, and undo/redo independent across tabs', () => {
    const gameId = state().activeDocumentId;
    state().updateNode('attack', { params: { method: 'AttackTarget' } });
    state().updateProject({ name: 'Guard AI' });
    state().select(['attack']);
    const gameProject = state().project;
    const workflowId = state().createDocument(createSample('workflow'));
    expect(state().past).toEqual([]);
    expect(state().future).toEqual([]);
    expect(state().selectedIds).toEqual([]);
    state().updateNode('create-order', { params: { method: 'SubmitOrder' } });
    state().select(['create-order']);
    state().undo();
    expect(state().future).toHaveLength(1);

    state().switchDocument(gameId);
    expect(state().project).toEqual(gameProject);
    expect(state().selectedIds).toEqual(['attack']);
    expect(state().past).toHaveLength(2);
    expect(state().future).toEqual([]);
    state().undo();
    expect(state().project.name).toBe('Sentinel AI');
    expect(state().project.nodes.find((node) => node.id === 'attack')?.params.method).toBe(
      'AttackTarget',
    );

    state().switchDocument(workflowId);
    expect(state().selectedIds).toEqual(['create-order']);
    expect(state().past).toEqual([]);
    expect(state().future).toHaveLength(1);
    state().redo();
    expect(state().project.nodes.find((node) => node.id === 'create-order')?.params.method).toBe(
      'SubmitOrder',
    );
    state().switchDocument(gameId);
    expect(state().project.name).toBe('Sentinel AI');
    state().redo();
    expect(state().project.name).toBe('Guard AI');
  });

  it('preserves each viewport and ignores invalid viewports', () => {
    const gameId = state().activeDocumentId;
    const gameViewport = { x: 130, y: -240, zoom: 0.7 };
    state().setViewport(gameViewport);
    const workflowId = state().createDocument(createEmptyProject('workflow'));
    expect(state().viewport).toBeUndefined();
    const workflowViewport = { x: -40, y: 50, zoom: 1.2 };
    state().setViewport(workflowViewport);
    state().setViewport({ x: Infinity, y: 0, zoom: 1 });
    state().setViewport({ x: 0, y: 0, zoom: 0.01 });
    expect(state().viewport).toEqual(workflowViewport);
    state().switchDocument(gameId);
    expect(state().viewport).toEqual(gameViewport);
    state().switchDocument(workflowId);
    expect(state().viewport).toEqual(workflowViewport);
  });

  it('finishes a pending drag in the original tab without leaking it into another history', () => {
    const gameId = state().activeDocumentId;
    const beforeMove = state().project;
    state().beginMove();
    state().moveNodes({ attack: { x: 500, y: 600 } });
    const workflowId = state().createDocument(createEmptyProject('workflow'));
    state().endMove();
    expect(state().past).toEqual([]);
    state().switchDocument(gameId);
    expect(state().past).toHaveLength(1);
    state().undo();
    expect(state().project).toEqual(beforeMove);
    state().switchDocument(workflowId);
    expect(state().past).toEqual([]);
  });

  it('keeps copy and paste available between projects with new node IDs', () => {
    state().select(['attack']);
    state().copy();
    state().createDocument(createEmptyProject('game'));
    state().paste();
    const copied = state().project.nodes.find((node) => node.kind === 'Action');
    expect(copied?.params.method).toBe('Attack');
    expect(copied?.id).not.toBe('attack');
    expect(state().project.nodes).toHaveLength(2);
    expect(state().past).toHaveLength(1);
  });

  it('does not mutate the workspace on malformed create or hydration', () => {
    const before = state();
    const brokenProject = { ...before.project, nodes: [] };
    expect(() => state().createDocument(brokenProject)).toThrow();
    const malformed = savedWorkspace();
    malformed.documents.push({ id: 'broken-document', project: brokenProject });
    expect(() => state().hydrateWorkspace(malformed)).toThrow();
    expect(state()).toBe(before);
    state().switchDocument('missing');
    expect(state()).toBe(before);
  });

  it('clears transient histories on restore while recovering every project and the active tab', () => {
    const gameId = state().activeDocumentId;
    state().updateProject({ name: 'Updated game' });
    const workflowId = state().createDocument(createSample('workflow'));
    state().updateProject({ name: 'Updated workflow' });
    state().setViewport({ x: 5, y: 9, zoom: 0.8 });
    state().select(['inventory']);
    const content = serializeWorkspace(state());
    const parsed = parseWorkspaceText(content);
    expect(content).not.toContain('selectedIds');
    expect(content).not.toContain('"past"');
    state().hydrateWorkspace(parsed);
    expect(state().activeDocumentId).toBe(workflowId);
    expect(state().project.name).toBe('Updated workflow');
    expect(state().viewport).toEqual({ x: 5, y: 9, zoom: 0.8 });
    expect(state().selectedIds).toEqual([]);
    expect(state().past).toEqual([]);
    state().switchDocument(gameId);
    expect(state().project.name).toBe('Updated game');
    expect(state().past).toEqual([]);
  });

  it('bounds the number of open documents without replacing the active tab', () => {
    while (state().documents.length < MAX_WORKSPACE_DOCUMENTS)
      state().createDocument(createEmptyProject('game'));
    const before = state();
    expect(() => state().createDocument(createEmptyProject('game'))).toThrow(/40/);
    expect(state()).toBe(before);
  });

  it('can close documents internally while retaining at least one project', () => {
    const originalId = state().activeDocumentId;
    expect(state().closeDocument(originalId)).toBe(false);
    const secondId = state().createDocument(createEmptyProject('game'));
    state().updateProject({ name: 'Second tree' });
    expect(state().closeDocument('missing')).toBe(false);
    expect(state().closeDocument(originalId)).toBe(true);
    expect(state().activeDocumentId).toBe(secondId);
    expect(state().project.name).toBe('Second tree');
    const thirdId = state().createDocument(createEmptyProject('workflow'));
    expect(state().closeDocument(thirdId)).toBe(true);
    expect(state().activeDocumentId).toBe(secondId);
    expect(state().project.name).toBe('Second tree');
    expect(state().closeDocument(secondId)).toBe(false);
  });
});

describe('workspace persistence boundary', () => {
  it('can migrate a valid legacy project near the existing 5 MiB project limit', () => {
    const project = createEmptyProject('game');
    project.name = 'x'.repeat(MAX_PROJECT_BYTES - 2048);
    const workspace = {
      schemaVersion: 1,
      activeDocumentId: 'legacy-project',
      documents: [{ id: 'legacy-project', project }],
    };
    const parsed = parseWorkspaceText(JSON.stringify(workspace));
    expect(parsed.documents[0].project.name).toHaveLength(project.name.length);
    expect(parsed.activeDocumentId).toBe('legacy-project');
  });

  it('overlays current project and viewport on the stale cached document', () => {
    const cachedProject = state().documents[0].project;
    state().updateProject({ name: 'Latest edits' });
    state().setViewport({ x: 10, y: -20, zoom: 0.5 });
    expect(cachedProject.name).toBe('Sentinel AI');
    const snapshot = snapshotWorkspace(state());
    expect(snapshot.documents[0].project.name).toBe('Latest edits');
    expect(snapshot.documents[0].viewport).toEqual({ x: 10, y: -20, zoom: 0.5 });
    expect(snapshot.documents[0]).not.toHaveProperty('past');
    expect(parseWorkspaceText(serializeWorkspace(state()))).toEqual(snapshot);
  });

  it('rejects ambiguous documents, missing active tabs, invalid viewports and schema versions', () => {
    const valid = savedWorkspace();
    for (const malformed of [
      { ...valid, schemaVersion: 2 },
      { ...valid, documents: [] },
      { ...valid, documents: [...valid.documents, ...valid.documents] },
      { ...valid, activeDocumentId: 'missing' },
      { ...valid, documents: [{ ...valid.documents[0], id: ' ' }] },
      { ...valid, documents: [{ ...valid.documents[0], viewport: { x: 0, y: 0, zoom: 2.5 } }] },
      { ...valid, documents: [{ ...valid.documents[0], viewport: { x: NaN, y: 0, zoom: 1 } }] },
    ])
      expect(() => parseWorkspace(malformed)).toThrow();
  });

  it('bounds the aggregate workspace before accepting storage data', () => {
    const workspace = savedWorkspace();
    workspace.documents[0].project.name = 'x'.repeat(MAX_WORKSPACE_BYTES / 2);
    expect(() => parseWorkspace(workspace)).toThrow(/20 MiB/);
    expect(() => parseWorkspaceText(' '.repeat(MAX_WORKSPACE_BYTES / 2 + 1))).toThrow(/20 MiB/);
  });
});
