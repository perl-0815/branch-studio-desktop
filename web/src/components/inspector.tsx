'use client';
import { useState } from 'react';
import {
  SlidersHorizontal,
  Database,
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Link2Off,
  Check,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { useEditorStore } from '@/lib/store';
import { registry } from '@/lib/registry';
import type { GraphNode, NodeKind, ValidationIssue, Variable } from '@/lib/types';
import { variableTypes } from '@/generated/contracts.generated';
import NodeIcon from './node-icon';
import { IconButton } from './ui/button';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
const conversions: Partial<Record<NodeKind, NodeKind>> = {
  Wait: 'Delay',
  Delay: 'Wait',
  BlackboardCheck: 'ContextCheck',
  ContextCheck: 'BlackboardCheck',
  SetBlackboard: 'SetContext',
  SetContext: 'SetBlackboard',
  Validate: 'Condition',
  Transform: 'Action',
};
const paramLabels: Record<string, string> = {
  method: 'Handler method',
  arguments: 'Arguments · JSON array',
  seconds: 'Duration · seconds',
  count: 'Repeat count',
  untilFailure: 'Stop on failure',
  attempts: 'Maximum attempts',
  successThreshold: 'Success threshold',
  failureThreshold: 'Failure threshold',
  variable: 'Variable',
  value: 'Value',
  httpMethod: 'HTTP method',
  url: 'Request URL',
  headers: 'Headers · JSON object',
  timeout: 'Timeout · seconds',
  credentialEnv: 'Bearer token · environment key',
  message: 'Message',
  mock: 'Mock result',
};
export default function Inspector({
  issues,
  activeTab,
  onTab,
}: {
  issues: ValidationIssue[];
  activeTab: 'node' | 'data';
  onTab: (tab: 'node' | 'data') => void;
}) {
  const s = useEditorStore();
  const p = s.project;
  const node = p.nodes.find((n) => n.id === s.selectedIds[0]);
  const [variableOpen, setVariableOpen] = useState<string | null>(null);
  const updateVariable = (id: string, patch: Partial<Variable>) =>
    s.updateProject({ variables: p.variables.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
  const renderParam = (key: string, value: string | number | boolean) => {
    const update = (v: string | number | boolean) =>
      s.updateNode(node!.id, { params: { [key]: v } } as Partial<GraphNode>);
    if (key === 'mock')
      return (
        <Field key={key} label={paramLabels[key]}>
          <select value={String(value)} onChange={(e) => update(e.target.value)}>
            <option>Success</option>
            <option>Failure</option>
            {!['Condition', 'Validate'].includes(node!.kind) && <option>Running</option>}
          </select>
        </Field>
      );
    if (key === 'variable')
      return (
        <Field key={key} label="Variable">
          <select value={String(value)} onChange={(e) => update(e.target.value)}>
            {!p.variables.some((v) => v.name === value) && (
              <option value={String(value)}>{String(value) || 'Select variable'}</option>
            )}
            {p.variables.map((v) => (
              <option key={v.id} value={v.name}>
                {v.name} : {v.type}
              </option>
            ))}
          </select>
        </Field>
      );
    if (key === 'httpMethod')
      return (
        <Field key={key} label={paramLabels[key]}>
          <select value={String(value)} onChange={(e) => update(e.target.value)}>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
      );
    if (typeof value === 'boolean')
      return (
        <label className="check-field" key={key}>
          <input type="checkbox" checked={value} onChange={(e) => update(e.target.checked)} />
          {paramLabels[key] ?? key}
        </label>
      );
    if (key === 'headers' || key === 'arguments')
      return (
        <Field key={key} label={paramLabels[key]}>
          <textarea
            maxLength={100000}
            value={String(value)}
            rows={key === 'headers' ? 3 : 2}
            placeholder={key === 'arguments' ? '[]' : '{}'}
            onChange={(e) => update(e.target.value)}
            spellCheck={false}
          />
        </Field>
      );
    return (
      <Field key={key} label={paramLabels[key] ?? key}>
        <input
          maxLength={100000}
          type={typeof value === 'number' ? 'number' : 'text'}
          step={['seconds', 'timeout'].includes(key) ? '0.1' : '1'}
          value={String(value)}
          onChange={(e) =>
            update(
              typeof value === 'number'
                ? e.target.value === ''
                  ? 0
                  : Number(e.target.value)
                : e.target.value,
            )
          }
          spellCheck={false}
        />
      </Field>
    );
  };
  const edges = node
    ? p.edges.filter((e) => e.source === node.id).sort((a, b) => a.order - b.order)
    : [];
  const reorder = (index: number, direction: number) => {
    const ids = edges.map((e) => e.target);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    s.reorderChildren(node!.id, ids);
  };
  return (
    <aside className="inspector">
      <div className="inspector-tabs">
        <button className={activeTab === 'node' ? 'active' : ''} onClick={() => onTab('node')}>
          <SlidersHorizontal size={14} />
          Inspector
        </button>
        <button className={activeTab === 'data' ? 'active' : ''} onClick={() => onTab('data')}>
          <Database size={14} />
          {p.mode === 'game' ? 'Blackboard' : 'Context'}
          <small>{p.variables.length}</small>
        </button>
      </div>
      <div className="inspector-scroll">
        {activeTab === 'data' ? (
          <>
            <div className="section-title">
              <span>SHARED VARIABLES</span>
              <IconButton
                label="Add variable"
                onClick={() => {
                  let i = 1;
                  while (p.variables.some((v) => v.name === `variable${i}`)) i++;
                  const id = crypto.randomUUID();
                  s.updateProject({
                    variables: [
                      ...p.variables,
                      { id, name: `variable${i}`, type: 'bool', value: 'false' },
                    ],
                  });
                  setVariableOpen(id);
                }}
              >
                <Plus size={14} />
              </IconButton>
            </div>
            {p.variables.length === 0 && <div className="empty-small">No variables defined.</div>}
            {p.variables.map((v) => (
              <div className="variable" key={v.id}>
                <div className="variable-heading">
                  <button onClick={() => setVariableOpen(variableOpen === v.id ? null : v.id)}>
                    <ChevronRight size={12} className={variableOpen === v.id ? 'rotate-90' : ''} />
                    <span>{v.name}</span>
                    <code>{v.type}</code>
                  </button>
                  <IconButton
                    label={`Delete variable ${v.name}`}
                    onClick={() =>
                      s.updateProject({ variables: p.variables.filter((x) => x.id !== v.id) })
                    }
                  >
                    <Trash2 size={12} />
                  </IconButton>
                </div>
                {variableOpen === v.id && (
                  <div className="variable-body">
                    <Field label="Name">
                      <input
                        maxLength={200}
                        value={v.name}
                        onChange={(e) => updateVariable(v.id, { name: e.target.value })}
                      />
                    </Field>
                    <Field label="Type">
                      <select
                        value={v.type}
                        onChange={(e) =>
                          updateVariable(v.id, {
                            type: e.target.value as Variable['type'],
                            value: {
                              bool: 'false',
                              int: '0',
                              float: '0',
                              string: '',
                              Vector3: '[0,0,0]',
                            }[e.target.value],
                          })
                        }
                      >
                        {variableTypes.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Default value">
                      <input
                        maxLength={100000}
                        value={v.value}
                        onChange={(e) => updateVariable(v.id, { value: e.target.value })}
                      />
                    </Field>
                  </div>
                )}
              </div>
            ))}
          </>
        ) : node ? (
          <>
            <div className="inspector-node-heading">
              <span style={{ color: registry[node.kind].color }}>
                <NodeIcon kind={node.kind} size={21} />
              </span>
              <div>
                <strong>{registry[node.kind].label}</strong>
                <small>{registry[node.kind].category}</small>
              </div>
              {node.kind !== 'Root' && (
                <button
                  className={`enable-toggle ${!node.disabled ? 'enabled' : ''}`}
                  role="switch"
                  aria-checked={!node.disabled}
                  aria-label="Node enabled"
                  onClick={() => s.updateNode(node.id, { disabled: !node.disabled })}
                >
                  <span />
                </button>
              )}
            </div>
            <div className="inspector-section">
              <Field label="Name">
                <input
                  aria-label="Node name"
                  maxLength={300}
                  value={node.name}
                  onChange={(e) => s.updateNode(node.id, { name: e.target.value })}
                />
              </Field>
              <div className="contract">
                <ShieldCheck size={12} />
                <code>{p.mode === 'game' ? 'IBehaviorNode' : 'IWorkflowNode'}</code>
                <Check size={11} />
              </div>
            </div>
            {!registry[node.kind].modes.includes(p.mode) && conversions[node.kind] && (
              <div className="conversion-notice">
                <span>Unavailable in {p.mode === 'game' ? 'Game AI' : 'Workflow'}</span>
                <button
                  onClick={() => {
                    const kind = conversions[node.kind]!;
                    s.updateNode(node.id, {
                      kind,
                      params: { ...registry[kind].defaults, ...node.params },
                    });
                  }}
                >
                  Convert to {registry[conversions[node.kind]!].label}
                </button>
              </div>
            )}
            {Object.keys(node.params).length > 0 && (
              <div className="inspector-section">
                <div className="section-title">PARAMETERS</div>
                {Object.entries(node.params)
                  .filter(([key]) => key !== 'mock')
                  .map(([key, value]) => renderParam(key, value))}
              </div>
            )}
            {registry[node.kind].maxChildren > 0 && (
              <div className="inspector-section">
                <div className="section-title">
                  <span>CHILD ORDER</span>
                  <small>
                    {edges.length}
                    {Number.isFinite(registry[node.kind].maxChildren)
                      ? ` / ${registry[node.kind].maxChildren}`
                      : ''}
                  </small>
                </div>
                {edges.length === 0 ? (
                  <div className="empty-small">No children connected</div>
                ) : (
                  edges.map((edge, i) => {
                    const child = p.nodes.find((n) => n.id === edge.target);
                    return (
                      child && (
                        <div className="child-row" key={edge.id}>
                          <span className="order-index">{i + 1}</span>
                          <button className="child-select" onClick={() => s.select([child.id])}>
                            <NodeIcon kind={child.kind} size={12} />
                            <span>{child.name}</span>
                          </button>
                          <button
                            className="tiny-button"
                            aria-label={`Move ${child.name} up`}
                            disabled={i === 0}
                            onClick={() => reorder(i, -1)}
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            className="tiny-button"
                            aria-label={`Move ${child.name} down`}
                            disabled={i === edges.length - 1}
                            onClick={() => reorder(i, 1)}
                          >
                            <ArrowDown size={12} />
                          </button>
                        </div>
                      )
                    );
                  })
                )}
              </div>
            )}
            {'mock' in node.params && (
              <div className="inspector-section">
                <div className="section-title">SIMULATION</div>
                {renderParam('mock', node.params.mock)}
              </div>
            )}
            {issues
              .filter((i) => i.nodeId === node.id)
              .map((issue) => (
                <div className={`inspector-issue ${issue.severity}`} key={issue.id}>
                  {issue.message}
                </div>
              ))}
            <div className="node-meta">
              <code>{node.id.slice(0, 16)}</code>
              <div>
                <IconButton label="Disconnect node" onClick={() => s.disconnectNode(node.id)}>
                  <Link2Off size={14} />
                </IconButton>
                <IconButton
                  label="Duplicate node"
                  disabled={node.kind === 'Root'}
                  onClick={() => s.duplicate()}
                >
                  <Copy size={14} />
                </IconButton>
                <IconButton
                  label="Delete node"
                  disabled={node.kind === 'Root'}
                  onClick={() => s.removeSelected()}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="inspector-node-heading">
              <SlidersHorizontal size={21} />
              <div>
                <strong>Project settings</strong>
                <small>{p.mode === 'game' ? 'Game AI · Unity / .NET' : 'Workflow · .NET'}</small>
              </div>
            </div>
            <div className="inspector-section">
              <Field label="Project name">
                <input
                  aria-label="Project name"
                  maxLength={200}
                  value={p.name}
                  onChange={(e) => s.updateProject({ name: e.target.value })}
                />
              </Field>
              <Field label="Namespace">
                <input
                  aria-label="Namespace"
                  maxLength={300}
                  value={p.settings.namespace}
                  onChange={(e) =>
                    s.updateProject({ settings: { ...p.settings, namespace: e.target.value } })
                  }
                />
              </Field>
              <Field label="Class name">
                <input
                  aria-label="Class name"
                  maxLength={200}
                  value={p.settings.className}
                  onChange={(e) =>
                    s.updateProject({ settings: { ...p.settings, className: e.target.value } })
                  }
                />
              </Field>
            </div>
            <div className="inspector-section">
              <div className="section-title">RUNTIME CONTRACT</div>
              <div className="contract">
                <ShieldCheck size={13} />
                <code>{p.mode === 'game' ? 'IBehaviorNode' : 'IWorkflowNode'}</code>
                <Check size={12} />
              </div>
              <p className="inspector-note">
                Handlers implement <code>I{p.settings.className}Handlers</code>. Missing
                implementations fail at compile time.
              </p>
            </div>
            <div className="inspector-section">
              <div className="section-title">PROJECT</div>
              <div className="info-row">
                <span>Schema</span>
                <code>v{p.schemaVersion}</code>
              </div>
              <div className="info-row">
                <span>Nodes</span>
                <code>{p.nodes.length}</code>
              </div>
              <div className="info-row">
                <span>Connections</span>
                <code>{p.edges.length}</code>
              </div>
              <div className="info-row">
                <span>Storage</span>
                <code>Local browser</code>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
