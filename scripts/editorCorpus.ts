/*
  Builds the editor v2 corpus from real regulations and counts the markup in
  it: which elements, classes, attributes, inline styles and nestings occur,
  in how many documents, with example documents for each. See
  docs/plan-tiptap-editor.md, "Schema" and "Tests".

    npx esbuild scripts/editorCorpus.ts --bundle --platform=node \
      --packages=external --outfile=/tmp/editorCorpus.js
    REGULATIONS_API_URL=<base URL, …/api/v1> \
      node /tmp/editorCorpus.js [--max-requests=1000] [--seed=1] \
        [--regs=0112-2012,…] [--out=.cache/editor-corpus]

  The sample: every regulation in /regulations/all/current/minimal (one
  request), grouped by decade, shuffled with a fixed seed, then taken round
  robin across decades so every decade gets its share before any gets more.
  For each: the `current` version, and the `original` too when the regulation
  has been amended. Plus `--regs` and the known long texts, first.

  Requests go through ./regulationsApi: sequential, one a second, cached in
  .cache/regulations-api/. The run stops when `--max-requests` real requests
  have gone out; cache hits are free, so a rerun with the same seed makes no
  requests and gives the same corpus.

  Writes to `--out`:
  - manifest.json — the documents in the corpus, so later phases test the
    same set
  - census.json — every count, with up to five example documents each
  and prints the summary.
*/

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { asDiv } from '../src/_cleanup/serverDOM';
import {
  ApiError,
  getJson,
  getReg,
  Reg,
  RequestBudgetExceeded,
  requestCount,
  setMaxRequests,
} from './regulationsApi';

const argStr = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const argNum = (name: string, fallback: number) =>
  Number(argStr(name) ?? fallback);

const MAX_REQUESTS = argNum('max-requests', 1000);
const SEED = argNum('seed', 1);
const OUT = argStr('out') ?? join('.cache', 'editor-corpus');
const EXTRA = (argStr('regs') ?? '').split(',').filter(Boolean);
/** The longest texts seen so far, kept in every sample for the speed tests. */
const KNOWN_LONG = [
  '0112-2012',
  '0544-2015',
  '1205-2021',
  '0340-2017',
  '0878-2014',
];
const EXAMPLES = 5;
/** Gateway errors in a row (each already retried once) before the run stops. */
const MAX_GATEWAY_FAILURES = 3;

// ---------------------------------------------------------------------------

type ListItem = { name: string; type?: string; migrated?: boolean };

/** A document the editor edits: a regulation's text, an appendix, or the comments. */
type Doc = {
  id: string;
  reg: string;
  variant: 'current' | 'original';
  field: string;
  migrated?: boolean;
  html: string;
};

/** mulberry32: small, seeded, good enough for shuffling a sample. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const shuffle = <T>(xs: Array<T>, rand: () => number) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

const decadeOf = (reg: string) => reg.slice(5, 8) + '0s';

/** Every decade's regulations, shuffled, interleaved one decade at a time. */
const sampleOrder = (list: Array<ListItem>) => {
  const rand = rng(SEED);
  const byDecade = new Map<string, Array<ListItem>>();
  list.forEach((item) => {
    const d = decadeOf(item.name.replace('/', '-'));
    byDecade.set(d, [...(byDecade.get(d) || []), item]);
  });
  const queues = [...byDecade.keys()]
    .sort()
    .map((d) => shuffle(byDecade.get(d)!, rand));
  const order: Array<ListItem> = [];
  for (let i = 0; queues.some((q) => i < q.length); i++) {
    queues.forEach((q) => q[i] && order.push(q[i]!));
  }
  return order;
};

const docsOf = (
  reg: string,
  variant: Doc['variant'],
  r: Reg,
  migrated?: boolean,
): Array<Doc> => {
  const docs: Array<Doc> = [];
  const add = (field: string, html?: string) =>
    html &&
    docs.push({
      id: `${reg}/${variant}/${field}`,
      reg,
      variant,
      field,
      migrated,
      html,
    });
  add('text', r.text);
  (r.appendixes || []).forEach((a, i) => add(`appendix${i + 1}`, a.text));
  add('comments', r.comments);
  return docs;
};

// ---------------------------------------------------------------------------
// Census

type Tally = { docs: number; count: number; examples: Array<string> };
type Census = Record<string, Record<string, Tally>>;

/** Attributes whose values are a small, meaningful set; others are counted by name only. */
const VALUE_ATTRS = new Set([
  'type',
  'align',
  'valign',
  'target',
  'dir',
  'scope',
  'border',
]);

