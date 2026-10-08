// Tiny static server over the repo root, GitHub-Pages style:
// "/x/" -> x/index.html, "/x" -> 301 to "/x/" when x/index.html exists,
// unknown paths -> 404.html with status 404.
// Usage: const { url, close } = await serve();   or   node tests/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
};

async function isFile(p) { try { return (await stat(p)).isFile(); } catch { return false; } }

export function serve({ root = ROOT, port = 0 } = {}) {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = resolve(join(root, pathname));
      if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      if (pathname.endsWith('/')) file = join(file, 'index.html');
      else if (!(await isFile(file)) && (await isFile(join(file, 'index.html')))) {
        res.writeHead(301, { Location: pathname + '/' }).end(); return;
      }
      if (await isFile(file)) {
        res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
        res.end(await readFile(file));
        return;
      }
      res.writeHead(404, { 'Content-Type': TYPES['.html'] });
      res.end(await readFile(join(root, '404.html')).catch(() => 'Not found'));
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => server.close(done)),
  })));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await serve({ port: Number(process.argv[2]) || 0 });
  console.log(`serving ${ROOT} at ${url}`);
}
