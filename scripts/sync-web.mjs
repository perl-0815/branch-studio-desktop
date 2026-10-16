import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(scriptDirectory, '..');
const source = path.join(workspace, 'web', 'out');
const destination = path.join(
  workspace,
  'src',
  'BranchStudio.Desktop',
  'Resources',
  'Raw',
  'wwwroot',
);

const indexFile = path.join(source, 'index.html');

try {
  const indexStat = await stat(indexFile);
  if (!indexStat.isFile()) throw new Error('index.html is not a file');
} catch {
  throw new Error(
    `Static web output is missing at ${indexFile}. Run "pnpm build:web" first.`,
  );
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

console.log(`Synced Branch Studio web assets to ${destination}`);
