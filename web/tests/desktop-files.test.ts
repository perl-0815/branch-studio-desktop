import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseProject,
  parseProjectText,
  readProjectFile,
  canConnect,
  toAst,
} from '../src/lib/graph';
import {
  assertProjectTextSize,
  MAX_PROJECT_BYTES,
  MAX_PROJECT_DEPTH,
  MAX_PROJECT_NODES,
} from '../src/lib/project-limits';
import { createSample } from '../src/lib/samples';
import { useEditorStore } from '../src/lib/store';
import type { GraphNode, Project } from '../src/lib/types';

function chain(count: number): Project {
  const project = createSample('game');
  project.nodes = Array.from({ length: count }, (_, i): GraphNode => ({
    id: `n${i}`,
    kind: i === 0 ? 'Root' : i === count - 1 ? 'Action' : 'Inverter',
    name: `Node ${i}`,
    position: { x: 0, y: i },
    params: i === count - 1 ? { method: 'Act', arguments: '' } : {},
    disabled: false,
  }));
  project.edges = Array.from({ length: count - 1 }, (_, i) => ({
    id: `e${i}`,
    source: `n${i}`,
    target: `n${i + 1}`,
    order: 0,
  }));
  return project;
}

describe('desktop project input bounds', () => {
  beforeEach(() =>
    useEditorStore.setState({
      project: createSample('game'),
      selectedIds: [],
      past: [],
      future: [],
      operationError: null,
    }),
  );
  it('uses the same parser for native text, browser files, and saved JSON', async () => {
    const sample = createSample('workflow');
    const content = JSON.stringify(sample);
    expect(parseProjectText(content)).toEqual(sample);
    expect(await readProjectFile({ size: content.length, text: async () => content })).toEqual(
      sample,
    );
  });
  it('rejects oversized browser files before reading them', async () => {
    const text = vi.fn(async () => '{}');
    await expect(readProjectFile({ size: MAX_PROJECT_BYTES + 1, text })).rejects.toThrow('5 MiB');
    expect(text).not.toHaveBeenCalled();
  });
  it('measures UTF-8 bytes, rather than only JavaScript string length', () => {
    expect(() => assertProjectTextSize('a'.repeat(MAX_PROJECT_BYTES))).not.toThrow();
    expect(() => assertProjectTextSize('界'.repeat(Math.ceil(MAX_PROJECT_BYTES / 3)))).toThrow(
      '5 MiB',
    );
    expect(() => parseProjectText(' '.repeat(MAX_PROJECT_BYTES + 1))).toThrow('5 MiB');
  });
  it('accepts depth512 and rejects513 before recursive AST processing', () => {
    const accepted = parseProject(chain(MAX_PROJECT_DEPTH));
    expect(() => toAst(accepted)).not.toThrow();
    expect(() => parseProject(chain(MAX_PROJECT_DEPTH + 1))).toThrow('512 levels');
  });
  it('handles a reversed node inventory without losing the actual path-depth bound', () => {
    const project = chain(MAX_PROJECT_DEPTH + 1);
    project.nodes.reverse();
    expect(() => parseProject(project)).toThrow('512 levels');
  });
  it('caps disconnected node inventories as well as reachable trees', () => {
    const project = chain(2);
    for (let i = 2; i < MAX_PROJECT_NODES; i++)
      project.nodes.push({ ...project.nodes[1], id: `extra${i}` });
    expect(parseProject(project).nodes).toHaveLength(MAX_PROJECT_NODES);
    project.nodes.push({ ...project.nodes[1], id: 'overflow' });
    expect(() => parseProject(project)).toThrow();
  });
  it('preserves the current project and history when a native/browser import exceeds bounds', () => {
    const before = useEditorStore.getState().project;
    expect(() => useEditorStore.getState().loadProject(chain(MAX_PROJECT_DEPTH + 1))).toThrow();
    expect(useEditorStore.getState().project).toBe(before);
    expect(useEditorStore.getState().past).toEqual([]);
  });
  it('refuses editor operations that exceed node or depth bounds without creating undo history', () => {
    const project = chain(2);
    for (let i = 2; i < MAX_PROJECT_NODES; i++)
      project.nodes.push({ ...project.nodes[1], id: `extra${i}` });
    useEditorStore.setState({ project });
    expect(useEditorStore.getState().addNode('Action', { x: 0, y: 0 })).toBeUndefined();
    expect(useEditorStore.getState().project).toBe(project);
    expect(useEditorStore.getState().operationError).toContain('2000');
    expect(useEditorStore.getState().past).toEqual([]);
    const deep = chain(MAX_PROJECT_DEPTH);
    deep.nodes.at(-1)!.kind = 'Inverter';
    deep.nodes.push({ ...project.nodes[1], id: 'unconnected' });
    expect(canConnect(deep, `n${MAX_PROJECT_DEPTH - 1}`, 'unconnected')).toBe(false);
  });
});

