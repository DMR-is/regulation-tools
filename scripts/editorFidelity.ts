/*
  Runs the editor v2 fidelity check (src/_editorV2/fidelity.ts) over the
  corpus: every document in .cache/editor-corpus/manifest.json, read from
  the API cache. No API requests are made.

    npx esbuild scripts/editorFidelity.ts --bundle --platform=node \
      --packages=external --outfile=/tmp/editorFidelity.js
    NODE_PATH=$PWD/node_modules node /tmp/editorFidelity.js \
      [--docs=0112-2012/current/text,…] [--examples=3] [--out=report.json]
      [--prettified]

  `--prettified` checks each document in the form the database stores it:
  prettified, with newlines between words, as a save leaves it. The public
  API returns texts with those newlines turned into spaces; the editor in
  reglugerd-admin-www loads the database form.

  For each document: whether the editor round trip, after cleanup, equals
  cleanup alone (lossless), whether a second round trip changes anything
  (idempotent), and how long it took. Failures are grouped by what differs
  at the first difference, so one schema fix can be checked against every
  document it affects.
*/

import '../src/__test__/editorV2-dom';

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { checkFidelity } from '../src/_editorV2/fidelity';
import { prettify } from '../src/_cleanup/text';
import { cleanupSingleEditorOutput } from '../src/cleanupEditorOutput';
import { HTMLText } from '../src/types';

const argStr = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const EXAMPLES = Number(argStr('examples') ?? 3);
const OUT = argStr('out');
const PRETTIFIED = process.argv.includes('--prettified');

const CORPUS = join('.cache', 'editor-corpus');
const API_CACHE = join('.cache', 'regulations-api', 'api.reglugerd.is');

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

/**
 * What differs, as a short label: the tag each side has at the first
 * difference when it falls inside a tag, otherwise the words.
 */
const signature = (expected: string, actual: string, at: number) => {
  const tagAt = (s: string) => {
    const open = s.lastIndexOf('<', at);
    const close = s.indexOf('>', open);
    return open >= 0 && s.lastIndexOf('>', at - 1) < open && close >= 0
      ? s.slice(open, close + 1)
      : undefined;
  };
  const word = (s: string) =>
    JSON.stringify(s.slice(Math.max(0, at - 10), at + 20));
  const e = tagAt(expected);
  const a = tagAt(actual);
  return e || a
    ? `${e ?? word(expected)}  →  ${a ?? word(actual)}`
    : `text ${word(expected)}  →  ${word(actual)}`;
};

const textOf = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent!.replace(/\s+/g, '');
};

type Row = {
  id: string;
  ok: boolean;
  idempotent: boolean;
  /** The text itself is unchanged, whatever happened to the markup. */
  sameText: boolean;
  ms: number;
  signature?: string;
  difference?: { at: number; expected: string; actual: string };
  error?: string;
};

const run = () => {
  const ids =
    argStr('docs')?.split(',') ??
    (
      JSON.parse(readFileSync(join(CORPUS, 'manifest.json'), 'utf8'))
        .documents as Array<{ id: string }>
    ).map((d) => d.id);

  const rows: Array<Row> = ids.map((id) => {
    const t0 = Date.now();
    try {
      const html = PRETTIFIED ? prettify(htmlOf(id) as HTMLText) : htmlOf(id);
      const r = checkFidelity(html, cleanupSingleEditorOutput);
      const ms = Date.now() - t0;
      if (r.ok) {
        return { id, ok: true, idempotent: r.idempotent, sameText: true, ms };
      }
      // Recompute the absolute position from the full strings.
      let at = 0;
      while (at < r.expected.length && r.expected[at] === r.actual[at]) {
        at++;
      }
      return {
        id,
        ok: false,
        idempotent: r.idempotent,
        sameText: textOf(r.expected) === textOf(r.actual),
        ms,
        signature: signature(r.expected, r.actual, at),
        difference: r.difference,
      };
    } catch (e) {
      return {
        id,
        ok: false,
        idempotent: false,
        sameText: false,
        ms: Date.now() - t0,
        error: String(e),
      };
    }
  });

  const failed = rows.filter((r) => !r.ok);
  const groups = new Map<string, Array<Row>>();
  failed.forEach((r) => {
    const key = r.error ? `error: ${r.error.slice(0, 80)}` : r.signature!;
    groups.set(key, [...(groups.get(key) || []), r]);
  });

  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  console.log(
    `${rows.length - failed.length}/${rows.length} documents lossless, ` +
      `${rows.filter((r) => !r.idempotent).length} not idempotent, ` +
      `${rows.filter((r) => !r.sameText).length} with changed text, ` +
      `median ${ms[Math.floor(ms.length / 2)]} ms, max ${ms[ms.length - 1]} ms`,
  );
  [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([key, group]) => {
      console.log(`\n${group.length}×  ${key}`);
      group.slice(0, EXAMPLES).forEach((r) => {
        console.log(`   ${r.id}`);
        if (r.difference) {
          console.log(`     cleanup only: …${r.difference.expected}…`);
          console.log(`     editor:       …${r.difference.actual}…`);
        }
      });
    });
  if (OUT) {
    writeFileSync(OUT, JSON.stringify(rows, null, 1));
  }
  // Allowed changes (the markup groups above) do not fail the run; lost
  // text, a second save that changes more, or an error does.
  if (rows.some((r) => r.error || !r.sameText || !r.idempotent)) {
    process.exitCode = 1;
  }
};

run();
