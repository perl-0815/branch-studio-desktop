import { assertProjectTextSize } from './project-limits';

interface HybridApi {
  SendRawMessage(message: string): void;
}
interface NativeTransport {
  postMessage(message: string): void;
}
interface NativeWindow extends Window {
  HybridWebView?: HybridApi;
  chrome?: { webview?: NativeTransport };
  webkit?: { messageHandlers?: { webwindowinterop?: NativeTransport } };
  hybridWebViewHost?: { sendMessage(message: string): void };
}
type Operation = 'openProject' | 'saveFile';
interface OpenedProject {
  fileName: string;
  content: string;
}
interface SavedFile {
  fileName: string;
}
interface PendingRequest {
  operation: Operation;
  resolve(value: OpenedProject | SavedFile): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}
const pending = new Map<string, PendingRequest>();
let scriptPromise: Promise<HybridApi> | undefined;
let listeningWindow: NativeWindow | undefined;

export class NativeOperationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cancelled = false,
  ) {
    super(message);
    this.name = 'NativeOperationError';
  }
}

function hostWindow(): NativeWindow | undefined {
  return typeof window === 'undefined' ? undefined : (window as NativeWindow);
}
export function isNativeHost(): boolean {
  const host = hostWindow();
  return !!(
    host?.HybridWebView?.SendRawMessage ||
    host?.chrome?.webview?.postMessage ||
    host?.webkit?.messageHandlers?.webwindowinterop?.postMessage ||
    host?.hybridWebViewHost?.sendMessage
  );
}

/** Browsers never request the MAUI-only framework resource. */
async function nativeApi(): Promise<HybridApi | null> {
  const host = hostWindow();
  if (!host || !isNativeHost()) return null;
  if (host.HybridWebView?.SendRawMessage) return host.HybridWebView;
  if (!scriptPromise) {
    scriptPromise = new Promise<HybridApi>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/_framework/hybridwebview.js';
      script.async = true;
      script.onload = () => {
        if (host.HybridWebView?.SendRawMessage) resolve(host.HybridWebView);
        else {
          script.remove();
          reject(
            new NativeOperationError('Desktop file bridge is unavailable.', 'bridge_unavailable'),
          );
        }
      };
      script.onerror = () => {
        script.remove();
        reject(
          new NativeOperationError(
            'Desktop file bridge could not be loaded.',
            'bridge_unavailable',
          ),
        );
      };
      document.head.appendChild(script);
    }).catch((error) => {
      scriptPromise = undefined;
      throw error;
    });
  }
  return scriptPromise;
}

export async function initializeNativeFiles(): Promise<boolean> {
  return !!(await nativeApi());
}

function receive(event: Event): void {
  const raw: unknown = (event as CustomEvent<{ message?: unknown }>).detail?.message;
  if (typeof raw !== 'string' || raw.length > 32 * 1024 * 1024) return;
  let message: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    message = parsed as Record<string, unknown>;
  } catch {
    return;
  }
  if (typeof message.requestId !== 'string') return;
  const request = pending.get(message.requestId);
  if (!request) return;
  const complete = () => {
    clearTimeout(request.timeout);
    pending.delete(message.requestId as string);
  };
  if (
    message.type === 'operationFailed' &&
    message.operation === request.operation &&
    typeof message.message === 'string' &&
    typeof message.code === 'string' &&
    typeof message.cancelled === 'boolean'
  ) {
    complete();
    request.reject(new NativeOperationError(message.message, message.code, message.cancelled));
    return;
  }
  if (
    request.operation === 'openProject' &&
    message.type === 'projectOpened' &&
    typeof message.fileName === 'string' &&
    typeof message.content === 'string'
  ) {
    complete();
    try {
      assertProjectTextSize(message.content);
      request.resolve({ fileName: message.fileName, content: message.content });
    } catch (error) {
      request.reject(error instanceof Error ? error : new Error('Invalid project file.'));
    }
  } else if (
    request.operation === 'saveFile' &&
    message.type === 'fileSaved' &&
    typeof message.fileName === 'string'
  ) {
    complete();
    request.resolve({ fileName: message.fileName });
  }
}

function listen(host: NativeWindow): void {
  if (listeningWindow === host) return;
  listeningWindow = host;
  host.addEventListener('HybridWebViewMessageReceived', receive);
  host.addEventListener('pagehide', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new NativeOperationError('The editor was closed.', 'closed', true));
    }
    pending.clear();
  });
}

async function request(
  operation: Operation,
  payload: Record<string, string> = {},
): Promise<OpenedProject | SavedFile | null> {
  const api = await nativeApi();
  if (!api) return null;
  const host = hostWindow()!;
  listen(host);
  const requestId =
    globalThis.crypto?.randomUUID?.() ??
    `file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        pending.delete(requestId);
        reject(new NativeOperationError('The desktop file operation timed out.', 'timeout'));
      },
      10 * 60 * 1000,
    );
    pending.set(requestId, { operation, resolve, reject, timeout });
    try {
      api.SendRawMessage(JSON.stringify({ type: operation, requestId, ...payload }));
    } catch (error) {
      clearTimeout(timeout);
      pending.delete(requestId);
      reject(error);
    }
  });
}

export async function openNativeProject(): Promise<OpenedProject | null> {
  return (await request('openProject')) as OpenedProject | null;
}
export async function saveNativeFile(
  fileName: string,
  content: string,
  mimeType = 'text/plain',
): Promise<SavedFile | null> {
  if (!isNativeHost()) return null;
  const maxExportBytes = 20 * 1024 * 1024;
  if (
    content.length > maxExportBytes ||
    new TextEncoder().encode(content).byteLength > maxExportBytes
  )
    throw new Error('Export files must be 20 MiB or smaller.');
  return (await request('saveFile', { fileName, content, mimeType })) as SavedFile | null;
}
