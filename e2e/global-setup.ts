/*
  Bundles the test page (./harness.tsx) and serves it, with editorV2.css and
  the files in ./fixtures, on a free port for the test run.
*/

import { readFileSync } from 'fs';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { join } from 'path';
import { build } from 'esbuild';

const ROOT = join(__dirname, '..');

const PAGE = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/editorV2.css">
<link rel="stylesheet" href="/diff.css">
<div id="root"></div><script src="/harness.js"></script>`;

export default async function globalSetup() {
  const result = await build({
    entryPoints: [join(__dirname, 'harness.tsx')],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: {
      'process.env.NODE_ENV': '"development"',
      // As build.js does for the package.
      'process.env.DEV_FILE_SERVER': '""',
    },
    logLevel: 'warning',
  });
  const js = result.outputFiles![0]!.text;

  const server = createServer((req, res) => {
    const path = new URL(req.url || '/', 'http://x').pathname;
    const send = (type: string, body: string | Buffer) => {
      res.writeHead(200, { 'content-type': type });
      res.end(body);
    };
    try {
      if (path === '/') {
        return send('text/html; charset=utf-8', PAGE);
      }
      if (path === '/harness.js') {
        return send('text/javascript', js);
      }
      if (path === '/editorV2.css' || path === '/diff.css') {
        return send('text/css', readFileSync(join(ROOT, 'src', path)));
      }
      if (path.startsWith('/files/')) {
        // Uploaded files: a 1×1 PNG, so images load.
        return send(
          'image/png',
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64',
          ),
        );
      }
    } catch {
      // fall through to 404
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  process.env.E2E_BASE_URL = `http://127.0.0.1:${
    (server.address() as AddressInfo).port
  }`;
  return () => server.close();
}
