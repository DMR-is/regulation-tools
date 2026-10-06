/*
  Runs getStructuredDiff over a corpus of real amendments and checks
  invariants, with getDiff alongside for comparison.

    npx esbuild scripts/structuredDiffCorpus.ts --bundle --platform=node \
      --packages=external --outfile=/tmp/structuredDiffCorpus.js
    REGULATIONS_API_URL=<base URL, …/api/v1> \
      node /tmp/structuredDiffCorpus.js --pages=3 --per-reg=8 [--regs=0112-2012,…] [--out=report.json]

  The corpus: regulations amended by those on the first `--pages` pages of
  /regulations/newest, each with its `--per-reg` most recent amendments.
  Requests go through the polite client in ./regulationsApi (sequential, one
  a second, cached), and a regulation is abandoned after 5 history dates in a
  row with no stored version.

  Checks, per amendment:
  - no text lost or duplicated: the diff with deletions removed reads exactly
    as the new version, and with insertions removed exactly as the old one
    (whitespace ignored; `ins.mod` marks formatting, not text, so it stays on
    the old side)
  - well-nested HTML
  - no exception, and under SLOW_MS
*/

import { writeFileSync } from 'fs';

import { asDiv } from '../src/_cleanup/serverDOM';
import { execute as htmldiff } from '../src/htmldiff-js';
import { isWellNested } from '../src/_structuredDiff/render';
import { getStructuredDiff } from '../src/structuredDiff';
import { HTMLText } from '../src/types';
import { getJson, getReg, Reg, requestCount } from './regulationsApi';

const arg = (name: string, fallback: number) =>
  Number(
    process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ??
      fallback,
  );
const PAGES = arg('pages', 3);
const PER_REG = arg('per-reg', 8);
const OUT = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1];
/** Extra regulations by name, e.g. `--regs=0112-2012,0678-2009`. */
const EXTRA = (
  process.argv.find((a) => a.startsWith('--regs='))?.split('=')[1] ?? ''
)
  .split(',')
  .filter(Boolean);
const SLOW_MS = 500;
const MAX_CONSECUTIVE_FAILURES = 5;

/** As apps/regulations-api's getDiff: htmldiff, minus empty marks. */
const apiGetDiff = (a: HTMLText, b: HTMLText) =>
  htmldiff(a, b)
    .replace(/<del [^>]+>\n*<\/del>/g, '')
    .replace(/<ins [^>]+>\n*<\/ins>/g, '');

const squash = (s: string) => s.replace(/\s+/g, '');
const textOf = (html: string, remove: string) => {
  const root = asDiv(html);
  root.querySelectorAll(remove).forEach((el) => el.remove());
  return squash(root.textContent || '');
};
/** Whether both versions can be read back out of the diff, unchanged. */
const sides = (diff: string, older: string, newer: string) => ({
  old: textOf(diff, 'ins:not(.mod)') === textOf(older, 'x-none'),
  new: textOf(diff, 'del') === textOf(newer, 'x-none'),
});

type Row = {
  reg: string;
  amend: string;
  date: string;
  ms: number;
  error?: string;
  wellNested?: boolean;
  sides?: { old: boolean; new: boolean };
  editedMove?: boolean;
  getDiff?: {
    ms: number;
    wellNested: boolean;
    sides: { old: boolean; new: boolean };
  };
  ops?: Record<string, number>;
};

const targetsFromNewest = async () => {
  const names = new Set<string>();
  for (let page = 1; page <= PAGES; page++) {
    const { data } = await getJson<{ data: Array<{ title: string }> }>(
      `regulations/newest?page=${page}`,
    );
    data.forEach(({ title }) => {
      const m = title.match(/reglugerð(?:ar)? nr\. (\d+)\/(\d{4})/i);
      if (m) {
        names.add(`${m[1]!.padStart(4, '0')}-${m[2]}`);
      }
    });
  }
  return [...names];
};

const run = async () => {
  const targets = [...new Set([...EXTRA, ...(await targetsFromNewest())])];
  console.log(
    `${targets.length} regulations: ${EXTRA.length} named, the rest from ${PAGES} page(s) of newest`,
  );
  const rows: Array<Row> = [];

  for (const reg of targets) {
    let current: Reg;
    try {
      current = await getReg(`${reg}/current`);
    } catch (e) {
      console.log(`${reg}: skipped (${e})`);
      continue;
    }
    if (!current.text) {
      console.log(`${reg}: redirect stub, no text`);
      continue;
    }
    const amends = (current.history || []).filter((h) => h.effect === 'amend');
    const first = Math.max(0, amends.length - PER_REG);
    // The version before the first amendment we diff.
    let prev: HTMLText | undefined;
    try {
      prev =
        first === 0
          ? (await getReg(`${reg}/original`)).text
          : (await getReg(`${reg}/d/${amends[first - 1]!.date}`)).text;
    } catch {
      prev = undefined;
    }
    let failures = 0;
    for (const h of amends.slice(first)) {
      let next: HTMLText;
      try {
        next = (await getReg(`${reg}/d/${h.date}`)).text;
        failures = 0;
      } catch {
        prev = undefined; // the next pair would span a missing version
        if (++failures >= MAX_CONSECUTIVE_FAILURES) {
          console.log(
            `${reg}: stopping, ${failures} missing versions in a row`,
          );
          break;
        }
        continue;
      }
      if (prev != null && prev !== next) {
        rows.push(check(reg, h.name, h.date, prev, next));
      }
      prev = next;
    }
    const mine = rows.filter((r) => r.reg === reg);
    console.log(
      `${reg}: ${mine.length} pairs, ${requestCount()} requests so far` +
        (mine.some(isProblem) ? '  ⚠' : ''),
    );
  }
  summarize(rows);
  if (OUT) {
    writeFileSync(OUT, JSON.stringify(rows, null, 1));
  }
};

