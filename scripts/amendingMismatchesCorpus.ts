/*
  Runs findAmendingMismatches over published amending regulations and the
  base regulations they amended, read from the regulations API cache (no
  requests are made).

    npx esbuild scripts/amendingMismatchesCorpus.ts --bundle --platform=node \
      --packages=external --log-level=warning --outfile=.cache/amendingMismatchesCorpus.js
    node .cache/amendingMismatchesCorpus.js [--out=.cache/amending-mismatches.json] [--since=2015]

  The cache is filled by the other corpus scripts (structuredDiffCorpus
  fetches each base regulation's `current`, `original` and `d/<date>`
  versions). A case is one amending regulation with, for every regulation
  it amended, the base text the day before and the day of the change. Only
  amendments that took effect on a single date are used: one that takes
  effect in steps spreads its changes over several pairs.

  Published amending regulations agree with their consolidation, so every
  warning on them is a false alarm or a real slip in the consolidation;
  `false-alarms` lists them for review.

  Recall is measured by planting the slip from the bug report: an amount in
  the amending text changed (115 → 116), the base left alone. The planted
  case should warn about it.
*/

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { asDiv } from '../src/_cleanup/serverDOM';
import { newNumbers, readChanges } from '../src/_amendingMismatches/changes';
import {
  AmendedRegulation,
  AmendingMismatch,
  findAmendingMismatches,
} from '../src/amendingMismatches';
import { getStructuredDiff } from '../src/structuredDiff';
import { HTMLText } from '../src/types';

const CACHE = join(
  process.env.REGULATIONS_CACHE_DIR ||
    join(process.cwd(), '.cache', 'regulations-api'),
  'api.reglugerd.is',
);
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const OUT = arg('out') || '.cache/amending-mismatches.json';
const SINCE = arg('since') || '2015';

type ApiReg = {
  name: string;
  type?: string;
  text: HTMLText;
  title?: string;
  publishedDate?: string;
  appendixes?: Array<{ title: string; text: HTMLText }>;
  history?: Array<{ date: string; name: string; effect: string }>;
  effects?: Array<{ name: string; date: string; effect: string }>;
  __missing?: string;
};

const fileName = (name: string) => name.replace('/', '-').padStart(9, '0');
const read = (file: string): ApiReg | undefined => {
  const path = join(CACHE, file + '.json');
  if (!existsSync(path)) {
    return undefined;
  }
  const j = JSON.parse(readFileSync(path, 'utf8'));
  return j.__missing || !j.text ? undefined : j;
};

const withAppendixes = (r: ApiReg) =>
  [
    r.text,
    ...(r.appendixes || []).map((a) => `<h2>${a.title}</h2>${a.text}`),
  ].join('\n') as HTMLText;

type Pair = { base: string; before: ApiReg; after: ApiReg };

/** amending name → its base pairs. */
const collect = () => {
  const pairs = new Map<string, Array<Pair>>();
  const incomplete = new Set<string>();
  for (const f of readdirSync(CACHE)) {
    if (!f.endsWith('__current.json')) {
      continue;
    }
    const reg = f.split('__')[0]!;
    const current = read(`${reg}__current`);
    if (!current) {
      continue;
    }
    const history = current.history || [];
    const amends = history.filter((h) => h.effect === 'amend');
    amends.forEach((h, i) => {
      // In steps (several dates), or the same day as another amendment.
      const steps = history.filter((x) => x.name === h.name).length;
      const sameDay = amends.filter((x) => x.date === h.date).length;
      const before =
        i === 0
          ? read(`${reg}__original`)
          : read(`${reg}__d__${amends[i - 1]!.date}`);
      const after = read(`${reg}__d__${h.date}`);
      if (steps !== 1 || sameDay !== 1 || !before || !after) {
        incomplete.add(h.name);
        return;
      }
      const list = pairs.get(h.name) || [];
      list.push({ base: current.name || reg, before, after });
      pairs.set(h.name, list);
    });
  }
  return { pairs, incomplete };
};

/** A diff per base regulation: its text, and each appendix that changed. */
const changesOf = (pairs: Array<Pair>): Array<AmendedRegulation> =>
  pairs.flatMap(({ base, before, after }) => {
    const out: Array<AmendedRegulation> = [];
    if (before.text !== after.text) {
      out.push({
        name: base,
        diff: getStructuredDiff(before.text, after.text, { asDiv }).diff,
      });
    }
    // Appendixes by title, else by position: one added in front shifts the rest.
    const olds = before.appendixes || [];
    const news = after.appendixes || [];
    const used = new Set<number>();
    const html = (a?: { title: string; text: string }) =>
      a ? `<h2>${a.title}</h2>${a.text}` : '';
    news.forEach((b, i) => {
      let j = olds.findIndex((a, k) => !used.has(k) && a.title === b.title);
      if (j < 0 && !used.has(i) && olds[i]) {
        j = i;
      }
      j >= 0 && used.add(j);
      const older = html(olds[j]);
      const newer = html(b);
      if (older !== newer) {
        out.push({
          name: `${base} viðauki ${i + 1}`,
          diff: getStructuredDiff(older as HTMLText, newer as HTMLText, {
            asDiv,
          }).diff,
        });
      }
    });
    return out;
  });

/**
 * 115 → 116, 7.500 → 7.501, 2027 → 2028: the same shape, another value.
 * A date gets the next day: "26. apríl 2017" → "27. apríl 2017".
 */
const bump = (n: string, date: boolean) =>
  date
    ? n.replace(/^\d+/, (d) => String((Number(d) % 28) + 1))
    : n.replace(/(\d)(?!.*\d)/, (d) => String((Number(d) + 1) % 10));

