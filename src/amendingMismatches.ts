/*
  Possible mismatches between an amending regulation's text and the changes
  recorded on the regulations it amends.

  The two are kept apart: the amending text is published as written, while
  each base regulation gets the changes recorded on it (a diff, as
  `getStructuredDiff` or `getDiff` makes it). Nothing ties them together, so
  an edit to one and not the other goes unnoticed. This looks for the
  telltale signs, both ways:

  - `missingFromText`: something a base change brings in that the amending
    text never mentions: an amount, a date, or wording.
  - `notInChanges`: an amount or a date the amending text states that no
    changed passage of the base regulations holds, before or after.

  These are hints for a person to look at, not proof: prose can't be mapped
  back to a diff reliably. Amounts and dates are compared exactly, except
  small whole numbers (below 100), which are as often places and counts and
  need only be mentioned. Wording is compared loosely (inflected forms
  count, and most of a long passage's word triples must appear), so a
  changed word inside a long new paragraph can go unnoticed. A quiet result
  does not mean the two agree. See the README, "Amending text mismatches".
*/

import { Amending, readAmending } from './_amendingMismatches/amending';
import {
  Change,
  newNumbers,
  readChanges,
  stripLabel,
} from './_amendingMismatches/changes';
import {
  contextOf,
  dateParts,
  insertedRuns,
  isValue,
  MONTHS,
  NumberToken,
  numbersIn,
  padded,
  stemOf,
  tidy,
  triples,
  valueKey,
  wordsOf,
} from './_amendingMismatches/text';
import { AsDiv } from './_structuredDiff/types';
import { HTMLText } from './types';

export type AmendedRegulation = {
  /** The base regulation's name, "1170/2012", for reports. */
  name?: string;
  /** The recorded change: diff HTML from `getStructuredDiff` (or `getDiff`). */
  diff: HTMLText;
};

export type AmendingMismatch =
  | {
      type: 'missingFromText';
      /**
       * What the base change brings in: the amount or date as written
       * there, or the wording.
       */
      text: string;
      /** For an amount or date: the words around it in the base regulation. */
      context?: string;
      /** The base regulation's name, when given. */
      regulation?: string;
      /** The base section, "5. gr.", when the diff names it (old numbering). */
      section?: string;
    }
  | {
      type: 'notInChanges';
      /** The amount or date as written in the amending text. */
      text: string;
      /** The words around it in the amending text. */
      context: string;
      /** The amending regulation's own article, "1. gr.", when it has one. */
      section?: string;
    };

export type AmendingMismatchOptions = {
  /** Parses HTML into a container element. `asDiv` from serverDOM, or a browser equivalent. */
  asDiv: AsDiv;
};

// ---------------------------------------------------------------------------

/**
 * A date only part of which changed, as amending text writes it: "í stað
 * „2019“ kemur: 2021" for "1. janúar 2019" → "1. janúar 2021", or "Í stað
 * orðsins „ágúst“ kemur: október". The text must mention each changed part.
 */
const partlyChanged = (
  t: NumberToken,
  { sides }: Change,
  amending: Amending,
) => {
  // Only a date the change rewrote in part: wholly inserted, it is new.
  const marks = sides.inserted.subarray(t.index, t.index + t.raw.length);
  if (marks.every((x) => x === 1)) {
    return false;
  }
  const now = dateParts(t);
  return numbersIn(sides.old).some((o) => {
    if (o.kind !== 'date') {
      return false;
    }
    const was = dateParts(o);
    const changed = (['day', 'month', 'year'] as const).filter(
      (k) => was[k] !== now[k],
    );
    return (
      changed.length > 0 &&
      changed.length < 3 &&
      changed.every((k) =>
        k === 'month'
          ? amending.words.includes(` ${now.month} `)
          : amending.digits.has(now[k]),
      )
    );
  });
};

