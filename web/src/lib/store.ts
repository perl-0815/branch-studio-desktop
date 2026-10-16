'use client';
import { create } from 'zustand';
import { schemaVersion } from '../generated/contracts.generated';
import { autoLayout as layout, canConnect, orderedEdges, parseProject } from './graph';
import { registry } from './registry';
import { createSample } from './samples';
import type { GraphNode, Mode, NodeKind, Project } from './types';
import { assertProjectBounds } from './project-limits';
import {
  MAX_WORKSPACE_DOCUMENTS,
  parseWorkspace,
  workspaceViewportSchema,
  type EditorDocument,
  type WorkspaceViewport,
} from './workspace';

interface Clipboard {
  nodes: GraphNode[];
  edges: Project['edges'];
}
export interface EditorState {
  project: Project;
  documents: EditorDocument[];
  activeDocumentId: string;
  viewport?: WorkspaceViewport;
  createDocument: (project: Project) => string;
  switchDocument: (id: string) => void;
  closeDocument: (id: string) => boolean;
  hydrateWorkspace: (input: unknown) => void;
  setViewport: (viewport: WorkspaceViewport) => void;
  operationError: string | null;
  clearOperationError: () => void;
  selectedIds: string[];
  past: Project[];
  future: Project[];
  select: (ids: string[]) => void;
  updateProject: (patch: Partial<Project>) => void;
  updateNode: (id: string, patch: Partial<GraphNode>) => void;
  addNode: (
    kind: NodeKind,
    position: { x: number; y: number },
    parentId?: string,
  ) => string | undefined;
  removeSelected: (edgeIds?: string[]) => void;
  removeNodes: (ids: string[], edgeIds?: string[]) => void;
  connect: (source: string, target: string) => boolean;
  disconnectNode: (id: string | string[]) => void;
  removeEdges: (ids: string[]) => void;
  reorderChildren: (parentId: string, childIds: string[]) => void;
  moveNodes: (positions: Record<string, { x: number; y: number }>, commit?: boolean) => void;
  beginMove: () => void;
  endMove: () => void;
  undo: () => void;
  redo: () => void;
  copy: () => void;
  paste: (position?: { x: number; y: number }) => void;
  duplicate: () => void;
  loadProject: (project: Project) => void;
  setMode: (mode: Mode) => void;
  autoLayout: () => void;
}
const id = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
const same = (a: Project, b: Project) => a === b || JSON.stringify(a) === JSON.stringify(b);
const normalizeOrders = (edges: Project['edges']) => {
  const groups = new Map<string, Project['edges']>();
  for (const e of edges) groups.set(e.source, [...(groups.get(e.source) ?? []), e]);
  const orders = new Map<string, number>();
  for (const list of groups.values())
    list
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, 'en'))
      .forEach((e, i) => orders.set(e.id, i));
  return edges.map((e) => ({ ...e, order: orders.get(e.id)! }));
};
let clipboard: Clipboard | undefined;
let moveStart: Project | undefined;

