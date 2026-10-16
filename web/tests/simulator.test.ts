import { describe, expect, it, vi } from 'vitest';
import { createSimulation } from '../src/lib/simulator';
import { registry } from '../src/lib/registry';
import type { AstNode, BehaviorTreeAst, Mode, NodeKind, Variable } from '../src/lib/types';

function node(
  kind: NodeKind,
  id: string,
  children: AstNode[] = [],
  params: AstNode['params'] = {},
): AstNode {
  return {
    id,
    kind,
    name: id,
    children,
    params: { ...registry[kind].defaults, ...params },
    disabled: false,
  };
}
function ast(root: AstNode, variables: Variable[] = [], mode: Mode = 'game'): BehaviorTreeAst {
  return { root, variables, mode, settings: { namespace: 'Tests', className: 'TestBehavior' } };
}

describe('AST simulation', () => {
  it('resumes a running sequence child without reevaluating completed siblings', () => {
    const simulation = createSimulation(
      ast(
        node('Sequence', 'sequence', [
          node('Condition', 'check'),
          node('Action', 'action', [], { mock: 'Running' }),
          node('Action', 'after'),
        ]),
      ),
    );
    expect(simulation.step()).toMatchObject({
      result: 'Running',
      statuses: { check: 'Success', action: 'Running', after: 'Idle' },
    });
    simulation.setMock('check', 'Failure');
    expect(simulation.step()).toMatchObject({
      result: 'Running',
      statuses: { check: 'Idle', action: 'Running' },
    });
    simulation.setMock('action', 'Success');
    expect(simulation.step()).toMatchObject({
      result: 'Success',
      statuses: { check: 'Idle', action: 'Success', after: 'Success' },
    });
    expect(simulation.step()).toMatchObject({
      result: 'Failure',
      statuses: { check: 'Failure', action: 'Idle', after: 'Idle' },
    });
  });

  it('resumes a running selector branch and inverts only terminal statuses', () => {
    const simulation = createSimulation(
      ast(
        node('Selector', 'selector', [
          node('Condition', 'first', [], { mock: 'Failure' }),
          node('Inverter', 'invert', [node('Action', 'pending', [], { mock: 'Running' })]),
        ]),
      ),
    );
    expect(simulation.step().result).toBe('Running');
    simulation.setMock('first', 'Success');
    simulation.setMock('pending', 'Failure');
    expect(simulation.step()).toMatchObject({
      result: 'Success',
      statuses: { first: 'Idle', invert: 'Success', pending: 'Failure' },
    });
  });

  it('performs at most one completed repeat or failed retry attempt per tick', () => {
    const repeat = createSimulation(
      ast(node('Repeater', 'repeat', [node('Action', 'action')], { count: 3 })),
    );
    expect([
      repeat.step().result,
      repeat.step().result,
      repeat.step().result,
      repeat.step().result,
    ]).toEqual(['Running', 'Running', 'Success', 'Running']);
    const untilFailure = createSimulation(
      ast(
        node('Repeater', 'repeat', [node('Action', 'action', [], { mock: 'Failure' })], {
          count: 10000,
          untilFailure: true,
        }),
      ),
    );
    expect(untilFailure.step().result).toBe('Success');
    const retry = createSimulation(
      ast(
        node('Retry', 'retry', [node('Action', 'action', [], { mock: 'Failure' })], {
          attempts: 3,
        }),
      ),
    );
    expect([retry.step().result, retry.step().result, retry.step().result]).toEqual([
      'Running',
      'Running',
      'Failure',
    ]);
    retry.setMock('action', 'Success');
    expect(retry.step().result).toBe('Success');
  });

  it.each(['Wait', 'Delay'] as const)(
    '%s uses virtual elapsed time and restarts after completion',
    (kind) => {
      const simulation = createSimulation(
        ast(node(kind, 'wait', [], { seconds: 0.5 }), [], kind === 'Delay' ? 'workflow' : 'game'),
      );
      expect([
        simulation.step().result,
        simulation.step().result,
        simulation.step().result,
        simulation.step().result,
      ]).toEqual(['Running', 'Running', 'Success', 'Running']);
      const immediate = createSimulation(ast(node(kind, 'wait', [], { seconds: 0 })));
      expect(immediate.step(0).result).toBe('Success');
    },
  );

  it('times out without visiting the child at the deadline and resets the timed-out branch', () => {
    const simulation = createSimulation(
      ast(
        node('Timeout', 'timeout', [node('Action', 'action', [], { mock: 'Running' })], {
          seconds: 0.5,
        }),
      ),
    );
    expect(simulation.step().result).toBe('Running');
    expect(simulation.step().result).toBe('Running');
    expect(simulation.step()).toMatchObject({
      result: 'Failure',
      statuses: { timeout: 'Failure', action: 'Idle' },
    });
    expect(simulation.step().result).toBe('Running');
  });

  it('preserves cooldown through parent restarts and clears it on global reset', () => {
    const simulation = createSimulation(
      ast(
        node('Sequence', 'sequence', [
          node('Cooldown', 'cooldown', [node('Action', 'action')], { seconds: 0.5 }),
        ]),
      ),
    );
    expect(simulation.step().result).toBe('Success');
    expect(simulation.step()).toMatchObject({ result: 'Failure', statuses: { action: 'Idle' } });
    expect(simulation.step().result).toBe('Success');
    expect(simulation.step().result).toBe('Failure');
    simulation.reset();
    expect(simulation.step()).toMatchObject({ result: 'Success', tick: 1 });
  });

  it('caches completed parallel children and prioritizes failure when both thresholds are met', () => {
    const simulation = createSimulation(
      ast(
        node(
          'Parallel',
          'parallel',
          [
            node('Action', 'done'),
            node('Action', 'failed', [], { mock: 'Failure' }),
            node('Action', 'pending', [], { mock: 'Running' }),
          ],
          { successThreshold: 2, failureThreshold: 2 },
        ),
      ),
    );
    expect(simulation.step().result).toBe('Running');
    simulation.setMock('done', 'Failure');
    simulation.setMock('pending', 'Success');
    expect(simulation.step()).toMatchObject({
      result: 'Success',
      statuses: { done: 'Success', failed: 'Failure', pending: 'Success' },
    });
    const simultaneous = createSimulation(
      ast(
        node(
          'Parallel',
          'parallel',
          [node('Action', 'success'), node('Action', 'failure', [], { mock: 'Failure' })],
          { successThreshold: 1, failureThreshold: 1 },
        ),
      ),
    );
    expect(simultaneous.step().result).toBe('Failure');
  });

  it.each([
    ['bool', 'false', 'true'],
    ['int', '0', '42'],
    ['float', '1.2', '0.1'],
    ['string', 'old', 'new'],
    ['Vector3', '[0,0,0]', '[0.1,0.2,0.3]'],
  ] as const)('sets and compares typed %s shared values', (type, initial, value) => {
    const simulation = createSimulation(
      ast(
        node('Sequence', 'sequence', [
          node('SetBlackboard', 'set', [], { variable: 'shared', value }),
          node('BlackboardCheck', 'check', [], { variable: 'shared', value }),
        ]),
        [{ id: 'v', name: 'shared', type, value: initial }],
      ),
    );
    expect(simulation.step().result).toBe('Success');
  });

  it('restores Workflow context values and retains configured mocks on reset', () => {
    const simulation = createSimulation(
      ast(
        node('Selector', 'selector', [
          node('ContextCheck', 'check', [], { variable: 'shared', value: 'true' }),
          node('SetContext', 'set', [], { variable: 'shared', value: 'true' }),
        ]),
        [{ id: 'v', name: 'shared', type: 'bool', value: 'false' }],
        'workflow',
      ),
    );
    expect(simulation.step().statuses.set).toBe('Success');
    expect(simulation.step().statuses.set).toBe('Idle');
    simulation.reset();
    expect(simulation.step().statuses.set).toBe('Success');
    const mocked = createSimulation(ast(node('Action', 'mocked')));
    mocked.setMock('mocked', 'Failure');
    mocked.reset();
    expect(mocked.step().result).toBe('Failure');
  });

  it('reports undefined or incorrectly typed variable access as failure', () => {
    const missing = createSimulation(
      ast(node('ContextCheck', 'check', [], { variable: 'missing', value: 'true' })),
    );
    expect(missing.step()).toMatchObject({ result: 'Failure' });
    expect(missing.step().logs.some((line) => line.includes('undefined variable missing'))).toBe(
      true,
    );
    const invalid = createSimulation(
      ast(node('SetBlackboard', 'set', [], { variable: 'shared', value: 'not-a-number' }), [
        { id: 'v', name: 'shared', type: 'int', value: '1' },
      ]),
    );
    expect(invalid.step().result).toBe('Failure');
  });

  it('bypasses disabled nodes as Success without evaluating their children', () => {
    const disabled = node('Sequence', 'disabled', [
      node('Action', 'action', [], { mock: 'Failure' }),
    ]);
    disabled.disabled = true;
    expect(createSimulation(ast(disabled)).step()).toMatchObject({
      result: 'Success',
      statuses: { disabled: 'Success', action: 'Idle' },
    });
  });

  it.each(['RandomSequence', 'RandomSelector'] as const)(
    '%s keeps its active order and reseeds on reset',
    (kind) => {
      const simulation = createSimulation(
        ast(
          node(kind, 'random', [
            node('Action', 'one', [], { mock: 'Running' }),
            node('Action', 'two', [], { mock: 'Running' }),
            node('Action', 'three', [], { mock: 'Running' }),
          ]),
        ),
      );
      const first = simulation.step().statuses;
      expect(Object.values(first).filter((status) => status === 'Running')).toHaveLength(2);
      expect(simulation.step().statuses).toEqual(first);
      simulation.reset();
      expect(simulation.step().statuses).toEqual(first);
    },
  );

  it('mocks asynchronous Workflow and HTTP nodes without making network requests', () => {
    const fetch = vi.fn(() => Promise.reject(new Error('Network must not run.')));
    vi.stubGlobal('fetch', fetch);
    try {
      const simulation = createSimulation(
        ast(
          node('ExceptionHandler', 'handler', [
            node('Sequence', 'sequence', [
              node('HttpRequest', 'http'),
              node('AsyncAction', 'async', [], { mock: 'Running' }),
              node('Log', 'log', [], { message: 'Completed' }),
            ]),
          ]),
          [],
          'workflow',
        ),
      );
      expect(simulation.step().result).toBe('Running');
      simulation.setMock('async', 'Success');
      expect(simulation.step()).toMatchObject({ result: 'Success', statuses: { log: 'Success' } });
      expect(simulation.step().logs.some((line) => line.endsWith('Completed'))).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects Running mocks on bool handlers and invalid time deltas', () => {
    const simulation = createSimulation(ast(node('Condition', 'condition')));
    expect(() => simulation.setMock('condition', 'Running')).toThrow('cannot return Running');
    expect(() => simulation.setMock('missing', 'Success')).toThrow();
    for (const delta of [-1, Infinity, NaN])
      expect(() => simulation.step(delta)).toThrow('nonnegative');
    expect(simulation.step().tick).toBe(1);
  });

  it('isolates AST input and returned snapshots, and bounds accumulated logs', () => {
    const input = ast(node('Action', 'action'));
    const simulation = createSimulation(input);
    input.root.disabled = true;
    simulation.setMock('action', 'Failure');
    const snapshot = simulation.step();
    expect(snapshot.result).toBe('Failure');
    snapshot.statuses.action = 'Success';
    snapshot.logs.push('external mutation');
    const next = simulation.step();
    expect(next.statuses.action).toBe('Failure');
    expect(next.logs).not.toContain('external mutation');
    for (let i = 0; i < 400; i++) simulation.step();
    expect(simulation.step().logs.length).toBeLessThanOrEqual(300);
  });
});