const censusOf = (docs: Array<Doc>) => {
  const census: Census = {};
  const sizes: Array<{ id: string; chars: number; elements: number }> = [];

  docs.forEach((doc) => {
    const seen = new Set<string>();
    const tally = (group: string, key: string) => {
      const g = (census[group] ||= {});
      const t = (g[key] ||= { docs: 0, count: 0, examples: [] });
      t.count++;
      if (!seen.has(group + '\0' + key)) {
        seen.add(group + '\0' + key);
        t.docs++;
        t.examples.length < EXAMPLES && t.examples.push(doc.id);
      }
    };

    const root = asDiv(doc.html);
    root.childNodes.forEach((n) => {
      if (n.nodeType === 3 && n.textContent!.trim()) {
        tally('root', '#text');
      } else if (n.nodeType === 8) {
        tally('root', '#comment');
      } else if (n.nodeType === 1) {
        tally('root', (n as Element).tagName.toLowerCase());
      }
    });

    const elements = root.querySelectorAll('*');
    elements.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      tally('element', tag);
      el.classList.forEach((c) => tally('class', `${tag}.${c}`));
      [...el.attributes].forEach(({ name, value }) => {
        if (name === 'class') {
          return;
        }
        if (name === 'style') {
          value
            .split(';')
            .map((p) => p.split(':')[0]!.trim().toLowerCase())
            .filter(Boolean)
            .forEach((prop) => tally('style', `${tag}{${prop}}`));
          return;
        }
        const withValue =
          VALUE_ATTRS.has(name) || name.startsWith('data-')
            ? `=${value.slice(0, 24)}`
            : '';
        tally('attribute', `${tag}[${name}${withValue}]`);
      });
      const parent = el.parentElement;
      tally(
        'nesting',
        `${parent === root ? 'root' : parent!.tagName.toLowerCase()}>${tag}`,
      );
    });

    // Comments anywhere, not only at the root.
    const walker = root.ownerDocument.createTreeWalker(root, 128);
    while (walker.nextNode()) {
      tally('other', '<!-- comment -->');
    }

    sizes.push({
      id: doc.id,
      chars: doc.html.length,
      elements: elements.length,
    });
  });

  sizes.sort((a, b) => b.chars - a.chars);
  return { census, longest: sizes.slice(0, 15) };
};

// ---------------------------------------------------------------------------

const run = async () => {
  setMaxRequests(MAX_REQUESTS);
  const docs: Array<Doc> = [];
  const regs: Array<string> = [];
  let stopped: string | undefined;
  let lastLogged = 0;
  let gatewayFailures = 0;
  const isGateway = (e: unknown) =>
    e instanceof ApiError && [502, 503, 504].includes(e.status);

  const take = async (reg: string, migrated?: boolean) => {
    const current = await getReg(`${reg}/current`);
    if (!current.text) {
      return; // a redirect stub
    }
    regs.push(reg);
    docs.push(...docsOf(reg, 'current', current, migrated));
    if ((current.history || []).some((h) => h.effect === 'amend')) {
      try {
        docs.push(
          ...docsOf(reg, 'original', await getReg(`${reg}/original`), migrated),
        );
      } catch (e) {
        if (e instanceof RequestBudgetExceeded || isGateway(e)) {
          throw e;
        }
        console.log(`${reg}: no original (${e})`);
      }
    }
  };

  try {
    const list = await getJson<Array<ListItem>>(
      'regulations/all/current/minimal',
    );
    const order = sampleOrder(list);
    const migratedOf = new Map(
      list.map((x) => [x.name.replace('/', '-'), x.migrated]),
    );
    console.log(
      `${list.length} regulations listed, in ${
        new Set(list.map((x) => decadeOf(x.name.replace('/', '-')))).size
      } decades`,
    );
    const first = [...new Set([...EXTRA, ...KNOWN_LONG])];
    const rest = order
      .map((x) => x.name.replace('/', '-'))
      .filter((n) => !first.includes(n));
    for (const reg of [...first, ...rest]) {
      try {
        await take(reg, migratedOf.get(reg));
        gatewayFailures = 0;
      } catch (e) {
        if (e instanceof RequestBudgetExceeded) {
          throw e;
        }
        console.log(`${reg}: skipped (${e})`);
        if (isGateway(e) && ++gatewayFailures >= MAX_GATEWAY_FAILURES) {
          stopped = `${gatewayFailures} gateway errors in a row, the API is struggling`;
          break;
        }
      }
      if (regs.length % 25 === 0 && regs.length !== lastLogged) {
        lastLogged = regs.length;
        console.log(`${regs.length} regulations, ${requestCount()} requests`);
      }
    }
  } catch (e) {
    if (!(e instanceof RequestBudgetExceeded)) {
      throw e;
    }
    stopped = `the budget of ${MAX_REQUESTS} requests is used up`;
  }

  const { census, longest } = censusOf(docs);
  const byDecade: Record<string, number> = {};
  regs.forEach(
    (r) => (byDecade[decadeOf(r)] = (byDecade[decadeOf(r)] || 0) + 1),
  );

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, 'manifest.json'),
    JSON.stringify(
      {
        seed: SEED,
        regulations: regs,
        documents: docs.map(({ id, migrated }) => ({ id, migrated })),
      },
      null,
      1,
    ),
  );
  writeFileSync(
    join(OUT, 'census.json'),
    JSON.stringify({ byDecade, longest, census }, null, 1),
  );

  console.log(
    `\n${regs.length} regulations, ${
      docs.length
    } documents, ${requestCount()} requests` +
      (stopped ? ` (stopped: ${stopped})` : ''),
  );
  console.log('by decade:', JSON.stringify(byDecade));
  console.log(
    'documents:',
    JSON.stringify({
      text: docs.filter((d) => d.field === 'text').length,
      appendix: docs.filter((d) => d.field.startsWith('appendix')).length,
      comments: docs.filter((d) => d.field === 'comments').length,
      unmigrated: docs.filter((d) => d.migrated === false).length,
    }),
  );
  Object.entries(census).forEach(([group, tallies]) => {
    console.log(`\n== ${group}`);
    Object.entries(tallies)
      .sort((a, b) => b[1].docs - a[1].docs)
      .slice(0, 40)
      .forEach(([key, t]) =>
        console.log(
          `${String(t.docs).padStart(6)} docs ${String(t.count).padStart(
            8,
          )}×  ${key}`,
        ),
      );
  });
  console.log('\n== longest');
  longest.forEach((x) =>
    console.log(
      `${String(x.chars).padStart(8)} chars ${String(x.elements).padStart(
        6,
      )} elements  ${x.id}`,
    ),
  );
  console.log(`\nWritten to ${OUT}/`);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
