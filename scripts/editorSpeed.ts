/*
  Measures how the editor feels on long regulations: the speed baseline in
  docs/plan-tiptap-editor.md, "Long texts: speed". Runs the editor in
  Chromium (Playwright) on each text, types into the middle of it, and
  reads the browser's own timings.

    npx esbuild scripts/editorSpeed.ts --bundle --platform=node \
      --packages=external --outfile=/tmp/editorSpeed.js
    NODE_PATH=$PWD/node_modules node /tmp/editorSpeed.js \
      [--docs=0112-2012/current/text,…] [--runs=3] [--cpu=4] [--react=18]
      [--editor=v2] [--scenario=type|paste|article|table]
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

  `--scenario` picks what is done after the quiet wait; `type` (the default)
  is the typing above. The others measure the same way (median over
  `--runs`, longest main-thread block, Event Timing per keystroke):
  - paste: a synthetic paste event at the end of the middle paragraph, on a
    fresh page each: HTML (four articles with titles, paragraphs and a
    lettered list, as copied from another regulation), then plain text (a
    few paragraphs and a "3. gr." line, as copied from a PDF). "In after" is
    the time until the pasted text is in the document, "freeze" the longest
    block until then, "pause freeze" the longest in the PAUSE_MS after.
  - article: at the end of the middle paragraph, Enter, "99. gr.", the
    "Grein" format from the toolbar (EditorV2's "Snið" dropdown, TinyMCE's
    Formats menu), Enter and a sentence. "Format freeze" is the longest
    block from choosing the format until the title is there; "freeze while
    editing" the longest block from the first
    Enter to the last key. Checks that the article title is there.
  - table: 2 rounds of typing at the end of a cell in the middle row of the
    largest table, then a row added below (EditorV2's "Tafla" menu;
    TinyMCE's `mceTableInsertRowAfter`, the command its table menu runs).
    Texts with no table are skipped.
  Auto-diff is read as for `type`, but after one more key at the end: the
  editors only show that it is off at the change after the slow diff.
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
/** `v1` is `Editor` (TinyMCE), `v2` is `EditorV2` (Tiptap). */
const EDITOR = argStr('editor') ?? 'v1';
/** What is measured; see `SCENARIOS`. */
const SCENARIO = argStr('scenario') ?? 'type';
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
    if (url.pathname === '/editorV2.css') {
      res.writeHead(200, { 'content-type': 'text/css' });
      return res.end(readFileSync('src/editorV2.css'));
    }
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
<link rel="stylesheet" href="/editorV2.css">
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

type Timing = { start: number; duration: number; id?: number };
/** A scenario's measures: numbers, so each has a median over the runs. */
type Result = Record<string, number>;
type Span = [number, number];

const timings = (page: Page) =>
  page.evaluate(() => ({
    now: performance.now(),
    events: (window as any).__events as Array<Timing>,
    longtasks: (window as any).__longtasks as Array<Timing>,
  }));

const now = async (page: Page) => (await timings(page)).now;

/** The longest main-thread block that started between `from` and `to`. */
const longestTask = (longtasks: Array<Timing>, from: number, to: number) =>
  Math.max(
    0,
    ...longtasks
      .filter((t) => t.start >= from && t.start <= to)
      .map((t) => t.duration),
  );

/** One keystroke is one interaction; its time is its slowest event. */
const interactions = (events: Array<Timing>, spans: Array<Span>) => {
  const keys = new Map<number, number>();
  events
    .filter((e) => e.id && spans.some(([a, b]) => e.start >= a && e.start <= b))
    .forEach((e) =>
      keys.set(e.id!, Math.max(keys.get(e.id!) || 0, e.duration)),
    );
  return keys;
};

