import type { AstNode, BehaviorTreeAst, Status, Variable } from './types';
import { isVariableValueValid } from './validation';

type ActiveStatus = Exclude<Status, 'Idle'>;
type SharedValue = boolean | number | string | [number, number, number];

export interface SimulationSnapshot {
  statuses: Record<string, Status>;
  result: Status;
  /** Cumulative, bounded execution log. No external handlers or requests run. */
  logs: string[];
  tick: number;
}

export interface Simulator {
  step(deltaSeconds?: number): SimulationSnapshot;
  /** Restores variables and execution state, retaining configured mocks. */
  reset(): void;
  setMock(nodeId: string, status: ActiveStatus): void;
}

interface NodeMemory {
  result?: ActiveStatus;
  cursor?: number;
  order?: number[];
  startedAt?: number;
  completed?: number;
  parallel?: Map<string, ActiveStatus>;
  cooldownUntil?: number;
}

const terminal = (status: Status): status is 'Success' | 'Failure' =>
  status === 'Success' || status === 'Failure';
const mockKinds = new Set([
  'Action',
  'Condition',
  'AsyncAction',
  'Validate',
  'Transform',
  'HttpRequest',
]);
const booleanKinds = new Set(['Condition', 'Validate']);
const MAX_LOGS = 300;
const INITIAL_SEED = 0x51f15e;

function sharedValue(variable: Variable, raw: unknown): SharedValue {
  const value = String(raw ?? '');
  if (!isVariableValueValid({ type: variable.type, value }))
    throw new Error(`Invalid ${variable.type} value for ${variable.name}.`);
  switch (variable.type) {
    case 'bool':
      return value === 'true';
    case 'int':
      return Number(value);
    case 'float':
      return Math.fround(Number(value));
    case 'Vector3':
      return (JSON.parse(value) as number[]).map(Math.fround) as [number, number, number];
    default:
      return value;
  }
}

/**
 * Deterministic, virtual-time interpreter for the validated AST, independent of
 * React and C#. A finished tree starts a new execution on the following step.
 * One repeat/retry attempt completes per step, so no decorator can spin forever.
 */
