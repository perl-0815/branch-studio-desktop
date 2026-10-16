import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// The editable master is the native SVG. Its embedded notice credits Lucide.
// Run from any directory: node /path/to/branch-studio/scripts/generate-icons.mjs
const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const source = await readFile(path.join(publicDirectory, 'favicon.svg'));
const tileColor = '#1b1e20';

async function renderPng(size, opaque = false) {
  // Rasterize vectors directly at the requested resolution, including 16px.
  let image = sharp(source, { density: (72 * size) / 64 }).resize(size, size);
  // OS launchers apply their own masks; install icons must have an opaque canvas.
  if (opaque) image = image.flatten({ background: tileColor });
  return image.png({ compressionLevel: 9, palette: false }).toBuffer();
}

function encodeIco(entries) {
  // ICO: ICONDIR + one ICONDIRENTRY per embedded PNG + the PNG payloads.
  const directory = Buffer.alloc(6 + entries.length * 16);
  directory.writeUInt16LE(1, 2); // type: icon
  directory.writeUInt16LE(entries.length, 4);
  let offset = directory.length;
  for (const [index, { size, png }] of entries.entries()) {
    const entry = 6 + index * 16;
    directory[entry] = size === 256 ? 0 : size;
    directory[entry + 1] = size === 256 ? 0 : size;
    directory.writeUInt16LE(1, entry + 4); // color planes
    directory.writeUInt16LE(32, entry + 6); // RGBA, 8 bits per channel
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  }
  return Buffer.concat([directory, ...entries.map(({ png }) => png)]);
}

const icoEntries = [];
for (const size of [16, 32, 48]) icoEntries.push({ size, png: await renderPng(size) });
const ico = encodeIco(icoEntries);
await writeFile(path.join(publicDirectory, 'favicon.ico'), ico);
console.log(
  `public/favicon.ico: ${icoEntries.map(({ size }) => `${size}×${size}`).join(', ')} PNG entries`,
);

for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  const png = await renderPng(size, true);
  await writeFile(path.join(publicDirectory, name), png);
  console.log(`public/${name}: ${size}×${size}`);
}
