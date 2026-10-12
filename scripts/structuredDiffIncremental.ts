/*
  Checks createStructuredDiffer against getStructuredDiff over the corpus:
  every document in .cache/editor-corpus/manifest.json, read from the API
  cache. No API requests are made.

    npx esbuild scripts/structuredDiffIncremental.ts --bundle --platform=node \
      --packages=external --outfile=/tmp/structuredDiffIncremental.js
    NODE_PATH=$PWD/node_modules node /tmp/structuredDiffIncremental.js \
      [--docs=0112-2012/current/text,…] [--edits=5] [--seed=1] [--no-timing]

  For each document: a differ on the stored text, then a seeded sequence of
  random edits (the same as src/__test__/structuredDiffIncremental.test.ts),
  and after every edit the differ's result compared with a fresh
  getStructuredDiff — the diff HTML byte for byte, and the sections as JSON
  with undefined properties kept. A mismatch names the seed and the edits.

  Then the timing: for the five long texts of docs/plan-tiptap-editor.md, a
  full getStructuredDiff against differ.diff after a few words are typed at
  the end of the middle top-level <p>, median of several such edits.
*/

import { readFileSync } from 'fs';
import { join } from 'path';

import { asDiv } from '../src/_cleanup/serverDOM';
import { splitTopLevel } from '../src/_structuredDiff/incremental';
import {
  createStructuredDiffer,
  getStructuredDiff,
} from '../src/structuredDiff';
import { HTMLText } from '../src/types';

const argStr = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const EDITS_PER_DOC = Number(argStr('edits') ?? 5);
const SEED = Number(argStr('seed') ?? 1);
const TIMING = !process.argv.includes('--no-timing');

const CORPUS = join('.cache', 'editor-corpus');
const API_CACHE = join('.cache', 'regulations-api', 'api.reglugerd.is');

const LONG_TEXTS = [
  '0112-2012/current/text',
  '0544-2015/current/text',
  '1205-2021/current/text',
  '0801-2022/current/appendix1',
  '0340-2017/current/text',
];
const TIMED_EDITS = 7;

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

/** Sections as JSON, `undefined` properties kept, so the comparison is strict. */
const project = (x: unknown) =>
  JSON.stringify(x, (_k, v) => (v === undefined ? '\u0000undefined' : v));

/** Whether every top-level piece parses back to itself (else: the full parse). */
const roundTrips = (html: string) =>
  splitTopLevel(html).every((piece) => {
    const root = asDiv(piece);
    return root.childNodes.length === 1 && root.innerHTML === piece;
  });

// ---------------------------------------------------------------------------
// Random edits, as in the Jest test

/** mulberry32 */
const random = (seed: number) => {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T>(xs: ArrayLike<T>): T | undefined =>
    xs.length ? xs[int(xs.length)] : undefined;
  return { next, int, pick };
};
type Rand = ReturnType<typeof random>;

const WORDS =
  'og skal ráðherra reglugerð þessi öðlast gildi samkvæmt lögum stofnun heimilt vegna breytingar eftirlit umsókn leyfi'.split(
    ' ',
  );
const phrase = (r: Rand, min: number, max: number) =>
  Array.from({ length: min + r.int(max - min + 1) }, () => r.pick(WORDS)).join(
    ' ',
  );

const topLevel = (root: Element, tag: string) =>
  Array.from(root.children).filter((el) => el.tagName === tag);

const textNodes = (el: Element) => {
  const out: Array<Text> = [];
  const walk = (node: Node) =>
    node.childNodes.forEach((c) =>
      c.nodeType === 3 ? out.push(c as Text) : walk(c),
    );
  walk(el);
  return out.filter((t) => t.data.trim());
};

