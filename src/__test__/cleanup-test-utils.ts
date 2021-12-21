import { readdirSync, readFileSync } from 'fs';

import { CleanerFn } from '../_cleanup/cleanup-utils';
import { HTMLText } from '../types';

type TestDescr<Options> = {
  input: string;
  skip?: true;
  only?: true;
  options?: Options;
} & (
  | { expected: string; throws?: undefined }
  | { expected?: undefined; throws: true }
);

export type TestDescriptions<T> = Record<string, TestDescr<T>>;

// ---------------------------------------------------------------------------

export const runCleanupMicroTests = <T>(
  cleanerFn: CleanerFn<T>,
  tests: TestDescriptions<T>,
) => {
  Object.entries(tests).forEach(([descr, t]) => {
    if (t.skip) {
      return;
    }
    const testFn = t.only ? test.only : test;
    testFn(descr, () => {
      const attempt = () => cleanerFn(t.input as HTMLText, t.options);
      if (t.throws) {
        expect(attempt).toThrow();
      } else {
        expect(attempt()).toEqual(cleanerFn.prettify(t.expected as HTMLText));
      }
    });
  });
};

// ---------------------------------------------------------------------------

export const runCleanupFiletests = (
  cleanerFn: (input: HTMLText) => HTMLText,
  opts: {
    parentDir: string;
    filter?: (fileNames: Array<string>) => Array<string>;
  },
) => {
  const { parentDir, filter = (fileNames) => fileNames } = opts;

  const inputDir = parentDir + '/input';
  const expectedDir = parentDir + '/expected';

  const allHTMLFiles = readdirSync(inputDir).filter((fileName) =>
    /\.html$/i.test(fileName),
  );

  filter(allHTMLFiles).forEach((fileName) => {
    test('clean up "input/' + fileName + '"', () => {
      const input = readFileSync(
        inputDir + '/' + fileName,
        'utf-8',
      ) as HTMLText;
      const expected = readFileSync(
        expectedDir + '/' + fileName,
        'utf-8',
      ) as HTMLText;

      expect(cleanerFn(input)).toEqual(expected);
    });
  });
};

// ---------------------------------------------------------------------------

