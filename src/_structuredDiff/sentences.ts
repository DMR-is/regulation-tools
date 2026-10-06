/*
  Splits regulation text into sentences (málsliðir), the unit amending text
  counts in: "2. málsl. 3. mgr. fellur brott".

  The hard part is every full stop that does not end a sentence, which in
  legal Icelandic is most of them:
    - ordinals and dates:      "3. mgr. 12. gr.", "27. október 2017"
    - abbreviations:           "a.m.k.", "þ.m.t.", "skv.", "o.fl."
    - roman numerals, letters: "IV. kafla", "b. liður", "H. Helgason"

  A sentence ends at . ! or ? followed by whitespace and a word that starts
  with a capital then a lowercase letter (or an opening quote/bracket before
  one) — so not before codes like "ÍST", "EI 60" or "A-liðar" — unless the
  word before the stop is an ordinal, a single letter, a roman numeral or one
  of ABBREVIATIONS. Errs towards *not* splitting: a sentence that ends in a
  number ("… sbr. ÍST 50. Sýna skal …") stays joined to the next one.
*/

/**
 * Abbreviations that, followed by a capital, are still mid-sentence —
 * lowercase, without the final full stop. Checked against the corpus: these
 * are followed by codes and names ("skv. ÍST 1", "sbr. XIII. kafla", "a.m.k.
 * EI 60", "þ.m.t. Lyfjastofnun"). References ("2. mgr.", "1. málsl."),
 * "o.fl." and amounts ("500 kr.") are left out on purpose: before a capital
 * they almost always end the sentence, and a continuing reference is
 * lowercase ("12. gr. laga nr. …").
 */
const ABBREVIATIONS = new Set([
  'skv',
  'sbr',
  'þ.e',
  'þ.m.t',
  't.d',
  'm.a',
  's.s',
  'u.þ.b',
  'e.t.v',
  'a.m.k',
  'f.h.r',
  'nr',
  'bls',
  'dags',
  'sl',
  'nk',
]);

const ROMAN = /^[IVXLCDM]+$/;

/** Whether the word ending at a full stop makes it not a sentence end. */
const isNonTerminal = (word: string) => {
  const w = word.replace(/^[("„“'«]+/, '');
  if (!w) {
    return false;
  }
  if (/^\d+$/.test(w)) {
    return true; // ordinal: "3." "27."
  }
  if (/^\d+[.,]\d+$/.test(w)) {
    return false; // a number like "1,5" or "2020/1234" ends normally
  }
  if (/^\p{L}$/u.test(w)) {
    return true; // single letter: "b." "H."
  }
  if (ROMAN.test(w)) {
    return true; // "IV."
  }
  return ABBREVIATIONS.has(w.toLowerCase());
};

/** The text split into sentences, each trimmed, in order. */
export const splitSentences = (text: string): Array<string> => {
  const out: Array<string> = [];
  // Candidate ends: a stop, whitespace, then (quote/bracket)? a capital and a lowercase letter.
  // A one-letter word is a sentence start only if it is an Icelandic word
  // (Á, Í, Ó, Ú), not a code ("E 30").
  const re = /([.!?])(\s+)(?=[("„“'«]?(?:\p{Lu}\p{Ll}|[ÁÍÓÚ]\s))/gu;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + 1;
    const before = text.slice(start, m.index);
    const lastWord = before.split(/\s+/).pop() || '';
    if (m[1] === '.' && isNonTerminal(lastWord)) {
      continue;
    }
    const sentence = text.slice(start, end).trim();
    if (sentence) {
      out.push(sentence);
    }
    start = end + m[2]!.length;
  }
  const rest = text.slice(start).trim();
  if (rest) {
    out.push(rest);
  }
  return out;
};
