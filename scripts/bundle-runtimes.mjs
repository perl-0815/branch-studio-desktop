import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedContracts = await readFile(
  resolve(root, 'web/src/generated/contracts.generated.cs'),
  'utf8',
);

const runtimes = [
  ['BranchStudio.Game.cs', 'web/runtime/BranchStudio.Runtime/BranchStudio.Game.cs'],
  ['BranchStudio.Workflow.cs', 'web/runtime/BranchStudio.Runtime/BranchStudio.Workflow.cs'],
];

for (const [fileName, sourcePath] of runtimes) {
  const runtime = await readFile(resolve(root, sourcePath), 'utf8');
  const banner =
    '// Standalone Branch Studio runtime. Shared contracts are appended from the C# source of truth.\n';
  const bundle = `${banner}${runtime.trimEnd()}\n\n${generatedContracts.trim()}\n`;
  await writeFile(resolve(root, 'web/public/runtime', fileName), bundle, 'utf8');
  console.log(`Bundled web/public/runtime/${fileName}`);
}
