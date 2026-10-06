/*
  Compares getDiff and getStructuredDiff over a regulation's real
  history, next to the amending regulation that produced each version.

    npx esbuild scripts/structuredDiffReport.ts --bundle --platform=node \
      --packages=external --outfile=/tmp/structuredDiffReport.js
    REGULATIONS_API_URL=<base URL, …/api/v1> \
      node /tmp/structuredDiffReport.js 0678-2009

  Requests go through ./regulationsApi: sequential, one per second, and
  cached under the OS temp dir, so a rerun makes no requests at all.

  For each amendment it prints how many blocks each diff marks as changed, the
  structured operations as rough amending phrases, and the amending
  regulation's own text to check them against.
*/

import { asDiv } from '../src/_cleanup/serverDOM';
import { getDiff } from '../src/html';
import { describeChanges } from '../src/_structuredDiff/describe';
import { getStructuredDiff } from '../src/structuredDiff';
import { HTMLText } from '../src/types';
import { getReg as get } from './regulationsApi';

const name = process.argv[2];
if (!name || name.startsWith('--')) {
  console.error('Usage: structuredDiffReport <name, e.g. 0678-2009>');
  process.exit(1);
}

const plain = (html: string) =>
  html
    .replace(/<\/(p|h\d|li)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .trim();

/** Top-level blocks that htmldiff put any `<ins>`/`<del>` into. */
const touchedBlocks = (diff: string) =>
  Array.from(asDiv(diff).children).filter((el) => el.querySelector('ins, del'))
    .length;

const run = async () => {
  const current = await get(`${name}/current`);
  if (!current.text) {
    console.log(`${name} has no text in the database (redirect stub).`);
    return;
  }
  const amends = (current.history || []).filter((h) => h.effect === 'amend');
  let prev = (await get(`${name}/original`)).text;

  // Some regulations have history dates with no stored version, and the
  // API answers each with a 500. Stop rather than keep asking.
  const MAX_CONSECUTIVE_FAILURES = 5;
  let failures = 0;
  for (const h of amends) {
    let next: HTMLText;
    try {
      next = (await get(`${name}/d/${h.date}`)).text;
      failures = 0;
    } catch (e) {
      if (++failures >= MAX_CONSECUTIVE_FAILURES) {
        console.log(
          `\nStopping: ${failures} history dates in a row had no version.`,
        );
        break;
      }
      // The API answers 500 "This variant/version does not exist" for some
      // history dates. Skip it; the next pair then spans both amendments.
      console.log(`\n${'='.repeat(78)}\n${h.date}  ${h.name}  — skipped: ${e}`);
      continue;
    }
    const t0 = Date.now();
    const flat = getDiff(prev, next).diff;
    const t1 = Date.now();
    const structured = getStructuredDiff(prev, next, { asDiv });
    const t2 = Date.now();

    const changedOps = structured.sections
      .flatMap((s) => s.blocks)
      .filter((b) => b.type !== 'equal').length;

    console.log(`\n${'='.repeat(78)}\n${h.date}  ${h.name}`);
    console.log(
      `getDiff: ${touchedBlocks(flat)} blocks touched (${t1 - t0} ms)   ` +
        `structured: ${changedOps} block ops (${t2 - t1} ms)`,
    );
    console.log('\n-- structured, as amending phrases:');
    describeChanges(structured).forEach((l) => console.log('  ' + l));

    try {
      const amending = await get(`${h.name.replace('/', '-')}/original`);
      console.log('\n-- the amending regulation says:');
      console.log(
        plain(amending.text)
          .split('\n')
          .map((l) => '  ' + (l.length > 160 ? l.slice(0, 157) + '…' : l))
          .join('\n'),
      );
    } catch (e) {
      console.log(`\n-- (amending regulation not available: ${e})`);
    }
    prev = next;
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