/** Types words into a text node of `el`, at a random point. */
const typeInto = (el: Element | undefined, r: Rand) => {
  const t = el && r.pick(textNodes(el));
  if (!t) {
    return;
  }
  const at = r.next() < 0.5 ? t.data.length : r.int(t.data.length + 1);
  const words = phrase(r, 1, 3);
  t.data = t.data.slice(0, at) + ' ' + words + ' ' + t.data.slice(at);
  return `"${words}" at ${at}`;
};

/** A top-level position to insert at: before a random child, or at the end. */
const insertAt = (root: Element, r: Rand, nodes: Array<Node>) => {
  const before = r.pick(Array.from(root.children).concat([null as any]));
  nodes.forEach((n) => root.insertBefore(n, before || null));
  return before ? Array.from(root.children).indexOf(before) : 'end';
};

/** An article heading and everything after it up to the next heading. */
const articleAt = (h: Element) => {
  const out: Array<Element> = [h];
  for (let n = h.nextElementSibling; n && !/^H[23]$/.test(n.tagName); ) {
    out.push(n);
    n = n.nextElementSibling;
  }
  return out;
};

const index = (el: Element) =>
  el.parentElement ? Array.from(el.parentElement.children).indexOf(el) : -1;

type Edit = (root: Element, r: Rand) => string | undefined;

const EDITS: Record<string, Edit> = {
  type: (root, r) => {
    const p = r.pick(root.querySelectorAll('p'));
    const d = typeInto(p, r);
    return d && `type ${d} into p ${index(p!)}`;
  },
  'type-end-of-p': (root, r) => {
    const p = r.pick(topLevel(root, 'P'));
    const t = p && textNodes(p).pop();
    if (!t) {
      return;
    }
    const words = phrase(r, 1, 3);
    t.data += ' ' + words;
    return `type "${words}" at end of p ${index(p!)}`;
  },
  'delete-p': (root, r) => {
    const p = r.pick(topLevel(root, 'P'));
    if (!p) {
      return;
    }
    const i = index(p);
    p.remove();
    return `delete p ${i}`;
  },
  'insert-p': (root, r) => {
    const p = root.ownerDocument.createElement('p');
    p.textContent = phrase(r, 4, 14);
    return `insert p at ${insertAt(root, r, [p])}`;
  },
  'add-article': (root, r) => {
    const doc = root.ownerDocument;
    const h = doc.createElement('h3');
    h.className = 'article__title';
    const n = 1 + r.int(40);
    h.textContent = `${n}. gr.`;
    const p = doc.createElement('p');
    p.textContent = phrase(r, 5, 15);
    return `add article "${n}. gr." at ${insertAt(root, r, [h, p])}`;
  },
  'rename-article': (root, r) => {
    const h = r.pick(root.querySelectorAll('h3, h2'));
    if (!h) {
      return;
    }
    const n = 1 + r.int(40);
    const text = r.next() < 0.5 ? `${n}. gr.` : `${n}. gr. ${phrase(r, 1, 3)}.`;
    h.textContent = text;
    return `rename heading ${index(h)} to "${text}"`;
  },
  'move-p': (root, r) => {
    const p = r.pick(topLevel(root, 'P'));
    if (!p) {
      return;
    }
    const from = index(p);
    p.remove();
    return `move p ${from} to ${insertAt(root, r, [p])}`;
  },
  'move-article': (root, r) => {
    const h = r.pick(topLevel(root, 'H3'));
    if (!h) {
      return;
    }
    const from = index(h);
    const nodes = articleAt(h);
    nodes.forEach((n) => n.remove());
    return `move article ${from} to ${insertAt(root, r, nodes)}`;
  },
  'delete-article': (root, r) => {
    const h = r.pick(topLevel(root, 'H3'));
    if (!h) {
      return;
    }
    const from = index(h);
    articleAt(h).forEach((n) => n.remove());
    return `delete article ${from}`;
  },
  'edit-li': (root, r) => {
    const li = r.pick(root.querySelectorAll('li'));
    if (!li) {
      return;
    }
    const k = r.int(3);
    if (k === 0) {
      return `type ${typeInto(li, r)} into li`;
    }
    if (k === 1) {
      li.remove();
      return 'delete li';
    }
    const added = root.ownerDocument.createElement('li');
    added.textContent = phrase(r, 3, 8);
    li.after(added);
    return 'add li';
  },
  'edit-cell': (root, r) => {
    const cell = r.pick(root.querySelectorAll('td, th'));
    if (!cell) {
      return;
    }
    const d = typeInto(cell, r);
    if (d) {
      return `type ${d} into cell`;
    }
    cell.textContent = phrase(r, 1, 3);
    return 'fill empty cell';
  },
  'split-p': (root, r) => {
    const p = r.pick(topLevel(root, 'P'));
    const t = p && textNodes(p)[0];
    if (!t || t.parentNode !== p || t.data.length < 20) {
      return;
    }
    const at = t.data.indexOf(' ', t.data.length >> 1);
    if (at < 0) {
      return;
    }
    const rest = root.ownerDocument.createElement('p');
    rest.textContent = t.data.slice(at + 1);
    t.data = t.data.slice(0, at);
    while (t.nextSibling) {
      rest.appendChild(t.nextSibling);
    }
    p!.after(rest);
    return `split p ${index(p!)}`;
  },
  'merge-p': (root, r) => {
    const p = r.pick(topLevel(root, 'P'));
    const next = p?.nextElementSibling;
    if (!p || next?.tagName !== 'P') {
      return;
    }
    p.append(' ', ...Array.from(next.childNodes));
    next.remove();
    return `merge p ${index(p)} with the next`;
  },
  'duplicate-p': (root, r) => {
    const p = r.pick(topLevel(root, 'P'));
    if (!p) {
      return;
    }
    const from = index(p);
    return `duplicate p ${from} to ${insertAt(root, r, [p.cloneNode(true)])}`;
  },
  'add-signature': (root) => {
    const p = root.ownerDocument.createElement('p');
    p.className = 'Dags';
    p.textContent = 'Ráðuneytinu, 1. janúar 2020.';
    root.append(p);
    return 'add signature line';
  },
};

