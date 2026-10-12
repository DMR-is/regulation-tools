/*
  The fidelity check of editor v2 (docs/plan-tiptap-editor.md, "Fidelity
  guard"): does loading a text into the editor and saving it, untouched, give
  back the same text?

  The text goes through the same steps it does in use: parsed into the
  schema the way the editor parses it (Tiptap's `createDocument`), written
  back out (`getHTMLFromFragment`), then cleaned as every save is
  (`cleanup`, normally `cleanupSingleEditorOutput`). The result must equal the
  text cleaned without the editor, byte for byte; anything else would show
  up as a change in `regulationchange.changeset` on a save with no edits.

  Needs a DOM: the browser's, or in Node a jsdom installed as `window` and
  `document` (see src/__test__/editorV2-dom.ts).
*/

import { createDocument, elementFromString, getSchema } from '@tiptap/core';
import { DOMParser, Schema } from '@tiptap/pm/model';

import { HTMLText } from '../types';

import { regulationSchemaExtensions } from './schema';
import { toRegulationHTML } from './serialize';

const schema = getSchema(regulationSchemaExtensions);

/** Loads `html` into the editor's schema and writes it back out. */
export const roundTrip = (html: string): HTMLText =>
  toRegulationHTML(createDocument(html, schema).content, schema);

export type FidelityResult = {
  ok: boolean;
  /** The text as cleanup alone leaves it. */
  expected: string;
  /** The text after the editor and cleanup. */
  actual: string;
  /**
   * Saving the result again through the editor gives what cleanup alone
   * gives on a second save. (Not "changes nothing": cleanup itself is not
   * stable around legacy indenters, where its second pass adds a space on
   * each side once.)
   */
  idempotent: boolean;
  /** Where `expected` and `actual` first differ, with some context. */
  difference?: { at: number; expected: string; actual: string };
};

const CONTEXT = 80;

const firstDifference = (a: string, b: string) => {
  let at = 0;
  while (at < a.length && a[at] === b[at]) {
    at++;
  }
  const from = Math.max(0, at - CONTEXT);
  return {
    at,
    expected: a.slice(from, at + CONTEXT),
    actual: b.slice(from, at + CONTEXT),
  };
};

export const checkFidelity = (
  html: string,
  cleanup: (html: HTMLText) => HTMLText,
): FidelityResult => {
  const expected = cleanup(html as HTMLText);
  const once = cleanup(roundTrip(html));
  const ok = once === expected;
  return {
    ok,
    expected,
    actual: once,
    idempotent: cleanup(roundTrip(once)) === cleanup(once as HTMLText),
    difference: ok ? undefined : firstDifference(expected, once),
  };
};

// ---------------------------------------------------------------------------

/**
 * Elements ProseMirror passes over without loss: wrappers whose content it
 * reads (`tbody`), and the allowed changes in docs/plan-tiptap-editor.md
 * ("Schema"): empty `colgroup`/`col`, and `font`, whose text is kept.
 */
const PASSED_OVER = new Set([
  'TBODY',
  'THEAD',
  'TFOOT',
  'COLGROUP',
  'COL',
  'FONT',
]);

/**
 * The schema plus a catch-all node that records every element no rule of
 * the schema takes, as Tiptap's own content check does.
 */
let unsupported: Array<string> = [];
const checkSchema = new Schema({
  topNode: schema.spec.topNode,
  marks: schema.spec.marks,
  nodes: schema.spec.nodes.append({
    __unsupported: {
      content: 'inline*',
      group: 'block',
      parseDOM: [
        {
          tag: '*',
          priority: 0,
          getAttrs: (elm) => {
            if (!PASSED_OVER.has(elm.tagName)) {
              unsupported.push(elm.outerHTML.slice(0, 200));
            }
            return false; // never actually matches
          },
        },
      ],
    },
  }),
});

/**
 * Elements in `html` the editor would drop on load, as short HTML snippets;
 * empty when the text loads whole. For the warning in the browser, where
 * the full check (which needs cleanup, and so jsdom) cannot run.
 */
export const findUnsupportedElements = (html: string): Array<string> => {
  unsupported = [];
  DOMParser.fromSchema(checkSchema).parse(elementFromString(html));
  return unsupported;
};
