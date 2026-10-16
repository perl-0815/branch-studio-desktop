'use client';
import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { AlertCircle, Circle, Check, X, LoaderCircle } from 'lucide-react';
import type { GraphNode, Status } from '@/lib/types';
import { registry } from '@/lib/registry';
import NodeIcon from './node-icon';
export type FlowNode = Node<
  { node: GraphNode; error: boolean; status?: Status; childCount: number },
  'behavior'
>;
const BehaviorNode = memo(function BehaviorNode({ data, selected }: NodeProps<FlowNode>) {
  const { node, error, status, childCount } = data;
  const def = registry[node.kind];
  const summary = node.params.method
    ? `${node.params.method}()`
    : node.params.seconds !== undefined
      ? `${node.params.seconds}s`
      : node.params.variable
        ? `${node.params.variable} = ${node.params.value}`
        : node.kind === 'Root'
          ? 'Tree entry point'
          : node.params.count
            ? `${node.params.count} repetitions`
            : node.params.attempts
              ? `${node.params.attempts} attempts`
              : node.params.message
                ? String(node.params.message)
                : `${childCount} ${childCount === 1 ? 'child' : 'children'}`;
  return (
    <div
      className={`behavior-node ${selected ? 'is-selected' : ''} ${error ? 'has-error' : ''} ${node.disabled ? 'is-disabled' : ''} state-${status ?? 'Idle'}`}
      style={{ '--node-color': def.color } as React.CSSProperties}
      data-testid={`node-${node.id}`}
    >
      {node.kind !== 'Root' && (
        <Handle type="target" position={Position.Top} className="node-handle" />
      )}
      <div className="node-type">
        <NodeIcon kind={node.kind} size={13} />
        <span>{def.label}</span>
        {error ? (
          <AlertCircle size={12} className="error-icon" />
        ) : status === 'Running' ? (
          <LoaderCircle size={12} />
        ) : status === 'Success' ? (
          <Check size={12} />
        ) : status === 'Failure' ? (
          <X size={12} />
        ) : (
          <Circle size={5} fill="currentColor" className="node-dot" />
        )}
      </div>
      <div className="node-name">{node.name}</div>
      <div className="node-summary">{summary}</div>
      {def.maxChildren > 0 && (
        <Handle type="source" position={Position.Bottom} className="node-handle" />
      )}
    </div>
  );
});
export default BehaviorNode;