/** With SPEED_DEBUG: where the slow keystrokes fall. */
const debugSlowKeys = (
  events: Array<Timing>,
  keys: Map<number, number>,
  spans: Array<Span>,
  what = 'round',
) => {
  if (!process.env.SPEED_DEBUG) {
    return;
  }
  // Where the slow keystrokes fall: round, and ms into the round.
  const startOf = new Map<number, number>();
  events.forEach(
    (e) => e.id && !startOf.has(e.id) && startOf.set(e.id, e.start),
  );
  [...keys.entries()]
    .filter(([, d]) => d > SLOW_KEY_MS)
    .forEach(([id, d]) => {
      const start = startOf.get(id)!;
      const round = spans.findIndex(([a, b]) => start >= a && start <= b);
      console.log(
        `  slow key: ${Math.round(d)} ms, ${what} ${round + 1}, ` +
          `${Math.round(start - spans[round]![0])} ms in`,
      );
    });
};

/**
 * Opens the page throttled, waits for the editor, then until no long task
 * has ended for QUIET_MS.
 */
const open = async (page: Page, url: string) => {
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
  return { loadMs, busyUntil };
};

/** The load measures, given when the first action started. */
const loadMeasures = (
  { loadMs, busyUntil }: { loadMs: number; busyUntil: number },
  longtasks: Array<Timing>,
  firstAction: number,
) => ({
  loadMs,
  busyAfterLoadMs: busyUntil - loadMs,
  loadFreezeMs: longestTask(longtasks, loadMs - 1, firstAction),
});

// Found by position, not marked with an attribute: ProseMirror removes
// attributes set on its DOM.
const TARGET = '.editor[contenteditable] > p';

/** Clicks at the end of the middle top-level paragraph; its index. */
const clickMiddleParagraph = async (page: Page) => {
  const index = await page.evaluate((selector) => {
    const ps = document.querySelectorAll(selector);
    const i = Math.floor(ps.length / 2);
    ps[i]!.scrollIntoView({ block: 'center' });
    return i;
  }, TARGET);
  const box = (await page.locator(TARGET).nth(index).boundingBox())!;
  await page.mouse.click(box.x + box.width - 2, box.y + box.height - 4);
  return index;
};

/** Types `rounds` rounds of TYPED, pausing PAUSE_MS after each. */
const typeRounds = async (page: Page, rounds: number) => {
  const typing: Array<Span> = [];
  for (let round = 0; round < rounds; round++) {
    const t0 = await now(page);
    await page.keyboard.type(TYPED, { delay: KEY_DELAY_MS });
    const t1 = await now(page);
    typing.push([t0, t1]);
    await page.waitForTimeout(PAUSE_MS);
  }
  return typing;
};

const isAutoDiffOff = (page: Page) =>
  page.evaluate(() => !!document.querySelector('[data-needs-updating]'));

/**
 * Whether auto-diff is off after a single action. The editors only show it
 * (`data-needs-updating`) at the next change after the slow diff, which the
 * typing rounds make but one paste or one new article does not. So, after
 * all the measuring, one more key; then the flag shows within the debounce
 * if auto-diff is off.
 */
const isAutoDiffOffAfterProbe = async (page: Page) => {
  if (await isAutoDiffOff(page)) {
    return true;
  }
  await page.keyboard.type(' ');
  return page
    .waitForFunction(
      () => !!document.querySelector('[data-needs-updating]'),
      null,
      {
        timeout: 5000,
      },
    )
    .then(() => true)
    .catch(() => false);
};

// ---------------------------------------------------------------------------
// `type`: typing at the end of the middle paragraph.

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

const measureType = async (page: Page, url: string): Promise<Measure> => {
  const loaded = await open(page, url);
  const index = await clickMiddleParagraph(page);
  const typing = await typeRounds(page, ROUNDS);
  const typed = await page.evaluate(
    ([selector, i, text]) =>
      document
        .querySelectorAll(selector as string)
        [i as number]!.textContent!.includes(text as string),
    [TARGET, index, TYPED.repeat(ROUNDS).trim()] as const,
  );
  if (!typed) {
    throw new Error(`the typed text did not land in the paragraph: ${url}`);
  }
  const autoDiffOff = await isAutoDiffOff(page);
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
  const maxIn = (from: number, to: number) => longestTask(longtasks, from, to);
  const keys = interactions(events, typing);
  debugSlowKeys(events, keys, typing);
  return {
    ...loadMeasures(loaded, longtasks, typing[0]![0]),
    slowKeys: [...keys.values()].filter((d) => d > SLOW_KEY_MS).length,
    slowestKeyMs: Math.max(0, ...keys.values()),
    typingFreezeMs: Math.max(...typing.map(([a, b]) => maxIn(a, b))),
    pauseFreezeMs: Math.max(...typing.map(([, b]) => maxIn(b, b + PAUSE_MS))),
    autoDiffOff: autoDiffOff ? 1 : 0,
  };
};

