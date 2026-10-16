import { schemaVersion } from '../generated/contracts.generated';
import type { GraphNode, Mode, NodeKind, Project } from './types';
import { registry } from './registry';
import { autoLayout } from './graph';

export function createSample(mode: Mode): Project {
  const project: Project = {
    schemaVersion,
    name: mode === 'game' ? 'Sentinel AI' : 'Order Processing',
    mode,
    nodes: [],
    edges: [],
    variables:
      mode === 'game'
        ? [
            { id: 'v-visible', name: 'targetVisible', type: 'bool', value: 'true' },
            { id: 'v-health', name: 'health', type: 'float', value: '100' },
            { id: 'v-target', name: 'targetPos', type: 'Vector3', value: '[0,0,0]' },
            { id: 'v-range', name: 'attackRange', type: 'float', value: '5' },
          ]
        : [
            { id: 'v-stock', name: 'hasStock', type: 'bool', value: 'true' },
            { id: 'v-order', name: 'orderId', type: 'string', value: 'ORD-001' },
          ],
    settings: {
      namespace: mode === 'game' ? 'Game.AI' : 'Business.Workflows',
      className: mode === 'game' ? 'SentinelBehavior' : 'OrderWorkflow',
    },
  };
  const node = (id: string, kind: NodeKind, name: string, params: GraphNode['params'] = {}) => {
    project.nodes.push({
      id,
      kind,
      name,
      position: { x: 0, y: 0 },
      params: { ...registry[kind].defaults, ...params },
      disabled: false,
    });
    return id;
  };
  const connect = (parent: string, ...children: string[]) =>
    children.forEach((child, order) =>
      project.edges.push({ id: `e-${parent}-${child}`, source: parent, target: child, order }),
    );
  const root = node('root', 'Root', 'Root');
  if (mode === 'game') {
    const selector = node('priority', 'Selector', 'Combat priorities');
    const attack = node('attack-sequence', 'Sequence', 'Engage target');
    const chase = node('chase-sequence', 'Sequence', 'Pursue target');
    connect(root, selector);
    connect(selector, attack, chase, node('patrol', 'Action', 'Patrol', { method: 'Patrol' }));
    connect(
      attack,
      node('visible-attack', 'Condition', 'Enemy visible', { method: 'IsEnemyVisible' }),
      node('in-range', 'Condition', 'Within attack range', { method: 'IsWithinAttackRange' }),
      node('attack', 'Action', 'Attack enemy', { method: 'Attack' }),
    );
    connect(
      chase,
      node('visible-chase', 'Condition', 'Enemy visible', { method: 'IsEnemyVisible' }),
      node('chase', 'Action', 'Chase target', { method: 'Chase' }),
    );
  } else {
    const sequence = node('order', 'Sequence', 'Process order');
    const retry = node('retry-inventory', 'Retry', 'Inventory retry', { attempts: 3 });
    const selector = node('stock-selector', 'Selector', 'Fulfil or reject');
    const fulfil = node('fulfil', 'Sequence', 'Create order');
    connect(root, sequence);
    connect(
      sequence,
      node('validate-order', 'Validate', 'Validate order', { method: 'ValidateOrder' }),
      retry,
      selector,
      node('completed', 'Log', 'Completed', { message: 'Order processing completed' }),
    );
    connect(
      retry,
      node('inventory', 'HttpRequest', 'Check inventory', { method: 'CheckInventory' }),
    );
    connect(
      selector,
      fulfil,
      node('reject-order', 'Action', 'Reject order', { method: 'RejectOrder' }),
    );
    connect(
      fulfil,
      node('has-stock', 'Condition', 'Stock available', { method: 'HasStock' }),
      node('create-order', 'AsyncAction', 'Create order', { method: 'CreateOrder' }),
    );
  }
  return autoLayout(project);
}
