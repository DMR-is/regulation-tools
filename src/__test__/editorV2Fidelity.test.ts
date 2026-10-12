import './editorV2-dom';

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { checkFidelity, roundTrip } from '../_editorV2/fidelity';
import { cleanupSingleEditorOutput } from '../cleanupEditorOutput';

/*
  The editor v2 schema, one construct at a time: loading a text into the
  editor and saving it untouched must give back what cleanup alone gives.
  The corpus run (scripts/editorFidelity.ts) checks the same over real
  regulations; these pin each construct, including some the corpus sample
  does not contain but the stored format allows.
*/

const lossless: Record<string, string> = {
  // Structure
  'article title with name':
    '<h3 class="article__title">1. gr. <em class="article__name">Gildissvið.</em></h3><p>Texti.</p>',
  'provisional article':
    '<h3 class="article__title article__title--provisional">Ákvæði til bráðabirgða.</h3><p>Texti.</p>',
  'chapter title with name':
    '<h2 class="chapter__title">I. KAFLI <em class="chapter__name">Almenn ákvæði.</em></h2>',
  'subchapter, section and appendix titles':
    '<h2 class="subchapter__title">A. <em class="subchapter__name">Undirkafli.</em></h2>' +
    '<h2 class="section__title">1. <em class="section__name">Hluti.</em></h2>' +
    '<h2 class="appendix__title">Viðauki</h2>',
  'plain headings': '<h2 align="center">Fyrirsögn</h2><h4>Minni</h4>',
  'a heading class cleanup does not keep makes a plain heading':
    '<h2 class="chapter__title chapter__title--appendix">VIÐAUKI <em>Skilgreining.</em></h2>',
  'an "empty" cell and a legacy indent holding only a nbsp, prettified':
    '<table><tbody><tr><td>\n&nbsp;\n</td></tr></tbody></table>' +
    '<p>\n<span data-legacy-indenter="">\n&nbsp;\n</span>\nAuðkenni\nefnis.\n</p>',

  // Paragraphs
  'paragraph classes':
    '<p class="indented">Inndregin.</p><p class="Dags" align="center">Dagsetning.</p>' +
    '<p class="FHUndirskr" align="right">F.h.r.</p><p class="Undirritun">Nafn</p>',
  'alignment on paragraphs and cells':
    '<p align="center">Miðja</p><p align="right">Hægri</p>' +
    '<table><tbody><tr><td align="center">a</td><td align="right">b</td></tr></tbody></table>',
  'legacy indents as margin styles':
    '<p style="margin-left: 2em; text-indent: -2em">Hangandi inndráttur.</p>',
  'ids, for links to point at': '<p id="ftn4">Neðanmálsgrein.</p>',
  'ids on links (footnote back-references)':
    '<p>CAS<sup class="footnote-reference"><a id="_ftnref1" href="#_ftn1">1</a>)</sup></p>',
  'horizontal rule': '<p>Fyrir.</p><hr><p>Eftir.</p>',
  blockquote: '<blockquote><p>Tilvitnun.</p></blockquote>',

  // Lists
  'lettered list with start and value':
    '<ol type="a" start="3"><li>c-liður</li><li value="7">g-liður</li></ol>',
  'start="1" is kept as written': '<ol start="1"><li>Fyrsti</li></ol>',
  'roman and upper-case lists':
    '<ol type="i"><li>i</li></ol><ol type="I"><li>I</li></ol><ol type="A"><li>A</li></ol>',
  'square bullet list': '<ul type="square"><li>Punktur</li></ul>',
  'list item holding only a nested list':
    '<ol><li>Almenn réttindi:</li><li><ol type="a"><li>Allt að 150.000 kr.</li></ol></li></ol>',
  'list item with paragraphs and a nested list':
    '<ol><li><p>Að því er varðar gas:</p><ol type="a"><li>að bjóða fram</li></ol></li></ol>',
  'double line break in a list item':
    '<ol><li>Lambakjöt.<br> <br> Skrokkar af gimbrarlömbum.</li></ol>',
  'table inside a list item':
    '<ol><li><p>Taflan:</p><table><tbody><tr><td>a</td></tr></tbody></table></li></ol>',

  // Tables
  'layout tables':
    '<table class="layout"><tbody><tr><td>a</td></tr></tbody></table>' +
    '<table class="layout layout--list"><tbody><tr><td>1.</td><td>b</td></tr></tbody></table>',
  'merged cells':
    '<table><tbody><tr><td colspan="2">a</td></tr><tr><td rowspan="2">b</td><td>c</td></tr><tr><td>d</td></tr></tbody></table>',
  'paragraphs and images in cells':
    '<table><tbody><tr><td><p>Fyrri.</p><p>Seinni.</p></td><td><img src="https://files.reglugerd.is/x.png" alt="x"></td></tr></tbody></table>',

  // Inline
  'bold, italic, underline, strike, sub and sup':
    '<p><strong>feitt</strong> <em>skáletrað</em> <u>undirstrikað</u> <s>yfirstrikað</s> H<sub>2</sub>O m<sup>2</sup></p>',
  'bold outside italic, as most texts have it':
    '<p><strong><em>Vigtun á grásleppu.</em></strong></p>',
  'links, inside sup as footnote links are':
    '<p>Sjá <a href="https://www.reglugerd.is">vefinn</a>.<sup><a href="#ftn1">[1]</a></sup></p>',
  'footnote marker around footnote reference':
    '<p id="ftn4"><sup class="footnote__marker"><sup class="footnote-reference">[4]</sup></sup> Tilskipun.</p>',
  'inline images with size':
    '<p>Mynd: <img src="https://files.reglugerd.is/y.png" alt="y" width="200" height="100"></p>',
  'line breaks': '<p>Lína eitt<br> lína tvö</p>',
  'legacy indenter spans, as cleanup stores them':
    '<p>a\n<span data-legacy-indenter="">  </span>\nb</p>',
  'legacy indenter spans, as older texts have them':
    '<p>a<span data-legacy-indenter="">      </span>b</p>',
};

