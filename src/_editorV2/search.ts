/*
  Search and replace for EditorV2 (TinyMCE's `searchreplace` plugin).
  Matches are decorations, so searching never changes the document; only
  the replace commands do, as ordinary undoable transactions.

  A match lies within one textblock: text is searched per paragraph,
  heading, list item or cell, across the formatting inside it.
*/

import { Extension } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import {
  EditorState,
  Plugin,
  PluginKey,
  TextSelection,
} from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type SearchState = {
  query: string;
  caseSensitive: boolean;
  matches: Array<{ from: number; to: number }>;
  /** Index into `matches`, or -1. */
  current: number;
};

export const searchKey = new PluginKey<SearchState>('regulationSearch');

const EMPTY: SearchState = {
  query: '',
  caseSensitive: false,
  matches: [],
  current: -1,
};

const findMatches = (doc: PMNode, query: string, caseSensitive: boolean) => {
  const matches: SearchState['matches'] = [];
  if (!query) {
    return matches;
  }
  const needle = caseSensitive ? query : query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true;
    }
    // The textblock's text, with each character's document position.
    let text = '';
    const positions: Array<number> = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        const start = pos + 1 + offset;
        for (let i = 0; i < child.text!.length; i++) {
          positions.push(start + i);
        }
        text += child.text!;
      } else {
        // A line break or image ends any match.
        positions.push(-1);
        text += '\u0000';
      }
    });
    const hay = caseSensitive ? text : text.toLowerCase();
    let i = hay.indexOf(needle);
    while (i >= 0) {
      const from = positions[i]!;
      const last = positions[i + needle.length - 1]!;
      if (from >= 0 && last >= 0) {
        matches.push({ from, to: last + 1 });
      }
      i = hay.indexOf(needle, i + needle.length);
    }
    return false;
  });
  return matches;
};

type Meta = Partial<Pick<SearchState, 'query' | 'caseSensitive' | 'current'>>;

const reduce = (state: SearchState, doc: PMNode, meta?: Meta) => {
  const query = meta?.query ?? state.query;
  const caseSensitive = meta?.caseSensitive ?? state.caseSensitive;
  const matches = findMatches(doc, query, caseSensitive);
  let current = meta?.current ?? state.current;
  if (current >= matches.length) {
    current = matches.length - 1;
  }
  if (current < 0 && matches.length) {
    current = 0;
  }
  return { query, caseSensitive, matches, current };
};

const selectMatch = (state: EditorState, index: number) => {
  const match = searchKey.getState(state)!.matches[index];
  return match
    ? state.tr
        .setMeta(searchKey, { current: index })
        .setSelection(TextSelection.create(state.doc, match.from, match.to))
        .scrollIntoView()
    : undefined;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    regulationSearch: {
      setSearch: (query: string, caseSensitive?: boolean) => ReturnType;
      clearSearch: () => ReturnType;
      findNext: () => ReturnType;
      findPrevious: () => ReturnType;
      replaceCurrent: (replacement: string) => ReturnType;
      replaceAll: (replacement: string) => ReturnType;
    };
  }
}

export const Search = Extension.create({
  name: 'regulationSearch',

  addCommands() {
    return {
      setSearch:
        (query, caseSensitive) =>
        ({ tr, dispatch }) => {
          dispatch?.(
            tr.setMeta(searchKey, { query, caseSensitive, current: 0 }),
          );
          return true;
        },
      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          dispatch?.(tr.setMeta(searchKey, { query: '', current: -1 }));
          return true;
        },
      findNext:
        () =>
        ({ state, dispatch }) => {
          const { matches, current } = searchKey.getState(state)!;
          if (!matches.length) {
            return false;
          }
          const tr = selectMatch(state, (current + 1) % matches.length);
          tr && dispatch?.(tr);
          return true;
        },
      findPrevious:
        () =>
        ({ state, dispatch }) => {
          const { matches, current } = searchKey.getState(state)!;
          if (!matches.length) {
            return false;
          }
          const tr = selectMatch(
            state,
            (current - 1 + matches.length) % matches.length,
          );
          tr && dispatch?.(tr);
          return true;
        },
      replaceCurrent:
        (replacement) =>
        ({ editor, state, tr, dispatch }) => {
          // Commands do not check this themselves; searching stays possible
          // in a read-only editor, replacing does not.
          if (!editor.isEditable) {
            return false;
          }
          const { matches, current } = searchKey.getState(state)!;
          const match = matches[current];
          if (!match) {
            return false;
          }
          // Keeps the formatting of the match's first character.
          tr.insertText(replacement, match.from, match.to);
          dispatch?.(tr);
          return true;
        },
      replaceAll:
        (replacement) =>
        ({ editor, state, tr, dispatch }) => {
          // Commands do not check this themselves; searching stays possible
          // in a read-only editor, replacing does not.
          if (!editor.isEditable) {
            return false;
          }
          const { matches } = searchKey.getState(state)!;
          if (!matches.length) {
            return false;
          }
          // Back to front, so earlier positions stay valid.
          [...matches].reverse().forEach(({ from, to }) => {
            tr.insertText(replacement, from, to);
          });
          dispatch?.(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => EMPTY,
          apply: (tr, value, _old, newState) => {
            const meta = tr.getMeta(searchKey) as Meta | undefined;
            if (!meta && !tr.docChanged) {
              return value;
            }
            if (!(meta?.query ?? value.query)) {
              return { ...EMPTY, caseSensitive: value.caseSensitive };
            }
            return reduce(value, newState.doc, meta);
          },
        },
        props: {
          decorations: (state) => {
            const { matches, current } = searchKey.getState(state)!;
            return matches.length
              ? DecorationSet.create(
                  state.doc,
                  matches.map(({ from, to }, i) =>
                    Decoration.inline(from, to, {
                      class:
                        i === current
                          ? 'regtools-search-match regtools-search-match--current'
                          : 'regtools-search-match',
                    }),
                  ),
                )
              : DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
