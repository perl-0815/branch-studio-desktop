import { z } from 'zod';
import { registry } from './registry';
import { modes, nodeKinds, schemaVersion, variableTypes } from '../generated/contracts.generated';
import type { AstNode, BehaviorTreeAst, GraphEdge, Project } from './types';
import { validateProject } from './validation';
import {
  assertProjectBounds,
  assertProjectTextSize,
  MAX_PROJECT_BYTES,
  MAX_PROJECT_NODES,
  MAX_PROJECT_EDGES,
  MAX_PROJECT_VARIABLES,
  projectLimitIssue,
} from './project-limits';

const finite = z.number().finite();
export const projectSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  name: z.string(),
  mode: z.enum(modes),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(nodeKinds),
        name: z.string(),
        position: z.object({ x: finite, y: finite }),
        params: z.record(z.string(), z.union([z.string(), finite, z.boolean()])),
        disabled: z.boolean(),
      }),
    )
    .max(MAX_PROJECT_NODES),
  edges: z
    .array(
      z.object({
        id: z.string().min(1),
        source: z.string().min(1),
        target: z.string().min(1),
        order: z.number().int().nonnegative(),
      }),
    )
    .max(MAX_PROJECT_EDGES),
  variables: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        type: z.enum(variableTypes),
        value: z.string(),
      }),
    )
    .max(MAX_PROJECT_VARIABLES),
  settings: z.object({ namespace: z.string(), className: z.string() }),
});

/** Parse before replacing editor state: malformed imports can never partially apply. */
export function parseProject(input: unknown): Project {
  const project: Project = projectSchema.parse(input);
  assertProjectBounds(project);
  const ids = new Set(project.nodes.map((n) => n.id));
  if (ids.size !== project.nodes.length) throw new Error('Duplicate node IDs in project.');
  const roots = project.nodes.filter((node) => node.kind === 'Root');
  if (roots.length !== 1 || roots[0].disabled)
    throw new Error('Project must contain exactly one enabled Root.');
  if (new Set(project.edges.map((e) => e.id)).size !== project.edges.length)
    throw new Error('Duplicate connection IDs in project.');
  if (new Set(project.variables.map((v) => v.id)).size !== project.variables.length)
    throw new Error('Duplicate variable IDs in project.');
  if (project.edges.some((e) => !ids.has(e.source) || !ids.has(e.target)))
    throw new Error('A connection references a missing node.');
  return project;
}

/** Shared validation path for browser imports, native picker results and recovery. */
export function parseProjectText(content: string): Project {
  assertProjectTextSize(content);
  return parseProject(JSON.parse(content));
}
export async function readProjectFile(file: {
  size: number;
  text(): Promise<string>;
}): Promise<Project> {
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_PROJECT_BYTES)
    throw new Error('Project files must be 5 MiB or smaller.');
  return parseProjectText(await file.text());
}
export function orderedEdges(project: Project, parentId: string): GraphEdge[] {
  return project.edges
    .filter((e) => e.source === parentId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, 'en'));
}
export function canConnect(project: Project, source: string, target: string): boolean {
  if (source === target) return false;
  const parent = project.nodes.find((n) => n.id === source);
  const child = project.nodes.find((n) => n.id === target);
  if (!parent || !child || child.kind === 'Root') return false;
  if (project.edges.some((e) => e.target === target)) return false;
  if (project.edges.filter((e) => e.source === source).length >= registry[parent.kind].maxChildren)
    return false;
  // Adding source -> target must not make source reachable from target.
  const pending = [target];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === source) return false;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const e of project.edges) if (e.source === id) pending.push(e.target);
  }
  return !projectLimitIssue({
    ...project,
    edges: [...project.edges, { id: 'candidate', source, target, order: 0 }],
  });
}
export function toAst(project: Project): BehaviorTreeAst {
  const errors = validateProject(project).filter((i) => i.severity === 'error');
  if (errors.length) throw new Error(errors.map((i) => i.message).join('\n'));
  const nodes = new Map(project.nodes.map((n) => [n.id, n]));
  const build = (id: string): AstNode => {
    const node = nodes.get(id)!;
    return {
      id: node.id,
      kind: node.kind,
      name: node.name,
      params: { ...node.params },
      disabled: node.disabled,
      children: orderedEdges(project, id).map((e) => build(e.target)),
    };
  };
  const root = project.nodes.find((n) => n.kind === 'Root')!;
  return {
    mode: project.mode,
    root: build(orderedEdges(project, root.id)[0].target),
    variables: project.variables.map((v) => ({ ...v })),
    settings: { ...project.settings },
  };
}

/** Stable, forest-aware tree layout. Execution order always comes from edges. */
export function autoLayout(project: Project): Project {
  const limit = projectLimitIssue(project);
  if (limit) throw new Error(limit.message);
  const nodes = new Map(project.nodes.map((n) => [n.id, n]));
  const positions = new Map<string, { x: number; y: number }>();
  const visiting = new Set<string>();
  let nextColumn = 0;
  const place = (id: string, depth: number): number => {
    if (positions.has(id)) return positions.get(id)!.x;
    if (visiting.has(id)) return nextColumn * 250;
    visiting.add(id);
    const children = orderedEdges(project, id).filter(
      (e) => nodes.has(e.target) && !visiting.has(e.target) && !positions.has(e.target),
    );
    const xs = children.map((e) => place(e.target, depth + 1));
    const x = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : nextColumn++ * 250;
    positions.set(id, { x, y: depth * 160 });
    visiting.delete(id);
    return x;
  };
  const hasParent = new Set(project.edges.map((e) => e.target));
  const roots = [
    ...project.nodes.filter((n) => n.kind === 'Root'),
    ...project.nodes.filter((n) => n.kind !== 'Root' && !hasParent.has(n.id)),
  ];
  for (const root of roots)
    if (!positions.has(root.id)) {
      place(root.id, 0);
      nextColumn++;
    }
  for (const node of project.nodes)
    if (!positions.has(node.id)) {
      place(node.id, 0);
      nextColumn++;
    }
  return {
    ...project,
    nodes: project.nodes.map((n) => ({ ...n, position: positions.get(n.id)! })),
  };
}
