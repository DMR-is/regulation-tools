/*
  Aligning two sequences as whole units — sections, blocks, list items or
  sentences: LCS on identical items, then each gap resolved by similarity
  (difflib's `fancy_replace`), with optional split/merge and pairing by
  position.
*/

import { OpType } from './types';

/** `aEnd` / `bEnd` (exclusive) are set for `merge` / `split`. */
export type Pair = {
  type: OpType;
  a?: number;
  b?: number;
  aEnd?: number;
  bEnd?: number;
};

export type AlignOptions<T> = {
  /**
   * Similarity of one item to several adjacent items on the other side
   * taken together. Enables `split` / `merge`.
   */
  joinSim?: (one: T, many: ReadonlyArray<T>) => number;
  /** Similarity a split/merge needs. Default 0.9 */
  joinCutoff?: number;
  /**
   * Pair whatever is left unpaired in a gap by position, as `replace`, when
   * both sides of the gap have the same number of items — each pair only if
   * `replaceable` allows it, else that pair is a delete + insert.
   */
  positionalReplace?: boolean;
  /**
   * Like `positionalReplace`, but also when the counts differ: pair in order
   * as far as both sides go, the rest delete/insert — how amending text
   * treats sentences ("2. málsl. orðast svo … 3. málsl. fellur brott").
   */
  positionalPrefix?: boolean;
  replaceable?: (x: T, y: T) => boolean;
  /**
   * Items that are the same item whatever their similarity — paired first in
   * each gap, as `modify` when similar enough, else `replace`. For blocks: a
   * definition of the same term.
   */
  pairFirst?: (x: T, y: T) => boolean;
  /**
   * Last resort in a gap, when nothing pairs by similarity: items that are
   * the same item by some other measure pair as `modify`. For sections: the
   * same number, when the title and body were both rewritten.
   */
  pairLast?: (x: T, y: T) => boolean;
};

/** Most pieces a split or merge is looked for across. */
export const MAX_JOIN = 4;

/**
 * Aligns two sequences as whole units. Items for which `same` holds anchor
 * the alignment (LCS); each gap between anchors is resolved by pairing the
 * most similar old/new items above `cutoff`, recursively either side of the
 * pair. Whatever is left over becomes delete/insert.
 */