const check = (
  reg: string,
  amend: string,
  date: string,
  older: HTMLText,
  newer: HTMLText,
): Row => {
  const t0 = Date.now();
  let row: Row;
  try {
    const sd = getStructuredDiff(older, newer, { asDiv });
    const ms = Date.now() - t0;
    const ops: Record<string, number> = {};
    let editedMove = false;
    sd.sections.forEach((s) => {
      if (s.renumbered) {
        ops.renumbered = (ops.renumbered || 0) + 1;
      }
      s.blocks.forEach((b) => {
        if (b.type !== 'equal') {
          ops[b.type] = (ops[b.type] || 0) + 1;
        }
        editedMove ||= b.type === 'move' && !!b.change;
      });
    });
    row = {
      reg,
      amend,
      date,
      ms,
      wellNested: isWellNested(sd.diff),
      sides: sides(sd.diff, older, newer),
      editedMove,
      ops,
    };
  } catch (e) {
    return { reg, amend, date, ms: Date.now() - t0, error: String(e) };
  }
  const g0 = Date.now();
  const flat = apiGetDiff(older, newer);
  row.getDiff = {
    ms: Date.now() - g0,
    wellNested: isWellNested(flat),
    sides: sides(flat, older, newer),
  };
  return row;
};

// A moved-and-edited block shows the old text twice (struck at its old
// position, word-diffed at its new one), so its old side cannot read back
// exactly. Expected; reported separately.
const isProblem = (r: Row) =>
  !!r.error ||
  r.wellNested === false ||
  r.sides?.new === false ||
  (r.sides?.old === false && !r.editedMove) ||
  r.ms > SLOW_MS;

const summarize = (rows: Array<Row>) => {
  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  console.log(
    `\n${rows.length} amendments in ${
      new Set(rows.map((r) => r.reg)).size
    } regulations, ${requestCount()} requests made`,
  );
  console.log('                        structured   getDiff');
  const line = (label: string, a: number, b: number | string) =>
    console.log(
      `  ${label.padEnd(22)}${String(a).padStart(9)}${String(b).padStart(10)}`,
    );
  line(
    'errors',
    count((r) => !!r.error),
    '—',
  );
  line(
    'mis-nested HTML',
    count((r) => r.wellNested === false),
    count((r) => r.getDiff?.wellNested === false),
  );
  line(
    'new side lost text',
    count((r) => r.sides?.new === false),
    count((r) => r.getDiff?.sides.new === false),
  );
  line(
    'old side lost text',
    count((r) => r.sides?.old === false && !r.editedMove),
    count((r) => r.getDiff?.sides.old === false),
  );
  line(
    `slower than ${SLOW_MS} ms`,
    count((r) => r.ms > SLOW_MS),
    count((r) => (r.getDiff?.ms ?? 0) > SLOW_MS),
  );
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  const gms = rows.map((r) => r.getDiff?.ms ?? 0).sort((a, b) => a - b);
  const pct = (xs: Array<number>, p: number) =>
    xs[Math.floor((xs.length - 1) * p)] ?? 0;
  line('median ms', pct(ms, 0.5), pct(gms, 0.5));
  line('p95 ms', pct(ms, 0.95), pct(gms, 0.95));
  line('max ms', pct(ms, 1), pct(gms, 1));
  const ops: Record<string, number> = {};
  rows.forEach((r) =>
    Object.entries(r.ops || {}).forEach(
      ([k, v]) => (ops[k] = (ops[k] || 0) + v),
    ),
  );
  console.log('\nop totals:', JSON.stringify(ops));
  const problems = rows.filter(isProblem);
  if (problems.length) {
    console.log('\nproblems:');
    problems.forEach((r) =>
      console.log(
        `  ${r.reg} ${r.amend} (${r.date}): ${JSON.stringify({
          error: r.error,
          wellNested: r.wellNested,
          sides: r.sides,
          ms: r.ms,
        })}`,
      ),
    );
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
