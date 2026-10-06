/*
  Word-level similarity between texts — what decides that two paragraphs are
  "the same paragraph, changed".
*/

export const words = (s: string) =>
  s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

export const MAX_LCS_WORDS = 400;

/** difflib-style ratio: 2·LCS / (|a| + |b|), over word tokens. */
export const similarity = (a: string, b: string): number => {
  if (a === b) {
    return 1;
  }
  const wa = words(a);
  const wb = words(b);
  const total = wa.length + wb.length;
  if (!total) {
    return 1;
  }
  if (wa.length > MAX_LCS_WORDS || wb.length > MAX_LCS_WORDS) {
    // Bag-of-words Dice for very long blocks, to keep this O(n).
    const counts = new Map<string, number>();
    wa.forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
    let shared = 0;
    wb.forEach((w) => {
      const c = counts.get(w) || 0;
      if (c) {
        shared++;
        counts.set(w, c - 1);
      }
    });
    return (2 * shared) / total;
  }
  let prev = new Array<number>(wb.length + 1).fill(0);
  for (let i = 1; i <= wa.length; i++) {
    const row = new Array<number>(wb.length + 1).fill(0);
    for (let j = 1; j <= wb.length; j++) {
      row[j] =
        wa[i - 1] === wb[j - 1]
          ? prev[j - 1]! + 1
          : Math.max(prev[j]!, row[j - 1]!);
    }
    prev = row;
  }
  return (2 * prev[wb.length]!) / total;
};

/**
 * How much of the shorter text survives, in order, in the longer: LCS of
 * words over the shorter's length. Recovered from `similarity`'s ratio.
 */
export const containment = (a: string, b: string) => {
  const la = words(a).length;
  const lb = words(b).length;
  if (!la || !lb) {
    return 0;
  }
  const lcs = (similarity(a, b) * (la + lb)) / 2;
  return lcs / Math.min(la, lb);
};

/** `containment` at which a paragraph paired by position is edited, not replaced. */
export const EDIT_CONTAINMENT = 0.8;