describe('HybridWebView raw file bridge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  const fakeHost = () =>
    Object.assign(new EventTarget(), { HybridWebView: { SendRawMessage: vi.fn() } });
  const reply = (host: EventTarget, message: unknown) =>
    host.dispatchEvent(
      new CustomEvent('HybridWebViewMessageReceived', {
        detail: { message: JSON.stringify(message) },
      }),
    );
  const module = async () => {
    vi.resetModules();
    return import('../src/lib/native-files');
  };

  it('keeps normal browsers on file-input/download fallbacks without loading MAUI resources', async () => {
    const appendChild = vi.fn();
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', { head: { appendChild } });
    const files = await module();
    expect(await files.initializeNativeFiles()).toBe(false);
    expect(await files.openNativeProject()).toBeNull();
    expect(await files.saveNativeFile('test.cs', 'text')).toBeNull();
    expect(appendChild).not.toHaveBeenCalled();
  });
  it('loads the framework script only for a detected native transport', async () => {
    const host = Object.assign(new EventTarget(), {
      chrome: { webview: { postMessage: vi.fn() } },
    }) as ReturnType<typeof fakeHost> & { chrome: unknown };
    const script = { src: '', async: false, onload: null as null | (() => void), remove: vi.fn() };
    const appendChild = vi.fn(() => {
      host.HybridWebView = { SendRawMessage: vi.fn() };
      script.onload?.();
    });
    vi.stubGlobal('window', host);
    vi.stubGlobal('document', { createElement: () => script, head: { appendChild } });
    expect(await (await module()).initializeNativeFiles()).toBe(true);
    expect(script.src).toBe('/_framework/hybridwebview.js');
    expect(appendChild).toHaveBeenCalledOnce();
  });
  it('correlates responses and ignores unrelated, malformed, or wrong-operation messages', async () => {
    const host = fakeHost();
    vi.stubGlobal('window', host);
    const files = await module();
    const opened = files.openNativeProject();
    await Promise.resolve();
    await Promise.resolve();
    const request = JSON.parse(host.HybridWebView.SendRawMessage.mock.calls[0][0]);
    expect(request.type).toBe('openProject');
    expect(typeof request.requestId).toBe('string');
    reply(host, {
      type: 'projectOpened',
      requestId: 'other',
      fileName: 'other.json',
      content: '{}',
    });
    reply(host, { type: 'fileSaved', requestId: request.requestId, fileName: 'wrong.cs' });
    host.dispatchEvent(
      new CustomEvent('HybridWebViewMessageReceived', { detail: { message: '{invalid' } }),
    );
    reply(host, {
      type: 'projectOpened',
      requestId: request.requestId,
      fileName: 'valid.json',
      content: '{}',
    });
    await expect(opened).resolves.toEqual({ fileName: 'valid.json', content: '{}' });
  });
  it('sends exact export text/mime and waits for native save completion', async () => {
    const host = fakeHost();
    vi.stubGlobal('window', host);
    const files = await module();
    const saved = files.saveNativeFile('tree.json', '{"name":"狐"}', 'application/json');
    await Promise.resolve();
    await Promise.resolve();
    const request = JSON.parse(host.HybridWebView.SendRawMessage.mock.calls[0][0]);
    expect(request).toMatchObject({
      type: 'saveFile',
      fileName: 'tree.json',
      content: '{"name":"狐"}',
      mimeType: 'application/json',
    });
    reply(host, { type: 'fileSaved', requestId: request.requestId, fileName: 'tree.json' });
    await expect(saved).resolves.toEqual({ fileName: 'tree.json' });
  });
  it('propagates cancellation without a false successful result', async () => {
    const host = fakeHost();
    vi.stubGlobal('window', host);
    const files = await module();
    const opened = files.openNativeProject();
    const rejected = expect(opened).rejects.toMatchObject({ cancelled: true, code: 'cancelled' });
    await Promise.resolve();
    await Promise.resolve();
    const request = JSON.parse(host.HybridWebView.SendRawMessage.mock.calls[0][0]);
    reply(host, {
      type: 'operationFailed',
      requestId: request.requestId,
      operation: 'openProject',
      code: 'cancelled',
      message: 'Cancelled',
      cancelled: true,
    });
    await rejected;
  });
  it('rejects oversized native content before it reaches the project parser', async () => {
    const host = fakeHost();
    vi.stubGlobal('window', host);
    const files = await module();
    const opened = files.openNativeProject();
    const rejected = expect(opened).rejects.toThrow('5 MiB');
    await Promise.resolve();
    await Promise.resolve();
    const request = JSON.parse(host.HybridWebView.SendRawMessage.mock.calls[0][0]);
    reply(host, {
      type: 'projectOpened',
      requestId: request.requestId,
      fileName: 'large.json',
      content: 'x'.repeat(MAX_PROJECT_BYTES + 1),
    });
    await rejected;
  });
  it('releases requests on page close and missing host response', async () => {
    const host = fakeHost();
    vi.stubGlobal('window', host);
    const files = await module();
    vi.useFakeTimers();
    const opened = files.openNativeProject();
    const closing = expect(opened).rejects.toMatchObject({ code: 'closed', cancelled: true });
    await Promise.resolve();
    await Promise.resolve();
    host.dispatchEvent(new Event('pagehide'));
    await closing;
    const saved = files.saveNativeFile('tree.cs', 'source');
    const timeout = expect(saved).rejects.toMatchObject({ code: 'timeout' });
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await timeout;
  });
});
