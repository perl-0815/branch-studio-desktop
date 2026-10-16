import { z } from 'zod';
import { schemaVersion } from '../generated/contracts.generated';
import { parseProject } from './graph';
import type { Mode, Project } from './types';

export const WORKSPACE_SCHEMA_VERSION = 1;
export const MAX_WORKSPACE_DOCUMENTS = 40;
export const MAX_WORKSPACE_BYTES = 20 * 1024 * 1024;

export interface WorkspaceViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface WorkspaceDocument {
  id: string;
  project: Project;
  viewport?: WorkspaceViewport;
}

/** Only durable data is written to disk; undo history is local to the open session. */
export interface Workspace {
  schemaVersion: typeof WORKSPACE_SCHEMA_VERSION;
  activeDocumentId: string;
  documents: WorkspaceDocument[];
}

export interface EditorDocument extends WorkspaceDocument {
  selectedIds: string[];
  past: Project[];
  future: Project[];
}

export const workspaceViewportSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().finite().min(0.15).max(2),
});

const documentIdSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value.trim().length > 0);
const workspaceSchema = z.object({
  schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
  activeDocumentId: documentIdSchema,
  documents: z
    .array(
      z.object({
        id: documentIdSchema,
        project: z.unknown(),
        viewport: workspaceViewportSchema.optional(),
      }),
    )
    .min(1)
    .max(MAX_WORKSPACE_DOCUMENTS),
});

function assertWorkspaceTextSize(content: string): void {
  // LocalStorage commonly accounts for UTF-16 code units. Bound both that representation
  // and UTF-8 exports. Browser quota errors are reported independently by persistence.
  if (
    content.length * 2 > MAX_WORKSPACE_BYTES ||
    new TextEncoder().encode(content).byteLength > MAX_WORKSPACE_BYTES
  )
    throw new Error(
      'The open workspace must be 20 MiB or smaller. Export your projects to keep a copy.',
    );
}

/** Validate the complete workspace before it can replace any open document. */
export function parseWorkspace(input: unknown): Workspace {
  const envelope = workspaceSchema.parse(input);
  assertWorkspaceTextSize(JSON.stringify(envelope));
  const ids = new Set(envelope.documents.map((document) => document.id));
  if (ids.size !== envelope.documents.length)
    throw new Error('Duplicate document IDs in workspace.');
  if (!ids.has(envelope.activeDocumentId))
    throw new Error('The active document is missing from workspace.');
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    activeDocumentId: envelope.activeDocumentId,
    documents: envelope.documents.map((document) => ({
      id: document.id,
      project: parseProject(document.project),
      ...(document.viewport ? { viewport: document.viewport } : {}),
    })),
  };
}

export function parseWorkspaceText(content: string): Workspace {
  assertWorkspaceTextSize(content);
  return parseWorkspace(JSON.parse(content));
}

export interface WorkspaceSnapshotSource {
  project: Project;
  activeDocumentId: string;
  documents: WorkspaceDocument[];
  viewport?: WorkspaceViewport;
}

/** The active editor state is authoritative; its cached session may predate the last edit. */
export function snapshotWorkspace(state: WorkspaceSnapshotSource): Workspace {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    activeDocumentId: state.activeDocumentId,
    documents: state.documents.map((document) => {
      const active = document.id === state.activeDocumentId;
      const viewport = active ? state.viewport : document.viewport;
      return {
        id: document.id,
        project: active ? state.project : document.project,
        ...(viewport ? { viewport } : {}),
      };
    }),
  };
}

export function serializeWorkspace(state: WorkspaceSnapshotSource): string {
  const content = JSON.stringify(snapshotWorkspace(state));
  assertWorkspaceTextSize(content);
  return content;
}

export function createEmptyProject(mode: Mode, name = 'Untitled'): Project {
  return {
    schemaVersion,
    name,
    mode,
    nodes: [
      {
        id: 'root',
        kind: 'Root',
        name: 'Root',
        position: { x: 0, y: 0 },
        params: {},
        disabled: false,
      },
    ],
    edges: [],
    variables: [],
    settings: {
      namespace: mode === 'game' ? 'Game.AI' : 'Business.Workflows',
      className: mode === 'game' ? 'NewBehavior' : 'NewWorkflow',
    },
  };
}