// ---------------------------------------------------------------------------
// `paste`: pasting at the end of the middle paragraph, as HTML (copied from
// another regulation) and as plain text (copied from a PDF).

const PASTE_HTML = `<h3 class="article__title">31. gr. <em>Gildissvið mælinga.</em></h3>
<p>Reglugerð þessi gildir um mælingar á hraða ritilsins við vinnslu langra texta, hvort sem þær fara fram hjá ráðuneyti eða stofnun.</p>
<p>Ráðherra er heimilt að setja nánari reglur um framkvæmd mælinga, þar á meðal um fjölda endurtekninga og þau tæki sem notuð eru.</p>
<h3 class="article__title">32. gr. <em>Skilyrði.</em></h3>
<p>Mæling telst gild ef eftirtalin skilyrði eru uppfyllt:</p>
<ol type="a">
<li>textinn hefur verið hlaðinn að fullu áður en mæling hefst,</li>
<li>engin önnur vinnsla fer fram á sama tíma og</li>
<li>niðurstöður eru skráðar með sama hætti í hvert sinn.</li>
</ol>
<p>Stofnunin skal halda skrá yfir allar mælingar og varðveita hana í fimm ár.</p>
<h3 class="article__title">33. gr. <em>Eftirlit.</em></h3>
<p>Stofnunin hefur eftirlit með því að ákvæðum reglugerðar þessarar sé fylgt. Hún getur krafist þeirra upplýsinga sem nauðsynlegar eru vegna eftirlitsins.</p>
<p>Verði vart við frávik skal stofnunin tilkynna það ráðuneytinu án tafar.</p>
<h3 class="article__title">34. gr. <em>Gildistaka.</em></h3>
<p>Reglugerð þessi er sett með stoð í lögum og öðlast þegar gildi. Hún lýkur límdum prófunartexta.</p>`;
const PASTE_HTML_MARKS = ['Gildissvið mælinga', 'lýkur límdum prófunartexta'];

const PASTE_TEXT = `Mælingar skulu fara fram á þeim tækjum sem stofnunin samþykkir og í samræmi við leiðbeiningar hennar.

Niðurstöður mælinga skulu birtar á vef stofnunarinnar eigi síðar en mánuði eftir að mælingu lýkur.

3. gr.
Undanþágur.

Stofnuninni er heimilt að veita undanþágu frá ákvæðum þessarar greinar ef sérstakar ástæður mæla með því. Hér lýkur límdum hreinum texta.`;
const PASTE_TEXT_MARKS = [
  'Mælingar skulu fara fram',
  'lýkur límdum hreinum texta',
];

const PASTES = {
  html: { type: 'text/html', data: PASTE_HTML, marks: PASTE_HTML_MARKS },
  text: { type: 'text/plain', data: PASTE_TEXT, marks: PASTE_TEXT_MARKS },
};

/**
 * Pastes at the end of the middle paragraph with a synthetic paste event:
 * how long until the pasted text is in the document, the longest block on
 * the way, and the longest in the pause after.
 */
