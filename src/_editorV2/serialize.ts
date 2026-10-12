/*
  Writes the editor's document out as HTML: what `EditorV2` hands its
  consumers, and what the fidelity check compares.
*/

import { getHTMLFromFragment } from '@tiptap/core';
import { Fragment, Schema } from '@tiptap/pm/model';

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
