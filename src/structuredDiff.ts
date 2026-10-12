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

  `createStructuredDiffer` gives the same result for one base text diffed
  against successive new versions, as an editor does while typing, redoing
  only what changed since the last call.

  Pass an `asDiv` for your environment, or import the bound versions from
  `./structuredDiff-server` or `./structuredDiff-browser`.
*/

import { HTMLText } from './types';
import { parseSections } from './_structuredDiff/parse';
import {
  diffSections,
  joinPieces,
  plainCaches,
} from './_structuredDiff/sections';
import { StructuredDiff, StructuredDiffOptions } from './_structuredDiff/types';

export type {
  Block,
  BlockKind,
  BlockOp,
  DiffPart,
  IncrementalDiff,
  MoveEnd,
  OpType,
  Section,
  SectionOp,
  SentenceOp,
  StructuredDiff,
  StructuredDiffer,
  StructuredDiffOptions,
  WordEdit,
} from './_structuredDiff/types';

export { createStructuredDiffer } from './_structuredDiff/incremental';

export const getStructuredDiff = (
  older: HTMLText,
  newer: HTMLText,
  opts: StructuredDiffOptions,
): StructuredDiff => {
  const oldSections = parseSections(older, opts.asDiv);
  const newSections = parseSections(newer, opts.asDiv);
  const { sections, pieces } = diffSections(
    oldSections,
    newSections,
    opts,
    plainCaches(opts),
  );
  return joinPieces(sections, pieces);
};