export const align = <T>(
  a: ReadonlyArray<T>,
  b: ReadonlyArray<T>,
  same: (x: T, y: T) => boolean,
  sim: (x: T, y: T) => number,
  cutoff: number,
  opts: AlignOptions<T> = {},
): Array<Pair> => {
  const {
    joinSim,
    joinCutoff = 0.9,
    positionalReplace,
    positionalPrefix,
    replaceable = () => true,
    pairFirst,
    pairLast,
  } = opts;
  // Trim the common prefix and suffix — usually most of a regulation.
  let lo = 0;
  while (lo < a.length && lo < b.length && same(a[lo]!, b[lo]!)) {
    lo++;
  }
  let hiA = a.length;
  let hiB = b.length;
  while (hiA > lo && hiB > lo && same(a[hiA - 1]!, b[hiB - 1]!)) {
    hiA--;
    hiB--;
  }

  const n = hiA - lo;
  const m = hiB - lo;
  // LCS table over the middle.
  const dp: Array<Uint32Array> = [];
  for (let i = 0; i <= n; i++) {
    dp.push(new Uint32Array(m + 1));
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = same(a[lo + i]!, b[lo + j]!)
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const out: Array<Pair> = [];
  for (let k = 0; k < lo; k++) {
    out.push({ type: 'equal', a: k, b: k });
  }

  const resolveGap = (a0: number, a1: number, b0: number, b1: number) => {
    if (a0 >= a1 || b0 >= b1) {
      for (let i = a0; i < a1; i++) {
        out.push({ type: 'delete', a: i });
      }
      for (let j = b0; j < b1; j++) {
        out.push({ type: 'insert', b: j });
      }
      return;
    }
    if (pairFirst) {
      for (let i = a0; i < a1; i++) {
        for (let j = b0; j < b1; j++) {
          if (pairFirst(a[i]!, b[j]!)) {
            resolveGap(a0, i, b0, j);
            out.push({
              type: sim(a[i]!, b[j]!) > cutoff ? 'modify' : 'replace',
              a: i,
              b: j,
            });
            resolveGap(i + 1, a1, j + 1, b1);
            return;
          }
        }
      }
    }
    let best = cutoff;
    let bi = -1;
    let bj = -1;
    let bType = 'modify' as 'modify' | 'split' | 'merge';
    let bk = 1;
    for (let i = a0; i < a1; i++) {
      for (let j = b0; j < b1; j++) {
        const s = sim(a[i]!, b[j]!);
        if (s > best) {
          best = s;
          bi = i;
          bj = j;
          bType = 'modify';
          bk = 1;
        }
      }
    }
    if (joinSim) {
      // One item matching several adjacent items taken together. Must beat
      // the best one-to-one pair, so a reworded paragraph followed by an
      // unrelated new one stays a modify + insert.
      const tryJoin = (
        s: number,
        i: number,
        j: number,
        k: number,
        t: 'split' | 'merge',
      ) => {
        if (s >= joinCutoff && s > best) {
          best = s;
          bi = i;
          bj = j;
          bType = t;
          bk = k;
        }
      };
      for (let i = a0; i < a1; i++) {
        for (let j = b0; j < b1; j++) {
          for (let k = 2; k <= MAX_JOIN && j + k <= b1; k++) {
            tryJoin(joinSim(a[i]!, b.slice(j, j + k)), i, j, k, 'split');
          }
          for (let k = 2; k <= MAX_JOIN && i + k <= a1; k++) {
            tryJoin(joinSim(b[j]!, a.slice(i, i + k)), i, j, k, 'merge');
          }
        }
      }
    }
    if (bi < 0 && pairLast) {
      for (let i = a0; i < a1; i++) {
        for (let j = b0; j < b1; j++) {
          if (pairLast(a[i]!, b[j]!)) {
            resolveGap(a0, i, b0, j);
            out.push({ type: 'modify', a: i, b: j });
            resolveGap(i + 1, a1, j + 1, b1);
            return;
          }
        }
      }
    }
    if (bi < 0 && positionalPrefix) {
      const k = Math.min(a1 - a0, b1 - b0);
      for (let t = 0; t < k; t++) {
        out.push({ type: 'replace', a: a0 + t, b: b0 + t });
      }
      resolveGap(a0 + k, a1, b0 + k, b1);
      return;
    }
    if (bi < 0) {
      if (positionalReplace && a1 - a0 === b1 - b0) {
        for (let k = 0; k < a1 - a0; k++) {
          if (replaceable(a[a0 + k]!, b[b0 + k]!)) {
            out.push({ type: 'replace', a: a0 + k, b: b0 + k });
          } else {
            out.push(
              { type: 'delete', a: a0 + k },
              { type: 'insert', b: b0 + k },
            );
          }
        }
        return;
      }
      resolveGap(a0, a1, b0, b0);
      resolveGap(a1, a1, b0, b1);
      return;
    }
    resolveGap(a0, bi, b0, bj);
    if (bType === 'split') {
      out.push({ type: 'split', a: bi, b: bj, bEnd: bj + bk });
      resolveGap(bi + 1, a1, bj + bk, b1);
    } else if (bType === 'merge') {
      out.push({ type: 'merge', a: bi, aEnd: bi + bk, b: bj });
      resolveGap(bi + bk, a1, bj + 1, b1);
    } else {
      out.push({ type: 'modify', a: bi, b: bj });
      resolveGap(bi + 1, a1, bj + 1, b1);
    }
  };

  let i = 0;
  let j = 0;
  let gapA = 0;
  let gapB = 0;
  while (i < n && j < m) {
    if (same(a[lo + i]!, b[lo + j]!)) {
      resolveGap(lo + gapA, lo + i, lo + gapB, lo + j);
      out.push({ type: 'equal', a: lo + i, b: lo + j });
      i++;
      j++;
      gapA = i;
      gapB = j;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  resolveGap(lo + gapA, hiA, lo + gapB, hiB);

  for (let k = 0; k < a.length - hiA; k++) {
    out.push({ type: 'equal', a: hiA + k, b: hiB + k });
  }
  return out;
};
