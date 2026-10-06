/*
  Diffing a section's blocks: pairing them, and for each modified block its
  word diff, list items, changed sentences and word edits.
*/

import { splitSentences } from './sentences';
import { align } from './align';
import { canonOf, contentOf, normalize, shapeOf } from './parse';
import {
  annotate,
  opAttrs,
  renderOp,
  replaceDiff,
  safeHtmldiff,
} from './render';
import { EDIT_CONTAINMENT, containment, similarity } from './similarity';
import { AsDiv, Block, BlockOp, SentenceOp, WordEdit } from './types';

/** A list's items as blocks, or undefined if it holds anything but `<li>`s. */
export const itemsOf = (
  list: Block,
  asDiv: AsDiv,
): Array<Block> | undefined => {
  const el = asDiv(list.html).firstElementChild;
  if (!el || !/^(OL|UL)$/.test(el.tagName)) {
    return;
  }
  const children = Array.from(el.children);
  if (!children.length || children.some((c) => c.tagName !== 'LI')) {
    return;
  }
  const start = Number(el.getAttribute('start')) || 1;
  const lettered = /^a$/i.test(el.getAttribute('type') || '');
  return children.map((li, i) => ({
    kind: 'item',
    html: li.outerHTML,
    text: normalize(li.textContent || ''),
    content: contentOf(li),
    canon: canonOf(li),
    shape: shapeOf(li),
    blockShape: shapeOf(li, false),
    mgr: list.mgr,
    item: start + i,
    lettered,
  }));
};

/**
 * A modified block's diff. A list whose container is unchanged is diffed
 * item by item — one new töluliður is one inserted item, and a 690-item list
 * is word-diffed only where it changed.
 */
export const modifyResult = (
  o: Block,
  n: Block,
  asDiv: AsDiv,
): { diff: string; items?: Array<BlockOp> } => {
  if (o.blockShape !== n.blockShape) {
    return { diff: replaceDiff(o.html, n.html, asDiv) };
  }
  if (o.kind === 'list' && n.kind === 'list') {
    const oldItems = itemsOf(o, asDiv);
    const newItems = itemsOf(n, asDiv);
    if (oldItems && newItems) {
      const items = diffBlocks(oldItems, newItems, 0.5, 0.3, asDiv);
      const list = asDiv(n.html).firstElementChild!;
      let afterItem = 0;
      list.innerHTML = items
        .map((op) => {
          const html = renderOp(op, asDiv);
          const out =
            op.type === 'equal'
              ? html
              : annotate(html, opAttrs(op, afterItem), asDiv);
          afterItem = op.old?.item ?? afterItem;
          return out;
        })
        .join('');
      return { diff: list.outerHTML, items };
    }
  }
  const diff = safeHtmldiff(o.html, n.html, asDiv);
  // A change htmldiff cannot mark — an attribute (href, src), an image —
  // must still show: the old block deleted, the new inserted.
  return {
    diff: /<(ins|del)\b/.test(diff) ? diff : replaceDiff(o.html, n.html, asDiv),
  };
};

export const modifyDiff = (o: Block, n: Block, asDiv: AsDiv): string =>
  modifyResult(o, n, asDiv).diff;

/** Which sentences of a modified text changed, or undefined for a one-sentence text. */
export const diffSentences = (
  older: string,
  newer: string,
): Array<SentenceOp> | undefined => {
  const a = splitSentences(older);
  const b = splitSentences(newer);
  if (a.length < 2 && b.length < 2) {
    return;
  }
  const out: Array<SentenceOp> = [];
  let afterOld = 0;
  for (const p of align(
    a,
    b,
    (x, y) => x === y,
    (x, y) => similarity(x, y),
    0.5,
    { positionalPrefix: true },
  )) {
    if (p.a != null) {
      afterOld = p.a + 1;
    }
    if (p.type === 'insert') {
      out.push({ type: 'insert', new: p.b! + 1, afterOld });
    } else if (p.type !== 'equal') {
      out.push({
        type: p.type as SentenceOp['type'],
        old: p.a != null ? p.a + 1 : undefined,
        new: p.b != null ? p.b + 1 : undefined,
      });
    }
  }
  return out;
};

export const squashSpace = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * The word-level changes in a word diff, read from its own marks so they
 * always agree with what is shown. Formatting-only marks (`ins.mod`) are not
 * text changes and read as unchanged text.
 */
export const extractEdits = (
  diffHtml: string,
  asDiv: AsDiv,
): Array<WordEdit> => {
  type Piece = { kind: 'text' | 'ins' | 'del'; text: string };
  const pieces: Array<Piece> = [];
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        pieces.push({ kind: 'text', text: child.textContent || '' });
      } else if (child.nodeType === 1) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if ((tag === 'ins' || tag === 'del') && !el.classList.contains('mod')) {
          pieces.push({ kind: tag, text: el.textContent || '' });
        } else {
          walk(el);
        }
      }
    });
  };
  walk(asDiv(diffHtml));

  const edits: Array<WordEdit> = [];
  let before = '';
  let current: { old: string; new: string; before: string } | undefined;
  const flush = () => {
    if (current) {
      const old = squashSpace(current.old);
      const neu = squashSpace(current.new);
      if (old || neu) {
        edits.push({
          type: old && neu ? 'replace' : old ? 'delete' : 'insert',
          old,
          new: neu,
          before: current.before || undefined,
        });
      }
      current = undefined;
    }
  };
  for (const p of pieces) {
    const text = p.text.replace(/\u00a0/g, ' ');
    if (p.kind === 'text') {
      if (text.trim()) {
        flush();
        before = text.trim().split(' ').pop() || '';
      } else if (current) {
        // Whitespace between two marks belongs to both sides of the edit.
        current.old += text;
        current.new += text;
      }
      continue;
    }
    current ||= { old: '', new: '', before };
    if (p.kind === 'del') {
      current.old += text;
    } else {
      current.new += text;
      before = text.trim().split(' ').pop() || before;
    }
  }
  flush();
  return edits;
};