describe('editor v2: a save without edits changes nothing', () => {
  Object.entries(lossless).forEach(([name, html]) => {
    test(name, () => {
      const r = checkFidelity(html, cleanupSingleEditorOutput);
      expect(r.actual).toBe(r.expected);
      expect(r.idempotent).toBe(true);
    });
  });
});

/*
  Real regulation texts as the database stores them: prettified, with a
  newline between most words. (The public API, which the corpus is read
  from, returns them with newlines turned into spaces.) The editor in
  reglugerd-admin-www loads this form.
*/
describe('editor v2: stored, prettified regulation texts', () => {
  // `expected/` holds stored texts. (`input/` holds raw Word HTML, what
  // dirtyClean starts from; it is never stored, so not loaded into editors.)
  const dirs = ['expected'].map((d) => join(__dirname, d));
  dirs.forEach((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.html'))
      .forEach((file) => {
        test(`${dir.split('/').pop()}/${file}`, () => {
          const html = readFileSync(join(dir, file), 'utf8');
          const r = checkFidelity(html, cleanupSingleEditorOutput);
          // Nested formatting order is an allowed change (below); compare
          // with it normalized, everything else exactly.
          const order = (h: string) =>
            h
              .replace(
                /<u><strong>([^<]*)<\/strong><\/u>/g,
                '<strong><u>$1</u></strong>',
              )
              .replace(
                /<em><strong>([^<]*)<\/strong><\/em>/g,
                '<strong><em>$1</em></strong>',
              );
          expect(order(r.actual)).toBe(order(r.expected));
          expect(r.idempotent).toBe(true);
        });
      }),
  );
});

/*
  Changes the editor makes that cleanup does not undo, accepted because no
  text and no formatting is lost (docs/plan-tiptap-editor.md, "Schema").
*/
describe('editor v2: allowed changes', () => {
  const after = (html: string) => cleanupSingleEditorOutput(roundTrip(html));

  test('nested inline formatting is written in one order', () => {
    // ProseMirror writes marks in schema order; the text is untouched.
    expect(after('<p><u><strong>Fylgiskjal.</strong></u></p>')).toBe(
      '<p><strong><u>Fylgiskjal.</u></strong></p>',
    );
    expect(after('<p><em><strong>Tollskrárnr.</strong></em></p>')).toBe(
      '<p><strong><em>Tollskrárnr.</em></strong></p>',
    );
  });

  test('a <colgroup> without widths is dropped', () => {
    expect(
      after(
        '<table><colgroup><col> <col></colgroup><tbody><tr><td>a</td><td>b</td></tr></tbody></table>',
      ),
    ).toBe('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
  });

  test('<font> is unwrapped, keeping its text', () => {
    expect(after('<p><strong>B-HLUTI <font>x</font></strong></p>')).toBe(
      '<p><strong>B-HLUTI x</strong></p>',
    );
  });
});

describe('editor v2: output before cleanup', () => {
  test('lone paragraphs in list items and cells are written bare', () => {
    expect(
      roundTrip(
        '<ol><li>a</li></ol><table><tbody><tr><td>b</td></tr></tbody></table>',
      ),
    ).toBe(
      '<ol><li>a</li></ol><table><tbody><tr><td>b</td></tr></tbody></table>',
    );
  });

  test('tables have no <colgroup> or width styles, links no target or rel', () => {
    const html = roundTrip(
      '<table><tbody><tr><td><a href="https://x.is">x</a></td></tr></tbody></table>',
    );
    expect(html).not.toMatch(/colgroup|style=|target=|rel=/);
  });
});
