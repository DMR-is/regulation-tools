/*
  The diff HTML: `<ins>`/`<del>` marks in the same classes getDiff uses,
  always well-nested, and the operations as `data-diff-*` attributes for
  consumers that keep only the HTML (the amending-text generator reads a saved
  diff, never the two texts). See README "Reading the annotations".
*/

import { DIFF_CLASSES } from '../diffClasses';
import { execute } from '../htmldiff-js';
import { HTMLText } from '../types';
import { INLINE_TAGS, isInline } from './parse';
import { AsDiv, BlockOp, MoveEnd, SectionOp } from './types';

/** Block HTML is sliced from an `HTMLText`, so it is HTML too. */
export const htmldiff = (a: string, b: string) =>
  execute(a as HTMLText, b as HTMLText);

export const VOID_TAGS = new Set([
  'area',
  'br',
  'col',
  'hr',
  'img',
  'input',
  'wbr',
]);

/**
 * True when every tag in `html` is closed in the order it was opened.
 * htmldiff's formatting-change markup is usually fine but not always — on
 * em → strong it leaves `<ins class="mod">` unclosed.
 */
export const isWellNested = (html: string): boolean => {
  const stack: Array<string> = [];
  for (const [, closing, name, selfClosing] of html.matchAll(
    /<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g,
  )) {
    const tag = name!.toLowerCase();
    if (VOID_TAGS.has(tag) || selfClosing) {
      continue;
    }
    if (!closing) {
      stack.push(tag);
    } else if (stack.pop() !== tag) {
      return false;
    }
  }
  return stack.length === 0;
};

/**
 * Marks a whole block as inserted or deleted: every run of inline content is
 * wrapped in `<ins class="diffins">` / `<del class="diffdel">` inside its own
 * element (`<p><ins>…</ins></p>`, as getDiff places them, never
 * `<ins><p>`). Built through the DOM, so the result is always well-formed —
 * unlike `htmldiff('', html)`, which leaves `<ins class="mod">` unclosed
 * around inline formatting such as a heading's `<em class="article__name">`.
 */
export const markWhole = (
  html: string,
  tag: 'ins' | 'del',
  asDiv: AsDiv,
  className: string = tag === 'ins' ? DIFF_CLASSES.ins : DIFF_CLASSES.del,
) => {
  if (!html) {
    return '';
  }
  const root = asDiv(html);
  const doc = root.ownerDocument;
  const wrapRuns = (el: Element) => {
    let run: Array<ChildNode> = [];
    const flush = () => {
      // Visible content: text, or an image — which has no text of its own.
      const visible = (node: ChildNode) =>
        !!(node.textContent || '').trim() ||
        (node.nodeType === 1 &&
          ((node as Element).tagName === 'IMG' ||
            !!(node as Element).querySelector('img')));
      if (run.some(visible)) {
        const mark = doc.createElement(tag);
        mark.className = className;
        el.insertBefore(mark, run[0]!);
        run.forEach((node) => mark.appendChild(node));
      }
      run = [];
    };
    for (const child of Array.from(el.childNodes)) {
      if (isInline(child)) {
        run.push(child);
      } else {
        flush();
        if (child.nodeType === 1) {
          wrapRuns(child as Element);
        }
      }
    }
    flush();
  };
  wrapRuns(root);
  return root.innerHTML;
};

export const replaceDiff = (older: string, newer: string, asDiv: AsDiv) =>
  markWhole(older, 'del', asDiv) + markWhole(newer, 'ins', asDiv);

/** htmldiff, unless its output would be mis-nested — then delete + insert. */
export const safeHtmldiff = (older: string, newer: string, asDiv: AsDiv) => {
  const wordLevel = htmldiff(older, newer);
  return isWellNested(wordLevel) ? wordLevel : replaceDiff(older, newer, asDiv);
};

export type Attrs = Record<string, string | number | undefined>;

/** Whether the element's text is all inside `tag` marks. */
export const allInside = (el: Element, tag: 'ins' | 'del') => {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll(tag).forEach((m) => m.remove());
  return !(clone.textContent || '').trim() && !!(el.textContent || '').trim();
};

