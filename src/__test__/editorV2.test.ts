import './editorV2-dom';

import { Editor } from '@tiptap/core';

// A headless editor view needs more of the browser than parsing does.
const win = globalThis.window as unknown as Record<string, unknown>;
[
  'innerHeight',
  'innerWidth',
  'navigator',
  'getComputedStyle',
  'getSelection',
  'Node',
  'HTMLElement',
  'Element',
  'MutationObserver',
].forEach((key) => {
  (globalThis as Record<string, unknown>)[key] ??= win[key];
});
(globalThis as Record<string, unknown>).requestAnimationFrame ??= (
  fn: () => void,
) => setTimeout(fn, 0);

import {
  editorExtensions,
  setBlockFormat,
  currentBlockFormat,
} from '../_editorV2/extensions';
import { searchKey } from '../_editorV2/search';
import {
  createRegulationSerializer,
  toRegulationHTML,
} from '../_editorV2/serialize';
import { parseToolbar } from '../_editorV2/toolbarItems';

const makeEditor = (content: string) =>
  new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content,
    enableInputRules: false,
    enablePasteRules: false,
  });

/** Puts the cursor right before the first occurrence of `text`. */
const cursorAt = (editor: Editor, text: string) => {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text!.includes(text)) {
      at = pos + node.text!.indexOf(text);
    }
  });
  editor.commands.setTextSelection(at);
};

// ---------------------------------------------------------------------------

