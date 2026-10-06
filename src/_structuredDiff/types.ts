/*
  The structured diff's data: what a parsed regulation looks like (sections
  of blocks) and what changed (section and block operations).
*/

import { HTMLText } from '../types';

/** `text` is loose top-level text and inline markup not wrapped in a block element. */
export type BlockKind =
  | 'paragraph'
  | 'text'
  | 'list'
  | 'item'
  | 'table'
  | 'other';

export type Block = {
  kind: BlockKind;
  html: string;
  /** Normalized text, for similarity and phrasing. Flattened: cell and item boundaries are lost. */
  text: string;
  /**
   * The text with cell, item and paragraph boundaries kept, so `[1, 23]` and
   * `[12, 3]` differ. Decides whether the *text* changed.
   */
  content: string;
  /**
   * The block canonicalised: tags, where formatting sits, the meaningful
   * attributes (SHAPE_ATTRS), and text, with incidental whitespace removed.
   * Two blocks are equal only if `content` and `canon` both match.
   */
  canon: string;
  /**
   * The element tree with the text removed, e.g. `ol[type=a](li(em),li)`.
   * Equal text with a different shape is a format change: a list going from
   * numbered to lettered, a paragraph losing its indent, em becoming strong.
   */
  shape: string;
  /**
   * `shape` without inline formatting (em, strong, a, sup, …): the block's own
   * tag and attributes and its list structure. When only the inline part
   * differs, the change can still be shown as a word-level diff.
   */
  blockShape: string;
  /**
   * The defined term of a definition paragraph — `<p><em>Seljandi:</em> …</p>`
   * gives "Seljandi". Two paragraphs defining different terms are never the
   * same paragraph rewritten, however they line up.
   */
  term?: string;
  /**
   * 1-based paragraph (málsgrein) number within its section. A list or table
   * belongs to the paragraph before it and shares its number.
   */
  mgr: number;
  /** For `item`s: the list item number (töluliður / stafliður), from the list's `start`. */
  item?: number;
  /** For `item`s: whether the list is lettered (`ol type="a"`, stafliðir). */
  lettered?: boolean;
};

export type Section = {
  /** Stable alignment key, e.g. `gr:7` or `sub:11.2`. `pre` before the first heading. */
  key: string;
  /** Label as amending text names it, e.g. "7. gr." or "11.2. gr." */
  label: string;
  /**
   * The heading without its number — "Opinber markaðsgæsla með rafföngum."
   * for "7.6 Opinber markaðsgæsla með rafföngum." Sections are matched on it,
   * so a renumbered article still pairs with itself. Empty for an untitled
   * heading ("1. gr.").
   */
  title: string;
  /**
   * The closing date line and signatories (`<p class="Dags">` onwards).
   * Consolidated versions leave it out, so the first amendment always shows
   * it deleted — true of the text, but not an amendment: it is rendered, but
   * left out of `describeChanges` and of move detection.
   */
  signature?: boolean;
  heading?: { html: string; text: string; shape: string };
  blocks: Array<Block>;
};

/**
 * `replace`: an unrelated rewrite in the same position (amending text's
 * "orðast svo"). `split` / `merge`: one block became several, or several
 * became one, with the text (nearly) unchanged. `move` / `moved`: a block
 * that left one place (`moved`, at the old position) and arrived at another
 * (`move`, at the new position) — possibly in another article.
 */
export type OpType =
  | 'equal'
  | 'insert'
  | 'delete'
  | 'modify'
  | 'replace'
  | 'split'
  | 'merge'
  | 'move'
  | 'moved';

/**
 * A changed sentence (málsliður) in a modified paragraph or item. Numbers
 * are 1-based; `old` for delete/modify/replace, `afterOld` for an insert
 * (0 = before the first).
 */
export type SentenceOp = {
  type: 'insert' | 'delete' | 'modify' | 'replace';
  old?: number;
  new?: number;
  afterOld?: number;
};