const WEIGHTED = [
  ...['type', 'type', 'type', 'type-end-of-p', 'type-end-of-p'],
  ...Object.keys(EDITS),
];

/**
 * One random step: an edit on the DOM, serialized as an editor would — or,
 * now and then, a jump back to an earlier version (undo), or to the raw
 * fixture, which need not round-trip and so takes the full parse.
 */
const step = (
  current: string,
  history: Array<string>,
  raw: string,
  r: Rand,
): [string, string] => {
  const x = r.next();
  if (x < 0.06 && history.length > 1) {
    const k = r.int(history.length - 1);
    return [history[k]!, `back to version ${k}`];
  }
  if (x < 0.09) {
    return [raw, 'raw fixture'];
  }
  for (let tries = 0; tries < 20; tries++) {
    const name = r.pick(WEIGHTED)!;
    const root = asDiv(current);
    const desc = EDITS[name]!(root, r);
    if (desc) {
      return [root.innerHTML, desc];
    }
  }
  return [current, 'no edit'];
};

// ---------------------------------------------------------------------------

type Mismatch = {
  id: string;
  what: string;
  seed: number;
  edits: Array<string>;
};

const checkDoc = (id: string, seed: number, mismatches: Array<Mismatch>) => {
  const older = htmlOf(id) as HTMLText;
  const r = random(seed);
  const differ = createStructuredDiffer(older, { asDiv });
  const edits: Array<string> = [];
  const history: Array<string> = [older];
  let current: string = older;
  let checked = 0;
  for (let k = 0; k <= EDITS_PER_DOC; k++) {
    if (k > 0) {
      const [next, desc] = step(current, history, older, r);
      current = next;
      history.push(next);
      edits.push(desc);
    }
    const expected = getStructuredDiff(older, current as HTMLText, { asDiv });
    const actual = differ.diff(current as HTMLText);
    checked++;
    const what =
      actual.diff !== expected.diff
        ? 'diff HTML'
        : project(actual.sections) !== project(expected.sections)
        ? 'sections'
        : actual.parts.map((p) => p.html).join('\n') !== actual.diff
        ? 'parts'
        : undefined;
    if (what) {
      mismatches.push({ id, what, seed, edits: [...edits] });
      break;
    }
  }
  return checked;
};