const measurePaste =
  (kind: keyof typeof PASTES) => async (page: Page, url: string) => {
    const { type, data, marks } = PASTES[kind];
    const loaded = await open(page, url);
    const index = await clickMiddleParagraph(page);
    // Dispatched in a task of its own, so its block starts after `t0`.
    const t0 = await page.evaluate(
      ([type, data]) => {
        const dt = new DataTransfer();
        dt.setData(type, data);
        const node = getSelection()!.anchorNode!;
        const target =
          node.nodeType === Node.ELEMENT_NODE
            ? (node as Element)
            : node.parentElement!;
        setTimeout(() =>
          target.dispatchEvent(
            new ClipboardEvent('paste', {
              clipboardData: dt,
              bubbles: true,
              cancelable: true,
            }),
          ),
        );
        return performance.now();
      },
      [type, data] as const,
    );
    // The pasted text lands in the paragraph and the blocks after it.
    const landed = await page
      .waitForFunction(
        ([selector, i, marks]) => {
          let el: Element | null = document.querySelectorAll(
            selector as string,
          )[i as number]!;
          let text = '';
          for (let n = 0; el && n < 60; n++, el = el.nextElementSibling) {
            text += el.textContent;
          }
          return (
            (marks as Array<string>).every((m) => text.includes(m)) &&
            performance.now()
          );
        },
        [TARGET, index, marks] as const,
        { polling: 'raf', timeout: 60000 },
      )
      .then((h) => h.jsonValue() as Promise<number>)
      .catch(() => {
        throw new Error(`the pasted ${kind} did not land: ${url}`);
      });
    await page.waitForTimeout(PAUSE_MS);
    if (process.env.SPEED_DEBUG) {
      // What the paste became: the blocks from the paragraph to the last mark.
      const blocks = await page.evaluate(
        ([selector, i, last]) => {
          const out: Array<string> = [];
          let el: Element | null = document.querySelectorAll(
            selector as string,
          )[i as number]!;
          for (let n = 0; el && n < 60; n++, el = el.nextElementSibling) {
            out.push(
              el.tagName.toLowerCase() +
                (el.className ? '.' + el.className.split(' ').join('.') : ''),
            );
            if (el.textContent!.includes(last as string)) {
              break;
            }
          }
          return out.join(' ');
        },
        [TARGET, index, marks[marks.length - 1]!] as const,
      );
      console.log(`  ${kind} paste became: ${blocks}`);
    }
    const autoDiffOff = await isAutoDiffOffAfterProbe(page);
    const { longtasks } = await timings(page);
    return {
      ...(kind === 'html' ? loadMeasures(loaded, longtasks, t0) : {}),
      [`${kind}LandMs`]: landed - t0,
      [`${kind}FreezeMs`]: longestTask(longtasks, t0, landed),
      [`${kind}PauseFreezeMs`]: longestTask(
        longtasks,
        landed,
        landed + PAUSE_MS,
      ),
      [`${kind}AutoDiffOff`]: autoDiffOff ? 1 : 0,
    };
  };

// ---------------------------------------------------------------------------
// `article`: a new article after the middle paragraph.

const ARTICLE_TITLE = '99. gr.';
const ARTICLE_TEXT = 'Grein sett inn til prufu a hrada ritilsins.';
const ARTICLE_KEYS = 1 + ARTICLE_TITLE.length + 1 + ARTICLE_TEXT.length;

/** Makes the current paragraph an article title, from the toolbar. */
const applyArticleTitle = async (page: Page) => {
  if (EDITOR === 'v2') {
    // EditorV2's "Snið" dropdown, item "Grein".
    await page.click('.regtools-toolbar button[aria-label="Snið"]');
    await page
      .locator('.regtools-toolbar__menu')
      .getByRole('button', { name: 'Grein', exact: true })
      .click();
    return;
  }
  // TinyMCE's "Formats" (styleselect) menu, item "Grein".
  await page.click('.tox-tbtn--select[title="Formats"]');
  await page
    .locator('.tox-collection__item')
    .filter({
      has: page.locator('.tox-collection__item-label', { hasText: /^Grein$/ }),
    })
    .click();
};

