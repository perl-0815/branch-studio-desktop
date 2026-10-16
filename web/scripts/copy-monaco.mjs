import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
const source = path.resolve('node_modules/monaco-editor/min/vs');
await mkdir('public/monaco', { recursive: true });
await cp(source, 'public/monaco/vs', { recursive: true });
await cp('node_modules/monaco-editor/LICENSE', 'public/monaco/LICENSE');
await cp('node_modules/monaco-editor/ThirdPartyNotices.txt', 'public/monaco/ThirdPartyNotices.txt');
