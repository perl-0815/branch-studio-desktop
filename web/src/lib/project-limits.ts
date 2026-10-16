import type { Project } from './types';

export const MAX_PROJECT_BYTES = 5 * 1024 * 1024;
export const MAX_PROJECT_NODES = 2000;
export const MAX_PROJECT_EDGES = 4000;
export const MAX_PROJECT_DEPTH = 512;
export const MAX_PROJECT_VARIABLES = 500;

export function assertProjectTextSize(text: string): void {
  if (
    text.length > MAX_PROJECT_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES
  )
    throw new Error('Project files must be 5 MiB or smaller.');
}

export interface ProjectLimitIssue {
  code: string;
  message: string;
  nodeId?: string;
}

/** Iterative bounds check, before any recursive AST/validation/layout work. */
export function projectLimitIssue(project: Project): ProjectLimitIssue | null {
  if (project.nodes.length > MAX_PROJECT_NODES)
    return { code: 'PROJECT_NODES', message: `Projects support up to ${MAX_PROJECT_NODES} nodes.` };
  if (project.edges.length > MAX_PROJECT_EDGES)
    return {
      code: 'PROJECT_EDGES',
      message: `Projects support up to ${MAX_PROJECT_EDGES} connections.`,
    };
  if (project.variables.length > MAX_PROJECT_VARIABLES)
    return {
      code: 'PROJECT_VARIABLES',
      message: `Projects support up to ${MAX_PROJECT_VARIABLES} variables.`,
    };
  const ids = new Set(project.nodes.map((n) => n.id));
  const outgoing = new Map<string, string[]>();
  for (const edge of project.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    const children = outgoing.get(edge.source) ?? [];
    children.push(edge.target);
    outgoing.set(edge.source, children);
  }
  const colors = new Map<string, 1 | 2>();
  const depths = new Map<string, number>();
  for (const node of project.nodes) {
    if (colors.has(node.id)) continue;
    const stack = [{ id: node.id, index: 0, depth: 1 }];
    colors.set(node.id, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (stack.length > MAX_PROJECT_DEPTH || frame.depth > MAX_PROJECT_DEPTH)
        return {
          code: 'PROJECT_DEPTH',
          message: `Trees support up to ${MAX_PROJECT_DEPTH} levels.`,
          nodeId: frame.id,
        };
      const children = outgoing.get(frame.id) ?? [];
      if (frame.index < children.length) {
        const child = children[frame.index++];
        if (!colors.has(child)) {
          colors.set(child, 1);
          stack.push({ id: child, index: 0, depth: 1 });
        } else if (colors.get(child) === 2)
          frame.depth = Math.max(frame.depth, 1 + depths.get(child)!);
        // Cycles are reported by semantic validation; never recurse into one here.
      } else {
        depths.set(frame.id, frame.depth);
        colors.set(frame.id, 2);
        stack.pop();
        if (stack.length)
          stack[stack.length - 1].depth = Math.max(stack[stack.length - 1].depth, frame.depth + 1);
      }
    }
  }
  return null;
}

export function assertProjectBounds(project: Project): void {
  const issue = projectLimitIssue(project);
  if (issue) throw new Error(issue.message);
  assertProjectTextSize(JSON.stringify(project));
}