const measureArticle = async (page: Page, url: string) => {
  const loaded = await open(page, url);
  await clickMiddleParagraph(page);
  const keySpans: Array<Span> = [];
  const keys = async (fn: () => Promise<void>) => {
    const a = await now(page);
    await fn();
    keySpans.push([a, await now(page)]);
  };
  const enter = async () => {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(KEY_DELAY_MS);
  };

  const t0 = await now(page);
  await keys(enter);
  await keys(() => page.keyboard.type(ARTICLE_TITLE, { delay: KEY_DELAY_MS }));
  const f0 = await now(page);
  await applyArticleTitle(page);
  await page.waitForFunction(
    (title) =>
      [
        ...document.querySelectorAll(
          '.editor[contenteditable] h3.article__title',
        ),
      ].some((h) => h.textContent!.trim() === title),
    ARTICLE_TITLE,
    { polling: 'raf', timeout: 60000 },
  );
  const f1 = await now(page);
  await page.waitForTimeout(KEY_DELAY_MS);
  await keys(enter);
  await keys(() => page.keyboard.type(ARTICLE_TEXT, { delay: KEY_DELAY_MS }));
  const t1 = await now(page);
  await page.waitForTimeout(PAUSE_MS);

  const ok = await page.evaluate(
    ([title, text]) => {
      const h = [
        ...document.querySelectorAll(
          '.editor[contenteditable] h3.article__title',
        ),
      ].find((h) => h.textContent!.trim() === title);
      return !!h && !!h.nextElementSibling?.textContent!.includes(text!);
    },
    [ARTICLE_TITLE, ARTICLE_TEXT] as const,
  );
  if (!ok) {
    throw new Error(`the new article is not in the editor: ${url}`);
  }
  const autoDiffOff = await isAutoDiffOffAfterProbe(page);
  const { events, longtasks } = await timings(page);
  const keyTimes = interactions(events, keySpans);
  debugSlowKeys(events, keyTimes, keySpans, 'step');
  return {
    ...loadMeasures(loaded, longtasks, t0),
    slowKeys: [...keyTimes.values()].filter((d) => d > SLOW_KEY_MS).length,
    slowestKeyMs: Math.max(0, ...keyTimes.values()),
    formatFreezeMs: longestTask(longtasks, f0, f1),
    editFreezeMs: longestTask(longtasks, t0, t1),
    pauseFreezeMs: longestTask(longtasks, t1, t1 + PAUSE_MS),
    autoDiffOff: autoDiffOff ? 1 : 0,
  };
};

// ---------------------------------------------------------------------------
// `table`: typing in a cell of the largest table, then a row added after it.

const TABLE_ROUNDS = 2;

const measureTable = async (page: Page, url: string) => {
  const loaded = await open(page, url);
  // The largest table by cells; a cell with text in its middle row.
  const at = await page.evaluate(() => {
    const tables = [
      ...document.querySelectorAll('.editor[contenteditable] table'),
    ] as Array<HTMLTableElement>;
    const size = (t: HTMLTableElement) =>
      [...t.rows].reduce((n, r) => n + r.cells.length, 0);
    const table = tables.reduce((a, b) => (size(b) > size(a) ? b : a));
    const t = tables.indexOf(table);
    const r = Math.floor(table.rows.length / 2);
    const cells = [...table.rows[r]!.cells];
    const c = Math.max(
      0,
      cells.findIndex((cell) => cell.textContent!.trim()),
    );
    const cell = cells[c]!;
    cell.scrollIntoView({ block: 'center' });
    // The end of its last text, where a click puts the cursor.
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    while (walker.nextNode()) {
      if (walker.currentNode.textContent!.trim()) {
        last = walker.currentNode as Text;
      }
    }
    let rect = cell.getBoundingClientRect();
    if (last) {
      const range = document.createRange();
      range.selectNodeContents(last);
      const rects = range.getClientRects();
      rect = rects[rects.length - 1] ?? rect;
    }
    return {
      t,
      r,
      c,
      rows: table.rows.length,
      x: rect.right - 1,
      y: rect.top + rect.height / 2,
    };
  });
  await page.mouse.click(at.x, at.y);
  const typing = await typeRounds(page, TABLE_ROUNDS);
  const typed = await page.evaluate(
    ([at, text]) =>
      (
        document.querySelectorAll('.editor[contenteditable] table')[
          at.t
        ] as HTMLTableElement
      ).rows[at.r]!.cells[at.c]!.textContent!.includes(text),
    [at, TYPED.repeat(TABLE_ROUNDS).trim()] as const,
  );
  if (!typed) {
    throw new Error(`the typed text did not land in the cell: ${url}`);
  }

  // The cursor is still in the cell.
  const r0 = await now(page);
  if (EDITOR === 'v2') {
    await page.click('.regtools-toolbar button[aria-label="Tafla"]');
    await page
      .locator('.regtools-toolbar__menu')
      .getByRole('button', { name: 'Röð fyrir neðan' })
      .click();
  } else {
    // TinyMCE's table menu is a context toolbar; its command is the same.
    await page.evaluate(() =>
      setTimeout(() =>
        (window as any).tinymce.activeEditor.execCommand(
          'mceTableInsertRowAfter',
        ),
      ),
    );
  }
  const r1 = await page
    .waitForFunction(
      (at) =>
        (
          document.querySelectorAll('.editor[contenteditable] table')[
            at.t
          ] as HTMLTableElement
        ).rows.length ===
          at.rows + 1 && performance.now(),
      at,
      { polling: 'raf', timeout: 60000 },
    )
    .then((h) => h.jsonValue() as Promise<number>)
    .catch(() => {
      throw new Error(`the row was not added: ${url}`);
    });
  await page.waitForTimeout(PAUSE_MS);

  const autoDiffOff = await isAutoDiffOffAfterProbe(page);
  const { events, longtasks } = await timings(page);
  const keys = interactions(events, typing);
  debugSlowKeys(events, keys, typing);
  return {
    ...loadMeasures(loaded, longtasks, typing[0]![0]),
    slowKeys: [...keys.values()].filter((d) => d > SLOW_KEY_MS).length,
    slowestKeyMs: Math.max(0, ...keys.values()),
    typingFreezeMs: Math.max(
      ...typing.map(([a, b]) => longestTask(longtasks, a, b)),
    ),
    pauseFreezeMs: Math.max(
      ...typing.map(([, b]) => longestTask(longtasks, b, b + PAUSE_MS)),
    ),
    rowFreezeMs: longestTask(longtasks, r0, r1),
    rowPauseFreezeMs: longestTask(longtasks, r1, r1 + PAUSE_MS),
    autoDiffOff: autoDiffOff ? 1 : 0,
  };
};

