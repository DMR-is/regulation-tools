/*
  Text helpers for findAmendingMismatches: reading both sides of a diff,
  and finding the numbers and dates in a text.
*/

// ---------------------------------------------------------------------------
// Characters

/** One kind of space, quote and dash; no soft hyphens. Keeps the length of the text it can. */
const cleanChars = (s: string) =>
  s
    .replace(/[\u00ad\u200b]/g, '')
    .replace(/[\u00a0\u2007\u202f\t\r]/g, ' ')
    .replace(/[\u201e\u201c\u201d\u00ab\u00bb]/g, '"')
    .replace(/[\u201a\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, '-');

/** For reports: single spaces, no space before punctuation. */
export const tidy = (s: string) =>
  cleanChars(s)
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();

/**
 * Lowercase words, punctuation dropped, numbers too: wording is compared
 * apart from numbers, which are compared exactly.
 */
export const wordsOf = (s: string) =>
  cleanChars(s)
    .toLowerCase()
    .split(/[^\p{L}\d]+/u)
    .filter((w) => /\p{L}/u.test(w));

/** The words as one string with a space either end, for whole-word search. */
export const padded = (words: ReadonlyArray<string>) => ` ${words.join(' ')} `;

/**
 * A word's stem for inflected forms: "Lyfjastofnunar" and "Lyfjastofnun",
 * "ráðuneytisins" and "ráðuneytið" — amending text gives a new name once,
 * "í viðeigandi beygingarfalli".
 */
export const stemOf = (word: string) =>
  word.slice(0, Math.max(4, word.length - 4));

/** Every prefix of every word of four letters or more: for `stemOf` lookups. */
export const prefixesOf = (words: ReadonlyArray<string>) => {
  const out = new Set<string>();
  for (const w of words) {
    for (let n = 4; n <= w.length; n++) {
      out.add(w.slice(0, n));
    }
  }
  return out;
};

export const triples = (words: ReadonlyArray<string>) => {
  const out = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) {
    out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Both sides of a diff

/** Between blocks, so words in neighbouring blocks never run together. */
export const BOUNDARY = '\n';

const BLOCK_TAGS = new Set([
  'P',
  'LI',
  'TD',
  'TH',
  'TR',
  'TABLE',
  'UL',
  'OL',
  'DIV',
  'DT',
  'DD',
  'CAPTION',
  'BLOCKQUOTE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

export type Sides = {
  /** The text before the change: without insertions (`ins.mod` is formatting, so it stays). */
  old: string;
  /** The text after the change: without deletions. */
  new: string;
  /** Per character of `new`: whether the change inserted it (not a move, not formatting). */
  inserted: Uint8Array;
};

/**
 * Reads one element of diff HTML as its old and new text, keeping track of
 * which characters of the new text were inserted. Without marks (no diff at
 * all), both sides are the text and nothing is inserted.
 */
export const sidesOf = (el: Node): Sides => {
  let old = '';
  const parts: Array<string> = [];
  const flags: Array<[number, boolean]> = [];
  const add = (t: string, toOld: boolean, toNew: boolean, ins: boolean) => {
    if (toOld) {
      old += t;
    }
    if (toNew) {
      parts.push(t);
      flags.push([t.length, ins]);
    }
  };
  const walk = (
    node: Node,
    inIns: boolean,
    inDel: boolean,
    inMark: boolean,
  ) => {
    if (node.nodeType === 3) {
      add(cleanChars((node as Text).data), !inIns, !inDel, inMark);
      return;
    }
    if (node.nodeType !== 1) {
      return;
    }
    const el = node as Element;
    const tag = el.tagName;
    if (tag === 'BR') {
      add(' ', true, true, false);
      return;
    }
    let ins = inIns;
    let del = inDel;
    let mark = inMark;
    if (tag === 'INS' && !el.classList.contains('mod')) {
      ins = true;
      // A move arrives unchanged: amending text moves it by number.
      mark = !el.classList.contains('diffmove');
    } else if (tag === 'DEL') {
      del = true;
    }
    const block = BLOCK_TAGS.has(tag);
    block && add(BOUNDARY, true, true, false);
    el.childNodes.forEach((c) => walk(c, ins, del, mark));
    block && add(BOUNDARY, true, true, false);
  };
  walk(el, false, false, false);

  const text = parts.join('');
  const inserted = new Uint8Array(text.length);
  let at = 0;
  for (const [len, ins] of flags) {
    ins && inserted.fill(1, at, at + len);
    at += len;
  }
  return { old, new: text, inserted };
};

/** The runs of inserted text, one per block, with where each starts in `new`. */
export const insertedRuns = ({ new: text, inserted }: Sides) => {
  const out: Array<{ text: string; index: number }> = [];
  let start = -1;
  for (let i = 0; i <= text.length; i++) {
    const inRun = i < text.length && inserted[i] === 1 && text[i] !== BOUNDARY;
    if (inRun && start < 0) {
      start = i;
    } else if (!inRun && start >= 0) {
      out.push({ text: text.slice(start, i), index: start });
      start = -1;
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// Numbers and dates

export const MONTHS = [
  'janúar',
  'febrúar',
  'mars',
  'apríl',
  'maí',
  'júní',
  'júlí',
  'ágúst',
  'september',
  'október',
  'nóvember',
  'desember',
];

/**
 * `value`: an amount, a count, a year — what a slip would change.
 * `date`: "26. apríl 2017", compared whole.
 * `ref`: part of a reference, "nr. 46", "2017/736".
 * `place`: a unit's number, "3. mgr.", "14. gr. a", a paragraph's own "2.".
 */
export type NumberKind = 'value' | 'date' | 'ref' | 'place';

export type NumberToken = {
  kind: NumberKind;
  /** As written. */
  raw: string;
  /** "7500" for "7.500", "2017-04-26" for a date. */
  canon: string;
  /** Every run of digits in it, canonical: "26", "2017". */
  digits: Array<string>;
  /**
   * A date or year that belongs to a reference: "nr. 278 6. mars 2013",
   * "(ESB) 2017/736 frá 26. apríl 2017", "nr. 120 frá 2021". It describes
   * the act cited, which the base regulation need not mention.
   */
  ofReference?: true;
  index: number;
};

const TOKEN_RE = new RegExp(
  String.raw`(?<![\p{L}\d,])(?:(?<=(?<!\p{L})kr\.)|(?<![\p{L}\d]\.))(?:(\d{1,2})\.\s*(${MONTHS.join(
    '|',
  )})\s+(\d{4})(?!\d)|(\d+(?:[.,]\d+)*)(?![.,]?\d)(?!\p{L}))`,
  'giu',
);

/** "7.500" and "7500" are the same amount, and "1,20" and "1,2". */
export const canonicalNumber = (n: string) => {
  const whole = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(n)
    ? n.replace(/\./g, '')
    : n;
  return whole.includes(',') && !whole.includes('.')
    ? whole.replace(/0+$/, '').replace(/,$/, '')
    : whole;
};

/** "2.3", "14.11.2": a section's number (decimals take a comma, thousands three digits). */
const SECTION_NUMBER = /^\d+(?:\.\d{1,2})+$/;

/** Words for the units amending text addresses, as they start. */
const UNIT = String.raw`(?:gr(?!\p{L})|grein|mgr|málsgr|málsl|tölul|tl\.|stafl|kafl|hlut[ia]|viðauk|fylgiskj|undirlið|lið|bráðabirgð|skýring|flokk)`;
/** Compounds of a unit word: "undirkafla 4", "gjaldflokki 104", "launaflokki 12". */
const UNIT_PREFIX = String.raw`(?:undir|loka|efnis|gjald|launa|vöru)`;
/** Units only after an ordinal: "3. línu í töflu", not "950 Tafla". */
const ORDINAL_UNIT = String.raw`(?:tafl|töflu|línu|dálk|reit)`;

/** Space within a block: a place's number and its unit are never split by a block. */
const S = String.raw`[ \t]`;

/** The rest of a list of numbers: ", 62. og 63." in "61., 62. og 63. tölul.". */
const LIST_REST = new RegExp(
  String.raw`^\.?(?:${S}*(?:,|og|eða|til|-)${S}*\d+(?:\.\d+)*\.?)*`,
  'u',
);

/**
 * What follows a number that names a place, not a value: "3. mgr.",
 * "14. gr. a", "2. málsl.", "III. kafla", "36 nýir töluliðir", "3. línu".
 */
const PLACE_AFTER = new RegExp(
  String.raw`^(?:${S}*,?${S}*(?:ný\p{L}*${S}+)?${UNIT}|\.${S}+${ORDINAL_UNIT})`,
  'iu',
);
/**
 * A unit word before: "Málsliðir 3 og 4", "lið 1.5", "töluliðir, 89.",
 * "Kafli 1.3.6", "flokknum 04 03". Each number before this one is followed
 * by a separator or a space, so a long run of digits can't be split many
 * ways.
 */
const PLACE_BEFORE = new RegExp(
  String.raw`(?<!\p{L})${UNIT_PREFIX}?${UNIT}\p{L}*\.?${S}*,?${S}*(?:\d+(?:\.\d+)*\.?(?:${S}*(?:,|og|eða|til|-)${S}*|${S}+))*$`,
  'iu',
);
/** An ordinal: "6. breytingu", "10. hver", "(7.) breytingu". */
const ORDINAL_AFTER = /^\.\)?\s+\p{Ll}/u;

/**
 * A reference number: "nr. 123/2020", "nr. 26", "bls. 422", and an EU
 * Official Journal citation's issue and date, "Stjtíð. ESB L 58, 3.3.2011".
 */
const REF_BEFORE =
  /(?:nr\.?|númer|bls\.?|\/|(?<!\p{L})(?:ESB|EB)\.?\s+L\s*(?:\d+,\s*)?)\s*$/u;
const REF_AFTER = /^\/\d/;
/** What a reference's date or year follows. */
const OF_REFERENCE =
  /(?:nr\.?\s*[\d/]+(?:\/\p{L}+)?|\d+\/\d+(?:\/\p{L}+)?)\s*,?\s*(?:frá\s+)?$/u;
/**
 * A block's own number, "2." or "2)", at its start, before its text, which
 * can be in the next table cell: `<td>23.</td><td>Skírteini …</td>`.
 */
const OWN_NUMBER = /^[.)]\s+\p{L}/u;
/** A list item numbered inline: "14) Sjálfbærniþættir". */
const ITEM_NUMBER = /^\)\s+\p{Lu}/u;

const pad2 = (s: string) => s.padStart(2, '0');

/** A date token's parts: day and year as written, the month by name. */
export const dateParts = (t: NumberToken) => ({
  day: t.digits[0]!,
  month: MONTHS[Number(t.canon.slice(5, 7)) - 1]!,
  year: t.digits[1]!,
});

/** A web address: its numbers are part of it ("?qid=1459959072574"). */
const URL_RE = /(?:https?:\/\/|www\.)\S+/giu;

export const numbersIn = (text: string): Array<NumberToken> => {
  const urls = Array.from(text.matchAll(URL_RE), (m) => [
    m.index!,
    m.index! + m[0].length,
  ]);
  const inUrl = (at: number) => urls.some(([a, b]) => a! <= at && at < b!);
  return Array.from(text.matchAll(TOKEN_RE))
    .filter((m) => !inUrl(m.index!))
    .map((m): NumberToken => {
      const index = m.index!;
      const raw = m[0];
      const before = text.slice(Math.max(0, index - 40), index);
      const ofReference = OF_REFERENCE.test(before) || undefined;
      if (m[1]) {
        const month = MONTHS.indexOf(m[2]!.toLowerCase()) + 1;
        return {
          kind: 'date',
          raw,
          canon: `${m[3]}-${pad2(String(month))}-${pad2(m[1])}`,
          digits: [m[1].replace(/^0/, ''), m[3]!],
          ofReference,
          index,
        };
      }
      const after = text
        .slice(index + raw.length, index + raw.length + 60)
        .replace(LIST_REST, '');
      // At a block's start, or where new wording starts after its lead:
      // "6. tölul., svohljóðandi: 6. Greiðslur …" (not "kemur: 3.600.000.").
      const atBlockStart =
        /(?:^|\n)\s*$/.test(before) ||
        (/^\d{1,3}$/.test(raw) && /(?:svohljóðandi|svo)\s*:\s*$/u.test(before));
      const kind: NumberKind =
        REF_BEFORE.test(before) || REF_AFTER.test(after)
          ? 'ref'
          : SECTION_NUMBER.test(raw) ||
            PLACE_AFTER.test(after) ||
            PLACE_AFTER.test(text.slice(index + raw.length)) ||
            PLACE_BEFORE.test(before) ||
            ORDINAL_AFTER.test(text.slice(index + raw.length)) ||
            ITEM_NUMBER.test(text.slice(index + raw.length)) ||
            (atBlockStart &&
              /^\d{1,3}$/.test(raw) &&
              OWN_NUMBER.test(text.slice(index + raw.length)))
          ? 'place'
          : 'value';
      const canon = canonicalNumber(raw);
      return { kind, raw, canon, digits: [canon], ofReference, index };
    });
};

/** Amounts and dates are values: what a slip would change. */
export const isValue = (t: NumberToken) =>
  t.kind === 'value' || t.kind === 'date';

/** For comparing like with like: "d:2017-04-26", "v:7500". */
export const valueKey = (t: NumberToken) =>
  `${t.kind === 'date' ? 'd' : 'v'}:${t.canon}`;

/** The words around a number, for reports. */
export const contextOf = (text: string, t: NumberToken) =>
  tidy(text.slice(Math.max(0, t.index - 40), t.index + t.raw.length + 40));
