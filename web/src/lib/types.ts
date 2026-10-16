import type {
  GeneratedNodeDefinition,
  Mode,
  NodeKind,
  ValidationSeverity,
  VariableType,
  schemaVersion,
} from '../generated/contracts.generated';

// Keep the editor's public imports stable while C# owns the shared wire values.
export type {
  Mode,
  ProjectMode,
  NodeKind,
  Status,
  NodeStatus,
  WorkflowResult,
  VariableType,
  NodeCategory,
  ValidationSeverity,
} from '../generated/contracts.generated';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  position: { x: number; y: number };
  params: GeneratedNodeDefinition['defaults'];
  disabled: boolean;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  order: number;
}
export interface Variable {
  id: string;
  name: string;
  type: VariableType;
  value: string;
}
export interface Project {
  schemaVersion: typeof schemaVersion;
  name: string;
  mode: Mode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  variables: Variable[];
  settings: { namespace: string; className: string };
}
export interface AstNode {
  id: string;
  kind: NodeKind;
  name: string;
  params: GraphNode['params'];
  disabled: boolean;
  children: AstNode[];
}
export interface BehaviorTreeAst {
  mode: Mode;
  root: AstNode;
  variables: Variable[];
  settings: Project['settings'];
}
export interface ValidationIssue {
  id: string;
  nodeId?: string;
  severity: ValidationSeverity;
  code: string;
  message: string;
}
export interface CodeResult {
  code: string;
  ranges: Record<string, { startLine: number; endLine: number }>;
}
/** Runtime adapter exposes Infinity for unlimited child counts, as before. */
export interface NodeDefinition extends Omit<GeneratedNodeDefinition, 'maxChildren'> {
  maxChildren: number;
}