// ---------------------------------------------------------------------------

const ms = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`;
const key = (n: number) => (n ? ms(n) : '<16 ms');
const diff = (off: number) => `auto-diff ${off ? 'OFF' : 'on'}`;
const loadLine = (row: Result) =>
  `  load ${ms(row.loadMs!)} · busy after load ${ms(
    row.busyAfterLoadMs!,
  )} (longest freeze ${ms(row.loadFreezeMs!)})\n`;

type Scenario = {
  /** What is done, for the heading. */
  what: string;
  /** Why a text cannot be measured, if it cannot. */
  skip?: (html: string) => string | undefined;
  /** Each step runs on a fresh page; their measures are merged. */
  steps: Array<(page: Page, url: string) => Promise<Result>>;
  print: (row: Result) => string;
};

const SCENARIOS: Record<string, Scenario> = {
  type: {
    what: `${ROUNDS}×${KEYS_PER_ROUND} keys at ${KEY_DELAY_MS} ms`,
    steps: [measureType],
    print: (row) =>
      loadLine(row) +
      `  slow keys ${row.slowKeys}/${KEYS} · slowest key ${key(
        row.slowestKeyMs!,
      )} · typing freeze ${ms(row.typingFreezeMs!)} · pause freeze ${ms(
        row.pauseFreezeMs!,
      )} · ${diff(row.autoDiffOff!)}`,
  },
  paste: {
    what: `pasting ${PASTE_HTML.length} chars of HTML and ${PASTE_TEXT.length} of plain text`,
    steps: [measurePaste('html'), measurePaste('text')],
    print: (row) =>
      loadLine(row) +
      (['html', 'text'] as const)
        .map(
          (k) =>
            `  ${k === 'html' ? 'HTML' : 'text'} paste: in after ${ms(
              row[`${k}LandMs`]!,
            )} · freeze ${ms(row[`${k}FreezeMs`]!)} · pause freeze ${ms(
              row[`${k}PauseFreezeMs`]!,
            )} · ${diff(row[`${k}AutoDiffOff`]!)}`,
        )
        .join('\n'),
  },
  article: {
    what:
      `a new article: Enter, "${ARTICLE_TITLE}", format "Grein", Enter, ` +
      `${ARTICLE_TEXT.length} keys, at ${KEY_DELAY_MS} ms`,
    steps: [measureArticle],
    print: (row) =>
      loadLine(row) +
      `  slow keys ${row.slowKeys}/${ARTICLE_KEYS} · slowest key ${key(
        row.slowestKeyMs!,
      )} · format freeze ${ms(row.formatFreezeMs!)} · freeze while editing ${ms(
        row.editFreezeMs!,
      )} · pause freeze ${ms(row.pauseFreezeMs!)} · ${diff(row.autoDiffOff!)}`,
  },
  table: {
    what:
      `${TABLE_ROUNDS}×${KEYS_PER_ROUND} keys at ${KEY_DELAY_MS} ms in a cell ` +
      `of the largest table, then a row added after`,
    skip: (html) => (/<table/i.test(html) ? undefined : 'no table'),
    steps: [measureTable],
    print: (row) =>
      loadLine(row) +
      `  slow keys ${row.slowKeys}/${TABLE_ROUNDS * KEYS_PER_ROUND} · ` +
      `slowest key ${key(row.slowestKeyMs!)} · typing freeze ${ms(
        row.typingFreezeMs!,
      )} · pause freeze ${ms(row.pauseFreezeMs!)}\n` +
      `  row added: freeze ${ms(row.rowFreezeMs!)} · pause freeze ${ms(
        row.rowPauseFreezeMs!,
      )} · ${diff(row.autoDiffOff!)}`,
  },
};

const median = (xs: Array<number>) =>
  [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] ?? 0;

const run = async () => {
  const scenario = SCENARIOS[SCENARIO];
  if (!scenario) {
    throw new Error(
      `unknown --scenario=${SCENARIO}; one of ${Object.keys(SCENARIOS).join(
        ', ',
      )}`,
    );
  }
  const ids = docIds();
  const docs = new Map(ids.map((id) => [id, htmlOf(id)]));
  const { base, close } = await serve(await bundle(), docs);
  const browser = await chromium.launch();
  const results: Array<
    { id: string; chars: number } & (
      | { runs: Array<Result> }
      | { skipped: string }
    )
  > = [];
  const probe = await browser.newPage();
  await probe.goto(
    `${base}/?editor=${EDITOR}&doc=${encodeURIComponent(ids[0]!)}`,
  );
  const reactVersion = await probe.evaluate(
    () => (window as any).__reactVersion as string,
  );
  await probe.close();
  console.log(
    `${
      EDITOR === 'v2' ? 'EditorV2' : 'Editor'
    }, React ${reactVersion}, CPU throttling ${CPU}×, ${RUNS} runs each, ${
      SCENARIO === 'type' ? '' : `scenario ${SCENARIO}: `
    }${scenario.what}\n`,
  );
  for (const id of ids) {
    const chars = docs.get(id)!.length;
    const skipped = scenario.skip?.(docs.get(id)!);
    if (skipped) {
      results.push({ id, chars, skipped });
      console.log(
        `${id} (${Math.round(chars / 1000)} KB)\n  skipped: ${skipped}`,
      );
      continue;
    }
    const runs: Array<Result> = [];
    for (let i = 0; i < RUNS; i++) {
      let result: Result = {};
      for (const step of scenario.steps) {
        const page = await browser.newPage();
        result = {
          ...result,
          ...(await step(
            page,
            `${base}/?editor=${EDITOR}&doc=${encodeURIComponent(id)}`,
          )),
        };
        await page.close();
      }
      runs.push(result);
    }
    const medians: Result = Object.fromEntries(
      Object.keys(runs[0]!).map((k) => [k, median(runs.map((r) => r[k]!))]),
    );
    results.push({ id, chars, ...medians, runs });
    console.log(
      `${id} (${Math.round(chars / 1000)} KB)\n` + scenario.print(medians),
    );
  }
  await browser.close();
  close();
  if (OUT) {
    writeFileSync(
      OUT,
      JSON.stringify(
        {
          editor: EDITOR,
          ...(SCENARIO !== 'type' && { scenario: SCENARIO }),
          cpu: CPU,
          react: reactVersion,
          results,
        },
        null,
        1,
      ),
    );
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
