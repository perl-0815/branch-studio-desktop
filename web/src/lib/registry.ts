import { nodeDefinitions } from '../generated/contracts.generated';
import type { NodeDefinition, NodeKind } from './types';

// JSON/C# use null for an unlimited child count. Preserve the editor's numeric API
// and copy mutable arrays/defaults so editing cannot mutate the generated catalog.
export const definitions: NodeDefinition[] = nodeDefinitions.map((definition) => ({
  ...definition,
  maxChildren: definition.maxChildren ?? Infinity,
  modes: [...definition.modes],
  defaults: { ...definition.defaults },
}));
export const registry = Object.fromEntries(
  definitions.map((definition) => [definition.kind, definition]),
) as Record<NodeKind, NodeDefinition>;