const median = (xs: Array<number>) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

const time = <T>(f: () => T): [number, T] => {
  const t0 = performance.now();
  const v = f();
  return [performance.now() - t0, v];
};

const timeDoc = (id: string) => {
  const older = htmlOf(id) as HTMLText;
  const [create, differ] = time(() => createStructuredDiffer(older, { asDiv }));
  // As the editor opens: its own serialization of the stored text.
  const root = asDiv(older);
  const [first] = time(() => differ.diff(root.innerHTML as HTMLText));
  const ps = Array.from(root.children).filter((el) => el.tagName === 'P');
  const p = ps[Math.floor(ps.length / 2)]!;
  const full: Array<number> = [];
  const incremental: Array<number> = [];
  for (let i = 0; i < TIMED_EDITS; i++) {
    p.append(' nokkur ný orð');
    const current = root.innerHTML as HTMLText;
    const [f, expected] = time(() =>
      getStructuredDiff(older, current, { asDiv }),
    );
    const [d, actual] = time(() => differ.diff(current));
    if (actual.diff !== expected.diff) {
      throw new Error(`${id}: timed diff differs`);
    }
    full.push(f);
    incremental.push(d);
  }
  return {
    id,
    kb: Math.round(older.length / 1000),
    create,
    first,
    full: median(full),
    incremental: median(incremental),
  };
};

const run = () => {
  const ids =
    argStr('docs')?.split(',') ??
    (
      JSON.parse(readFileSync(join(CORPUS, 'manifest.json'), 'utf8'))
        .documents as Array<{ id: string }>
    ).map((d) => d.id);

  const t0 = Date.now();
  const mismatches: Array<Mismatch> = [];
  const errors: Array<string> = [];
  let checked = 0;
  let fullParse = 0;
  ids.forEach((id, i) => {
    try {
      if (!roundTrips(htmlOf(id))) {
        fullParse++;
      }
      checked += checkDoc(id, SEED + i, mismatches);
    } catch (e) {
      errors.push(`${id}: ${e}`);
    }
  });
  console.log(
    `${ids.length} documents, ${checked} diffs compared, ` +
      `${mismatches.length} mismatches, ${errors.length} errors ` +
      `(${Math.round((Date.now() - t0) / 1000)} s). ` +
      `${fullParse} stored texts do not round-trip in pieces, so their ` +
      `unedited version takes the full parse.`,
  );
  mismatches.forEach((m) =>
    console.log(
      `  ${m.id}: ${m.what} differs — seed ${m.seed}, edits: ${
        m.edits.join(' → ') || '(none)'
      }`,
    ),
  );
  errors.forEach((e) => console.log(`  ${e}`));

  if (TIMING) {
    console.log(
      `\nms, median of ${TIMED_EDITS} edits (words typed at the end of the middle top-level <p>):`,
    );
    console.log(
      '| Text | Size | Full | Incremental | Differ created | First diff |',
    );
    console.log('|---|---|---|---|---|---|');
    LONG_TEXTS.map(timeDoc).forEach((t) =>
      console.log(
        `| ${t.id} | ${t.kb} KB | ${t.full.toFixed(
          0,
        )} | ${t.incremental.toFixed(1)} | ${t.create.toFixed(
          0,
        )} | ${t.first.toFixed(0)} |`,
      ),
    );
  }
  if (mismatches.length || errors.length) {
    process.exitCode = 1;
  }
};

run();
