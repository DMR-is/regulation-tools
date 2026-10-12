/*
  Writes the editor's document out as HTML: what `EditorV2` hands its
  consumers, and what the fidelity check compares.
*/

import { getHTMLFromFragment } from '@tiptap/core';
import {
  DOMSerializer,
  Fragment,
  Node as PMNode,
  Schema,
} from '@tiptap/pm/model';

import { HTMLText } from '../types';

/**
 * A lone paragraph without attributes inside a list item or table cell is
 * written without its `<p>`, as TinyMCE wrote it and as the stored texts
 * have it. The schema needs the paragraph; the stored format does not have
 * it, and cleanup treats the two differently: it splits a `<p>` at a double
 * `<br>`, but not loose text in an `<li>`.
 */
const unwrapLoneParagraphs = (root: Element) => {
  root.querySelectorAll('li > p, td > p, th > p').forEach((p) => {
    const parent = p.parentElement!;
    if (parent.childNodes.length === 1 && p.attributes.length === 0) {
      p.replaceWith(...Array.from(p.childNodes));
    }
  });
};

export const toRegulationHTML = (
  fragment: Fragment,
  schema: Schema,
): HTMLText => {
  const container = document.createElement('div');
  container.innerHTML = getHTMLFromFragment(fragment, schema);
  unwrapLoneParagraphs(container);
  return container.innerHTML as HTMLText;
};

/**
 * The same output as `toRegulationHTML`, written one top-level node at a
 * time and remembered per node. ProseMirror documents are immutable: a
 * top-level node a change did not touch is the same object afterwards, so
 * after a keystroke only the edited article's paragraph is written again.
 */
export const createRegulationSerializer = (schema: Schema) => {
  const serializer = DOMSerializer.fromSchema(schema);
  const cache = new WeakMap<PMNode, string>();
  const nodeHTML = (node: PMNode) => {
    let html = cache.get(node);
    if (html == null) {
      const container = document.createElement('div');
      container.appendChild(serializer.serializeNode(node));
      unwrapLoneParagraphs(container);
      html = container.innerHTML;
      cache.set(node, html);
    }
    return html;
  };
  return (doc: PMNode): HTMLText => {
    let html = '';
    doc.forEach((node) => {
      html += nodeHTML(node);
    });
    return html as HTMLText;
  };
};

/**
 * A text as the editor should read it. Stored texts are prettified, with a
 * newline between most words; in HTML those are just spaces. Tiptap drops
 * text nodes that look like formatting whitespace (`/^(\n\s\s|\n)$/`)
 * before parsing, and `\s` matches a non-breaking space, so `\n&nbsp;\n`
 * (a legacy indent, an "empty" cell) would vanish. Newlines in text, outside
 * `<pre>`, become spaces first.
 */
export const editorInput = (html: string): string => {
  if (!html.includes('\n')) {
    return html;
  }
  const container = document.createElement('div');
  container.innerHTML = html;
  const walker = document.createTreeWalker(container, 4 /* SHOW_TEXT */);
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (text.data.includes('\n') && !text.parentElement!.closest('pre')) {
      text.data = text.data.replace(/\r?\n/g, ' ');
    }
  }
  return container.innerHTML;
};