export function createSimulation(input: BehaviorTreeAst): Simulator {
  const ast = structuredClone(input);
  const nodes = new Map<string, AstNode>();
  const collect = (node: AstNode) => {
    if (nodes.has(node.id)) throw new Error('Simulation requires a tree with unique node IDs.');
    nodes.set(node.id, node);
    node.children.forEach(collect);
  };
  collect(ast.root);
  const definitions = new Map(ast.variables.map((variable) => [variable.name, variable]));
  const values = new Map<string, SharedValue>();
  const memory = new Map<string, NodeMemory>();
  const mocks = new Map<string, ActiveStatus>();
  let now = 0;
  let tick = 0;
  let seed = INITIAL_SEED;
  let logs: string[] = [];
  let previousStatuses: Record<string, Status> = {};
  let statuses: Record<string, Status> = {};

  function log(message: string) {
    logs.push(`[${tick}] ${message}`);
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
  }

  function state(node: AstNode): NodeMemory {
    let value = memory.get(node.id);
    if (!value) {
      value = {};
      memory.set(node.id, value);
    }
    return value;
  }

  // Preserve cooldowns when a parent restarts a child. Global reset clears them.
  function resetBranch(node: AstNode) {
    const cooldownUntil = memory.get(node.id)?.cooldownUntil;
    if (node.kind === 'Cooldown' && cooldownUntil !== undefined)
      memory.set(node.id, { cooldownUntil });
    else memory.delete(node.id);
    node.children.forEach(resetBranch);
  }

  function random() {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  }

  function shuffle(length: number) {
    const order = Array.from({ length }, (_, i) => i);
    for (let i = length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }

  const number = (node: AstNode, key: string, fallback: number) => {
    const value = node.params[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };

  function mock(node: AstNode): ActiveStatus {
    const value = mocks.get(node.id) ?? node.params.mock ?? 'Success';
    if (
      !['Success', 'Failure', 'Running'].includes(String(value)) ||
      (booleanKinds.has(node.kind) && value === 'Running')
    ) {
      log(`${node.name}: invalid mock result.`);
      return 'Failure';
    }
    return value as ActiveStatus;
  }

  function evaluate(node: AstNode): ActiveStatus {
    if (terminal(state(node).result ?? 'Idle')) resetBranch(node);
    const s = state(node);
    const finish = (result: ActiveStatus) => {
      s.result = result;
      statuses[node.id] = result;
      return result;
    };
    if (node.disabled) return finish('Success');

    const child = () => (node.children[0] ? evaluate(node.children[0]) : 'Failure');
    let result: ActiveStatus;
    switch (node.kind) {
      case 'Root':
        result = child();
        break;
      case 'Sequence':
      case 'Selector':
      case 'RandomSequence':
      case 'RandomSelector': {
        const sequence = node.kind === 'Sequence' || node.kind === 'RandomSequence';
        const randomized = node.kind.startsWith('Random');
        const order = (s.order ??= randomized
          ? shuffle(node.children.length)
          : node.children.map((_, i) => i));
        s.cursor ??= 0;
        result = sequence ? 'Success' : 'Failure';
        while (s.cursor < order.length) {
          const status = evaluate(node.children[order[s.cursor]]);
          if (status === 'Running' || status === (sequence ? 'Failure' : 'Success')) {
            result = status;
            break;
          }
          s.cursor++;
        }
        break;
      }
      case 'Parallel': {
        const results = (s.parallel ??= new Map());
        for (const nodeChild of node.children) {
          const cached = results.get(nodeChild.id);
          if (cached && terminal(cached)) statuses[nodeChild.id] = cached;
          else results.set(nodeChild.id, evaluate(nodeChild));
        }
        const success = [...results.values()].filter((status) => status === 'Success').length;
        const failure = [...results.values()].filter((status) => status === 'Failure').length;
        result =
          failure >= number(node, 'failureThreshold', 1)
            ? 'Failure'
            : success >= number(node, 'successThreshold', 1)
              ? 'Success'
              : results.size === node.children.length && [...results.values()].every(terminal)
                ? 'Failure'
                : 'Running';
        // Terminal thresholds cancel other branches instead of retaining Running state.
        if (terminal(result))
          for (const nodeChild of node.children)
            if (results.get(nodeChild.id) === 'Running') resetBranch(nodeChild);
        break;
      }
      case 'Inverter': {
        const status = child();
        result = status === 'Success' ? 'Failure' : status === 'Failure' ? 'Success' : 'Running';
        break;
      }
      case 'Repeater': {
        const status = child();
        if (status === 'Running') result = 'Running';
        else {
          s.completed = (s.completed ?? 0) + 1;
          result =
            (node.params.untilFailure === true && status === 'Failure') ||
            s.completed >= number(node, 'count', 3)
              ? 'Success'
              : 'Running';
        }
        break;
      }
      case 'Retry': {
        const status = child();
        if (status !== 'Failure') result = status;
        else {
          s.completed = (s.completed ?? 0) + 1;
          result = s.completed >= number(node, 'attempts', 3) ? 'Failure' : 'Running';
        }
        break;
      }
      case 'Timeout': {
        s.startedAt ??= now;
        if (now - s.startedAt >= number(node, 'seconds', 5)) {
          if (node.children[0]) resetBranch(node.children[0]);
          result = 'Failure';
        } else result = child();
        break;
      }
      case 'Wait':
      case 'Delay':
        s.startedAt ??= now;
        result = now - s.startedAt >= number(node, 'seconds', 1) ? 'Success' : 'Running';
        break;
      case 'Cooldown':
        if (now < (s.cooldownUntil ?? -Infinity)) result = 'Failure';
        else {
          result = child();
          if (terminal(result)) s.cooldownUntil = now + number(node, 'seconds', 2);
        }
        break;
      case 'BlackboardCheck':
      case 'ContextCheck':
      case 'SetBlackboard':
      case 'SetContext': {
        const name = String(node.params.variable ?? '');
        const definition = definitions.get(name);
        if (!definition) {
          log(`${node.name}: undefined variable ${name}.`);
          result = 'Failure';
          break;
        }
        try {
          const value = sharedValue(definition, node.params.value);
          if (node.kind.startsWith('Set')) {
            values.set(name, value);
            result = 'Success';
          } else {
            const actual = values.get(name);
            result =
              Array.isArray(value) && Array.isArray(actual)
                ? value.every((component, i) => component === actual[i])
                  ? 'Success'
                  : 'Failure'
                : value === actual
                  ? 'Success'
                  : 'Failure';
          }
        } catch (error) {
          log(error instanceof Error ? error.message : 'Invalid shared variable.');
          result = 'Failure';
        }
        break;
      }
      case 'Log':
        log(String(node.params.message ?? ''));
        result = 'Success';
        break;
      case 'ExceptionHandler':
        try {
          result = child();
        } catch (error) {
          log(`${node.name}: ${error instanceof Error ? error.message : 'Unhandled exception'}`);
          result = 'Failure';
        }
        break;
      default:
        result = mockKinds.has(node.kind) ? mock(node) : 'Failure';
    }
    return finish(result);
  }

  function reset() {
    now = 0;
    tick = 0;
    seed = INITIAL_SEED;
    logs = [];
    memory.clear();
    values.clear();
    previousStatuses = {};
    statuses = {};
    for (const variable of ast.variables)
      values.set(variable.name, sharedValue(variable, variable.value));
  }
  reset();

  return {
    step(deltaSeconds = 0.25) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
        throw new RangeError('Simulation delta must be a finite, nonnegative number.');
      now += deltaSeconds;
      tick++;
      statuses = Object.fromEntries([...nodes.keys()].map((id) => [id, 'Idle' as Status]));
      const result = evaluate(ast.root);
      for (const node of nodes.values()) {
        const status = statuses[node.id];
        if (status !== 'Idle' && status !== previousStatuses[node.id])
          log(`${node.name}: ${status}`);
      }
      log(`Tick ${tick}: ${result}`);
      previousStatuses = { ...statuses };
      return { statuses: { ...statuses }, result, logs: [...logs], tick };
    },
    reset,
    setMock(nodeId, status) {
      const node = nodes.get(nodeId);
      if (!node || !mockKinds.has(node.kind))
        throw new Error('Choose an Action, Condition, or mocked Workflow node.');
      if (!['Success', 'Failure', 'Running'].includes(status))
        throw new Error('Invalid mock status.');
      if (booleanKinds.has(node.kind) && status === 'Running')
        throw new Error('Boolean conditions and validators cannot return Running.');
      mocks.set(nodeId, status);
    },
  };
}
