import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('out');
const port = Number(process.env.PORT || 3100);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.cs': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
try {
  await stat(resolve(root, 'index.html'));
} catch {
  console.error('Run pnpm build before pnpm start.');
  process.exit(1);
}
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = resolve(file, 'index.html');
    let content;
    try {
      content = await readFile(file);
    } catch {
      try {
        file += '.html';
        content = await readFile(file);
      } catch {
        file = resolve(root, '404.html');
        content = await readFile(file);
        res.statusCode = 404;
      }
    }
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
  }
});
server.listen(port, () => console.log(`Branch Studio: http://localhost:${port}`));
