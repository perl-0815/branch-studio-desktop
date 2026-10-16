import { registry } from './registry';
import type { Project, ValidationIssue, Variable } from './types';
import { projectLimitIssue } from './project-limits';

// Deliberately restrict user symbols to a portable subset of C# identifiers.
const keywords = new Set(
  'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while add alias and ascending async await by descending dynamic equals file from get global group init into join let managed nameof nint not notnull nuint on or orderby partial record remove required scoped select set unmanaged value var when where with yield'.split(
    ' ',
  ),
);
export function isCSharpIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) && !keywords.has(value)
  );
}
export function isVariableValueValid(variable: Pick<Variable, 'type' | 'value'>): boolean {
  const { type, value } = variable;
  if (type === 'string') return true;
  if (type === 'bool') return value === 'true' || value === 'false';
  if (type === 'int')
    return (
      /^-?\d+$/.test(value) &&
      Number.isSafeInteger(Number(value)) &&
      Number(value) >= -2147483648 &&
      Number(value) <= 2147483647
    );
  if (type === 'float')
    return (
      value.trim() !== '' &&
      Number.isFinite(Number(value)) &&
      Math.abs(Number(value)) <= 3.402823466e38
    );
  try {
    const v: unknown = JSON.parse(value);
    return (
      Array.isArray(v) &&
      v.length === 3 &&
      v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 3.402823466e38)
    );
  } catch {
    return false;
  }
}
export function parseArguments(value: unknown): (string | number | boolean | null)[] {
  if (value === undefined || (typeof value === 'string' && !value.trim())) return [];
  if (typeof value !== 'string') throw new Error('Arguments must be a JSON array.');
  const result: unknown = JSON.parse(value);
  if (
    !Array.isArray(result) ||
    !result.every(
      (v) =>
        v === null ||
        typeof v === 'string' ||
        typeof v === 'boolean' ||
        (typeof v === 'number' && Number.isFinite(v)),
    )
  )
    throw new Error('Use a JSON array of strings, finite numbers, booleans, or null.');
  return result;
}
export function validateProject(project: Project): ValidationIssue[] {
  const limit = projectLimitIssue(project);
  if (limit) return [{ ...limit, id: `${limit.code}:project`, severity: 'error' }];
  const issues: ValidationIssue[] = [];
  const add = (
    code: string,
    message: string,
    nodeId?: string,
    severity: ValidationIssue['severity'] = 'error',
  ) =>
    issues.push({
      id: `${code}:${nodeId ?? 'project'}:${issues.length}`,
      code,
      message,
      nodeId,
      severity,
    });
  const nodes = new Map(project.nodes.map((n) => [n.id, n]));
  const roots = project.nodes.filter((n) => n.kind === 'Root');
  if (roots.length !== 1) add('ROOT_COUNT', 'A project must contain exactly one Root.');
  if (nodes.size !== project.nodes.length) add('DUPLICATE_ID', 'Node IDs must be unique.');
  if (new Set(project.edges.map((e) => e.id)).size !== project.edges.length)
    add('DUPLICATE_EDGE_ID', 'Connection IDs must be unique.');
  if (!project.name.trim()) add('PROJECT_NAME', 'Enter a project name.');
  if (!isCSharpIdentifier(project.settings.className))
    add('CLASS_NAME', 'Class name must be a valid C# identifier.');
  if (['Create', 'CreateBlackboard', 'CreateWorkflowContext'].includes(project.settings.className))
    add('CLASS_NAME', 'Class name conflicts with a generated factory method.');
  if (
    project.settings.namespace === 'BranchStudio' &&
    ['Game', 'Workflow', 'Contracts'].includes(project.settings.className)
  )
    add('CLASS_NAME', 'Class name would shadow a runtime namespace.');
  if (project.settings.namespace === 'System' || project.settings.namespace.startsWith('System.'))
    add('NAMESPACE', 'Use an application namespace outside the reserved System namespaces.');
  const runtimeTypes = new Set([
    'NodeStatus',
    'IBehaviorNode',
    'BehaviorNode',
    'Blackboard',
    'IGameClock',
    'MonotonicClock',
    'WorkflowResult',
    'IWorkflowNode',
    'WorkflowNode',
    'WorkflowContext',
    'ConstantNode',
    'ActionNode',
    'ConditionNode',
    'VariableCheckNode',
    'SetVariableNode',
    'CompositeNode',
    'SequenceNode',
    'SelectorNode',
    'ParallelNode',
    'DecoratorNode',
    'InverterNode',
    'RepeaterNode',
    'RetryNode',
    'TimeoutNode',
    'WaitNode',
    'CooldownNode',
    'RandomCompositeNode',
    'RandomSelectorNode',
    'RandomSequenceNode',
    'DelayNode',
    'LogNode',
    'ExceptionHandlerNode',
    'HttpRequestNode',
  ]);
  if (
    ['BranchStudio.Game', 'BranchStudio.Workflow'].includes(project.settings.namespace) &&
    runtimeTypes.has(project.settings.className)
  )
    add('CLASS_NAME', 'Class name would redefine a runtime type in this namespace.');
  if (
    [...runtimeTypes].some((type) =>
      ['BranchStudio.Game', 'BranchStudio.Workflow'].some(
        (ns) =>
          project.settings.namespace === `${ns}.${type}` ||
          project.settings.namespace.startsWith(`${ns}.${type}.`),
      ),
    )
  )
    add('NAMESPACE', 'Namespace conflicts with a runtime type.');
  const contractTypes = [
    'ProjectMode',
    'NodeKind',
    'NodeCategory',
    'NodeStatus',
    'WorkflowResult',
    'VariableType',
    'ValidationSeverity',
    'ContractValueAttribute',
    'ContractValue',
    'ContractCatalog',
    'NodeDefinition',
  ];
  if (
    project.settings.namespace === 'BranchStudio.Contracts' &&
    contractTypes.includes(project.settings.className)
  )
    add('CLASS_NAME', 'Class name would redefine a shared contract type in this namespace.');
  if (
    contractTypes.some(
      (type) =>
        project.settings.namespace === `BranchStudio.Contracts.${type}` ||
        project.settings.namespace.startsWith(`BranchStudio.Contracts.${type}.`),
    )
  )
    add('NAMESPACE', 'Namespace conflicts with a shared contract type.');
  if (!project.settings.namespace.split('.').every(isCSharpIdentifier))
    add('NAMESPACE', 'Namespace must contain valid C# identifiers separated by dots.');
  const outgoing = new Map<string, typeof project.edges>();
  const incoming = new Map<string, number>();
  const pairs = new Set<string>();
  for (const e of project.edges) {
    if (!nodes.has(e.source) || !nodes.has(e.target)) {
      add('MISSING_ENDPOINT', 'A connection refers to a missing node.');
      continue;
    }
    const pair = JSON.stringify([e.source, e.target]);
    if (pairs.has(pair)) add('DUPLICATE_CONNECTION', 'A connection already exists.', e.target);
    pairs.add(pair);
    outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e]);
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    if (!Number.isInteger(e.order) || e.order < 0)
      add('CHILD_ORDER', 'Child order must be a nonnegative integer.', e.source);
    if (e.source === e.target) add('SELF_CONNECTION', 'A node cannot connect to itself.', e.source);
  }
  const variableNames = new Set<string>();
  const variableIds = new Set<string>();
  for (const v of project.variables) {
    if (!isCSharpIdentifier(v.name))
      add('VARIABLE_NAME', `Variable “${v.name}” must be a valid C# identifier.`);
    if (variableNames.has(v.name))
      add('DUPLICATE_VARIABLE', `Variable “${v.name}” is defined more than once.`);
    if (variableIds.has(v.id)) add('DUPLICATE_VARIABLE_ID', 'Variable IDs must be unique.');
    variableNames.add(v.name);
    variableIds.add(v.id);
    if (!isVariableValueValid(v))
      add('VARIABLE_VALUE', `Default value for “${v.name}” is not a valid ${v.type}.`);
  }
  const signatures = new Map<string, string>();
  const numeric = (
    nodeId: string,
    name: string,
    value: unknown,
    min: number,
    max: number,
    integer = false,
  ) => {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    )
      add(
        'PARAMETER',
        `${name} must be ${integer ? 'an integer ' : ''}between ${min} and ${max}.`,
        nodeId,
      );
  };
  for (const n of project.nodes) {
    const definition = registry[n.kind];
    if (!definition) {
      add('NODE_KIND', 'Unknown node type.', n.id);
      continue;
    }
    if (!definition.modes.includes(project.mode))
      add(
        'MODE_UNSUPPORTED',
        `${definition.label} is unavailable in ${project.mode === 'game' ? 'Game AI' : 'Workflow'}.`,
        n.id,
      );
    const count = outgoing.get(n.id)?.length ?? 0;
    if (count < definition.minChildren || count > definition.maxChildren)
      add(
        'CHILD_COUNT',
        `${definition.label} requires ${definition.minChildren === definition.maxChildren ? definition.minChildren : `at least ${definition.minChildren}`} child${definition.minChildren === 1 ? '' : 'ren'}.`,
        n.id,
      );
    if (n.kind === 'Root' && incoming.has(n.id))
      add('ROOT_PARENT', 'Root cannot have a parent.', n.id);
    if (n.kind === 'Root' && n.disabled) add('ROOT_DISABLED', 'Root must remain enabled.', n.id);
    if ((incoming.get(n.id) ?? 0) > 1)
      add('MULTIPLE_PARENTS', 'A node can have only one parent.', n.id);
    const orders = outgoing.get(n.id)?.map((e) => e.order) ?? [];
    if (new Set(orders).size !== orders.length)
      add('CHILD_ORDER', 'Children must have unique execution order values.', n.id);
    if (!n.name.trim()) add('NODE_NAME', 'Enter a node name.', n.id);
    if (['Condition', 'Action', 'AsyncAction', 'Validate', 'Transform'].includes(n.kind)) {
      if (!isCSharpIdentifier(n.params.method))
        add('METHOD_NAME', 'Handler name must be a valid C# identifier.', n.id);
      else {
        if (n.params.method === `I${project.settings.className}Handlers`)
          add('METHOD_NAME', 'Handler name conflicts with its generated interface name.', n.id);
        const signature = ['Condition', 'Validate'].includes(n.kind) ? 'condition' : 'action';
        if (signatures.has(n.params.method) && signatures.get(n.params.method) !== signature)
          add(
            'HANDLER_CONFLICT',
            `Handler “${n.params.method}” is used for incompatible return types.`,
            n.id,
          );
        signatures.set(n.params.method, signature);
      }
      try {
        parseArguments(n.params.arguments);
      } catch (e) {
        add('ARGUMENTS', e instanceof Error ? e.message : 'Invalid arguments.', n.id);
      }
    }
    if (['BlackboardCheck', 'SetBlackboard', 'ContextCheck', 'SetContext'].includes(n.kind)) {
      const variable = project.variables.find((v) => v.name === n.params.variable);
      if (!variable)
        add('VARIABLE_REFERENCE', `Variable “${n.params.variable ?? ''}” is not defined.`, n.id);
      else if (!isVariableValueValid({ type: variable.type, value: String(n.params.value ?? '') }))
        add('VARIABLE_ASSIGNMENT', `Value must be a valid ${variable.type}.`, n.id);
    }
    if (['Wait', 'Delay', 'Cooldown', 'Timeout'].includes(n.kind))
      numeric(n.id, 'Seconds', n.params.seconds, n.kind === 'Timeout' ? 0.001 : 0, 86400);
    if (n.kind === 'Repeater') {
      numeric(n.id, 'Repeat count', n.params.count, 1, 10000, true);
      if (typeof n.params.untilFailure !== 'boolean')
        add('PARAMETER', 'Until failure must be a boolean.', n.id);
    }
    if (n.kind === 'Retry') numeric(n.id, 'Attempts', n.params.attempts, 1, 10000, true);
    if (n.kind === 'Parallel') {
      numeric(n.id, 'Success threshold', n.params.successThreshold, 1, Math.max(1, count), true);
      numeric(n.id, 'Failure threshold', n.params.failureThreshold, 1, Math.max(1, count), true);
    }
    if (n.kind === 'Log' && typeof n.params.message !== 'string')
      add('PARAMETER', 'Log message must be a string.', n.id);
    if (n.kind === 'HttpRequest') {
      if (
        !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(
          String(n.params.httpMethod),
        )
      )
        add('HTTP_METHOD', 'Choose a supported HTTP method.', n.id);
      try {
        const url = new URL(String(n.params.url));
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
          throw Error();
      } catch {
        add('HTTP_URL', 'Enter an HTTP(S) URL without embedded credentials.', n.id);
      }
      numeric(n.id, 'HTTP timeout', n.params.timeout, 0.001, 86400);
      if (
        n.params.credentialEnv &&
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(n.params.credentialEnv))
      )
        add('CREDENTIAL_ENV', 'Credential environment variable name is invalid.', n.id);
      try {
        const headers: unknown = JSON.parse(String(n.params.headers));
        if (
          !headers ||
          Array.isArray(headers) ||
          typeof headers !== 'object' ||
          !Object.entries(headers).every(
            ([key, value]) =>
              /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) &&
              typeof value === 'string' &&
              !/[\r\n]/.test(value),
          )
        )
          throw Error();
        if (
          Object.keys(headers).some((key) =>
            /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key)$/i.test(key),
          )
        )
          add(
            'SECRET_HEADER',
            'Use Credential env for authentication; do not store secret headers.',
            n.id,
          );
      } catch {
        add(
          'HTTP_HEADERS',
          'Headers must be a JSON object with string values and valid header names.',
          n.id,
        );
      }
    }
  }
  // Three-color DFS detects cycles, including disconnected components.
  const colors = new Map<string, number>();
  const visit = (id: string) => {
    colors.set(id, 1);
    for (const edge of outgoing.get(id) ?? []) {
      if (colors.get(edge.target) === 1)
        add('CYCLE', 'A cycle was found in the tree.', edge.target);
      else if (!colors.has(edge.target)) visit(edge.target);
    }
    colors.set(id, 2);
  };
  for (const n of project.nodes) if (!colors.has(n.id)) visit(n.id);
  const reachable = new Set<string>();
  const queue = roots.length === 1 ? [roots[0].id] : [];
  while (queue.length) {
    const id = queue.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const e of outgoing.get(id) ?? []) queue.push(e.target);
  }
  if (roots.length === 1)
    for (const n of project.nodes)
      if (!reachable.has(n.id)) add('UNREACHABLE', 'Node is not connected to Root.', n.id);
  return issues;
}
