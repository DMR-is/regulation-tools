/*
  Measures how the editor feels on long regulations: the speed baseline in
  docs/plan-tiptap-editor.md, "Long texts: speed". Runs the editor in
  Chromium (Playwright) on each text, types into the middle of it, and
  reads the browser's own timings.

    npx esbuild scripts/editorSpeed.ts --bundle --platform=node \
      --packages=external --outfile=/tmp/editorSpeed.js
    NODE_PATH=$PWD/node_modules node /tmp/editorSpeed.js \
      [--docs=0112-2012/current/text,…] [--runs=3] [--cpu=4] [--react=18]
      [--out=file.json]

  Texts come from the corpus cache (scripts/editorCorpus.ts); with no
  `--docs`, the five longest in .cache/editor-corpus/census.json. No API
  requests are made.

  Per text, the median over `--runs`. After loading, it waits until the page
  has been idle for QUIET_MS (the current editor diffs once on load), then
  types ROUNDS times, KEYS_PER_ROUND keys each, pausing PAUSE_MS after each
  round so the diff and the warnings run:
  - load: from navigation until the editor shows the text
  - after load: how long the page stays busy after that, and its longest
    freeze (the load-time diff and warnings)
  - slow keys: keystrokes that took over 50 ms to handle, of all typed
  - slowest key: the longest keystroke (the browser's Event Timing API; it
    reports nothing under 16 ms, so "<16" means every key was fast)
  - typing freeze: the longest main-thread block while typing
  - pause freeze: the longest block in the pauses after typing
  - auto-diff off: whether the editor gave up diffing automatically (a diff
    took over 1.5 s) and now waits for "Endurreikna breytingar". When it is
    off, a short pause freeze only means the diff did not run.

  Every run also checks that the editor works: the typed text lands in the
  paragraph, and while auto-diff is on, the diff pane shows it as inserted.
  `--react=18` bundles the page with React 18 (the `react-18` alias in
  devDependencies) instead of 19, so the same run is a smoke test on both.

  `--cpu` slows the CPU down (Chrome's throttling) to stand in for the
  office laptops the editors use; 1 is this machine at full speed.
*/

import { readFileSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { join } from 'path';
import { build } from 'esbuild';
import { chromium, Page } from 'playwright';

const argStr = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const RUNS = Number(argStr('runs') ?? 3);
const CPU = Number(argStr('cpu') ?? 4);
const OUT = argStr('out');
const REACT = argStr('react') ?? '19';
const ROUNDS = 3;
const KEYS_PER_ROUND = 20;
const KEYS = ROUNDS * KEYS_PER_ROUND;
const KEY_DELAY_MS = 80; // a quick typist
const PAUSE_MS = 4000; // the diff runs 1 s after typing stops
const QUIET_MS = 2000;
const SLOW_KEY_MS = 50;
const TYPED = ' og fleira'.repeat(KEYS_PER_ROUND / 10);

const CORPUS = join('.cache', 'editor-corpus');
const API_CACHE = join('.cache', 'regulations-api', 'api.reglugerd.is');

/** `0112-2012/current/text` → that document's HTML, from the corpus cache. */
const htmlOf = (id: string) => {
  const [reg, variant, field] = id.split('/') as [string, string, string];
  const r = JSON.parse(
    readFileSync(join(API_CACHE, `${reg}__${variant}.json`), 'utf8'),
  );
  if (field === 'text') {
    return r.text as string;
  }
  if (field === 'comments') {
    return r.comments as string;
  }
  return r.appendixes[Number(field.replace('appendix', '')) - 1].text as string;
};

const docIds = () =>
  argStr('docs')?.split(',') ??
  (
    JSON.parse(readFileSync(join(CORPUS, 'census.json'), 'utf8'))
      .longest as Array<{
      id: string;
    }>
  )
    .slice(0, 5)
    .map((x) => x.id);

// ---------------------------------------------------------------------------

const bundle = async () => {
  const result = await build({
    entryPoints: ['scripts/editorSpeed/harness.tsx'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    minify: true,
    alias:
      REACT === '18' ? { react: 'react-18', 'react-dom': 'react-dom-18' } : {},
    define: {
      'process.env.NODE_ENV': '"production"',
      // As build.js does for the package.
      'process.env.DEV_FILE_SERVER': '""',
    },
    logLevel: 'warning',
  });
  return result.outputFiles![0]!.text; // set with `write: false`
};

const serve = (js: string, docs: Map<string, string>) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    if (url.pathname === '/harness.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end(js);
    }
    const html = docs.get(url.searchParams.get('doc') || '');
    if (url.pathname !== '/' || html == null) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8">
<script>
  window.__events = []; window.__longtasks = [];
  new PerformanceObserver((l) => window.__events.push(...l.getEntries().map((e) =>
    ({ name: e.name, start: e.startTime, duration: e.duration, id: e.interactionId }))))
    .observe({ type: 'event', durationThreshold: 16, buffered: true });
  new PerformanceObserver((l) => window.__longtasks.push(...l.getEntries().map((e) =>
    ({ start: e.startTime, duration: e.duration }))))
    .observe({ type: 'longtask', buffered: true });
  window.__html = ${JSON.stringify(html).replace(/</g, '\\u003c')};
</script>
<div id="root"></div><script src="/harness.js"></script>`);
  });
  return new Promise<{ base: string; close: () => void }>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        close: () => server.close(),
      }),
    ),
  );
};

// ---------------------------------------------------------------------------

type Measure = {
  loadMs: number;
  busyAfterLoadMs: number;
  loadFreezeMs: number;
  slowKeys: number;
  slowestKeyMs: number;
  typingFreezeMs: number;
  pauseFreezeMs: number;
  autoDiffOff: number; // 1 or 0, so it has a median like the rest
};

type Timing = { start: number; duration: number; id?: number };

const timings = (page: Page) =>
  page.evaluate(() => ({
    now: performance.now(),
    events: (window as any).__events as Array<Timing>,
    longtasks: (window as any).__longtasks as Array<Timing>,
  }));

const measure = async (page: Page, url: string): Promise<Measure> => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__readyAt != null, null, {
    timeout: 120000,
  });
  const loadMs = await page.evaluate(() => (window as any).__readyAt as number);

  // Wait until no long task has ended for QUIET_MS.
  let busyUntil = loadMs;
  for (let waited = 0; ; waited += 250) {
    const { now, longtasks } = await timings(page);
    busyUntil = Math.max(loadMs, ...longtasks.map((t) => t.start + t.duration));
    if (now - busyUntil >= QUIET_MS) {
      break;
    }
    if (waited > 180000) {
      throw new Error(`the page never went quiet after loading: ${url}`);
    }
    await page.waitForTimeout(250);
  }

  // Click at the end of the middle paragraph.
  await page.evaluate(() => {
    const ps = document.querySelectorAll('.editor[contenteditable] > p');
    const p = ps[Math.floor(ps.length / 2)]!;
    p.scrollIntoView({ block: 'center' });
    p.setAttribute('data-speed-target', '');
  });
  const box = (await page.locator('[data-speed-target]').boundingBox())!;
  await page.mouse.click(box.x + box.width - 2, box.y + box.height - 4);

  const typing: Array<[number, number]> = [];
  for (let round = 0; round < ROUNDS; round++) {
    const t0 = (await timings(page)).now;
    await page.keyboard.type(TYPED, { delay: KEY_DELAY_MS });
    const t1 = (await timings(page)).now;
    typing.push([t0, t1]);
    await page.waitForTimeout(PAUSE_MS);
  }
  const typed = await page.evaluate(
    (text) =>
      document
        .querySelector('[data-speed-target]')!
        .textContent!.includes(text),
    TYPED.repeat(ROUNDS).trim(),
  );
  if (!typed) {
    throw new Error(`the typed text did not land in the paragraph: ${url}`);
  }
  const autoDiffOff = await page.evaluate(
    () => !!document.querySelector('[data-needs-updating]'),
  );
  if (!autoDiffOff) {
    const shown = await page.evaluate(() =>
      [...document.querySelectorAll('.result ins')].some((ins) =>
        ins.textContent!.includes('fleira'),
      ),
    );
    if (!shown) {
      throw new Error(`the diff pane does not show the typed text: ${url}`);
    }
  }

  const { events, longtasks } = await timings(page);
  const maxIn = (from: number, to: number) =>
    Math.max(
      0,
      ...longtasks
        .filter((t) => t.start >= from && t.start <= to)
        .map((t) => t.duration),
    );
  // One keystroke is one interaction; its time is its slowest event.
  const keys = new Map<number, number>();
  events
    .filter(
      (e) => e.id && typing.some(([a, b]) => e.start >= a && e.start <= b),
    )
    .forEach((e) =>
      keys.set(e.id!, Math.max(keys.get(e.id!) || 0, e.duration)),
    );
  return {
    loadMs,
    busyAfterLoadMs: busyUntil - loadMs,
    loadFreezeMs: maxIn(loadMs - 1, typing[0]![0]),
    slowKeys: [...keys.values()].filter((d) => d > SLOW_KEY_MS).length,
    slowestKeyMs: Math.max(0, ...keys.values()),
    typingFreezeMs: Math.max(...typing.map(([a, b]) => maxIn(a, b))),
    pauseFreezeMs: Math.max(...typing.map(([, b]) => maxIn(b, b + PAUSE_MS))),
    autoDiffOff: autoDiffOff ? 1 : 0,
  };
};

const median = (xs: Array<number>) =>
  [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] ?? 0;

const run = async () => {
  const ids = docIds();
  const docs = new Map(ids.map((id) => [id, htmlOf(id)]));
  const { base, close } = await serve(await bundle(), docs);
  const browser = await chromium.launch();
  const results: Array<
    { id: string; chars: number } & Measure & { runs: Array<Measure> }
  > = [];
  const probe = await browser.newPage();
  await probe.goto(`${base}/?doc=${encodeURIComponent(ids[0]!)}`);
  const reactVersion = await probe.evaluate(
    () => (window as any).__reactVersion as string,
  );
  await probe.close();
  console.log(
    `React ${reactVersion}, CPU throttling ${CPU}×, ${RUNS} runs each, ${ROUNDS}×${KEYS_PER_ROUND} keys at ${KEY_DELAY_MS} ms\n`,
  );
  for (const id of ids) {
    const runs: Array<Measure> = [];
    for (let i = 0; i < RUNS; i++) {
      const page = await browser.newPage();
      runs.push(await measure(page, `${base}/?doc=${encodeURIComponent(id)}`));
      await page.close();
    }
    const m = (k: keyof Measure) => median(runs.map((r) => r[k]));
    const row = {
      id,
      chars: docs.get(id)!.length,
      ...(Object.fromEntries(
        (Object.keys(runs[0]!) as Array<keyof Measure>).map((k) => [k, m(k)]),
      ) as Measure),
      runs,
    };
    results.push(row);
    const ms = (n: number) =>
      n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`;
    console.log(
      `${id} (${Math.round(row.chars / 1000)} KB)\n` +
        `  load ${ms(row.loadMs)} · busy after load ${ms(
          row.busyAfterLoadMs,
        )} (longest freeze ${ms(row.loadFreezeMs)})\n` +
        `  slow keys ${row.slowKeys}/${KEYS} · slowest key ${
          row.slowestKeyMs ? ms(row.slowestKeyMs) : '<16 ms'
        } · typing freeze ${ms(row.typingFreezeMs)} · pause freeze ${ms(
          row.pauseFreezeMs,
        )} · auto-diff ${row.autoDiffOff ? 'OFF' : 'on'}`,
    );
  }
  await browser.close();
  close();
  if (OUT) {
    writeFileSync(
      OUT,
      JSON.stringify({ cpu: CPU, react: reactVersion, results }, null, 1),
    );
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