/**
 * One word-level change — "Í stað orðanna `old` kemur: `new`". `before` is
 * the word before it in the new text, for an insertion ("Á eftir orðinu …").
 */
export type WordEdit = {
  type: 'insert' | 'delete' | 'replace';
  old: string;
  new: string;
  before?: string;
};

/** The other end of a move: the section label and paragraph number there. */
export type MoveEnd = { label: string; mgr: number };

export type BlockOp = {
  type: OpType;
  /** For `split` / `merge`, the first block on that side. */
  old?: Block;
  /** For `split` / `merge`, the first block on that side. */
  new?: Block;
  /** For `merge`: every old block, in order. */
  oldBlocks?: Array<Block>;
  /** For `split`: every new block, in order. */
  newBlocks?: Array<Block>;
  /** For a modified list: what happened to each item. */
  items?: Array<BlockOp>;
  /** For a modified paragraph or item with more than one sentence: which changed. */
  sentences?: Array<SentenceOp>;
  /** For a modified paragraph or item: the word-level changes. */
  edits?: Array<WordEdit>;
  /** For `move`: where the block came from (old numbering). */
  movedFrom?: MoveEnd;
  /** For `moved`: where the block went (new numbering). */
  movedTo?: MoveEnd;
  /** For inserts: the `mgr` of the last old block before the insertion point (0 = at the top). */
  afterOldMgr?: number;
  /**
   * For `modify`: whether the wording changed, the formatting (`shape`)
   * changed, or both.
   */
  change?: 'text' | 'format' | 'both';
  /**
   * Diff HTML, for every type but `equal`, `insert` and `delete`. A `move` /
   * `moved` is marked `class="diffmove"` at both ends, or word-diffed at the
   * new position if it was also edited. A `replace` is
   * word-level only when old and new share enough words; otherwise the old
   * block deleted + the new inserted. For `modify`: word-level when only the text or the inline
   * formatting changed — htmldiff marks the latter `<ins class="mod">`. When
   * the block-level shape changed (`ol` → `ul`, a class, a list type), or
   * htmldiff's output would be mis-nested, the old block as deleted followed
   * by the new as inserted: htmldiff cannot express a changed block tag, and
   * on `ol` → `ul` emits `<ol><ul>…</ol></ul>`.
   */
  diff?: string;
};

export type SectionOp = {
  type: OpType;
  old?: Section;
  new?: Section;
  /** For inserted sections: the old section the new one follows. */
  afterOld?: Section;
  /** The heading's title or formatting changed — not just its number. */
  headingChanged?: boolean;
  /** Matched by title, but its number changed: "7.6. gr. verður 7.7. gr." */
  renumbered?: boolean;
  blocks: Array<BlockOp>;
};

export type StructuredDiff = {
  sections: Array<SectionOp>;
  /** Diff HTML in the same `<ins class="diffins">` markup `getDiff` emits. */
  diff: HTMLText;
};

export type StructuredDiffOptions = {
  /** Parses HTML into a container element. `asDiv` from serverDOM, or a browser equivalent. */
  asDiv: (html: string) => Element;
  /** Similarity (0–1) needed to call two blocks "the same block, changed". Default 0.5 */
  blockCutoff?: number;
  /** Similarity needed to pair two differently-numbered sections. Default 0.5 */
  sectionCutoff?: number;
  /**
   * Similarity a `replace` needs to be shown as a word diff instead of
   * whole-block delete + insert. Below it, a word diff is mostly noise — the
   * shared words are "skal", "og", "sem". Default 0.3
   */
  replaceWordDiffFloor?: number;
  /**
   * Similarity a block deleted in one place and inserted in another needs to
   * count as moved (and edited). Identical blocks always count. Default 0.9
   */
  moveCutoff?: number;
};

export type AsDiv = StructuredDiffOptions['asDiv'];
