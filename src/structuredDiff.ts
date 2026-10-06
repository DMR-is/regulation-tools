/*
  Structure-aware diffing of regulation HTML.

  `getDiff` hands both texts to htmldiff as one flat stream of words, so a new
  paragraph that shares words with its neighbours gets smeared across them.
  This diffs top-down instead, the way amendments are written:

    1. Parse each version into sections (articles, sub-articles, chapters)
       holding blocks (paragraphs, lists, tables).
    2. Align sections by title, or by number when untitled.
    3. Align blocks inside each section as whole units, then list items and
       sentences inside each changed block.
    4. Word-diff (htmldiff) only inside paired blocks.

  The result is diff HTML in getDiff's `<ins>`/`<del>` markup, carrying the
  changes as `data-diff-*` attributes, and the same changes as data. See the
  README, "Structured diff".

  Pass an `asDiv` for your environment, or import the bound versions from
  `./structuredDiff-server` or `./structuredDiff-browser`.
*/

import { HTMLText } from './types';
import { align } from './_structuredDiff/align';
import { diffBlocks } from './_structuredDiff/blocks';
import { detectMoves } from './_structuredDiff/moves';
import { parseSections } from './_structuredDiff/parse';
import { renderDiff } from './_structuredDiff/render';
import { similarity } from './_structuredDiff/similarity';
import {
  Section,
  SectionOp,
  StructuredDiff,
  StructuredDiffOptions,
} from './_structuredDiff/types';

export type {
  Block,
  BlockKind,
  BlockOp,
  MoveEnd,
  OpType,
  Section,
  SectionOp,
  SentenceOp,
  StructuredDiff,
  StructuredDiffOptions,
  WordEdit,
} from './_structuredDiff/types';

/** Section similarity, remembered per pair: alignment asks for the same pair repeatedly. */
const memoSimilarity = () => {
  const memo = new Map<Section, Map<Section, number>>();
  return (x: Section, y: Section) => {
    let row = memo.get(x);
    if (!row) {
      memo.set(x, (row = new Map()));
    }
    let v = row.get(y);
    if (v == null) {
      row.set(y, (v = similarity(sectionText(x), sectionText(y))));
    }
    return v;
  };
};

/** `gr`, `sub`, `h2`, `h3`, `sig` or `pre` — only like pairs with like. */
const sectionKind = (s: Section) => s.key.split(':')[0];

const sectionText = (s: Section) =>
  (s.heading?.text || '') + ' ' + s.blocks.map((b) => b.text).join(' ');

export const getStructuredDiff = (
  older: HTMLText,
  newer: HTMLText,
  opts: StructuredDiffOptions,
): StructuredDiff => {
  const {
    asDiv,
    blockCutoff = 0.5,
    sectionCutoff = 0.5,
    replaceWordDiffFloor = 0.3,
    moveCutoff = 0.9,
  } = opts;
  const oldSections = parseSections(older, asDiv);
  const newSections = parseSections(newer, asDiv);

  // A section is the same section when its heading says so: the same title
  // (so a renumbered article still pairs with itself), or the same number
  // when neither has a title. When the heading is ambiguous — the title
  // recurs ("Almennt." in every chapter), or one side has a title and the
  // other not — the bodies must also be similar, or a new 3.1 "Almennt."
  // would take the place of the old 3.1 "Almennt." now numbered 4.1.
  const sectionSim = memoSimilarity();
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
      const blocks = diffBlocks(
        o.blocks,
        n.blocks,
        blockCutoff,
        replaceWordDiffFloor,
        asDiv,
      );
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
  return { sections, diff: renderDiff(sections, asDiv) };
};