export const useEditorStore = create<EditorState>((set, get) => {
  const initialProject = createSample('game');
  const initialDocumentId = id('document');
  const captureDocuments = (state: EditorState): EditorDocument[] =>
    state.documents.map((document) =>
      document.id === state.activeDocumentId
        ? {
            id: document.id,
            project: state.project,
            viewport: state.viewport,
            selectedIds: state.selectedIds,
            past:
              moveStart && !same(moveStart, state.project)
                ? [...state.past, moveStart].slice(-100)
                : state.past,
            future: moveStart && !same(moveStart, state.project) ? [] : state.future,
          }
        : document,
    );
  const activate = (document: EditorDocument) => ({
    activeDocumentId: document.id,
    project: document.project,
    viewport: document.viewport,
    selectedIds: document.selectedIds.filter((id) =>
      document.project.nodes.some((node) => node.id === id),
    ),
    past: document.past,
    future: document.future,
    operationError: null,
  });
  const apply = (project: Project, selectedIds?: string[]) => {
    const state = get();
    try {
      assertProjectBounds(project);
    } catch (error) {
      set({ operationError: error instanceof Error ? error.message : 'Project limit exceeded.' });
      return false;
    }
    if (same(state.project, project)) return true;
    set({
      project,
      operationError: null,
      past: [...state.past, state.project].slice(-100),
      future: [],
      selectedIds: (selectedIds ?? state.selectedIds).filter((id) =>
        project.nodes.some((n) => n.id === id),
      ),
    });
    return true;
  };
  const getClipboard = (): Clipboard => {
    const { project, selectedIds } = get();
    const nodes = project.nodes.filter((n) => selectedIds.includes(n.id) && n.kind !== 'Root');
    const ids = new Set(nodes.map((n) => n.id));
    return structuredClone({
      nodes,
      edges: project.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    });
  };
  const insert = (data: Clipboard, position?: { x: number; y: number }) => {
    if (!data.nodes.length) return;
    const state = get();
    const remap = new Map(data.nodes.map((n) => [n.id, id('node')]));
    const minX = Math.min(...data.nodes.map((n) => n.position.x));
    const minY = Math.min(...data.nodes.map((n) => n.position.y));
    const dx = position ? position.x - minX : 40;
    const dy = position ? position.y - minY : 40;
    const nodes = data.nodes.map((n) => ({
      ...structuredClone(n),
      id: remap.get(n.id)!,
      position: { x: n.position.x + dx, y: n.position.y + dy },
    }));
    const edges = normalizeOrders(
      data.edges.map((e) => ({
        ...e,
        id: id('edge'),
        source: remap.get(e.source)!,
        target: remap.get(e.target)!,
      })),
    );
    apply(
      {
        ...state.project,
        nodes: [...state.project.nodes, ...nodes],
        edges: [...state.project.edges, ...edges],
      },
      nodes.map((n) => n.id),
    );
  };
  return {
    project: initialProject,
    activeDocumentId: initialDocumentId,
    documents: [
      { id: initialDocumentId, project: initialProject, selectedIds: [], past: [], future: [] },
    ],
    viewport: undefined,
    createDocument: (project) => {
      const parsed = parseProject(project);
      const state = get();
      if (state.documents.length >= MAX_WORKSPACE_DOCUMENTS)
        throw new Error(`A workspace supports up to ${MAX_WORKSPACE_DOCUMENTS} open projects.`);
      const document: EditorDocument = {
        id: id('document'),
        project: parsed,
        selectedIds: [],
        past: [],
        future: [],
      };
      const documents = [...captureDocuments(state), document];
      moveStart = undefined;
      set({ documents, ...activate(document) });
      return document.id;
    },
    switchDocument: (documentId) => {
      const state = get();
      if (documentId === state.activeDocumentId) return;
      const documents = captureDocuments(state);
      const document = documents.find((item) => item.id === documentId);
      if (!document) return;
      moveStart = undefined;
      set({ documents, ...activate(document) });
    },
    closeDocument: (documentId) => {
      const state = get();
      if (
        state.documents.length <= 1 ||
        !state.documents.some((document) => document.id === documentId)
      )
        return false;
      const index = state.documents.findIndex((document) => document.id === documentId);
      const documents = captureDocuments(state).filter((document) => document.id !== documentId);
      moveStart = undefined;
      if (state.activeDocumentId === documentId)
        set({ documents, ...activate(documents[Math.min(index, documents.length - 1)]) });
      else
        set({
          documents,
          ...activate(documents.find((document) => document.id === state.activeDocumentId)!),
        });
      return true;
    },
    hydrateWorkspace: (input) => {
      const workspace = parseWorkspace(input);
      const documents: EditorDocument[] = workspace.documents.map((document) => ({
        ...document,
        selectedIds: [],
        past: [],
        future: [],
      }));
      const document = documents.find((item) => item.id === workspace.activeDocumentId)!;
      moveStart = undefined;
      set({ documents, ...activate(document) });
    },
    setViewport: (viewport) => {
      const parsed = workspaceViewportSchema.safeParse(viewport);
      if (!parsed.success) return;
      const current = get().viewport;
      if (
        current &&
        current.x === viewport.x &&
        current.y === viewport.y &&
        current.zoom === viewport.zoom
      )
        return;
      set({ viewport: parsed.data });
    },
    operationError: null,
    clearOperationError: () => set({ operationError: null }),
    selectedIds: [],
    past: [],
    future: [],
    select: (ids) =>
      set((state) => ({
        selectedIds: [...new Set(ids)].filter((id) => state.project.nodes.some((n) => n.id === id)),
      })),
    updateProject: (patch) => apply({ ...get().project, ...patch, schemaVersion }),
    updateNode: (nodeId, patch) => {
      const state = get();
      apply({
        ...state.project,
        nodes: state.project.nodes.map((n) =>
          n.id !== nodeId
            ? n
            : {
                ...n,
                ...patch,
                id: n.id,
                kind: n.kind === 'Root' || patch.kind === 'Root' ? n.kind : (patch.kind ?? n.kind),
                disabled: n.kind === 'Root' ? false : (patch.disabled ?? n.disabled),
                position: { ...n.position, ...patch.position },
                params: { ...n.params, ...patch.params },
              },
        ),
      });
    },
    addNode: (kind, position, parentId) => {
      const state = get();
      if (
        !registry[kind] ||
        (kind === 'Root' && state.project.nodes.some((n) => n.kind === 'Root'))
      )
        return;
      if (!registry[kind].modes.includes(state.project.mode)) return;
      const nodeId = id('node');
      const node: GraphNode = {
        id: nodeId,
        kind,
        name: registry[kind].label,
        position: { ...position },
        params: { ...registry[kind].defaults },
        disabled: false,
      };
      let project: Project = { ...state.project, nodes: [...state.project.nodes, node] };
      if (parentId) {
        if (!canConnect(project, parentId, nodeId)) return;
        const siblings = orderedEdges(project, parentId);
        project = {
          ...project,
          edges: [
            ...project.edges,
            {
              id: id('edge'),
              source: parentId,
              target: nodeId,
              order: Math.max(-1, ...siblings.map((e) => e.order)) + 1,
            },
          ],
        };
      }
      if (!apply(project, [nodeId])) return;
      return nodeId;
    },
    removeSelected: (edgeIds = []) => get().removeNodes(get().selectedIds, edgeIds),
    removeNodes: (ids, edgeIds = []) => {
      const project = get().project;
      const removed = new Set(
        project.nodes.filter((n) => ids.includes(n.id) && n.kind !== 'Root').map((n) => n.id),
      );
      apply({
        ...project,
        nodes: project.nodes.filter((n) => !removed.has(n.id)),
        edges: normalizeOrders(
          project.edges.filter(
            (e) => !removed.has(e.source) && !removed.has(e.target) && !edgeIds.includes(e.id),
          ),
        ),
      });
    },
    connect: (source, target) => {
      const project = get().project;
      if (!canConnect(project, source, target)) return false;
      const siblings = orderedEdges(project, source);
      return apply({
        ...project,
        edges: [
          ...project.edges,
          {
            id: id('edge'),
            source,
            target,
            order: Math.max(-1, ...siblings.map((e) => e.order)) + 1,
          },
        ],
      });
    },
    disconnectNode: (nodeId) => {
      const ids = Array.isArray(nodeId) ? nodeId : [nodeId];
      const project = get().project;
      apply({
        ...project,
        edges: normalizeOrders(
          project.edges.filter((e) => !ids.includes(e.source) && !ids.includes(e.target)),
        ),
      });
    },
    removeEdges: (ids) => {
      const project = get().project;
      apply({
        ...project,
        edges: normalizeOrders(project.edges.filter((e) => !ids.includes(e.id))),
      });
    },
    reorderChildren: (parentId, childIds) => {
      const project = get().project;
      const children = orderedEdges(project, parentId).map((e) => e.target);
      if (
        children.length !== childIds.length ||
        new Set(childIds).size !== children.length ||
        children.some((id) => !childIds.includes(id))
      )
        return;
      apply({
        ...project,
        edges: project.edges.map((e) =>
          e.source === parentId ? { ...e, order: childIds.indexOf(e.target) } : e,
        ),
      });
    },
    moveNodes: (positions, commit = false) => {
      const project = get().project;
      const next = {
        ...project,
        nodes: project.nodes.map((n) =>
          positions[n.id] &&
          Number.isFinite(positions[n.id].x) &&
          Number.isFinite(positions[n.id].y)
            ? { ...n, position: { ...positions[n.id] } }
            : n,
        ),
      };
      if (same(next, project)) return;
      // React Flow keyboard moves do not emit drag start/stop events.
      if (commit || !moveStart) apply(next);
      else set({ project: next });
    },
    beginMove: () => {
      moveStart = get().project;
    },
    endMove: () => {
      const before = moveStart;
      moveStart = undefined;
      const state = get();
      if (before && !same(before, state.project))
        set({ past: [...state.past, before].slice(-100), future: [] });
    },
    undo: () => {
      const state = get();
      const previous = state.past.at(-1);
      if (!previous) return;
      moveStart = undefined;
      set({
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future],
        selectedIds: state.selectedIds.filter((id) => previous.nodes.some((n) => n.id === id)),
      });
    },
    redo: () => {
      const state = get();
      const next = state.future[0];
      if (!next) return;
      moveStart = undefined;
      set({
        project: next,
        past: [...state.past, state.project].slice(-100),
        future: state.future.slice(1),
        selectedIds: state.selectedIds.filter((id) => next.nodes.some((n) => n.id === id)),
      });
    },
    copy: () => {
      clipboard = getClipboard();
    },
    paste: (position) => {
      if (clipboard) insert(clipboard, position);
    },
    duplicate: () => insert(getClipboard()),
    loadProject: (project) => {
      const parsed = parseProject(project);
      moveStart = undefined;
      apply(parsed, []);
    },
    setMode: (mode) => apply({ ...get().project, mode }),
    autoLayout: () => apply(layout(get().project)),
  };
});