/** Whether the amending text leaves out an inserted run of wording. */
const wordingMissing = (run: string, old: string, amending: Amending) => {
  const words = wordsOf(run);
  // Numbers only, or a date's month: compared as numbers and dates.
  if (words.every((w) => MONTHS.includes(w))) {
    return false;
  }
  const oldWords = wordsOf(old);
  if (words.length < 4) {
    const seq = padded(words);
    if (amending.words.includes(seq) || padded(oldWords).includes(seq)) {
      return false;
    }
    // A word or three: inflected forms count. Amending text gives a new
    // name once, "í viðeigandi beygingarfalli".
    return !words.every(
      (w) => w.length < 5 || amending.prefixes.has(stemOf(w)),
    );
  }
  // Loosely: the word diff can mark a reordered passage inserted, and the
  // published wording can differ from the consolidated in punctuation. So:
  // most of the triples that are new to the block must be in the text.
  const oldTriples = triples(oldWords);
  const novel = [...triples(words)].filter((t) => !oldTriples.has(t));
  if (!novel.length) {
    return false;
  }
  const found = novel.filter((t) => amending.triples.has(t)).length;
  return found / novel.length < 0.5;
};

// ---------------------------------------------------------------------------

/**
 * Possible mismatches between `amendingHtml`, the amending regulation's
 * text (with its appendixes, if any), and `regulations`, the changes it
 * records on each base regulation (and on their appendixes). Pass every
 * change the text makes: an amount the text states is looked for in all of
 * them.
 */
export const findAmendingMismatches = (
  amendingHtml: HTMLText,
  regulations: ReadonlyArray<AmendedRegulation>,
  opts: AmendingMismatchOptions,
): Array<AmendingMismatch> => {
  const { asDiv } = opts;
  const amending = readAmending(amendingHtml, asDiv);
  const changes = regulations.flatMap((r) =>
    readChanges(r.diff, r.name, asDiv),
  );

  const out: Array<AmendingMismatch> = [];
  const seen = new Set<string>();
  const once = (key: string) => (seen.has(key) ? false : (seen.add(key), true));
  const report = (change: Change, t: NumberToken) =>
    out.push({
      type: 'missingFromText',
      text: t.raw,
      context: contextOf(change.sides.new, t),
      regulation: change.regulation,
      section: change.section,
    });

  // What the base changes bring in, the amending text must mention.
  const dateCounts = new Map<string, number>();
  for (const change of changes) {
    const { regulation, sides } = change;
    // Places ("sbr. 21. gr.") are left out: renumbering shifts them.
    for (const t of newNumbers(change).filter((t) => t.kind !== 'place')) {
      if (t.kind === 'date') {
        // The date of an act cited, as often as it is brought in: EU acts
        // listed together often share one, and a slip in one of them would
        // hide behind the others. Other dates once: one instruction can set
        // the same deadline in several places.
        const n = (dateCounts.get(valueKey(t)) || 0) + 1;
        dateCounts.set(valueKey(t), n);
        const given = amending.dates.get(valueKey(t)) || 0;
        if (
          (t.ofReference ? n > given : !given) &&
          !partlyChanged(t, change, amending) &&
          once(`m\0${valueKey(t)}`)
        ) {
          report(change, t);
        }
        continue;
      }
      // A small whole number is as often a count or a place as a value,
      // and the two texts don't always agree on which: any mention counts.
      // So does any mention of a reference's numbers.
      const small = t.kind === 'value' && /^\d{1,2}$/.test(t.canon);
      const missing =
        isValue(t) && !small
          ? !amending.values.has(valueKey(t))
          : t.digits.some((d) => !amending.digits.has(d));
      if (missing && once(`m\0${regulation}\0${valueKey(t)}`)) {
        report(change, t);
      }
    }
    for (const raw of insertedRuns(sides)) {
      let text = tidy(raw).replace(/^[\s.,;:)"']+|[\s.,;:("']+$/g, '');
      if (change.heading) {
        text = stripLabel(text);
      }
      if (
        text &&
        wordingMissing(text, sides.old, amending) &&
        once(`w\0${regulation}\0${text}`)
      ) {
        out.push({
          type: 'missingFromText',
          text,
          regulation,
          section: change.section,
        });
      }
    }
  }

  // What the amending text states, the base changes must hold.
  const base = new Set<string>();
  for (const { sides } of changes) {
    for (const t of [...numbersIn(sides.old), ...numbersIn(sides.new)]) {
      base.add(valueKey(t));
      t.digits.forEach((d) => base.add(`v:${d}`));
    }
  }
  for (const { token, context, section } of amending.stated) {
    if (!base.has(valueKey(token)) && once(`n\0${valueKey(token)}`)) {
      out.push({ type: 'notInChanges', text: token.raw, context, section });
    }
  }
  return out;
};