describe('toolbar', () => {
  test('takes the toolbar strings consumers pass to Editor today', () => {
    expect(
      parseToolbar(
        'bold italic underline | align numlist bullist table | link | customInsertButton',
      ),
    ).toEqual([
      'bold',
      'italic',
      'underline',
      '|',
      'align',
      'numlist',
      'bullist',
      'table',
      '|',
      'link',
      '|',
      'customInsertButton',
    ]);
  });

  test('false is no toolbar; unknown names are left out', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseToolbar(false)).toEqual([]);
    expect(parseToolbar('bold fontsize')).toEqual(['bold']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"fontsize"'));
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------

describe('cached serializer', () => {
  const html =
    '<h3 class="article__title">1. gr. <em>Gildissvið.</em></h3>' +
    '<p>Fyrsta málsgrein.</p>' +
    '<ol type="a"><li>a-liður</li><li><p>b-liður</p><ol><li>i</li></ol></li></ol>' +
    '<table class="layout"><tbody><tr><td>a</td><td><p>b</p><p>c</p></td></tr></tbody></table>' +
    '<p align="center">Miðja</p>';

  test('writes what toRegulationHTML writes', () => {
    const editor = makeEditor(html);
    const serialize = createRegulationSerializer(editor.schema);
    expect(serialize(editor.state.doc)).toBe(
      toRegulationHTML(editor.state.doc.content, editor.schema),
    );
    editor.destroy();
  });

  test('stays right after edits, reusing untouched nodes', () => {
    const editor = makeEditor(html);
    const serialize = createRegulationSerializer(editor.schema);
    serialize(editor.state.doc);
    const before = editor.state.doc;
    cursorAt(editor, 'málsgrein');
    editor.commands.insertContent('Breytt ');
    const after = editor.state.doc;
    // Untouched top-level nodes are the same objects.
    expect(after.child(0)).toBe(before.child(0));
    expect(after.child(2)).toBe(before.child(2));
    expect(serialize(after)).toBe(
      toRegulationHTML(after.content, editor.schema),
    );
    expect(serialize(after)).toContain('<p>Fyrsta Breytt málsgrein.</p>');
    editor.destroy();
  });
});

// ---------------------------------------------------------------------------

describe('block formats', () => {
  test('Grein, Kafli, Bráðabirgðaákvæði at the top level', () => {
    const editor = makeEditor('<p>1. gr.</p><p>II. KAFLI</p><p>Ákvæði</p>');
    cursorAt(editor, '1. gr.');
    expect(setBlockFormat(editor, 'articleTitle')).toBe(true);
    cursorAt(editor, 'II. KAFLI');
    setBlockFormat(editor, 'chapterTitle');
    cursorAt(editor, 'Ákvæði');
    setBlockFormat(editor, 'provisional');
    expect(currentBlockFormat(editor)).toBe('provisional');
    expect(editor.getHTML()).toBe(
      '<h3 class="article__title">1. gr.</h3>' +
        '<h2 class="chapter__title">II. KAFLI</h2>' +
        '<h3 class="article__title article__title--provisional">Ákvæði</h3>',
    );
    editor.destroy();
  });

  test('structure is not created inside a list', () => {
    const editor = makeEditor('<ol><li>liður</li></ol>');
    cursorAt(editor, 'liður');
    expect(setBlockFormat(editor, 'articleTitle')).toBe(false);
    expect(editor.getHTML()).not.toContain('article__title');
    editor.destroy();
  });

  test('"m. heiti" fills an empty line with the template', () => {
    const editor = makeEditor('<p>Fyrir</p><p></p>');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    setBlockFormat(editor, 'articleTitleWithName');
    expect(editor.getHTML()).toContain(
      '<h3 class="article__title">gr. <em>Titill</em></h3>',
    );
    editor.destroy();
  });

  test('"m. heiti" keeps a line\'s text and adds a name', () => {
    const editor = makeEditor('<p>3. gr.</p>');
    cursorAt(editor, '3. gr.');
    setBlockFormat(editor, 'articleTitleWithName');
    expect(editor.getHTML()).toBe(
      '<h3 class="article__title">3. gr. <em>Titill</em></h3>',
    );
    editor.destroy();
  });

  test('paragraph variants are classes', () => {
    const editor = makeEditor('<p>Reykjavík, 1. janúar 2026.</p>');
    cursorAt(editor, 'Reykjavík');
    setBlockFormat(editor, 'Dags');
    expect(editor.getHTML()).toBe(
      '<p class="Dags">Reykjavík, 1. janúar 2026.</p>',
    );
    setBlockFormat(editor, 'paragraph');
    expect(editor.getHTML()).toBe('<p>Reykjavík, 1. janúar 2026.</p>');
    editor.destroy();
  });
});

// ---------------------------------------------------------------------------

describe('search and replace', () => {
  const matches = (editor: Editor) =>
    searchKey.getState(editor.state)!.matches.length;

  test('finds across formatting, case-insensitive by default', () => {
    const editor = makeEditor(
      '<p>Ráðherra <strong>setur</strong> reglugerð.</p><p>ráðherra skal</p>',
    );
    editor.commands.setSearch('ráðherra');
    expect(matches(editor)).toBe(2);
    editor.commands.setSearch('ráðherra', true);
    expect(matches(editor)).toBe(1);
    editor.commands.setSearch('herra setur');
    expect(matches(editor)).toBe(1);
    editor.destroy();
  });

  test('replace all is one undoable step', () => {
    const editor = makeEditor('<p>a-lið og a-lið</p><p>a-lið</p>');
    editor.commands.setSearch('a-lið');
    editor.commands.replaceAll('b-lið');
    expect(editor.getHTML()).toBe('<p>b-lið og b-lið</p><p>b-lið</p>');
    expect(matches(editor)).toBe(0);
    editor.commands.undo();
    expect(editor.getHTML()).toBe('<p>a-lið og a-lið</p><p>a-lið</p>');
    editor.destroy();
  });

  test('a line break ends a match', () => {
    const editor = makeEditor('<p>ab<br>cd</p>');
    editor.commands.setSearch('bc');
    expect(matches(editor)).toBe(0);
    editor.destroy();
  });
});

describe('splitting and structure', () => {
  test('Enter does not copy a list number or an id into the new block', () => {
    const editor = makeEditor(
      '<ol><li value="5">fimm</li></ol><p id="a1">Akkeri</p>',
    );
    cursorAt(editor, 'fimm');
    editor.commands.setTextSelection(editor.state.selection.from + 4);
    editor.commands.splitListItem('listItem');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.splitBlock();
    const html = editor.getHTML();
    expect(html.match(/value="5"/g)).toHaveLength(1);
    expect(html.match(/id="a1"/g)).toHaveLength(1);
    editor.destroy();
  });

  test('"Grein" is refused for a selection running into a list', () => {
    const editor = makeEditor('<p>Fyrst</p><ol><li>liður</li></ol>');
    editor.commands.setTextSelection({
      from: 2,
      to: editor.state.doc.content.size - 3,
    });
    expect(setBlockFormat(editor, 'articleTitle')).toBe(false);
    expect(editor.getHTML()).not.toContain('article__title');
    editor.destroy();
  });

  test('search: the first "next" selects the first match', () => {
    const editor = makeEditor('<p>a x b x</p>');
    editor.commands.setSearch('x');
    editor.commands.findNext();
    expect(searchKey.getState(editor.state)!.current).toBe(0);
    expect(
      editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
      ),
    ).toBe('x');
    editor.commands.findNext();
    expect(searchKey.getState(editor.state)!.current).toBe(1);
    editor.destroy();
  });
});
