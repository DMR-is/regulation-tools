/*
  EditorV2's comparison pane: the diff, one part per section
  (`createStructuredDiffer`'s `parts`). After an edit only the parts whose
  HTML changed are replaced in the page; the other articles' DOM is left
  alone, so the browser does not lay out the whole regulation again. The
  pane holds exactly what joining the parts gives, the same HTML
  `getStructuredDiff` returns.
*/

import React, { useLayoutEffect, useRef } from 'react';

import type { DiffPart } from '../structuredDiff';

type Rendered = { key: string; html: string; nodes: Array<ChildNode> };

/** The separator `diff` puts between parts. */
const SEPARATOR = '\n';

/**
 * A part's nodes, with the separator before it (all parts but the first).
 * So every part but the first has a node even when its HTML is empty, and
 * keeps its place in the pane.
 */
const nodesOf = (html: string, index: number) => {
  const template = document.createElement('template');
  template.innerHTML = html;
  const nodes: Array<ChildNode> = Array.from(template.content.childNodes);
  index > 0 && nodes.unshift(document.createTextNode(SEPARATOR));
  return nodes;
};

/**
 * Puts `next` in the place of `prev` in the page, keeping the nodes the two
 * share at the start and at the end. A section can be a whole appendix of
 * tables; an edit to one paragraph then replaces that paragraph, not the
 * appendix. Returns the part's nodes as they now are in the page.
 */
const patch = (prev: Array<ChildNode>, next: Array<ChildNode>) => {
  let head = 0;
  while (
    head < prev.length &&
    head < next.length &&
    prev[head]!.isEqualNode(next[head]!)
  ) {
    head++;
  }
  let tail = 0;
  while (
    tail < prev.length - head &&
    tail < next.length - head &&
    prev[prev.length - 1 - tail]!.isEqualNode(next[next.length - 1 - tail]!)
  ) {
    tail++;
  }
  const removed = prev.slice(head, prev.length - tail);
  const added = next.slice(head, next.length - tail);
  if (removed.length) {
    removed[0]!.before(...added);
  } else if (head > 0) {
    prev[head - 1]!.after(...added);
  } else {
    prev[0]!.before(...added);
  }
  removed.forEach((n) => n.remove());
  return [...prev.slice(0, head), ...added, ...prev.slice(prev.length - tail)];
};

export const DiffPane = (props: { parts: Array<DiffPart> }) => {
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useRef<Array<Rendered>>([]);

  useLayoutEffect(() => {
    const container = ref.current!;
    const old = rendered.current;
    const { parts } = props;
    const sameKeys =
      old.length === parts.length &&
      old.every((r, i) => r.key === parts[i]!.key);

    if (!sameKeys) {
      // Sections were added, removed or re-paired. Keep the parts that are
      // unchanged at the start and the end where they are, and rebuild the
      // middle: adding an article then lays out that article, not the
      // whole regulation again.
      const same = (r: Rendered | undefined, p: DiffPart | undefined) =>
        !!r && !!p && r.key === p.key && r.html === p.html;
      let head = 0;
      while (same(old[head], parts[head])) {
        head++;
      }
      let tail = 0;
      while (
        tail < old.length - head &&
        tail < parts.length - head &&
        same(old[old.length - 1 - tail], parts[parts.length - 1 - tail])
      ) {
        tail++;
      }
      const removed = old.slice(head, old.length - tail);
      const added = parts.slice(head, parts.length - tail).map((p, j) => ({
        key: p.key,
        html: p.html,
        nodes: nodesOf(p.html, head + j),
      }));
      const before = old[head - 1]?.nodes.at(-1);
      const after =
        removed.flatMap((r) => r.nodes)[0] ?? old[old.length - tail]?.nodes[0];
      const newNodes = added.flatMap((r) => r.nodes);
      if (after) {
        after.before(...newNodes);
      } else if (before) {
        before.after(...newNodes);
      } else {
        container.append(...newNodes);
      }
      removed.forEach((r) => r.nodes.forEach((n) => n.remove()));
      const next = [
        ...old.slice(0, head),
        ...added,
        ...old.slice(old.length - tail),
      ];
      // Each part but the first starts with the separator; a part kept from
      // the end may have become the first, or the first may have moved on.
      next.forEach((r, i) => {
        const first = r.nodes[0];
        const hasSeparator =
          !!first && first.nodeType === 3 && first.textContent === SEPARATOR;
        if (i === 0 && hasSeparator) {
          first.remove();
          r.nodes = r.nodes.slice(1);
        } else if (i > 0 && !hasSeparator) {
          const separator = document.createTextNode(SEPARATOR);
          first
            ? first.before(separator)
            : next[i - 1]!.nodes.at(-1)!.after(separator);
          r.nodes = [separator, ...r.nodes];
        }
      });
      rendered.current = next;
      return;
    }
    rendered.current = parts.map((p, i) => {
      const r = old[i]!;
      if (r.html === p.html) {
        return r;
      }
      const nodes = nodesOf(p.html, i);
      if (!r.nodes.length) {
        // Only the first part can have no nodes: it starts the pane.
        container.prepend(...nodes);
        return { key: p.key, html: p.html, nodes };
      }
      return { key: p.key, html: p.html, nodes: patch(r.nodes, nodes) };
    });
  }, [props.parts]);

  return <div ref={ref} />;
};
