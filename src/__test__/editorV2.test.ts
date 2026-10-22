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
import { findUnsupportedElements, roundTrip } from '../_editorV2/fidelity';
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

describe('table markup', () => {
  // ojoi stores the editor's output as it is, so a table must come out
  // with the markup TinyMCE kept: it sets how the table prints.
  test('keeps attributes, colgroups, and head and foot rows', () => {
    expect(
      roundTrip(
        '<table style="width:100%;border-collapse:collapse" border="1">' +
          '<colgroup><col width="120"><col style="width:70%"></colgroup>' +
          '<thead><tr valign="top"><th width="50%" scope="col">H</th><th>I</th></tr></thead>' +
          '<tbody><tr><td style="width:30%;text-align:right" width="120" valign="top">a</td>' +
          '<td align="right" height="20">b</td></tr></tbody>' +
          '<tfoot><tr><td colspan="2">f</td></tr></tfoot></table>',
      ),
    ).toBe(
      '<table style="width: 100%; border-collapse: collapse;" border="1">' +
        '<colgroup><col width="120"><col style="width: 70%;"></colgroup>' +
        '<thead><tr valign="top"><th width="50%" scope="col">H</th><th>I</th></tr></thead>' +
        '<tbody><tr><td style="text-align: right; width: 30%;" width="120" valign="top">a</td>' +
        '<td style="text-align: right;" height="20">b</td></tr></tbody>' +
        '<tfoot><tr><td colspan="2">f</td></tr></tfoot></table>',
    );
  });

  test('keeps the classes of rows and cells', () => {
    // ojoi finds an advert's serial-number row by `advertSubSerial`, and
    // styles `advertText` and `advertType`.
    const html =
      '<table class="layout"><tbody><tr class="advertSubSerial"><td class="advertTD">1</td></tr>' +
      '<tr><th class="advertType">a</th><td class="advertText">b</td></tr></tbody></table>';
    expect(roundTrip(html)).toBe(html);
  });

  test('a table of head rows only; no event handlers', () => {
    expect(roundTrip('<table><thead><tr><th>H</th></tr></thead></table>')).toBe(
      '<table><thead><tr><th>H</th></tr></thead></table>',
    );
    expect(
      roundTrip(
        '<table><tbody><tr onclick="x()"><td onmouseover="y()" nowrap="">a</td></tr></tbody></table>',
      ),
    ).toBe('<table><tbody><tr><td nowrap="">a</td></tr></tbody></table>');
  });

  test('a row added in the head goes in the body, after the head', () => {
    const editor = makeEditor(
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table>',
    );
    cursorAt(editor, 'H');
    editor.commands.addRowAfter();
    const serialize = createRegulationSerializer(editor.schema);
    expect(serialize(editor.state.doc)).toBe(
      '<table><thead><tr><th>H</th></tr></thead>' +
        '<tbody><tr><td></td></tr><tr><td>a</td></tr></tbody></table>',
    );
    editor.destroy();
  });

  test('keeps left and justified alignment', () => {
    expect(
      roundTrip('<p align="justify">a</p><p style="text-align:left">b</p>'),
    ).toBe(
      '<p style="text-align: justify;">a</p><p style="text-align: left;">b</p>',
    );
  });
});

describe('the warning about what the editor drops', () => {
  // Each case: an attribute (`marker` is how it shows in the output) and
  // whether the schema drops it. The warning's list must agree with the
  // schema: it says lost exactly when the round trip loses it.
  const cases: Array<[html: string, marker: string, lost: boolean]> = [
    ['<p class="zz">a</p>', 'zz', false],
    ['<p style="margin-left: 9px">a</p>', 'margin-left', false],
    ['<p style="color: red">a</p>', 'color', true],
    ['<p lang="en">a</p>', 'lang', true],
    ['<p dir="rtl">a</p>', 'rtl', true],
    ['<p align="justify">a</p>', 'justify', false],
    ['<p align="middle">a</p>', 'middle', true],
    ['<h4 align="center">a</h4>', 'center', false],
    ['<h4 class="zz">a</h4>', 'zz', true],
    ['<h3 class="article__title" align="center">a</h3>', 'center', true],
    ['<h2 class="appendix__title" align="center">a</h2>', 'center', false],
    ['<ol start="3" type="a"><li value="7">a</li></ol>', 'value="7"', false],
    ['<ol style="list-style: square"><li>a</li></ol>', 'square', true],
    ['<li style="text-align: right">a</li>', 'right', true],
    ['<blockquote cite="zz">a</blockquote>', 'zz', true],
    ['<p><img src="a.png" alt="zz" width="9"></p>', 'zz', false],
    ['<p><img src="a.png" style="float: left"></p>', 'float', true],
    ['<p><a href="/a" title="zz">a</a></p>', 'zz', false],
    ['<p><a href="/a" style="color: red">a</a></p>', 'color', true],
    ['<p><a id="x" class="zz">a</a></p>', 'zz', true],
    ['<p><strong class="zz">a</strong></p>', 'zz', true],
    ['<p><sup class="zz">a</sup></p>', 'zz', false],
    ['<p><s id="zz">a</s></p>', 'zz', true],
    [
      '<table><tbody><tr><td bgcolor="zz">a</td></tr></tbody></table>',
      'zz',
      false,
    ],
    [
      '<table><tbody class="zz"><tr><td>a</td></tr></tbody></table>',
      'zz',
      true,
    ],
    [
      '<table class="zz"><tbody><tr class="zz1"><th class="zz2">a</th><td class="zz3">b</td></tr></tbody></table>',
      'zz3',
      false,
    ],
    [
      '<table><colgroup onclick="zz()"><col onmouseover="zz()"></colgroup><tbody><tr><td>a</td></tr></tbody></table>',
      'zz',
      true,
    ],
    [
      '<table><tbody><tr onclick="zz()"><td>a</td></tr></tbody></table>',
      'zz',
      true,
    ],
    [
      '<table><tbody><tr><td align="middle">a</td></tr></tbody></table>',
      'middle',
      true,
    ],
    [
      '<table><tbody><tr><td style="text-align: start">a</td></tr></tbody></table>',
      'start',
      true,
    ],
    [
      '<table><tbody><tr><td style="text-align: justify">a</td></tr></tbody></table>',
      'justify',
      false,
    ],
  ];
  test.each(cases)('%s', (html, marker, lost) => {
    expect(roundTrip(html).includes(marker)).toBe(!lost);
    expect(findUnsupportedElements(html).length > 0).toBe(lost);
  });

  test('one line per element and attribute, with a count', () => {
    expect(
      findUnsupportedElements(
        '<p lang="en">a</p><p lang="is">b</p><p style="color: red; margin-left: 2px">c</p>',
      ),
    ).toEqual(['<p lang="en"> (2×)', '<p style="color: red">']);
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

  test('Enter mid-text or at the start leaves one id, on the text', () => {
    let editor = makeEditor('<p id="ftn4">Neðanmáls grein.</p>');
    editor.commands.setTextSelection(10);
    editor.commands.splitBlock();
    expect(editor.getHTML()).toBe('<p id="ftn4">Neðanmáls</p><p> grein.</p>');
    editor.destroy();
    editor = makeEditor('<p id="ftn4">Neðanmáls grein.</p>');
    editor.commands.setTextSelection(1);
    editor.commands.splitBlock();
    expect(editor.getHTML()).toBe('<p></p><p id="ftn4">Neðanmáls grein.</p>');
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
