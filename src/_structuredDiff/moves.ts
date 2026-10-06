/*
  Move detection: blocks deleted in one place and inserted in another,
  anywhere in the regulation.
*/

import { DIFF_CLASSES } from '../diffClasses';

import { blockSim, modifyDiff } from './blocks';
import { markWhole } from './render';
import { words } from './similarity';
import { AsDiv, Block, BlockOp, SectionOp } from './types';

/** Moves shorter than this are left as delete + insert: too likely chance. */
export const MIN_MOVE_WORDS = 5;

/**
 * Pairs blocks deleted in one place and inserted in another — across the
 * whole regulation, not just one gap — as `moved` (old position) and `move`
 * (new position). Identical text and shape first, then near-identical.
 * Runs after alignment, so it only ever sees what alignment left unpaired.
 */
export const detectMoves = (
  sections: Array<SectionOp>,
  cutoff: number,
  asDiv: AsDiv,
) => {
  type Ref = { op: BlockOp; label: string };
  // Only text that occurs once in each version can be said to have moved:
  // stock sentences ("Húsnæðis- og mannvirkjastofnun skal gefa út
  // leiðbeiningar um …") recur across articles, and one copy removed while
  // another is added elsewhere is two changes, not a move.
  const tally = (side: 'old' | 'new') => {
    const counts = new Map<string, number>();
    sections.forEach((s) =>
      s[side]?.blocks.forEach((b) =>
        counts.set(b.text, (counts.get(b.text) || 0) + 1),
      ),
    );
    return counts;
  };
  const oldCounts = tally('old');
  const newCounts = tally('new');
  const deletes: Array<Ref> = [];
  const inserts: Array<Ref> = [];
  for (const s of sections) {
    if ((s.old || s.new)!.signature) {
      continue;
    }
    for (const op of s.blocks) {
      if (
        op.type === 'delete' &&
        words(op.old!.text).length >= MIN_MOVE_WORDS &&
        oldCounts.get(op.old!.text) === 1
      ) {
        deletes.push({ op, label: s.old!.label });
      } else if (
        op.type === 'insert' &&
        words(op.new!.text).length >= MIN_MOVE_WORDS &&
        newCounts.get(op.new!.text) === 1
      ) {
        inserts.push({ op, label: s.new!.label });
      }
    }
  }
  const pair = (ins: Ref, del: Ref) => {
    const o = del.op.old!;
    const n = ins.op.new!;
    const edited = o.text !== n.text || o.shape !== n.shape;
    Object.assign(del.op, {
      type: 'moved',
      movedTo: { label: ins.label, mgr: n.mgr },
      diff: markWhole(o.html, 'del', asDiv, DIFF_CLASSES.move),
    });
    Object.assign(ins.op, {
      type: 'move',
      old: o,
      movedFrom: { label: del.label, mgr: o.mgr },
      change: !edited
        ? undefined
        : o.shape === n.shape
        ? 'text'
        : o.text === n.text
        ? 'format'
        : 'both',
      diff: edited
        ? modifyDiff(o, n, asDiv)
        : markWhole(n.html, 'ins', asDiv, DIFF_CLASSES.move),
    });
    deletes.splice(deletes.indexOf(del), 1);
  };
  // Identical first, so a near-identical candidate never takes an exact
  // one's match. A lookup, not a scan: a wholesale rewrite leaves hundreds
  // of each.
  const byContent = new Map<string, Array<Ref>>();
  const contentKey = (b: Block) => b.shape + '\0' + b.text;
  deletes.forEach((d) => {
    const k = contentKey(d.op.old!);
    byContent.set(k, [...(byContent.get(k) || []), d]);
  });
  const unmatched: Array<Ref> = [];
  for (const ins of inserts) {
    const del = byContent.get(contentKey(ins.op.new!))?.shift();
    if (del) {
      pair(ins, del);
    } else {
      unmatched.push(ins);
    }
  }

  // Near-identical. similarity ≥ cutoff is impossible unless the word counts
  // are close and the word bags overlap — both cheap — so the word-level LCS
  // only runs on pairs that pass them.
  type Bag = { size: number; counts: Map<string, number> };
  const bagOf = (b: Block): Bag => {
    const w = words(b.text);
    const counts = new Map<string, number>();
    w.forEach((x) => counts.set(x, (counts.get(x) || 0) + 1));
    return { size: w.length, counts };
  };
  const dice = (x: Bag, y: Bag) => {
    let shared = 0;
    x.counts.forEach((c, w) => {
      shared += Math.min(c, y.counts.get(w) || 0);
    });
    return (2 * shared) / (x.size + y.size);
  };
  // 2·m / (a + b) ≥ cutoff with m ≤ min(a, b) needs min/max ≥ cutoff / (2 − cutoff).
  const minRatio = cutoff / (2 - cutoff);
  const delBags = new Map(deletes.map((d) => [d, bagOf(d.op.old!)]));
  for (const ins of unmatched) {
    const ib = bagOf(ins.op.new!);
    let best = cutoff;
    let bestDel: Ref | undefined;
    for (const d of deletes) {
      const db = delBags.get(d)!;
      if (
        Math.min(ib.size, db.size) / Math.max(ib.size, db.size) < minRatio ||
        dice(ib, db) < best
      ) {
        continue;
      }
      const sim = blockSim(d.op.old!, ins.op.new!);
      if (sim >= best) {
        best = sim;
        bestDel = d;
      }
    }
    if (bestDel) {
      pair(ins, bestDel);
    }
  }
};
