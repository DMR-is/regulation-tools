import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { asDiv } from '../_cleanup/serverDOM';
import { splitTopLevel } from '../_structuredDiff/incremental';
import { createStructuredDiffer, getStructuredDiff } from '../structuredDiff';
import { createStructuredDiffer as createServerDiffer } from '../structuredDiff-server';
import { HTMLText } from '../types';

/*
  createStructuredDiffer must give exactly what getStructuredDiff gives, for
  any sequence of new texts. Each fixture gets a seeded sequence of random
  edits, made the way an editor makes them (on the DOM, then serialized), and
  after every edit the differ's result is compared with a fresh full diff.
  `DIFFER_SEED=n` reruns with another seed.
*/

const SEED = Number(process.env.DIFFER_SEED) || 20261012;
const EDITS_PER_FIXTURE = 10;

const read = (...path: Array<string>) =>
  readFileSync(join(__dirname, ...path), 'utf8') as HTMLText;

/** Sections as JSON, `undefined` properties kept, so the comparison is strict. */
const project = (x: unknown) =>
  JSON.stringify(x, (_k, v) => (v === undefined ? '\u0000undefined' : v));

const firstDifference = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) {
    i++;
  }
  return `at ${i}: ${JSON.stringify(
    a.slice(i - 40, i + 60),
  )} vs ${JSON.stringify(b.slice(i - 40, i + 60))}`;
};

// ---------------------------------------------------------------------------
// Random edits

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

type Case = { name: string; older: HTMLText; start: HTMLText };

/**
 * The uncleaned input against its cleanup differs almost everywhere, which
 * exercises the paired-op cache hardest — but a full diff of the larger ones
 * takes 50–200 ms, too slow to repeat after every edit here.
 */
const INPUT_VS_CLEAN = new Set([
  '1960-0159.html',
  '1975-0504.html',
  '1975-0530.html',
  '1998-0815-excerpt.html',
  '2001-0652.html',
  '2019-0676.html',
  '2020-0363.html',
  '2020-1106.html',
]);

const cases = (): Array<Case> => {
  const v = (date: string) =>
    read('structuredDiff', '0678-2009', `${date}.html`);
  const out: Array<Case> = [
    {
      name: '0678-2009 2019 → 2020',
      older: v('2019-01-05'),
      start: v('2020-10-30'),
    },
  ];
  for (const file of readdirSync(join(__dirname, 'expected')).sort()) {
    const clean = read('expected', file);
    // Unchanged to start with, as when an editor opens.
    out.push({ name: `${file} (clean)`, older: clean, start: clean });
    if (INPUT_VS_CLEAN.has(file)) {
      out.push({
        name: `${file} (input → clean)`,
        older: read('input', file),
        start: clean,
      });
    }
  }
  return out;
};

const runCase = ({ name, older, start }: Case, seed: number) => {
  const r = random(seed);
  const differ = createStructuredDiffer(older, { asDiv });
  const edits: Array<string> = [];
  const history: Array<string> = [start];
  let current: string = start;
  for (let k = 0; k <= EDITS_PER_FIXTURE; k++) {
    if (k > 0) {
      const [next, desc] = step(current, history, start, r);
      current = next;
      history.push(next);
      edits.push(desc);
    }
    const expected = getStructuredDiff(older, current as HTMLText, { asDiv });
    const actual = differ.diff(current as HTMLText);
    const where = () =>
      `seed ${seed}, ${name}, after ${k} edit(s): ${
        edits.length ? edits.join(' → ') : '(none)'
      }`;
    if (actual.diff !== expected.diff) {
      throw new Error(
        `diff HTML differs — ${where()}\n${firstDifference(
          expected.diff,
          actual.diff,
        )}`,
      );
    }
    const a = project(actual.sections);
    const e = project(expected.sections);
    if (a !== e) {
      throw new Error(`sections differ — ${where()}\n${firstDifference(e, a)}`);
    }
    if (actual.parts.map((p) => p.html).join('\n') !== actual.diff) {
      throw new Error(`parts do not join to diff — ${where()}`);
    }
    if (new Set(actual.parts.map((p) => p.key)).size !== actual.parts.length) {
      throw new Error(`part keys not unique — ${where()}`);
    }
  }
  return EDITS_PER_FIXTURE + 1;
};

// ---------------------------------------------------------------------------

describe('createStructuredDiffer', () => {
  it('equals getStructuredDiff after every random edit', () => {
    let checked = 0;
    cases().forEach((c, i) => {
      checked += runCase(c, SEED + i);
    });
    expect(checked).toBeGreaterThan(250);
  });

  it('equals getStructuredDiff for repeated, reverted and empty texts', () => {
    const older = read('structuredDiff', '0678-2009', '2018-10-31.html');
    const newer = read('structuredDiff', '0678-2009', '2019-01-05.html');
    const differ = createServerDiffer(older);
    for (const text of [newer, newer, older, '', newer, older]) {
      const expected = getStructuredDiff(older, text as HTMLText, { asDiv });
      const actual = differ.diff(text as HTMLText);
      expect(actual.diff).toBe(expected.diff);
      expect(project(actual.sections)).toBe(project(expected.sections));
    }
  });

  it('keeps one part per section, keyed stably', () => {
    const older = read('expected', '2017-0866.html');
    const differ = createStructuredDiffer(older, { asDiv });
    const before = differ.diff(older);
    const root = asDiv(older);
    const p = topLevel(root, 'P')[3]!;
    p.append(' ný orð');
    const after = differ.diff(root.innerHTML as HTMLText);
    expect(after.parts.map((x) => x.key)).toEqual(
      before.parts.map((x) => x.key),
    );
    const changed = after.parts.filter(
      (x, i) => x.html !== before.parts[i]!.html,
    );
    expect(changed).toHaveLength(1);
    expect(changed[0]!.html).toContain('ný orð');
  });
});

describe('splitTopLevel', () => {
  it('cuts between top-level nodes and loses nothing', () => {
    const html =
      'loose <em>text</em><p class="a">x <b>y</b></p>\n<!-- c --><table><tbody><tr><td>1</td></tr></tbody></table>' +
      '<br><script>if (a<b) "</p>"</script><h3>1. gr.</h3>';
    const pieces = splitTopLevel(html);
    expect(pieces.join('')).toBe(html);
    expect(pieces).toEqual([
      'loose ',
      '<em>text</em>',
      '<p class="a">x <b>y</b></p>',
      '\n',
      '<!-- c -->',
      '<table><tbody><tr><td>1</td></tr></tbody></table>',
      '<br>',
      '<script>if (a<b) "</p>"</script>',
      '<h3>1. gr.</h3>',
    ]);
  });

  it('falls back to a full parse when a piece does not round-trip', () => {
    // `&aacute;` serializes as "á", and the unclosed <p> spans the cut.
    const older = '<h3>1. gr.</h3><p>Gr&aacute;tt.</p><p>Ein<p>Tvær</p>';
    const newer = '<h3>1. gr.</h3><p>Grátt.</p><p>Ein<p>Tvær og þrjár</p>';
    const differ = createStructuredDiffer(older, { asDiv });
    for (const text of [older, newer, older]) {
      expect(differ.diff(text as HTMLText).diff).toBe(
        getStructuredDiff(older as HTMLText, text as HTMLText, { asDiv }).diff,
      );
    }
  });
});