/** Sets `attrs` on every top-level element of `html`, plus `data-diff-side`. */
export const annotate = (html: string, attrs: Attrs, asDiv: AsDiv) => {
  const root = asDiv(html);
  for (const el of Array.from(root.children)) {
    // Loose text has no element of its own; never annotate its inline marks.
    const tag = el.tagName.toLowerCase();
    if (INLINE_TAGS.has(tag) || tag === 'ins' || tag === 'del') {
      continue;
    }
    Object.entries(attrs).forEach(
      ([k, v]) => v != null && v !== '' && el.setAttribute(k, String(v)),
    );
    if (attrs['data-diff'] && attrs['data-diff'] !== 'equal') {
      // All text inside <ins>: shows only the new version; inside <del>: only the old.
      const side = allInside(el, 'ins')
        ? 'new'
        : allInside(el, 'del')
        ? 'old'
        : undefined;
      side && el.setAttribute('data-diff-side', side);
    }
  }
  return root.innerHTML;
};

export const moveEnd = (end?: MoveEnd) =>
  end && `${end.label ? end.label + ', ' : ''}${end.mgr}. mgr.`;

/** The data attributes for one block op. `afterItem`: the old item a new item follows. */
export const opAttrs = (op: BlockOp, afterItem?: number): Attrs => {
  const isItem = (op.old || op.new)!.kind === 'item';
  return {
    'data-diff': op.type,
    'data-diff-change': op.change,
    'data-diff-mgr': isItem
      ? undefined
      : op.oldBlocks
      ? op.oldBlocks.map((b) => b.mgr).join(',')
      : op.old?.mgr,
    'data-diff-item': isItem ? op.old?.item : undefined,
    'data-diff-after-mgr':
      !isItem && op.type === 'insert' ? op.afterOldMgr : undefined,
    'data-diff-after-item':
      isItem && op.type === 'insert' ? afterItem ?? 0 : undefined,
    'data-diff-from': moveEnd(op.movedFrom),
    'data-diff-to': moveEnd(op.movedTo),
    'data-diff-sentences': op.sentences
      ?.map((x) => `${x.type}:${x.type === 'insert' ? x.afterOld : x.old}`)
      .join(' '),
  };
};

/** One block op as diff HTML. */
export const renderOp = (op: BlockOp, asDiv: AsDiv): string =>
  op.type === 'equal'
    ? op.new!.html
    : op.diff != null
    ? op.diff
    : op.type === 'insert'
    ? markWhole(op.new!.html, 'ins', asDiv)
    : markWhole(op.old!.html, 'del', asDiv);

export const renderDiff = (
  sections: Array<SectionOp>,
  asDiv: AsDiv,
): HTMLText => {
  const out: Array<string> = [];
  for (const s of sections) {
    const sec = (s.new || s.old)!;
    const signature = sec.signature ? 'true' : undefined;
    const oh = s.old?.heading?.html || '';
    const nh = s.new?.heading?.html || '';
    // The part before the first heading has no heading to render.
    if (oh || nh) {
      const html =
        oh === nh
          ? nh
          : !oh
          ? markWhole(nh, 'ins', asDiv)
          : !nh
          ? markWhole(oh, 'del', asDiv)
          : safeHtmldiff(oh, nh, asDiv);
      out.push(
        annotate(
          html,
          {
            'data-diff-section': sec.label,
            'data-diff':
              s.type === 'insert' || s.type === 'delete'
                ? s.type
                : s.headingChanged
                ? 'modify'
                : undefined,
            'data-diff-renumbered-from': s.renumbered
              ? s.old!.label
              : undefined,
          },
          asDiv,
        ),
      );
    }
    for (const b of s.blocks) {
      const html = renderOp(b, asDiv);
      out.push(
        b.type === 'equal' && !signature
          ? html
          : annotate(
              html,
              {
                ...(b.type === 'equal' ? {} : opAttrs(b)),
                'data-diff-signature': signature,
              },
              asDiv,
            ),
      );
    }
  }
  return out.join('\n') as HTMLText;
};
