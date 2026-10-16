'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  useReactFlow,
  useNodesInitialized,
  ConnectionLineType,
  type AriaLabelConfig,
  type Connection,
  type NodeChange,
  type OnConnectEnd,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  GitBranch,
  ChevronDown,
  Undo2,
  Redo2,
  ShieldCheck,
  Braces,
  Download,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Upload,
  Search,
  FolderOpen,
  Database,
  FileCode2,
  Copy,
  Check,
  X,
  Plus,
  Maximize,
  ZoomIn,
  ZoomOut,
  Map as MapIcon,
  Network,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleCheck,
  AlertCircle,
  AlertTriangle,
  Terminal,
  Keyboard,
  Gamepad2,
  Workflow,
  Trash2,
  Link2Off,
  ExternalLink,
  Type,
} from 'lucide-react';
import type { CodeResult, NodeKind, Project, Status } from '@/lib/types';
import { useEditorStore } from '@/lib/store';
import { canConnect, parseProjectText, readProjectFile, toAst } from '@/lib/graph';
import {
  initializeNativeFiles,
  isNativeHost,
  NativeOperationError,
  openNativeProject,
  saveNativeFile,
} from '@/lib/native-files';
import { validateProject } from '@/lib/validation';
import { createSample } from '@/lib/samples';
import { generateCSharp } from '@/lib/generator';
import { createSimulation } from '@/lib/simulator';
import { definitions, registry } from '@/lib/registry';
import BehaviorNode, { type FlowNode } from './behavior-node';
import Library from './library';
import Inspector from './inspector';
import CodePreview from './code-preview';
import AppearanceSettings from './appearance-settings';
import ProjectTabs from './project-tabs';
import CloseProjectDialog from './close-project-dialog';
import { createEmptyProject, parseWorkspaceText, serializeWorkspace } from '@/lib/workspace';
import {
  APPEARANCE_STORAGE_KEY,
  defaultAppearance,
  parseAppearance,
  type AppearancePreferences,
} from '@/lib/appearance';
import NodeIcon from './node-icon';
import { Button, IconButton, TooltipProvider } from './ui/button';
import { I18nProvider } from '@/lib/i18n';
import { createTranslator } from '@/lib/localization';
const nodeTypes = { behavior: BehaviorNode };
const STORAGE_KEY = 'branch-studio.project.v1';
const WORKSPACE_KEY = 'branch-studio.workspace.v1';
function download(filename: string, content: string, type = 'text/plain') {
  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([content], { type }));
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type QuickMenu = {
  x: number;
  y: number;
  flow: { x: number; y: number };
  parentId?: string;
  kind: 'add' | 'context' | 'find';
};
type SimSnapshot = {
  statuses: Record<string, Status>;
  result: Status;
  logs: string[];
  tick: number;
};
export default function Editor() {
  return (
    <TooltipProvider>
      <ReactFlowProvider>
        <EditorWorkspace />
      </ReactFlowProvider>
    </TooltipProvider>
  );
}
function EditorWorkspace() {
  const s = useEditorStore();
  const p = s.project;
  const flow = useReactFlow<FlowNode>();
  const nodesInitialized = useNodesInitialized();
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState<'saved' | 'saving' | 'error'>('saved');
  const [notice, setNotice] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<'node' | 'data'>('node');
  const [tab, setTab] = useState<'problems' | 'code' | 'console'>('code');
  const [bottomHeight, setBottomHeight] = useState(255);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [miniMap, setMiniMap] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [exportOpen, setExportOpen] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [appearance, setAppearance] = useState<AppearancePreferences>(defaultAppearance);
  const t = useMemo(() => createTranslator(appearance.language), [appearance.language]);
  const flowAriaLabels = useMemo<Partial<AriaLabelConfig>>(
    () =>
      appearance.language === 'ja'
        ? {
            'node.a11yDescription.default':
              'EnterまたはSpaceでノードを選択します。Deleteで削除、Escapeで選択を解除します。',
            'node.a11yDescription.keyboardDisabled':
              'EnterまたはSpaceで選択し、矢印キーで移動します。Deleteで削除、Escapeで選択を解除します。',
            'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) =>
              `選択中のノードを${({ left: '左', right: '右', up: '上', down: '下' } as Record<string, string>)[direction] ?? direction}に移動しました。位置: x ${x}、y ${y}`,
            'edge.a11yDescription.default':
              'EnterまたはSpaceで接続を選択します。Deleteで削除、Escapeで選択を解除します。',
            'controls.ariaLabel': 'キャンバス操作',
            'controls.zoomIn.ariaLabel': '拡大',
            'controls.zoomOut.ariaLabel': '縮小',
            'controls.fitView.ariaLabel': '全体を表示',
            'controls.interactive.ariaLabel': '操作の有効・無効を切り替え',
            'minimap.ariaLabel': 'ミニマップ',
            'handle.ariaLabel': '接続ハンドル',
          }
        : {},
    [appearance.language],
  );
  const [appearanceSaveUnavailable, setAppearanceSaveUnavailable] = useState(false);
  const [quick, setQuick] = useState<QuickMenu | null>(null);
  const [quickQuery, setQuickQuery] = useState('');
  const [quickIndex, setQuickIndex] = useState(0);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [fileOperation, setFileOperation] = useState<'open' | 'save' | null>(null);
  const [closingDocumentId, setClosingDocumentId] = useState<string | null>(null);
  const [closeSaveError, setCloseSaveError] = useState(false);
  const [simState, setSimState] = useState<SimSnapshot | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const connectSource = useRef<string | null>(null);
  const quickInput = useRef<HTMLInputElement>(null);
  const ignorePaneClick = useRef(false);
  const recoveryBlocked = useRef(false); // preserve unreadable saved data until explicit recovery
  const restoredDocument = useRef<string | null>(null);
  const restoringViewport = useRef(false);
  const viewportOwner = useRef<string | null>(null);
  const viewportRequest = useRef(0);
  const [measurements, setMeasurements] = useState(
    () => new Map<string, { width: number; height: number }>(),
  );
  const issues = useMemo(() => validateProject(p), [p]);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const errorIds = useMemo(
    () => new Set(issues.filter((i) => i.severity === 'error').map((i) => i.nodeId)),
    [issues],
  );
  const semanticKey = JSON.stringify({
    mode: p.mode,
    settings: p.settings,
    variables: p.variables,
    nodes: p.nodes.map(({ position, params, ...n }) => ({
      ...n,
      params: Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'mock')),
    })),
    edges: p.edges,
  });
  const generationProject = useMemo(() => p, [semanticKey]);
  const deferredProject = useDeferredValue(generationProject);
  const generation = useMemo<{ result: CodeResult | null; error?: string }>(() => {
    try {
      if (validateProject(deferredProject).some((i) => i.severity === 'error'))
        return { result: null };
      return { result: generateCSharp(toAst(deferredProject)) };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : 'Code generation failed' };
    }
  }, [deferredProject]);
  const codeResult =
    !errors.length && generationProject === deferredProject ? generation.result : null;
  const simulator = useMemo(() => {
    try {
      return createSimulation(toAst(p));
    } catch {
      return null;
    }
  }, [semanticKey, s.activeDocumentId]); // positions never reset execution
  const mockKey = JSON.stringify(
    p.nodes.filter((n) => 'mock' in n.params).map((n) => [n.id, n.params.mock]),
  );
  useEffect(() => {
    if (!simulator) return;
    for (const n of p.nodes) {
      if (
        'mock' in registry[n.kind].defaults &&
        ['Success', 'Failure', 'Running'].includes(String(n.params.mock))
      )
        simulator.setMock(n.id, n.params.mock as 'Success' | 'Failure' | 'Running');
    }
  }, [simulator, mockKey]);
  const addLog = useCallback(
    (message: string) => setLogs((old) => [...old.slice(-199), message]),
    [],
  );
  const notify = useCallback((message: string) => {
    setNotice(message);
  }, []);
  const updateAppearance = (next: AppearancePreferences) => {
    setAppearance(next);
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
      setAppearanceSaveUnavailable(false);
    } catch {
      setAppearanceSaveUnavailable(true);
    }
  };
  useEffect(() => {
    try {
      const saved = localStorage.getItem(APPEARANCE_STORAGE_KEY);
      if (saved) setAppearance(parseAppearance(JSON.parse(saved)));
    } catch {
      // Unreadable preferences never prevent the editor or saved project from opening.
    }
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--ui-text-scale',
      String(appearance.textScale / 100),
    );
  }, [appearance.textScale]);
  useEffect(() => {
    document.documentElement.lang = appearance.language;
  }, [appearance.language]);
  useEffect(() => {
    void initializeNativeFiles().catch((error) =>
      notify(error instanceof Error ? error.message : 'Desktop file bridge is unavailable.'),
    );
  }, [notify]);
  useEffect(() => {
    if (!s.operationError) return;
    notify(s.operationError);
    s.clearOperationError();
  }, [s.operationError, s.clearOperationError, notify]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    if (window.innerWidth < 720) {
      setLeftOpen(false);
      setRightOpen(false);
    }
    try {
      const workspace = localStorage.getItem(WORKSPACE_KEY);
      if (workspace) s.hydrateWorkspace(parseWorkspaceText(workspace));
      else {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved)
          s.hydrateWorkspace({
            schemaVersion: 1,
            activeDocumentId: 'restored-project',
            documents: [{ id: 'restored-project', project: parseProjectText(saved) }],
          });
      }
    } catch {
      recoveryBlocked.current = true;
      setNotice('Saved workspace could not be restored. Your saved data has been preserved.');
      setSaved('error');
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    if (recoveryBlocked.current) return;
    setSaved('saving');
    const id = setTimeout(() => {
      try {
        localStorage.setItem(WORKSPACE_KEY, serializeWorkspace(useEditorStore.getState()));
        setSaved('saved');
      } catch {
        setSaved('error');
      }
    }, 600);
    return () => clearTimeout(id);
  }, [p, s.documents, s.activeDocumentId, s.viewport, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    // Commit the current store snapshot before navigation can discard the debounce timer.
    const flush = () => {
      if (recoveryBlocked.current) return;
      try {
        localStorage.setItem(WORKSPACE_KEY, serializeWorkspace(useEditorStore.getState()));
        setSaved('saved');
      } catch {
        setSaved('error');
      }
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flushWhenHidden);
    };
  }, [hydrated]);
  useEffect(() => {
    if (!hydrated || !nodesInitialized || !flow.viewportInitialized) return;
    if (restoredDocument.current === s.activeDocumentId) return;
    const documentId = s.activeDocumentId;
    const request = ++viewportRequest.current;
    restoringViewport.current = true;
    restoredDocument.current = documentId;
    const viewport = useEditorStore.getState().viewport;
    const restore = viewport
      ? flow.setViewport(viewport, { duration: 0 })
      : flow.fitView({ padding: 0.2, maxZoom: 1, duration: 0 });
    void restore.finally(() => {
      if (
        useEditorStore.getState().activeDocumentId !== documentId ||
        viewportRequest.current !== request
      )
        return;
      viewportOwner.current = documentId;
      restoringViewport.current = false;
      useEditorStore.getState().setViewport(flow.getViewport());
      setZoom(Math.round(flow.getZoom() * 100));
    });
  }, [hydrated, nodesInitialized, s.activeDocumentId, flow]);
  const captureViewport = () => {
    const state = useEditorStore.getState();
    if (
      flow.viewportInitialized &&
      !restoringViewport.current &&
      viewportOwner.current === state.activeDocumentId
    ) {
      const viewport = flow.getViewport();
      void flow.setViewport(viewport, { duration: 0 });
      state.setViewport(viewport);
    }
  };
  const resetViewportOwner = () => {
    viewportOwner.current = null;
    restoredDocument.current = null;
    restoringViewport.current = true;
    viewportRequest.current++;
  };
  useEffect(() => {
    setSelectedEdges([]);
    setLogs([]);
    setQuick(null);
    setExportOpen(false);
    setSamplesOpen(false);
    connectSource.current = null;
  }, [s.activeDocumentId]);
  useEffect(() => {
    setRunning(false);
    setSimState(null);
  }, [simulator]);
  const step = useCallback(() => {
    if (!simulator) {
      notify('Resolve validation errors before simulation.');
      setTab('problems');
      setBottomOpen(true);
      return;
    }
    const snapshot = simulator.step(0.25);
    setSimState(snapshot);
    setTab('console');
    setBottomOpen(true);
    if (snapshot.result !== 'Running') setRunning(false);
  }, [simulator, notify]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(step, 400);
    return () => clearInterval(id);
  }, [running, step]);
  const save = useCallback(() => {
    try {
      localStorage.setItem(WORKSPACE_KEY, serializeWorkspace(useEditorStore.getState()));
      recoveryBlocked.current = false;
      setSaved('saved');
      notify('All open trees saved locally.');
    } catch {
      setSaved('error');
      notify('Local storage is unavailable. Export JSON to save your project.');
    }
  }, [notify]);
  const generate = useCallback(() => {
    setBottomOpen(true);
    if (errors.length) {
      setTab('problems');
      notify(`${errors.length} ${errors.length === 1 ? 'error needs' : 'errors need'} attention.`);
    } else {
      setTab('code');
      addLog(
        `Generated ${p.settings.className}.cs · ${p.nodes.length} nodes · ${p.mode === 'game' ? 'Game AI' : 'Workflow'}`,
      );
      notify('C# generated successfully.');
    }
  }, [errors.length, p, notify, addLog]);
  const focusNode = useCallback(
    (id: string) => {
      s.select([id]);
      setRightOpen(true);
      setInspectorTab('node');
      flow.fitView({ nodes: [{ id }], duration: 250, padding: 1.5, maxZoom: 1.15 });
    },
    [s.select, flow],
  );
  const openQuick = useCallback(
    (kind: QuickMenu['kind'] = 'add', point?: { x: number; y: number }, parentId?: string) => {
      const rect = graphRef.current?.getBoundingClientRect();
      const screen = point ?? {
        x: (rect?.left ?? 200) + (rect?.width ?? 600) / 2 - 120,
        y: (rect?.top ?? 100) + 80,
      };
      setQuick({
        x: Math.min(screen.x, window.innerWidth - 305),
        y: Math.min(screen.y, window.innerHeight - 410),
        flow: flow.screenToFlowPosition(screen),
        kind,
        parentId,
      });
      setQuickQuery('');
      setQuickIndex(0);
    },
    [flow],
  );
  useEffect(() => {
    if (quick) quickInput.current?.focus();
  }, [quick]);
  const addNode = useCallback(
    (kind: NodeKind, position?: { x: number; y: number }, parentId?: string) => {
      const rect = graphRef.current?.getBoundingClientRect();
      const point =
        position ??
        flow.screenToFlowPosition({
          x: (rect?.left ?? 0) + (rect?.width ?? 700) / 2 - 90,
          y: (rect?.top ?? 0) + (rect?.height ?? 500) / 2 - 40,
        });
      const id = s.addNode(kind, point, parentId);
      if (id) {
        setRightOpen(true);
        setInspectorTab('node');
        setQuick(null);
        addLog(`Added ${registry[kind].label}`);
      }
    },
    [s.addNode, flow, addLog],
  );
  const quickItems = useMemo(
    () =>
      quick?.kind === 'find'
        ? p.nodes
            .filter((n) =>
              `${n.name} ${n.kind} ${t(registry[n.kind].label)}`
                .toLowerCase()
                .includes(quickQuery.toLowerCase()),
            )
            .map((n) => ({ id: n.id, label: n.name, kind: n.kind, detail: registry[n.kind].label }))
        : definitions
            .filter(
              (d) =>
                d.kind !== 'Root' &&
                d.modes.includes(p.mode) &&
                `${d.label} ${d.category} ${d.description} ${d.aliases} ${t(d.label)} ${t(d.category)} ${t(d.description)}`
                  .toLowerCase()
                  .includes(quickQuery.toLowerCase()),
            )
            .map((d) => ({ id: d.kind, label: d.label, kind: d.kind, detail: d.category })),
    [quick?.kind, p, quickQuery, t],
  );
  const chooseQuick = (index: number) => {
    const item = quickItems[index];
    if (!item || !quick) return;
    if (quick.kind === 'find') {
      focusNode(item.id);
      setQuick(null);
    } else addNode(item.kind, quick.flow, quick.parentId);
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (appearanceOpen || document.querySelector('dialog[open]')) return;
      const target = e.target as HTMLElement;
      const input = target.closest(
        'input, textarea, select, [contenteditable="true"], .monaco-editor, [role="tablist"]',
      );
      if (input) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (shortcuts) {
        if (key === 'escape') setShortcuts(false);
        return;
      }
      if (key === 'escape') {
        setQuick(null);
        setExportOpen(false);
        setSamplesOpen(false);
        setShortcuts(false);
        return;
      }
      if (mod && key === 'z') {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
      } else if (mod && key === 'c') {
        e.preventDefault();
        s.copy();
        notify('Selection copied.');
      } else if (mod && key === 'v') {
        e.preventDefault();
        s.paste();
      } else if (mod && key === 'd') {
        e.preventDefault();
        s.duplicate();
      } else if (mod && key === 'a') {
        e.preventDefault();
        s.select(p.nodes.map((n) => n.id));
      } else if (mod && key === 's') {
        e.preventDefault();
        save();
      } else if (mod && e.key === 'Enter') {
        e.preventDefault();
        generate();
      } else if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        s.removeSelected(selectedEdges);
        setSelectedEdges([]);
      } else if (key === ' ' && !target.closest('button')) {
        e.preventDefault();
        openQuick();
      } else if (key === 'f' && !mod) {
        e.preventDefault();
        flow.fitView({ duration: 200, padding: 0.2 });
      } else if (key === '/' && !mod) {
        e.preventDefault();
        (document.querySelector('.library .search-box input') as HTMLInputElement)?.focus();
      } else if (key === '?' && !mod) {
        setShortcuts((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    s,
    p.nodes,
    save,
    generate,
    notify,
    openQuick,
    flow,
    selectedEdges,
    shortcuts,
    appearanceOpen,
  ]);
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const dimensions = changes.filter(
        (change) => change.type === 'dimensions' && change.dimensions,
      );
      if (dimensions.length)
        setMeasurements((current) => {
          const next = new Map(current);
          let changed = false;
          for (const change of dimensions) {
            if (change.type !== 'dimensions' || !change.dimensions) continue;
            const previous = current.get(change.id);
            if (
              previous?.width === change.dimensions.width &&
              previous?.height === change.dimensions.height
            )
              continue;
            next.set(change.id, change.dimensions);
            changed = true;
          }
          return changed ? next : current;
        });
      const positions: Record<string, { x: number; y: number }> = {};
      const selected = new Set(useEditorStore.getState().selectedIds);
      let selectionChanged = false;
      for (const c of changes) {
        if (c.type === 'select') {
          if (c.selected) selected.add(c.id);
          else selected.delete(c.id);
          selectionChanged = true;
        }
        if (c.type === 'position' && c.position) positions[c.id] = c.position;
        if (c.type === 'remove') s.removeNodes([c.id]);
      }
      if (selectionChanged) {
        const ids = [...selected];
        if (JSON.stringify(ids) !== JSON.stringify(useEditorStore.getState().selectedIds))
          useEditorStore.getState().select(ids);
      }
      if (Object.keys(positions).length) s.moveNodes(positions, false);
    },
    [s.moveNodes, s.removeNodes],
  );
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!s.connect(connection.source, connection.target))
        notify('Connection rejected: check parent, capacity, and cycles.');
    },
    [s.connect, notify],
  );
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      const source = connectSource.current;
      connectSource.current = null;
      if (!source || state.isValid || state.toNode) return;
      const mouse = 'changedTouches' in event ? event.changedTouches[0] : event;
      if (mouse) {
        ignorePaneClick.current = true;
        openQuick('add', { x: mouse.clientX, y: mouse.clientY }, source);
      }
    },
    [openQuick],
  );
  const nodeDataCache = useRef(new Map<string, FlowNode['data']>());
  const flowNodes: FlowNode[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of p.edges) counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
    const currentIds = new Set(p.nodes.map((node) => node.id));
    for (const id of nodeDataCache.current.keys()) {
      if (!currentIds.has(id)) nodeDataCache.current.delete(id);
    }
    return p.nodes.map((node) => {
      const error = errorIds.has(node.id);
      const status = node.kind === 'Root' ? simState?.result : simState?.statuses[node.id];
      const childCount = counts.get(node.id) ?? 0;
      let data = nodeDataCache.current.get(node.id);
      if (
        !data ||
        data.node !== node ||
        data.error !== error ||
        data.status !== status ||
        data.childCount !== childCount
      ) {
        data = { node, error, status, childCount };
        nodeDataCache.current.set(node.id, data);
      }
      return {
        id: node.id,
        type: 'behavior',
        position: node.position,
        selected: s.selectedIds.includes(node.id),
        measured: measurements.get(node.id),
        data,
      };
    });
  }, [p, s.selectedIds, errorIds, simState, measurements]);
  const flowEdges = useMemo(
    () =>
      p.edges.map((edge) => ({
        ...edge,
        type: 'smoothstep',
        label: String(edge.order + 1),
        selected: selectedEdges.includes(edge.id),
        style: {
          stroke: simState?.statuses[edge.target] === 'Running' ? '#a5be89' : '#4a5257',
          strokeWidth: 1.4,
        },
        labelStyle: {
          fill: '#919b9d',
          fontSize: (10 * appearance.textScale) / 100,
          fontFamily: 'monospace',
        },
        labelBgStyle: { fill: '#171a1c', fillOpacity: 1 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
      })),
    [p.edges, selectedEdges, simState, appearance.textScale],
  );
  const applyImportedProject = (project: Project, fileName: string) => {
    captureViewport();
    s.createDocument(project);
    resetViewportOwner();
    recoveryBlocked.current = false;
    notify(`Imported ${project.name}.`);
    addLog(`Imported ${fileName}`);
  };
  const reportFileError = (error: unknown, operation: 'Open' | 'Save') => {
    if (error instanceof NativeOperationError && error.cancelled) return;
    notify(
      `${operation} failed: ${error instanceof Error ? error.message : 'File operation failed.'}`,
    );
  };
  const openProject = async () => {
    setExportOpen(false);
    setSamplesOpen(false);
    if (!isNativeHost()) {
      fileInput.current?.click();
      return;
    }
    setFileOperation('open');
    try {
      const file = await openNativeProject(appearance.language);
      if (!file) throw new Error('Desktop file bridge is unavailable.');
      applyImportedProject(parseProjectText(file.content), file.fileName);
    } catch (error) {
      reportFileError(error, 'Open');
    } finally {
      setFileOperation(null);
    }
  };
  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = e.target.files?.[0];
    if (!file) return;
    setFileOperation('open');
    try {
      applyImportedProject(await readProjectFile(file), file.name);
    } catch (error) {
      notify(`Import failed: ${error instanceof Error ? error.message : 'Invalid project'}`);
    } finally {
      input.value = '';
      setFileOperation(null);
    }
  };
  const saveExport = async (
    filename: string,
    source: string | (() => Promise<string>),
    type = 'text/plain',
  ) => {
    setExportOpen(false);
    setFileOperation('save');
    try {
      const content = typeof source === 'string' ? source : await source();
      const savedFile = await saveNativeFile(filename, content, type);
      if (savedFile) {
        notify(`Saved ${savedFile.fileName}.`);
        addLog(`Saved ${savedFile.fileName}`);
      } else download(filename, content, type);
      return true;
    } catch (error) {
      reportFileError(error, 'Save');
      return false;
    } finally {
      setFileOperation(null);
    }
  };
  const exportCs = () => {
    if (!codeResult || errors.length) {
      generate();
      return;
    }
    void saveExport(`${p.settings.className}.cs`, codeResult.code);
  };
  const copyCs = async () => {
    if (!codeResult) return;
    setExportOpen(false);
    try {
      await navigator.clipboard.writeText(codeResult.code);
      notify('C# copied to clipboard.');
    } catch {
      notify('Clipboard is unavailable. Download the C# file instead.');
    }
  };
  const newProject = () => {
    const current = useEditorStore.getState();
    const names = new Set(
      current.documents.map((doc) =>
        doc.id === current.activeDocumentId ? current.project.name : doc.project.name,
      ),
    );
    let name = 'Untitled tree';
    for (let number = 2; names.has(name); number++) name = `Untitled tree ${number}`;
    try {
      captureViewport();
      s.createDocument(createEmptyProject(current.project.mode, name));
      resetViewportOwner();
      recoveryBlocked.current = false;
      setTab('problems');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not create a tree.');
    }
  };
  const selectDocument = (documentId: string) => {
    if (documentId === useEditorStore.getState().activeDocumentId) return;
    captureViewport();
    resetViewportOwner();
    s.switchDocument(documentId);
  };
  const closeDocument = (documentId: string) => {
    captureViewport();
    const previousId = useEditorStore.getState().activeDocumentId;
    if (!s.closeDocument(documentId)) return;
    if (useEditorStore.getState().activeDocumentId !== previousId) resetViewportOwner();
    setClosingDocumentId(null);
    requestAnimationFrame(() =>
      document.getElementById(`project-tab-${useEditorStore.getState().activeDocumentId}`)?.focus(),
    );
  };
  const closingProject =
    closingDocumentId === s.activeDocumentId
      ? p
      : s.documents.find((doc) => doc.id === closingDocumentId)?.project;
  const saveAndCloseDocument = async () => {
    if (!closingDocumentId || !closingProject || fileOperation) return;
    setCloseSaveError(false);
    const saved = await saveExport(
      `${closingProject.name.replace(/[^a-z0-9_-]/gi, '-') || 'Untitled-tree'}.json`,
      JSON.stringify(closingProject, null, 2),
      'application/json',
    );
    if (saved) closeDocument(closingDocumentId);
    else setCloseSaveError(true);
  };
  const loadSample = (mode: Project['mode']) => {
    s.loadProject(createSample(mode));
    recoveryBlocked.current = false;
    setSamplesOpen(false);
    const documentId = s.activeDocumentId;
    setTimeout(() => {
      if (useEditorStore.getState().activeDocumentId === documentId)
        void flow.fitView({ padding: 0.18 });
    }, 100);
    notify(
      `${mode === 'game' ? 'Enemy AI' : 'Order processing'} sample loaded. Undo restores your previous tree.`,
    );
  };
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shortcuts) return;
    const before = document.activeElement as HTMLElement;
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [tabindex="0"]',
      );
      if (!items?.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', trap);
    return () => {
      window.removeEventListener('keydown', trap);
      before?.focus();
    };
  }, [shortcuts]);
  const resizePanel = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const startY = e.clientY,
      startHeight = bottomHeight;
    const move = (event: PointerEvent) =>
      setBottomHeight(
        Math.min(Math.max(120, startHeight + startY - event.clientY), window.innerHeight * 0.65),
      );
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };
  if (!hydrated)
    return (
      <div className="app-loading">
        <GitBranch size={25} />
        <span>Branch Studio</span>
      </div>
    );
  return (
    <I18nProvider language={appearance.language}>
      <div className="app-shell">
        <header className="topbar">
          <div className="project-toolbar">
            <a className="brand" href="/" aria-label="Branch Studio">
              <span className="brand-mark">
                <GitBranch size={22} strokeWidth={1.6} />
              </span>
              <span>
                branch<span className="brand-light">studio</span>
              </span>
              <span className="version">BETA</span>
            </a>
            <div className="toolbar-divider" />
            <div className="project-switch">
              <span className="project-dot" />
              <input
                aria-label={t('Rename project')}
                maxLength={200}
                value={p.name}
                onChange={(e) => s.updateProject({ name: e.target.value })}
              />
            </div>
            <div className="mode-select">
              {p.mode === 'game' ? <Gamepad2 size={14} /> : <Workflow size={14} />}
              <select
                aria-label={t('Project mode')}
                value={p.mode}
                onChange={(e) => {
                  s.setMode(e.target.value as Project['mode']);
                  notify('Mode changed. All nodes and settings are preserved.');
                }}
              >
                <option value="game">{t('Game AI')}</option>
                <option value="workflow">{t('Workflow')}</option>
              </select>
              <ChevronDown size={11} />
            </div>
            <div className="project-file-actions" role="group" aria-label={t('Project files')}>
              <Button
                variant="outline"
                aria-label={t('Open JSON')}
                title={t('Open a project JSON file')}
                disabled={!!fileOperation}
                onClick={() => void openProject()}
              >
                <Upload size={14} />
                <span>{t('Open JSON')}</span>
              </Button>
              <Button
                variant="outline"
                aria-label={t('Save JSON')}
                title={t('Save project JSON · Cmd/Ctrl + S saves locally')}
                disabled={!!fileOperation}
                onClick={() => {
                  void saveExport(
                    `${p.name.replace(/[^a-z0-9_-]/gi, '-') || 'Untitled-tree'}.json`,
                    JSON.stringify(p, null, 2),
                    'application/json',
                  );
                }}
              >
                <Download size={14} />
                <span>{t('Save JSON')}</span>
              </Button>
            </div>
          </div>
          <div className="editor-toolbar">
            <div className="history-tools" role="group" aria-label={t('Edit history')}>
              <IconButton label="Undo" shortcut="⌘ Z" disabled={!s.past.length} onClick={s.undo}>
                <Undo2 size={16} />
              </IconButton>
              <IconButton
                label="Redo"
                shortcut="⌘ ⇧ Z"
                disabled={!s.future.length}
                onClick={s.redo}
              >
                <Redo2 size={16} />
              </IconButton>
            </div>
            <div className="toolbar-divider" />
            <div className="code-toolbar" role="group" aria-label={t('Code and simulation')}>
              <div className="simulation-controls" role="group" aria-label={t('Simulation')}>
                <Button
                  className="simulation-run"
                  aria-label={t(running ? 'Pause simulation' : 'Run simulation')}
                  title={t(running ? 'Pause simulation' : 'Run simulation with mock handlers')}
                  disabled={!!errors.length}
                  onClick={() => {
                    if (running) setRunning(false);
                    else {
                      if (simState?.result !== 'Running') {
                        simulator?.reset();
                        setSimState(null);
                      }
                      setRunning(true);
                      setTab('console');
                      setBottomOpen(true);
                    }
                  }}
                >
                  {running ? <Pause size={13} /> : <Play size={13} />}
                  <span>{t(running ? 'Pause' : 'Run')}</span>
                </Button>
                <IconButton
                  label="Step simulation"
                  disabled={!!errors.length}
                  onClick={() => {
                    setRunning(false);
                    step();
                  }}
                >
                  <SkipForward size={13} />
                </IconButton>
                <IconButton
                  label="Reset simulation"
                  onClick={() => {
                    setRunning(false);
                    simulator?.reset();
                    setSimState(null);
                  }}
                >
                  <RotateCcw size={13} />
                </IconButton>
              </div>

              <IconButton
                label="Validate tree"
                onClick={() => {
                  setTab('problems');
                  setBottomOpen(true);
                  notify(errors.length ? `${errors.length} errors found.` : 'Tree is valid.');
                  addLog(`Validation: ${errors.length} errors, ${warnings.length} warnings`);
                }}
              >
                <ShieldCheck size={17} />
              </IconButton>
              <Button
                variant="primary"
                aria-label={t('Generate C#')}
                title={t('Generate C# (Cmd/Ctrl + Enter)')}
                onClick={generate}
              >
                <Braces size={15} />
                <span>{t('Generate')}</span>
                <kbd>⌘ ↵</kbd>
              </Button>
              <div className="dropdown-anchor">
                <Button
                  variant="outline"
                  aria-label={t('C# code actions')}
                  aria-expanded={exportOpen}
                  aria-controls="code-actions"
                  onClick={() => {
                    setExportOpen(!exportOpen);
                    setSamplesOpen(false);
                  }}
                >
                  <Download size={14} />
                  <span>{t('Export C#')}</span>
                  <ChevronDown size={11} />
                </Button>
                {exportOpen && (
                  <>
                    <div className="dismiss-layer" onClick={() => setExportOpen(false)} />
                    <div
                      id="code-actions"
                      className="dropdown-menu export-menu"
                      role="group"
                      aria-label={t('C# output')}
                    >
                      <button onClick={copyCs} disabled={!codeResult}>
                        <Copy size={15} />
                        {t('Copy C#')}
                      </button>
                      <button
                        aria-label={t('Download C#')}
                        onClick={exportCs}
                        disabled={!codeResult || !!fileOperation}
                      >
                        <FileCode2 size={15} />
                        {t('Download C#')}
                        <span>.cs</span>
                      </button>
                      <div className="menu-separator" />
                      <a
                        href={`/runtime/BranchStudio.${p.mode === 'game' ? 'Game' : 'Workflow'}.cs`}
                        download
                        aria-disabled={!!fileOperation}
                        onClick={(event) => {
                          setExportOpen(false);
                          if (!isNativeHost()) return;
                          event.preventDefault();
                          if (fileOperation) return;
                          const fileName = `BranchStudio.${p.mode === 'game' ? 'Game' : 'Workflow'}.cs`;
                          void saveExport(fileName, async () => {
                            const response = await fetch(`/runtime/${fileName}`);
                            if (!response.ok)
                              throw new Error('The C# runtime could not be loaded.');
                            return response.text();
                          });
                        }}
                      >
                        <Download size={15} />
                        {t('Download C# runtime')}
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>
        <ProjectTabs
          documents={s.documents.map((doc) => ({
            id: doc.id,
            name: doc.id === s.activeDocumentId ? p.name : doc.project.name,
            mode: doc.id === s.activeDocumentId ? p.mode : doc.project.mode,
          }))}
          activeId={s.activeDocumentId}
          onSelect={selectDocument}
          onCreate={newProject}
          onClose={(documentId) => {
            setRunning(false);
            setCloseSaveError(false);
            setClosingDocumentId(documentId);
          }}
        />
        <div className="workspace-bar">
          <div className="workspace-path">
            <span>{t(p.mode === 'game' ? 'Game AI' : 'Workflow')}</span>
            <ChevronRight size={11} />
            <span>{t('Behavior tree')}</span>
          </div>
          <button
            className="text-tool project-settings-button"
            aria-label={t('Project settings')}
            title={t('Project name, namespace and C# class')}
            onClick={() => {
              s.select([]);
              setInspectorTab('node');
              setRightOpen(true);
              setExportOpen(false);
              setSamplesOpen(false);
            }}
          >
            <Settings2 size={13} />
            <span>{t('Project settings')}</span>
          </button>
          <div className="workspace-tools">
            <div className="dropdown-anchor">
              <button
                className="text-tool"
                aria-expanded={samplesOpen}
                onClick={() => {
                  setSamplesOpen(!samplesOpen);
                  setExportOpen(false);
                }}
              >
                <FolderOpen size={13} />
                {t('Samples')}
                <ChevronDown size={10} />
              </button>
              {samplesOpen && (
                <>
                  <div className="dismiss-layer" onClick={() => setSamplesOpen(false)} />
                  <div className="dropdown-menu samples-menu">
                    <button onClick={() => loadSample('game')}>
                      <Gamepad2 size={15} />
                      {t('Enemy AI')}
                    </button>
                    <button onClick={() => loadSample('workflow')}>
                      <Workflow size={15} />
                      {t('Order processing')}
                    </button>
                  </div>
                </>
              )}
            </div>
            <IconButton
              label={leftOpen ? 'Hide node library' : 'Show node library'}
              onClick={() => setLeftOpen(!leftOpen)}
            >
              {leftOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </IconButton>
            <IconButton label="Toggle inspector" onClick={() => setRightOpen(!rightOpen)}>
              {rightOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            </IconButton>
          </div>
        </div>
        <div
          className="workspace-main"
          id="project-editor"
          role="tabpanel"
          aria-labelledby={`project-tab-${s.activeDocumentId}`}
        >
          <nav className="activity-bar" aria-label={t('Editor panels')}>
            <IconButton
              label="Node library"
              className={leftOpen ? 'activity-active' : ''}
              onClick={() => setLeftOpen(!leftOpen)}
            >
              <Network size={20} />
            </IconButton>
            <IconButton label="Find node" onClick={() => openQuick('find')}>
              <Search size={19} />
            </IconButton>
            <IconButton
              label={p.mode === 'game' ? 'Blackboard' : 'Context'}
              className={inspectorTab === 'data' && rightOpen ? 'activity-active' : ''}
              onClick={() => {
                setRightOpen(true);
                setInspectorTab('data');
              }}
            >
              <DatabaseIcon />
            </IconButton>
            <div className="activity-spacer" />
            <IconButton
              label="Appearance settings"
              onClick={() => {
                setShortcuts(false);
                setQuick(null);
                setExportOpen(false);
                setSamplesOpen(false);
                setAppearanceOpen(true);
              }}
            >
              <Type size={19} />
            </IconButton>
            <IconButton label="Keyboard shortcuts" onClick={() => setShortcuts(!shortcuts)}>
              <Keyboard size={19} />
            </IconButton>
          </nav>
          {leftOpen && <Library onAdd={(kind) => addNode(kind)} />}
          <div className="center-workspace">
            <div
              className="graph-area"
              ref={graphRef}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/branch-node')) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }
              }}
              onDrop={(e) => {
                const kind = e.dataTransfer.getData('application/branch-node') as NodeKind;
                if (!registry[kind] || kind === 'Root') return;
                e.preventDefault();
                addNode(kind, flow.screenToFlowPosition({ x: e.clientX - 92, y: e.clientY - 40 }));
              }}
            >
              <div className="canvas-toolbar">
                <div className="canvas-breadcrumb">
                  <GitBranch size={13} />
                  <span>{p.settings.className}</span>
                </div>
                <div className="canvas-toolbar-spacer" />
                <button
                  className="canvas-tool"
                  onClick={() => {
                    s.autoLayout();
                    const documentId = s.activeDocumentId;
                    setTimeout(() => {
                      if (useEditorStore.getState().activeDocumentId === documentId)
                        void flow.fitView({ padding: 0.15, duration: 0 });
                    }, 60);
                  }}
                  title={t('Arrange tree')}
                >
                  <Network size={13} />
                  <span>{t('Auto layout')}</span>
                </button>
                <IconButton label="Find node" onClick={() => openQuick('find')}>
                  <Search size={14} />
                </IconButton>
              </div>
              <ReactFlow<FlowNode>
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={(changes) => {
                  const removals = changes.filter((c) => c.type === 'remove').map((c) => c.id);
                  if (removals.length) s.removeEdges(removals);
                  const selections = changes.filter((c) => c.type === 'select');
                  if (selections.length)
                    setSelectedEdges((old) => {
                      const ids = new Set(old);
                      for (const c of selections) {
                        if (c.selected) ids.add(c.id);
                        else ids.delete(c.id);
                      }
                      return [...ids];
                    });
                }}
                onConnect={onConnect}
                onConnectStart={(_, params) => {
                  connectSource.current = params.handleType === 'source' ? params.nodeId : null;
                }}
                onConnectEnd={onConnectEnd}
                isValidConnection={(c) => canConnect(p, c.source, c.target)}
                onNodeDragStart={() => s.beginMove()}
                onNodeDragStop={() => s.endMove()}
                onSelectionDragStart={() => s.beginMove()}
                onSelectionDragStop={() => s.endMove()}
                onNodeClick={(_, node) => {
                  setInspectorTab('node');
                  setRightOpen(true);
                }}
                onPaneClick={() => {
                  if (ignorePaneClick.current) {
                    ignorePaneClick.current = false;
                    return;
                  }
                  setQuick(null);
                  s.select([]);
                }}
                onPaneContextMenu={(e) => {
                  e.preventDefault();
                  openQuick('context', { x: e.clientX, y: e.clientY });
                }}
                onNodeContextMenu={(e, node) => {
                  e.preventDefault();
                  s.select([node.id]);
                  openQuick('context', { x: e.clientX, y: e.clientY });
                }}
                onMove={(_, viewport) => setZoom(Math.round(viewport.zoom * 100))}
                onMoveEnd={(_, viewport) => {
                  if (
                    !restoringViewport.current &&
                    viewportOwner.current === s.activeDocumentId &&
                    useEditorStore.getState().activeDocumentId === s.activeDocumentId
                  )
                    s.setViewport(viewport);
                }}
                minZoom={0.15}
                maxZoom={2}
                snapToGrid
                snapGrid={[16, 16]}
                selectionOnDrag
                selectionKeyCode="Shift"
                multiSelectionKeyCode="Shift"
                panOnDrag={[1, 2]}
                panOnScroll
                zoomOnScroll={false}
                zoomOnPinch
                deleteKeyCode={null}
                connectionLineType={ConnectionLineType.SmoothStep}
                colorMode="dark"
                ariaLabelConfig={flowAriaLabels}
                defaultEdgeOptions={{ interactionWidth: 18 }}
                elevateNodesOnSelect
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#33393d" />
                {miniMap && (
                  <MiniMap
                    position="bottom-right"
                    nodeColor={(n) => registry[(n.data as FlowNode['data']).node.kind].color}
                    maskColor="rgba(10,12,13,.6)"
                    style={{ background: '#1b1f22' }}
                    pannable
                    zoomable
                  />
                )}
              </ReactFlow>
              <div className="canvas-bottom-left">
                <div className="zoom-controls">
                  <IconButton label="Zoom out" onClick={() => flow.zoomOut({ duration: 100 })}>
                    <ZoomOut size={15} />
                  </IconButton>
                  <button
                    className="zoom-value"
                    aria-label={t('Reset zoom to 100 percent')}
                    onClick={() => flow.zoomTo(1, { duration: 150 })}
                  >
                    {zoom}%
                  </button>
                  <IconButton label="Zoom in" onClick={() => flow.zoomIn({ duration: 100 })}>
                    <ZoomIn size={15} />
                  </IconButton>
                  <span className="mini-divider" />
                  <IconButton
                    label="Fit view"
                    shortcut="F"
                    onClick={() => flow.fitView({ duration: 200, padding: 0.2 })}
                  >
                    <Maximize size={14} />
                  </IconButton>
                </div>
              </div>
              <div className="canvas-bottom-right">
                <IconButton
                  label="Toggle minimap"
                  aria-pressed={miniMap}
                  onClick={() => setMiniMap(!miniMap)}
                >
                  <MapIcon size={15} />
                </IconButton>
                <Button
                  className="quick-add-button"
                  aria-label={t('Add node')}
                  title={t('Add node (Space)')}
                  onClick={() => openQuick()}
                >
                  <Plus size={14} />
                  <span>{t('Add node')}</span>
                  <kbd>Space</kbd>
                </Button>
              </div>
            </div>
            <section
              className={`bottom-panel ${bottomOpen ? '' : 'collapsed'}`}
              style={{ height: bottomOpen ? bottomHeight : 36 }}
            >
              <div
                className="panel-resizer"
                onPointerDown={resizePanel}
                role="separator"
                aria-label={t('Resize output panel')}
                aria-orientation="horizontal"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp')
                    setBottomHeight((h) => Math.min(h + 30, window.innerHeight * 0.65));
                  if (e.key === 'ArrowDown') setBottomHeight((h) => Math.max(h - 30, 120));
                }}
              />
              <div className="bottom-tabs">
                <button
                  className={tab === 'problems' ? 'active' : ''}
                  onClick={() => {
                    setTab('problems');
                    setBottomOpen(true);
                  }}
                >
                  <AlertCircle size={13} />
                  {t('Problems')}
                  <span className={`tab-count ${errors.length ? 'error-count' : ''}`}>
                    {issues.length}
                  </span>
                </button>
                <button
                  className={tab === 'code' ? 'active' : ''}
                  onClick={() => {
                    setTab('code');
                    setBottomOpen(true);
                  }}
                >
                  <Braces size={14} />
                  {t('C# Preview')}
                </button>
                <button
                  className={tab === 'console' ? 'active' : ''}
                  onClick={() => {
                    setTab('console');
                    setBottomOpen(true);
                  }}
                >
                  <Terminal size={13} />
                  {t('Console')}
                  {simState && <span className="tab-count">{simState.tick}</span>}
                </button>
                <div className="bottom-tabs-spacer" />
                {tab === 'code' && <span className="readonly-badge">{t('READ ONLY')}</span>}
                {tab === 'console' && (
                  <IconButton
                    label="Clear console"
                    onClick={() => {
                      setLogs([]);
                      simulator?.reset();
                      setSimState(null);
                      setRunning(false);
                    }}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                )}
                <IconButton
                  label={bottomOpen ? 'Collapse output panel' : 'Expand output panel'}
                  onClick={() => setBottomOpen(!bottomOpen)}
                >
                  <ChevronUp size={14} className={bottomOpen ? 'rotate-180' : ''} />
                </IconButton>
              </div>
              {bottomOpen &&
                (tab === 'code' ? (
                  <>
                    <div className="code-file-bar">
                      <FileCode2 size={12} />
                      <span>{p.settings.className}.cs</span>
                      <span className="code-file-path">{p.settings.namespace}</span>
                      {generationProject !== deferredProject && <span>{t('Updating…')}</span>}
                      <span className="code-contract">
                        {p.mode === 'game' ? 'IBehaviorNode' : 'IWorkflowNode'}
                      </span>
                    </div>
                    {generation.error ? (
                      <div className="panel-empty error-icon">{t(generation.error)}</div>
                    ) : (
                      <CodePreview
                        fontSize={appearance.codeFontSize}
                        result={codeResult}
                        selectedId={s.selectedIds[0]}
                        onSelect={focusNode}
                      />
                    )}
                  </>
                ) : tab === 'problems' ? (
                  <div className="problems-list">
                    {issues.length === 0 ? (
                      <div className="panel-empty">
                        <CircleCheck size={23} />
                        <span>{t('No problems detected')}</span>
                        <small>{t('Your tree is ready to generate.')}</small>
                      </div>
                    ) : (
                      issues.map((issue) => (
                        <button
                          key={issue.id}
                          className="problem-row"
                          onClick={() =>
                            issue.nodeId
                              ? focusNode(issue.nodeId)
                              : (s.select([]), setInspectorTab('node'), setRightOpen(true))
                          }
                        >
                          {issue.severity === 'error' ? (
                            <AlertCircle size={14} />
                          ) : (
                            <AlertTriangle size={14} />
                          )}
                          <span>{t(issue.message)}</span>
                          <code>{issue.code}</code>
                          <small>
                            {p.nodes.find((n) => n.id === issue.nodeId)?.name ?? t('Project')}
                          </small>
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="console-output">
                    {simState && (
                      <div className="console-session-bar" aria-live="polite">
                        <span>{t('Simulation')}</span>
                        <span className={`simulation-result status-${simState.result}`}>
                          {t(simState.result)}
                          <small>#{simState.tick}</small>
                        </span>
                      </div>
                    )}
                    {!logs.length && !simState ? (
                      <div className="panel-empty">
                        <Terminal size={23} />
                        <span>{t('Console is ready')}</span>
                        <small>{t('Run or step through the tree to inspect execution.')}</small>
                      </div>
                    ) : (
                      <>
                        {logs.map((log, i) => (
                          <div className="console-line" key={`log${i}`}>
                            <span>studio</span>
                            <code>{t(log)}</code>
                          </div>
                        ))}
                        {simState?.logs.map((log, i) => (
                          <div className="console-line" key={`sim${i}`}>
                            <span>sim</span>
                            <code>{t(log)}</code>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                ))}
            </section>
          </div>
          {rightOpen && (
            <Inspector issues={issues} activeTab={inspectorTab} onTab={setInspectorTab} />
          )}
        </div>
        <footer className="statusbar">
          <span className={`status-validation ${errors.length ? 'has-errors' : ''}`}>
            <GitBranch size={12} />
            <span>
              {errors.length
                ? t(errors.length === 1 ? '{count} error' : '{count} errors', {
                    count: errors.length,
                  })
                : t('Ready')}
            </span>
          </span>
          <button
            onClick={() => {
              setTab('problems');
              setBottomOpen(true);
            }}
          >
            <AlertCircle size={11} />
            {errors.length}
            <AlertTriangle size={11} />
            {warnings.length}
          </button>
          <span className="status-save">
            {saved === 'saved' ? (
              <Check size={11} />
            ) : saved === 'error' ? (
              <AlertCircle size={11} />
            ) : (
              <Circle size={8} />
            )}{' '}
            {t(
              saved === 'saved'
                ? 'All changes saved'
                : saved === 'error'
                  ? 'Local save unavailable'
                  : 'Saving…',
            )}
          </span>
          <div className="status-spacer" />
          <span>
            {s.selectedIds.length ? t('{count} selected', { count: s.selectedIds.length }) : ''}
          </span>
          <span>{t('{count} nodes', { count: p.nodes.length })}</span>
          <span className="status-separator" />
          <span>UTF-8</span>
          <span>C#</span>
          <span className="status-contract">
            <ShieldCheck size={11} />
            {t('Interface enforced')}
          </span>
        </footer>
        <input
          ref={fileInput}
          className="hidden"
          type="file"
          accept=".json,application/json"
          onChange={importFile}
          aria-label={t('Import project JSON')}
        />
        {notice && (
          <div className="toast" role="status">
            <CircleCheck size={15} />
            <span>{t(notice)}</span>
            <button aria-label={t('Dismiss notification')} onClick={() => setNotice(null)}>
              <X size={13} />
            </button>
          </div>
        )}
        {quick && (
          <>
            <div className="menu-backdrop" onClick={() => setQuick(null)} />
            <div className="quick-menu" style={{ left: quick.x, top: Math.max(60, quick.y) }}>
              <div className="quick-search">
                <Search size={15} />
                <input
                  ref={quickInput}
                  aria-label={t(quick.kind === 'find' ? 'Find existing node' : 'Quick add node')}
                  placeholder={t(quick.kind === 'find' ? 'Find in tree...' : 'Search nodes...')}
                  value={quickQuery}
                  onChange={(e) => {
                    setQuickQuery(e.target.value);
                    setQuickIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setQuick(null);
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setQuickIndex((i) => Math.min(i + 1, quickItems.length - 1));
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setQuickIndex((i) => Math.max(0, i - 1));
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      chooseQuick(quickIndex);
                    }
                  }}
                />
                <kbd>esc</kbd>
              </div>
              {quick.kind === 'context' && !quickQuery && (
                <div className="quick-commands">
                  <button
                    onClick={() => {
                      s.copy();
                      setQuick(null);
                      notify('Selection copied.');
                    }}
                    disabled={!s.selectedIds.length}
                  >
                    <Copy size={13} />
                    {t('Copy')}
                    <kbd>⌘ C</kbd>
                  </button>
                  <button
                    onClick={() => {
                      s.paste(quick.flow);
                      setQuick(null);
                    }}
                  >
                    <Copy size={13} />
                    {t('Paste')}
                    <kbd>⌘ V</kbd>
                  </button>
                  <button
                    onClick={() => {
                      s.duplicate();
                      setQuick(null);
                    }}
                    disabled={!s.selectedIds.length}
                  >
                    <Plus size={13} />
                    {t('Duplicate')}
                    <kbd>⌘ D</kbd>
                  </button>
                  <button
                    onClick={() => {
                      s.disconnectNode(s.selectedIds);
                      setQuick(null);
                    }}
                    disabled={!s.selectedIds.length}
                  >
                    <Link2Off size={13} />
                    {t('Disconnect')}
                  </button>
                  <button
                    onClick={() => {
                      s.removeSelected();
                      setQuick(null);
                    }}
                    disabled={
                      !s.selectedIds.some((id) => p.nodes.find((n) => n.id === id)?.kind !== 'Root')
                    }
                  >
                    <Trash2 size={13} />
                    {t('Delete')}
                    <kbd>⌫</kbd>
                  </button>
                  <button
                    onClick={() => {
                      s.autoLayout();
                      setQuick(null);
                    }}
                  >
                    <Network size={13} />
                    {t('Auto layout')}
                  </button>
                </div>
              )}
              <div className="quick-group-label">
                {t(
                  quick.kind === 'find'
                    ? 'NODES IN TREE'
                    : quick.parentId
                      ? 'ADD CONNECTED NODE'
                      : 'ADD NODE',
                )}
              </div>
              <div className="quick-results">
                {quickItems.map((item, i) => (
                  <button
                    className={quickIndex === i ? 'active' : ''}
                    key={item.id}
                    onMouseEnter={() => setQuickIndex(i)}
                    onClick={() => chooseQuick(i)}
                  >
                    <NodeIcon kind={item.kind} size={15} />
                    <span>{quick.kind === 'find' ? item.label : t(item.label)}</span>
                    <small>{t(item.detail)}</small>
                    {quickIndex === i && <kbd>↵</kbd>}
                  </button>
                ))}
                {!quickItems.length && <div className="empty-small">{t('No matching nodes')}</div>}
              </div>
            </div>
          </>
        )}
        <AppearanceSettings
          open={appearanceOpen}
          preferences={appearance}
          saveUnavailable={appearanceSaveUnavailable}
          onChange={updateAppearance}
          onClose={() => setAppearanceOpen(false)}
        />
        <CloseProjectDialog
          open={!!closingDocumentId && !!closingProject}
          documentName={closingProject?.name || 'Untitled tree'}
          busy={!!fileOperation}
          saveError={closeSaveError}
          onCancel={() => setClosingDocumentId(null)}
          onDiscard={() => closingDocumentId && closeDocument(closingDocumentId)}
          onSave={() => void saveAndCloseDocument()}
        />
        {shortcuts && (
          <div className="modal-backdrop" onClick={() => setShortcuts(false)}>
            <div
              ref={dialogRef}
              className="shortcut-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={t('Keyboard shortcuts')}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="dialog-heading">
                <Keyboard size={17} />
                <strong>{t('Keyboard shortcuts')}</strong>
                <IconButton label="Close shortcuts" onClick={() => setShortcuts(false)}>
                  <X size={15} />
                </IconButton>
              </div>
              {[
                ['Quick add', 'Space'],
                ['Find in library', '/'],
                ['Fit tree', 'F'],
                ['Undo', '⌘ / Ctrl Z'],
                ['Redo', '⌘ / Ctrl ⇧ Z'],
                ['Copy / paste', '⌘ / Ctrl C / V'],
                ['Duplicate', '⌘ / Ctrl D'],
                ['Select all', '⌘ / Ctrl A'],
                ['Save locally', '⌘ / Ctrl S'],
                ['Generate C#', '⌘ / Ctrl ↵'],
                ['Delete', 'Delete / Backspace'],
                ['Multi-select', 'Shift + click / drag'],
                ['Pan canvas', 'Scroll / middle drag'],
              ].map(([a, b]) => (
                <div className="shortcut-row" key={a}>
                  <span>{t(a)}</span>
                  <kbd>{t(b)}</kbd>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </I18nProvider>
  );
}
function DatabaseIcon() {
  return <Database size={19} />;
}