/** A `modify` op, with its item, sentence and word-level detail. */
/** Two blocks are the same block, unchanged. */
export const sameBlock = (x: Block, y: Block) =>
  x.content === y.content && x.canon === y.canon;

/**
 * What changed between two blocks: the text (`content`, boundaries
 * included), the formatting (`shape`, or where formatting and attributes
 * sit when the text did not change), or both. Undefined if nothing.
 */
export const changeOf = (o: Block, n: Block): BlockOp['change'] | undefined => {
  const textChanged = o.content !== n.content;
  const formatChanged =
    o.shape !== n.shape || (!textChanged && o.canon !== n.canon);
  return textChanged && formatChanged
    ? 'both'
    : textChanged
    ? 'text'
    : formatChanged
    ? 'format'
    : undefined;
};

export const modifyOp = (o: Block, n: Block, asDiv: AsDiv): BlockOp => {
  const change = changeOf(o, n);
  const textChanged = change === 'text' || change === 'both';
  const { diff, items } = modifyResult(o, n, asDiv);
  const prose = !items && textChanged && o.kind !== 'table';
  return {
    type: 'modify',
    old: o,
    new: n,
    change,
    diff,
    items,
    sentences: prose ? diffSentences(o.text, n.text) : undefined,
    edits: prose ? extractEdits(diff, asDiv) : undefined,
  };
};

/** Paragraphs and loose text are both prose, and may pair with each other. */
export const isProse = (b: Block) =>
  b.kind === 'paragraph' || b.kind === 'text';

export const blockSim = (x: Block, y: Block) =>
  x.kind === y.kind || (isProse(x) && isProse(y))
    ? similarity(x.text, y.text)
    : 0;

export const joinedSim = (one: Block, many: ReadonlyArray<Block>) =>
  isProse(one) && many.every(isProse)
    ? similarity(one.text, many.map((b) => b.text).join(' '))
    : 0;

export const joinHtml = (blocks: ReadonlyArray<Block>) =>
  blocks.map((b) => b.html).join('');

export const diffBlocks = (
  oldBlocks: Array<Block>,
  newBlocks: Array<Block>,
  cutoff: number,
  replaceFloor: number,
  asDiv: AsDiv,
): Array<BlockOp> => {
  const pairs = align(oldBlocks, newBlocks, sameBlock, blockSim, cutoff, {
    joinSim: joinedSim,
    positionalReplace: true,
    replaceable: (x, y) => !x.term || !y.term || x.term === y.term,
    pairFirst: (x, y) => !!x.term && x.term === y.term,
  });
  let afterOldMgr = 0;
  return pairs.map(({ type, a, b, aEnd, bEnd }): BlockOp => {
    const o = a != null ? oldBlocks[a] : undefined;
    const n = b != null ? newBlocks[b] : undefined;
    if (o) {
      afterOldMgr = o.mgr;
    }
    switch (type) {
      case 'insert':
        return { type, new: n, afterOldMgr };
      case 'modify':
        return modifyOp(o!, n!, asDiv);
      case 'replace': {
        // Most of the shorter paragraph surviving, in order, in the longer is
        // an edit — a phrase deleted or added — however much the length
        // changed: 0785/2014 cut 2. mgr. 9.4. gr. from 37 words to 15, and
        // 13 of the 15 are the old ones.
        if (
          o!.blockShape === n!.blockShape &&
          containment(o!.text, n!.text) >= EDIT_CONTAINMENT
        ) {
          return modifyOp(o!, n!, asDiv);
        }
        return {
          type,
          old: o,
          new: n,
          diff:
            o!.blockShape === n!.blockShape && blockSim(o!, n!) >= replaceFloor
              ? safeHtmldiff(o!.html, n!.html, asDiv)
              : replaceDiff(o!.html, n!.html, asDiv),
        };
      }
      case 'split': {
        const news = newBlocks.slice(b, bEnd);
        return {
          type,
          old: o,
          new: n,
          newBlocks: news,
          diff: safeHtmldiff(o!.html, joinHtml(news), asDiv),
        };
      }
      case 'merge': {
        const olds = oldBlocks.slice(a, aEnd);
        afterOldMgr = olds[olds.length - 1]!.mgr;
        return {
          type,
          old: o,
          new: n,
          oldBlocks: olds,
          diff: safeHtmldiff(joinHtml(olds), n!.html, asDiv),
        };
      }
      default:
        return { type, old: o, new: n };
    }
  });
};
