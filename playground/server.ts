/*
  A local page for trying the editors while working on them: `yarn dev`.

  Bundles ./app.tsx (and the package's CSS) with esbuild in watch mode and
  serves it on http://localhost:4100 (or PORT). Every rebuild reloads the
  page; a change to CSS alone swaps the stylesheet and keeps the editor as
  it is.

  Regulations are read from the API cache in `.cache/regulations-api/`
  (see scripts/regulationsApi.ts), so no requests are made for those. With
  REGULATIONS_API_URL set, one that is not cached is fetched and cached.
*/

import { context, Plugin } from 'esbuild';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { createServer, ServerResponse } from 'http';
import { join } from 'path';

// Run from the repo root by `yarn dev` (the bundled server lives in .cache/).
const ROOT = process.cwd();
const HERE = join(ROOT, 'playground');
const PORT = Number(process.env.PORT) || 4100;
const CACHE_ROOT =
  process.env.REGULATIONS_CACHE_DIR || join(ROOT, '.cache', 'regulations-api');

const PAGE = `<!doctype html>
<html lang="is">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Editor playground</title>
<link rel="stylesheet" href="/app.css">
<div id="root"></div>
<script src="/app.js"></script>
<script>
  new EventSource('/events').onmessage = (e) => {
    if (e.data === 'css') {
      const link = document.querySelector('link[href^="/app.css"]');
      link.href = '/app.css?' + Date.now();
    } else {
      location.reload();
    }
  };
</script>`;

// ---------------------------------------------------------------------------
// Regulations

/** The cache folder of each API host, e.g. `api.reglugerd.is`. */
const cacheDirs = () =>
  existsSync(CACHE_ROOT)
    ? readdirSync(CACHE_ROOT).map((host) => join(CACHE_ROOT, host))
    : [];

const readCached = (file: string): unknown => {
  for (const dir of cacheDirs()) {
    const path = join(dir, file);
    if (existsSync(path)) {
      const json = JSON.parse(readFileSync(path, 'utf8'));
      return json && json.__missing ? undefined : json;
    }
  }
  return undefined;
};

type ListItem = { name: string; title: string; cached: boolean };

/** Every regulation the cache knows of, cached texts first. */
const regList = (): Array<ListItem> => {
  const cached = new Set<string>();
  for (const dir of cacheDirs()) {
    for (const file of readdirSync(dir)) {
      const m = /^(\d{4})-(\d{4})__current\.json$/.exec(file);
      if (m) {
        cached.add(`${m[1]}/${m[2]}`);
      }
    }
  }
  const all =
    (readCached('regulations__all__current__minimal.json') as
      | Array<{ name: string; title: string }>
      | undefined) || [];
  const titles = new Map(all.map((r) => [r.name, r.title]));
  const list = [...cached].map((name) => ({
    name,
    title: titles.get(name) || '',
    cached: true,
  }));
  if (process.env.REGULATIONS_API_URL) {
    for (const r of all) {
      if (!cached.has(r.name)) {
        list.push({ name: r.name, title: r.title, cached: false });
      }
    }
  }
  return list;
};

/** `0678/2009`, variant `current` or `original`. */
const getRegulation = async (name: string, variant: string) => {
  const path = `${name.replace('/', '-')}/${variant}`;
  const cached = readCached(path.replace(/\//g, '__') + '.json');
  if (cached || !process.env.REGULATIONS_API_URL) {
    return cached;
  }
  // Loaded only here: it exits at once when REGULATIONS_API_URL is unset.
  const { getReg } = await import('../scripts/regulationsApi');
  return getReg(path);
};

// ---------------------------------------------------------------------------
// Bundle

let js = '';
let css = '';
let buildError = '';
const clients = new Set<ServerResponse>();

const notify = (message: string) => {
  for (const res of clients) {
    res.write(`data: ${message}\n\n`);
  }
};

const reloader: Plugin = {
  name: 'reloader',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) {
        buildError = result.errors
          .map((e) => `${e.location?.file}:${e.location?.line} ${e.text}`)
          .join('\n');
        notify('reload');
        return;
      }
      buildError = '';
      let newJs = js;
      let newCss = css;
      for (const file of result.outputFiles || []) {
        if (file.path.endsWith('.js')) {
          newJs = file.text;
        } else if (file.path.endsWith('.css')) {
          newCss = file.text;
        }
      }
      const jsChanged = newJs !== js;
      const cssChanged = newCss !== css;
      const first = !js;
      js = newJs;
      css = newCss;
      if (!first && (jsChanged || cssChanged)) {
        notify(jsChanged ? 'reload' : 'css');
        console.info(jsChanged ? 'Rebuilt: reloading' : 'Rebuilt: CSS only');
      }
    });
  },
};

// ---------------------------------------------------------------------------

const main = async () => {
  const ctx = await context({
    entryPoints: { app: join(HERE, 'app.tsx') },
    outdir: join(HERE, 'out'),
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    sourcemap: 'inline',
    define: {
      'process.env.NODE_ENV': '"development"',
      // As build.js does for the package.
      'process.env.DEV_FILE_SERVER': '""',
    },
    logLevel: 'warning',
    plugins: [reloader],
  });
  await ctx.watch();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    const send = (type: string, body: string) => {
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    };
    try {
      if (url.pathname === '/') {
        return send(
          'text/html; charset=utf-8',
          buildError
            ? `<pre style="color:#b3261e;padding:1em">${buildError.replace(
                /</g,
                '&lt;',
              )}</pre>` + PAGE.slice(PAGE.indexOf('<script>'))
            : PAGE,
        );
      }
      if (url.pathname === '/app.js') {
        return send('text/javascript; charset=utf-8', js);
      }
      if (url.pathname === '/app.css') {
        return send('text/css; charset=utf-8', css);
      }
      if (url.pathname === '/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
        });
        res.write('\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (url.pathname === '/api/regulations') {
        return send('application/json', JSON.stringify(regList()));
      }
      const m = /^\/api\/regulation\/(\d{4}-\d{4})\/(current|original)$/.exec(
        url.pathname,
      );
      if (m) {
        const reg = await getRegulation(m[1]!.replace('-', '/'), m[2]!);
        if (reg) {
          return send('application/json', JSON.stringify(reg));
        }
      }
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(String(e));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  // This machine only: with REGULATIONS_API_URL set, a request makes it
  // fetch from that API and write to the cache.
  server.listen(PORT, '127.0.0.1', () => {
    console.info(`Editor playground: http://localhost:${PORT}`);
  });
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
