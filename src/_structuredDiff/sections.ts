/*
  From two parsed versions to the finished diff: align the sections, diff
  each pair's blocks, detect moves, render. Shared by `getStructuredDiff` and
  the incremental differ, which differ only in what they remember between
  calls (`DiffCaches`), so the two cannot drift apart.
*/

import { align } from './align';
import { diffBlocks } from './blocks';
import { detectMoves } from './moves';
import { renderSections, RenderMemo } from './render';
import { similarity } from './similarity';
import {
  BlockOp,
  Section,
  SectionOp,
  StructuredDiff,
  StructuredDiffOptions,
} from './types';

export type DiffCaches = {
  /** Similarity of an old and a new section. */
  sectionSim: (x: Section, y: Section) => number;
  /**
   * The block ops of a paired old and new section. Must return ops the
   * caller may mutate: `detectMoves` rewrites deletes and inserts in place.
   */
  blocks: (o: Section, n: Section) => Array<BlockOp>;
  render?: RenderMemo;
};

/** `gr`, `sub`, `h2`, `h3`, `sig` or `pre` — only like pairs with like. */
const sectionKind = (s: Section) => s.key.split(':')[0];

export const sectionText = (s: Section) =>
  (s.heading?.text || '') + ' ' + s.blocks.map((b) => b.text).join(' ');

export const sectionSimilarity = (x: Section, y: Section) =>
  similarity(sectionText(x), sectionText(y));

/** Section similarity, remembered per pair: alignment asks for the same pair repeatedly. */
export const memoSimilarity = () => {
  const memo = new Map<Section, Map<Section, number>>();
  return (x: Section, y: Section) => {
    let row = memo.get(x);
    if (!row) {
      memo.set(x, (row = new Map()));
    }
    let v = row.get(y);
    if (v == null) {
      row.set(y, (v = sectionSimilarity(x, y)));
    }
    return v;
  };
};

/** The defaults, filled in. */
export const diffOptions = (opts: StructuredDiffOptions) => {
  const {
    asDiv,
    blockCutoff = 0.5,
    sectionCutoff = 0.5,
    replaceWordDiffFloor = 0.3,
    moveCutoff = 0.9,
  } = opts;
  return {
    asDiv,
    blockCutoff,
    sectionCutoff,
    replaceWordDiffFloor,
    moveCutoff,
  };
};

/** `getStructuredDiff`'s caches: none kept beyond one call. */
export const plainCaches = (opts: StructuredDiffOptions): DiffCaches => {
  const { asDiv, blockCutoff, replaceWordDiffFloor } = diffOptions(opts);
  return {
    sectionSim: memoSimilarity(),
    blocks: (o, n) =>
      diffBlocks(o.blocks, n.blocks, blockCutoff, replaceWordDiffFloor, asDiv),
  };
};

/** The section ops, with moves detected, and each section's rendered pieces. */
export const diffSections = (
  oldSections: Array<Section>,
  newSections: Array<Section>,
  opts: StructuredDiffOptions,
  caches: DiffCaches,
): { sections: Array<SectionOp>; pieces: Array<Array<string>> } => {
  const { asDiv, sectionCutoff, moveCutoff } = diffOptions(opts);

  // A section is the same section when its heading says so: the same title
  // (so a renumbered article still pairs with itself), or the same number
  // when neither has a title. When the heading is ambiguous — the title
  // recurs ("Almennt." in every chapter), or one side has a title and the
  // other not — the bodies must also be similar, or a new 3.1 "Almennt."
  // would take the place of the old 3.1 "Almennt." now numbered 4.1.
  const { sectionSim } = caches;
  const titles = (sections: Array<Section>) => {
    const counts = new Map<string, number>();
    sections.forEach((x) => {
      const k = sectionKind(x) + '\0' + x.title;
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    return (x: Section) => counts.get(sectionKind(x) + '\0' + x.title) || 0;
  };
  const oldTitles = titles(oldSections);
  const newTitles = titles(newSections);
  const sameSection = (x: Section, y: Section) => {
    if (sectionKind(x) !== sectionKind(y)) {
      return false;
    }
    const byTitle = !!(x.title && y.title);
    if (byTitle ? x.title !== y.title : x.key !== y.key) {
      return false;
    }
    const ambiguous = byTitle
      ? oldTitles(x) > 1 || newTitles(y) > 1
      : !!(x.title || y.title);
    return !ambiguous || sectionSim(x, y) >= sectionCutoff;
  };
  const pairs = align(
    oldSections,
    newSections,
    sameSection,
    (x, y) => (sectionKind(x) === sectionKind(y) ? sectionSim(x, y) : 0),
    sectionCutoff,
    { pairLast: (x, y) => x.key === y.key },
  );

  let afterOld: Section | undefined;
  const sections = pairs.map(({ a, b }): SectionOp => {
    const o = a != null ? oldSections[a] : undefined;
    const n = b != null ? newSections[b] : undefined;
    if (o && n) {
      afterOld = o;
      const blocks = caches.blocks(o, n);
      const headingChanged =
        o.title !== n.title || o.heading?.shape !== n.heading?.shape;
      const renumbered = o.key !== n.key;
      const changed =
        headingChanged || renumbered || blocks.some((x) => x.type !== 'equal');
      return {
        type: changed ? 'modify' : 'equal',
        old: o,
        new: n,
        headingChanged,
        renumbered,
        blocks,
      };
    }
    if (o) {
      afterOld = o;
      return {
        type: 'delete',
        old: o,
        blocks: o.blocks.map((x) => ({ type: 'delete', old: x })),
      };
    }
    return {
      type: 'insert',
      new: n,
      afterOld,
      blocks: n!.blocks.map((x) => ({ type: 'insert', new: x })),
    };
  });

  detectMoves(sections, moveCutoff, asDiv);
  return {
    sections,
    pieces: renderSections(sections, asDiv, caches.render),
  };
};

/** The diff as `getStructuredDiff` returns it. */
export const joinPieces = (
  sections: Array<SectionOp>,
  pieces: Array<Array<string>>,
): StructuredDiff => ({
  sections,
  diff: pieces.flat().join('\n') as StructuredDiff['diff'],
});