type Case = {
  amending: string;
  bases: Array<string>;
  warnings: Array<AmendingMismatch>;
  planted?: {
    from: string;
    to: string;
    caught: boolean;
    warnings: number;
    kind: string;
  };
};

const run = () => {
  const { pairs, incomplete } = collect();
  const cases: Array<Case> = [];
  let skipped = 0;
  let appendixWarnings = 0;
  let appendixCases = 0;
  let withAppendixChange = 0;
  for (const [name, list] of pairs) {
    const amending = read(`${fileName(name)}__original`);
    if (
      !amending ||
      incomplete.has(name) ||
      (amending.publishedDate || '') < SINCE
    ) {
      skipped++;
      continue;
    }
    // Every regulation it amended must be in the case, or its numbers go missing.
    const effects = (amending.effects || []).filter(
      (e) => e.effect === 'amend',
    );
    if (
      effects.some(
        (e) => !list.some((p) => fileName(p.base) === fileName(e.name)),
      )
    ) {
      skipped++;
      continue;
    }
    const text = withAppendixes(amending);
    const changes = changesOf(list);
    if (!changes.length) {
      skipped++;
      continue;
    }
    const warnings = findAmendingMismatches(text, changes, { asDiv });
    appendixWarnings += warnings.filter(
      (w) => w.type === 'missingFromText' && /viðauki/.test(w.regulation || ''),
    ).length;
    appendixCases += +warnings.some(
      (w) => w.type === 'missingFromText' && /viðauki/.test(w.regulation || ''),
    );
    withAppendixChange += +changes.some((ch) => /viðauki/.test(ch.name || ''));
    const c: Case = {
      amending: name,
      bases: list.map((p) => p.base),
      warnings,
    };

    // Plant the slip: in the text, change an amount or a date that a base
    // change brings in (not a single digit, which is everywhere).
    const targets = changes
      .flatMap((ch) => readChanges(ch.diff, ch.name, asDiv))
      .flatMap(newNumbers)
      .filter(
        (t) =>
          t.kind === 'date' ||
          (t.kind === 'value' && t.canon.replace(/\D/g, '').length >= 2),
      );
    for (const t of targets) {
      const re = new RegExp(
        '(?<![\\d.,])' +
          t.raw
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\s+/g, '(?:\\s|&nbsp;)+') +
          '(?![.,]?\\d)',
        'u',
      );
      const m = re.exec(text);
      if (
        !m ||
        /öðlast|tekur gildi/.test(
          text.slice(Math.max(0, m.index - 150), m.index),
        )
      ) {
        continue;
      }
      const to = bump(m[0], t.kind === 'date');
      const planted = (text.slice(0, m.index) +
        to +
        text.slice(m.index + m[0].length)) as HTMLText;
      const pw = findAmendingMismatches(planted, changes, { asDiv });
      const flat = (s: string) => s.replace(/&nbsp;|\s+/g, ' ');
      const caught = pw.some(
        (w) =>
          (w.type === 'notInChanges' && flat(w.text) === flat(to)) ||
          (w.type === 'missingFromText' && flat(w.text) === flat(t.raw)),
      );
      c.planted = { from: m[0], to, caught, warnings: pw.length, kind: t.kind };
      break;
    }
    cases.push(c);
  }

  const isAppendix = (w: AmendingMismatch) =>
    w.type === 'missingFromText' && /viðauki/.test(w.regulation || '');
  // Main text: every notInChanges, and missingFromText from the base text itself.
  for (const c of cases) {
    c.warnings = c.warnings.filter((w) => !isAppendix(w));
  }
  const warned = cases.filter((c) => c.warnings.length);
  const byType = (t: AmendingMismatch['type']) =>
    cases.reduce(
      (n, c) => n + c.warnings.filter((w) => w.type === t).length,
      0,
    );
  const casesWith = (t: AmendingMismatch['type']) =>
    cases.filter((c) => c.warnings.some((w) => w.type === t)).length;
  const planted = cases.filter((c) => c.planted);
  const caught = planted.filter((c) => c.planted!.caught);

  console.log(
    `${cases.length} cases (amending regulations since ${SINCE}), ${skipped} skipped (incomplete or in steps)`,
  );
  console.log(
    `Published cases with any warning: ${warned.length} (${Math.round(
      (100 * warned.length) / cases.length,
    )}%)`,
  );
  console.log(
    `  missingFromText: ${byType('missingFromText')} in ${casesWith(
      'missingFromText',
    )} cases`,
  );
  console.log(
    `  notInChanges:    ${byType('notInChanges')} in ${casesWith(
      'notInChanges',
    )} cases`,
  );
  console.log(
    `Appendixes (reported apart: many amending regulations link to an appendix instead of printing it): ` +
      `${appendixWarnings} missingFromText in ${appendixCases} of ${withAppendixChange} cases that change one`,
  );
  console.log(
    `Planted amount slips caught: ${caught.length} of ${
      planted.length
    } (${Math.round((100 * caught.length) / (planted.length || 1))}%)`,
  );
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        falseAlarms: warned.map((c) => ({
          amending: c.amending,
          bases: c.bases,
          warnings: c.warnings,
        })),
        missed: planted
          .filter((c) => !c.planted!.caught)
          .map((c) => ({ amending: c.amending, ...c.planted })),
      },
      null,
      1,
    ),
  );
  for (const kind of ['value', 'date']) {
    const p = planted.filter((c) => c.planted!.kind === kind);
    const k = p.filter((c) => c.planted!.caught);
    console.log(
      `  ${kind === 'value' ? 'amounts' : 'dates  '}: ${k.length} of ${
        p.length
      } (${Math.round((100 * k.length) / (p.length || 1))}%)`,
    );
  }
  console.log(`Details: ${OUT}`);
};

run();