export const universalTests: TestDescriptions<undefined> = {
  'Converts escaped text entities to unicode characters': {
    input: '<p>&Ouml;&#214;</p>',
    expected: '<p>ÖÖ</p>',
  },

  'Removes all soft-hyphens': {
    input: '<p>Orð&shy;skipt&shy;ing</p>',
    expected: '<p>Orðskipting</p>',
  },

  'Removes <meta/>, <style/>, <link/> and <script/> elements': {
    input:
      '<meta charset="iso-8859-1"/> ' +
      '<style>A { color: blue }</style> ' +
      '<link rel="stylesheet" href="foo.css" /> ' +
      '<script>B()</script> ' +
      '<noscript>C</noscript> ',
    expected: '<p>C</p>',
  },

  'Pushes trailing/leading spaces and <br>s to outside of inline elements': {
    input:
      '<p><em> <strong> A </strong></em><s>B </s></p>' +
      '<p><em>C</em><strong> <em><ins>D <br/> </ins> </em> </strong>E</p>' +
      '<ul><li>F<br/></li><li>G</li></ul>' +
      '',
    expected:
      '<p><em><strong>A</strong></em> <s>B</s></p>' +
      '<p><em>C</em> <strong><em><ins>D</ins></em></strong><br/> E</p>' +
      '<ul><li>F</li><li>G</li></ul>' +
      '',
  },

  'Removes invalid align="" attributes off elements': {
    input:
      '<h2 align="right">AA</h2>' +
      '<h3 align="right">BB</h3>' +
      '<h5 align="center">CC</h5>' +
      '<h4 align="left">DD</h4>' +
      '<p align="left">EE</p>' +
      '<p align="justified">FF</p>' +
      '<h2 class="chapter__title" align="center">1. Kafli</h2>' +
      '',
    expected:
      '<h2>AA</h2>' +
      '<h3>BB</h3>' +
      '<h5 align="center">CC</h5>' +
      '<h4>DD</h4>' +
      '<p>EE</p>' +
      '<p>FF</p>' +
      '<h2 class="chapter__title">1. Kafli</h2>' +
      '',
  },

  'Removes empty elements': {
    input:
      '<p></p><p> </p><p align="right">&#160;</p>' +
      '<table><tbody>' +
      '  <tr><td></td><td></td></tr>' + // empty row
      '  <tr><td>A</td><td></td></tr>' + // row with some empty cells
      '  <tr><td></td><td>B</td></tr>' + // row with some empty cells
      '</tbody></table>' +
      '<p>B<br/><u></u></p>' +
      '',
    expected:
      '' +
      '<table><tbody>' +
      '  <tr><td>A</td><td></td></tr>' +
      '  <tr><td></td><td>B</td></tr>' +
      '</tbody></table>' +
      '<p>B</p>' +
      '',
  },

  'Removes trailing <br/>s': {
    input: '<p>A<br/>\n<br/><br/></p><p>B<br/>C <br/></p><br/>',
    expected: '<p>A</p><p>B<br /> C</p>',
  },

  'Allow no more than two adjacent <br/>s': {
    input:
      '<ul>' +
      '<li>A<br/> <br/> <br/> <br/><br/>B</li>' +
      '<li>C<br/>D<br/>E<br/>F<br/>G</li>' +
      '</ul>',
    expected:
      '<ul>' +
      '<li>A<br/> <br/> B</li>' +
      '<li>C<br/> D<br/> E<br/> F<br/> G</li>' +
      '</ul>',
  },

  'Splits paragraphs on double <br>s': {
    input:
      '<p>A<br/> <br/> <br/> <br/><br/>B</p> C <br/> <br/> D' +
      '<p><em><strong>E <br/><br/>F</strong> G</em></p>' +
      '<p>Z1<br/><br/>Z2<br/><br/><u></u></p>' +
      '',
    expected:
      '<p>A</p><p>B</p><p>C</p><p>D</p>' +
      '<p><em><strong>E</strong></em></p> <p><em><strong>F</strong> G</em></p>' +
      '<p>Z1</p><p>Z2</p>' +
      '',
  },

  'Maintains .Dags, .FHUndirskr and .Undirritun class-names': {
    input:
      '<p class="Dags"style="text-align: left">A 2020</p>' + // must contain a year to avoid dirtyClean stripping the class-name
      '<p class="FHUndirskr" style="text-align: center"><em>B</em></p>' +
      '<p class="Undirritun" style="text-align: right"><b>C</b></p>',
    expected:
      '<p class="Dags">A 2020</p>' +
      '<p class="FHUndirskr" align="center"><em>B</em></p>' +
      '<p class="Undirritun" align="right"><strong>C</strong></p>',
  },

  'Strips numbers off old .Undirritun1 and .Undirritun2': {
    input:
      '<p class="Undirritun1">A</p>' +
      '<p class="Undirritun2">B</p>' +
      '<p class="Undirritun3">B</p>', // silly className!
    expected:
      '<p class="Undirritun">A</p>' +
      '<p class="Undirritun">B</p>' +
      '<p>B</p>',
  },

  'Removes width and height attributes off table cells': {
    input:
      '<table><tr>' +
      '  <th width="20%" height="100">A</th>' +
      '  <td width="20%" height="100">B</td>' +
      '</tr></table>',
    expected:
      '<table><tbody><tr>' +
      '  <th>A</th>' +
      '  <td>B</td>' +
      '</tr></tbody></table>',
  },

  'Wraps stray table-cell block-element siblings into <p>s': {
    input:
      '<table><tr>' +
      '  <td>A<p>B</p></td>' +
      '  <td><ul><li>C</li></ul>D</td>' +
      '  <td>E<table><tr><th>E1</th><td>E2</td></tr></table></td>' +
      '</tr></table>',
    expected:
      '<table><tbody><tr>' +
      '  <td><p>A</p><p>B</p></td>' +
      '  <td><ul><li>C</li></ul><p>D</p></td>' +
      '  <td><p>E</p><table><tbody><tr><th>E1</th><td>E2</td></tr></tbody></table></td>' +
      '</tr></tbody></table>',
  },

  // NOTE: This should never happen, but just in case be forgiving and lossless
  'Passes appendixes through unharmed': {
    input:
      `<section>A</section>` +
      '<section class="appendix">' +
      '  <h2 class="appendix__title">B</h2>' +
      '  <p>C</p>' +
      '  D' + // performs no cleanup inside appendixes (that should happen separately)
      '</section>' +
      '',
    expected:
      `<p>A</p>` +
      '<section class="appendix">' +
      '  <h2 class="appendix__title">B</h2>' +
      '  <p>C</p>' +
      '  D' +
      '</section>' +
      '',
  },
  'Passes images through ok': {
    input:
      '<p align="center">' +
      '<img' +
      ' title="Formúla sem lýsir útreikningi vegins fjármagnskostnaðar eftir skatt að teknu tilliti til skattspörunar vegna skuldsetningar"' +
      ' class="center"' +
      ' id="5ef80e62-7a32-410e-941d-7a8e49884cdd"' +
      ' alt="Formúla sem lýsir útreikningi vegins fjármagnskostnaðar eftir skatt að teknu tilliti til skattspörunar vegna skuldsetningar"' +
      ' src="https://foo.is/vidhengi/B_nr_192_2016_mynd1.png"' +
      '/>' +
      '</p>',
    expected:
      '<p align="center">' +
      '<img' +
      ' id="5ef80e62-7a32-410e-941d-7a8e49884cdd"' +
      ' src="https://foo.is/vidhengi/B_nr_192_2016_mynd1.png"' +
      ' alt="Formúla sem lýsir útreikningi vegins fjármagnskostnaðar eftir skatt að teknu tilliti til skattspörunar vegna skuldsetningar"' +
      '/></p>',
  },

  'Removes redundant <ol><li value=""> attributes': {
    input:
      '<ol><li>A1</li><li value="2">A2</li><li>A3</li></ol>' +
      '<ol><li>B1</li><li value="3">B3</li><li>B4</li></ol>' + // not redundant
      '<ol><li>C1</li><li value="2">C2</li><li>C3</li><li start="4">C4</li></ol>' +
      '<ol start="3"><li>D3</li><li value="4">D4</li><li>D5</li></ol>' +
      '<ol start="3"><li>E3</li><li value="2">E2</li><li>E3</li><li value="4">E4</li></ol>' + // weird flex but ok
      '<ol><li value="20">F20</li><li>F21</li><li>F22</li></ol>' + // not redundant
      '',
    expected:
      '<ol><li>A1</li><li>A2</li><li>A3</li></ol>' +
      '<ol><li>B1</li><li value="3">B3</li><li>B4</li></ol>' +
      '<ol><li>C1</li><li>C2</li><li>C3</li><li>C4</li></ol>' +
      '<ol start="3"><li>D3</li><li>D4</li><li>D5</li></ol>' +
      '<ol start="3"><li>E3</li><li value="2">E2</li><li>E3</li><li>E4</li></ol>' +
      '<ol><li value="20">F20</li><li>F21</li><li>F22</li></ol>' +
      '',
  },
};
