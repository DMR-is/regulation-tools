import dirtyClean from '../dirtyClean-server';
import {
  runCleanupFiletests,
  runCleanupMicroTests,
  universalTests,
} from './cleanup-test-utils';

// ---------------------------------------------------------------------------

runCleanupFiletests(dirtyClean, {
  parentDir: __dirname,
  // filter: (fileNames) =>
  // 	fileNames
  // 		// .slice(0, 0)
  // 		.filter((fileName) => fileName === '0822-2004.html'),
});

// ---------------------------------------------------------------------------

runCleanupMicroTests(dirtyClean, {
  'Parses and trims simple HTML': {
    input: '\n<p> \tfoo\n</p>\n',
    expected: '<p>foo</p>',
  },

  'Fixes mistakes (actual examples 🤷‍♂️)': {
    input:
      '<p><u>&gt;</u></p>' +
      '<p><u>&lt;&lt;/u&gt;</p>' +
      '<p><u>A</u></p>' +
      '<p align="center; LINE-HEIGHT: 12pt; font-weight: bold; tab-stops: right -68.4pt left -59.05pt">B</p>' +
      '',
    expected:
      '<p>≥</p>' +
      '<p>≤</p>' +
      '<p><u>A</u></p>' +
      '<p align="center"><strong>B</strong></p>' +
      '',
  },

  'Aggressively normalizes all types of spaces': {
    input: '<p>A\t B C &nbsp;&#160; D\t \nE</p> ',
    expected: '<p>A B C D E</p>',
  },

  'Changes &#64257; (ﬁ) into "Þ"': {
    input: '<p>&#64257; (ﬁ)</p>',
    expected: '<p>Þ (Þ)</p>',
  },

  'Aggressively strips out HTML comments': {
    input: '<p>A<!-- comment --></p><!-- comment -->',
    expected: '<p>A</p>',
  },

  'Throws out weird templating directives/crud': {
    input: '<p>A<![if !supportEmptyParas]> <![endif]>B</p>',
    expected: '<p>A B</p>',
  },

  'Maintains certain inline elements': {
    input: '<p><sup>A</sup><sub>B</sub></p>',
    expected: '<p><sup>A</sup><sub>B</sub></p>',
  },

  'Leaves in <hr> elements': {
    input: '<p>A</p><hr align="center" /><p>B</p>',
    expected: '<p>A</p><hr/><p>B</p>',
  },

  'Detects Office tab stop markers': {
    input:
      'A<span style="&#39;mso-tab-count:">         </span>' +
      'B <span style="&#39;mso-tab-count:4&#39;">      </span>' + // removes spaces around indenters
      'C <span style="&#39;mso-tab-count:1&#39;"> </span> D' + // too short, pointless
      '<p>E <span style="&#39;mso-tab-count:3&#39;">    </span></p>' + // trailing indenters are trimmed
      '',
    expected:
      '<p>' +
      'A\n<span data-legacy-indenter="">           </span>\n' +
      'B\n<span data-legacy-indenter="">        </span>\n' +
      'C\n<span data-legacy-indenter="">   </span>\nD</p>' +
      '<p>E</p>' +
      '',
  },

  'Merges adjacent inline elements': {
    input:
      '<p><em>A</em><em>B</em><sup>C</sup><sup>D</sup><em>E</em><em>F</em></p>' +
      '<p><em>G</em> <em>H</em> <u>I</u><br/><u>J</u></p>' + // spaces and <br>s are joined
      '<p><em>a</em><em>b</em> <em>c </em> <img src="url" /> <em>d</em></p>' + // multi-element merge
      '<p><em>e</em> <strong><em>f</em></strong> <em>g</em></p>' + // detects only-children
      '<p><u>K</u> <span style="&#39;mso-tab-count:4&#39;">      </span><u>L</u></p>' + // indenteers are joined
      '<p><a href="X">M</a><a href="Y">N</a></p>' + // links with different hrefs are not joined
      '<p><s id="Z">M</s><s>N</s></p>' + // different id=""s prevent merging
      '',
    expected:
      '<p><em>AB</em><sup>CD</sup><em>EF</em></p>' +
      '<p><em>G H</em> <u>I<br/> J</u></p>' +
      '<p><em>ab c <img src="url" /> d</em></p>' +
      '<p><em>e <strong>f</strong> g</em></p>' + // detect children
      '<p><u>K\n<span data-legacy-indenter="">        </span>\nL</u></p>' +
      '<p><a href="X">M</a><a href="Y">N</a></p>' +
      '<p><s id="Z">M</s><s>N</s></p>' +
      '',
  },

  'Correctly handles mutiple indenter spans wrapped in other spans': {
    input: `
    <p>A  
    <span lang="IS" style='font-size:11.0pt;mso-bidi-font-size: 12.0pt;mso-bidi-font-family:Arial;mso-ansi-language:IS'><span style='mso-tab-count: 1'>                  </span> Þ =<span style='mso-tab-count:1'>   </span> ----------<span style='mso-tab-count:1'>      </span> x<span style='mso-tab-count:1'>  </span></span>
    B</p>
    `,
    expected:
      '<p>A' +
      ' <span data-legacy-indenter="">                    </span> ' +
      ' Þ =' +
      ' <span data-legacy-indenter="">     </span> ' +
      ' ----------' +
      ' <span data-legacy-indenter="">        </span> ' +
      ' x' +
      ' <span data-legacy-indenter="">    </span> ' +
      ' B</p>',
  },

  'Zaps stray <span>s': {
    input: '<p><span>A</span></p>',
    expected: '<p>A</p>',
  },

  'Zaps redundant inline elements': {
    input: '<p><em><strong>A <em>B</em></strong></em> <u><u>C</u></u></p>',
    expected: '<p><em><strong>A B</strong></em> <u>C</u></p>',
  },

  'Zaps redundant only-child <p>s': {
    input:
      '<ul><li><p>A</p></li><li><p>C</p> D</li></ul>' +
      '<table><tr><td><p align="center">E</p></td><td><p align="right"></p></td></tr></table>' + // passes align="" up to <td>
      '',
    expected:
      '<ul><li>A</li><li><p>C</p><p>D</p></li></ul>' +
      '<table><tbody><tr><td align="center">E</td><td></td></tr></tbody></table>' +
      '',
  },

  'Moves leading/trailing single-<td> table rows outside of the table': {
    input:
      '<table><tbody><tr><td align="center">A1</td></tr><tr><td align="right"><p>A2</p>A3</td></tr></tbody></table>' +
      '<table><tbody><tr><td colspan="2">B1</td></tr><tr><td colspan="2">B2</td></tr></tbody></table>' + // is single column despite colspan attributes
      '<table><tbody><tr><td colspan="2">C1</td></tr><tr><td>C2</td>' +
      '  <td>C3</td></tr><tr><td colspan="2" align="center">C4</td></tr></tbody></table>' +
      '<table><thead><tr><td>D1</td></tr></thead><tbody><tr><td>D2</td></tr></tbody></table>' + // tables with thead are left alone
      '<table>' + // is not thwarted by multi-tbody tables.
      '  <tbody><tr><td colspan="2">E0</td></tr><tr><td colspan="2">E0b</td></tr></tbody>' +
      '  <tbody><tr><td colspan="2">E1</td></tr><tr><td>E2</td><td>E3</td></tr><tr><td colspan="2">E3b</td></tr></tbody>' +
      '  <tbody><tr><td colspan="2">E4</td></tr><tr><td>E5</td><td>E6</td></tr><tr><td colspan="2">E7</td></tr></tbody>' +
      '</table>' +
      '',
    expected:
      '<p align="center">A1</p><p align="right">A2</p><p align="right">A3</p>' +
      '<p>B1</p><p>B2</p>' +
      '<p>C1</p><table><tbody><tr><td>C2</td><td>C3</td></tr></tbody></table><p align="center">C4</p>' +
      '<table><thead><tr><td>D1</td></tr></thead><tbody><tr><td>D2</td></tr></tbody></table>' +
      '<p>E0</p><p>E0b</p><p>E1</p><table>' +
      '  <tbody><tr><td>E2</td><td>E3</td></tr><tr><td colspan="2">E3b</td></tr></tbody>' +
      '  <tbody><tr><td colspan="2">E4</td></tr><tr><td>E5</td><td>E6</td></tr></tbody>' +
      '</table><p>E7</p>' +
      '',
  },

  'Converts <div>s to <p>s': {
    input: '<div>A</div><div>B</div>',
    expected: '<p>A</p><p>B</p>',
  },

  'Collapses nested <div>s': {
    input:
      '<div><div>A</div></div><div><div><p>B</p></div></div>' +
      '<div><div>C</div> D <div><p>E</p></div></div>' +
      '',
    expected: '<p>A</p><p>B</p>' + '<p>C</p><p>D</p><p>E</p>' + '',
  },

  'Passes id="" and align="" from zapped element down to its (first) children':
    {
      input:
        '<div id="foo"><p>A</p><p>B</p></div>' +
        '<div align="center"><p>C</p><p>D</p><em>E</em></div>' +
        '<div id="foo2"><em>F</em><p>G</p><p>H</p></div>' +
        '',
      expected:
        '<p id="foo">A</p><p>B</p>' +
        '<p align="center">C</p><p align="center">D</p><p align="center"><em>E</em></p>' +
        '<p id="foo2"><em>F</em></p><p>G</p><p>H</p>' +
        '',
    },

  'Passes margin-left/text-indent styles from zapped element down to its block children':
    {
      input:
        '<div style="margin-left: 2em;"><p>A</p><p>B</p></div>' +
        '<div style="margin-left: 2em; text-indent: -2em"><p>C</p><p>D</p><em>E</em></div>' +
        '',
      expected:
        '<p style="margin-left: 2em;">A</p><p style="margin-left: 2em;">B</p>' +
        '<p style="margin-left: 2em; text-indent: -2em">C</p><p style="margin-left: 2em; text-indent: -2em">D</p><p style="margin-left: 2em; text-indent: -2em"><em>E</em></p>' +
        '',
    },

  'Throw when passing id="" down to a child that already has id=""': {
    input: '<div id="foo"><p id="bar">A</p><p>B</p>',
    throws: true,
  },

  'Collapses spaces between block-level elements': {
    input:
      '<div><div>A</div>\t&nbsp;</div> <br/> <div>\t<p>B</p></div>\n\n <div>C</div>',
    expected: '<p>A</p><p>B</p><p>C</p>',
  },

  'Pushes data-legacy-indenters outside elements just like any other space': {
    input:
      '<p>G<span style="&#39;mso-tab-count:1&#39;"> </span></p>' +
      '<p><span style="&#39;mso-tab-count:1&#39;"> </span> H</p>' +
      '<p><strong><span style="&#39;mso-tab-count:1&#39;"> </span> </strong>I</p>' +
      '',
    expected:
      '<p>G</p>' +
      '<p><span data-legacy-indenter="">   </span>\nH</p>' +
      '<p><span data-legacy-indenter="">   </span>\nI</p>' +
      '',
  },

  'Removes unsupported attributes': {
    input:
      '<p data-some-attribute="foo" id="hi" right="right"' +
      '  tab-stops:-33.15pt="tab-stops:-33.15pt"' +
      '  type="whatever" dir="ltr">A</p>' +
      '<ol type="A"><li lang="en" type="a">B</li></ol>',
    expected: '<p id="hi">A</p><ol type="A"><li>B</li></ol>',
  },

  'Changes list-style-type styles into type attribute': {
    input:
      '<ol style="list-style-type: lower-alpha"><li>A</li></ol>' +
      '<ol style="list-style-type: decimal"><li>A</li></ol>' +
      '<ul style="list-style-type: circle"><li>A</li></ul>' +
      '<ul style="list-style-type: decimal"><li>A</li></ul>' +
      '',
    expected:
      '<ol type="a"><li>A</li></ol>' +
      '<ol><li>A</li></ol>' +
      '<ul type="circle"><li>A</li></ul>' +
      '<ul><li>A</li></ul>' +
      '',
  },

  'Preserves list start="" attributes': {
    input:
      '<ol start="2"><li>A</li></ol>' + '<ul start="2"><li>B</li></ul>' + '',
    expected:
      '<ol start="2"><li>A</li></ol>' + '<ul start="2"><li>B</li></ul>' + '',
  },

  'Removes all pre-existing classNames': {
    input: '<p class="MsoBodyText">A</p><p class="foo">B</p>',
    expected: '<p>A</p><p>B</p>',
  },

  'Wraps top-level inline content in <p>s': {
    input:
      '<p>A</p>\n <br/> <br/> <br/> <span>B</span> <br/> <em>C</em> <span><br/>D</span>',
    expected: '<p>A</p><p>B<br/> <em>C</em><br/> D</p>',
  },

  'Wraps inline siblings to <p>s in a <p>': {
    input:
      '<ul><li><p>A</p>\n <br/> <br/> <br/> <span>B</span> <br/> <em>C</em> <span><br/>D</span></li></ul>' +
      ' Foo<br/>bar ' +
      '<ul><li><p>E</p>F</li></ul>' +
      '',
    expected:
      '<ul><li><p>A</p><p>B<br/> <em>C</em><br/> D</p></li></ul>' +
      '<p>Foo<br/> bar</p>' +
      '<ul><li><p>E</p><p>F</p></li></ul>' +
      '',
  },

  'Turn <b> and <i> into <strong> and <em>': {
    input: '<p><i>A</i> <b>B</b></p>',
    expected: '<p><em>A</em> <strong>B</strong></p>',
  },

  'Allows certain align="" attributes': {
    input:
      '<p align="center">A</p>' +
      '<div align="right">B</div>' +
      '<p align="left">C</p>',
    expected: '<p align="center">A</p>' + '<p align="right">B</p>' + '<p>C</p>',
  },

  'Converts text-align styles to align-attributes': {
    input:
      '<p style="text-align: center">A</p>' +
      '<div style="text-align: right">B</div>' +
      '<p style="text-align: left">C</p>',
    expected: '<p align="center">A</p>' + '<p align="right">B</p>' + '<p>C</p>',
  },

  'Converts inline font-style/font-weight rules into inline HTML elements': {
    input:
      '<div style="font-style: italic">A</div>' +
      '<p style="font-weight: bold !important;">B</p>' +
      '<p style="font-weight: 700">C <em>C2</em></p>' +
      '<p style="font-weight: 600">D</p>' +
      '<p style="font-weight: 500">E</p>' + // evaluate as normal
      '<p style="font-weight: bolder;">F</p>' +
      '',
    expected:
      '<p><em>A</em></p>' +
      '<p><strong>B</strong></p>' +
      '<p><strong>C <em>C2</em></strong></p>' +
      '<p><strong>D</strong></p>' +
      '<p>E</p>' +
      '<p><strong>F</strong></p>' +
      '',
  },

  'Paragraphs marked as "indented" are passed through': {
    input: '<p class="indented">A</p>',
    expected: '<p class="indented">A</p>',
  },

  'Converts text-decoration style attributes into inline HTML elements': {
    input: '<span style="text-decoration: underline">A</span>',
    expected: '<p><u>A</u></p>',
  },

  'Leaves margin-left and text-indent styls in place': {
    input:
      '<p style="mso-margin-top-alt:auto;mso-margin-bottom-alt:auto; ' +
      'margin-left:19.85pt;text-align:justify;text-indent:-19.85pt;' +
      'tab-stops:19.85pt 35.45pt right 389.8pt">A</p>' +
      '<p style="margin-left:50px">B</p>' +
      '',
    expected:
      '<p style="margin-left:19.85pt; text-indent:-19.85pt;">A</p>' +
      '<p style="margin-left:50px;">B</p>' +
      '',
  },

  'Blocks never start start with a <br/>': {
    input: '<p><br/>A</p>',
    expected: '<p>A</p>',
  },

  'Removes garbage style="" attributes': {
    input: '<p style="border: 1px solid red;">A</p>',
    expected: '<p>A</p>',
  },

  'Normalizes image URLs': {
    input:
      '<p>' +
      '<img src="/media/A1//A2.gif" />' +
      '<img src="/media/B1//B2/B3.gif" />' +
      '<img src="/media/C1/C2//C3.gif" />' +
      '<img src="/foobar/D1.gif" />' +
      '<img src="http://www.stjornartidindi.is/D" />' + // normalize stjórnartíðindi URLs to "https://www."
      '<img src="http://stjornartidindi.is/E" />' + // normalize stjórnartíðindi URLs to "https://www."
      '<img src="http://hleri/dkmadmin/Stj/F" />' + // convert borked local urls to "https://www.stjornartidindi.is"
      '<img src="https://www.stjornartidindi.is/DocumentActions.aspx?ActionType=GetImage&documentID=0518a48e-3f82-44e5-a839-4258c6af5a5c" />' + // converts "?" to a safe token "__q__"
      '<img src="http://www.lovdata.no/for/sf/gr/sd-19930928-0910-001.gif" />' + // actual image url
      '<img src="https://lh6.googleusercontent.com/LOvkwMqJ8saeCgmGTYk7yaiq-v4WO_0AwfbsGPH_OALJl0y-2hFDIfl1v4zER4PGnZCawOebimcR89CkNTfil_dealngaPGsDo0OKMqqaVqBVThCq03UX2Els6CN5hDmtWu81ZPu" />' + // actual URL
      '<img src="some/relative/url.gif" />' + // Ignores path relative URLs
      '<img src="../parent/relative/url.gif" />' + // Ignores path relative URLs
      '<img src="file://file-protocol/url.gif" />' + // Ignores bad protocols
      '<img src="http://www.blerg.is/G1//G2.gif" />' + // leave surprising full-URLs alone
      '</p>',
    expected:
      '<p>' +
      '<img src="https://files.reglugerd.is/media/A1/A2.gif" />' +
      '<img src="https://files.reglugerd.is/media/B1/B2/B3.gif" />' +
      '<img src="https://files.reglugerd.is/media/C1/C2/C3.gif" />' +
      '<img src="https://files.reglugerd.is/foobar/D1.gif" />' +
      '<img src="https://files.reglugerd.is/stjornartidindi/D" />' +
      '<img src="https://files.reglugerd.is/stjornartidindi/E" />' +
      '<img src="https://files.reglugerd.is/stjornartidindi/F" />' +
      '<img src="https://files.reglugerd.is/stjornartidindi/DocumentActions.aspx__q__ActionType=GetImage&documentID=0518a48e-3f82-44e5-a839-4258c6af5a5c" />' +
      '<img src="https://files.reglugerd.is/ext/www.lovdata.no/for/sf/gr/sd-19930928-0910-001.gif" />' +
      '<img src="https://files.reglugerd.is/ext/lh6.googleusercontent.com/LOvkwMqJ8saeCgmGTYk7yaiq-v4WO_0AwfbsGPH_OALJl0y-2hFDIfl1v4zER4PGnZCawOebimcR89CkNTfil_dealngaPGsDo0OKMqqaVqBVThCq03UX2Els6CN5hDmtWu81ZPu" />' +
      '<img src="some/relative/url.gif" />' +
      '<img src="../parent/relative/url.gif" />' +
      '<img src="file://file-protocol/url.gif" />' +
      '<img src="http://www.blerg.is/G1//G2.gif" />' +
      '</p>',
  },

  'Removes spacer images': {
    input:
      '<img src="/icons/ecblank.gif" width="100"  height="100" /><br/>' + // "/icons/ecblank.gif" is a known spacer
      '<img src="some/url1.gif" width="1" height="20" /><br/>' + // too narrow
      '<img src="some/url2.gif" width="20" height="2" /><br/>' + // too low
      '<img src="some/url3.gif" width="2" /><br/>' + // too narrow
      '<img src="some/url4.gif" height="2" /><br/>' + // too low
      '<img src="some/url5.gif" style="width: 1px" width="20" /><br/>' + // too narrow (style trumps attr)
      '<img src="some/url6.gif" style="width: 100px" height="1" /><br/>' + // too low
      '<img src="some/url-1.gif" /><br/>' + // missing height might be large
      '<img src="some/url-2.gif" width="20" height="20" /><br/>' + // large enough, might be significant
      '<img src="some/url-3.gif" style="width: 0.75em" width="20" /><br/>' + // large enough  (1em === 16px)
      '<img src="some/url-4.gif" style="width: 1em; height:2rem;" /><br/>' + // large enough (1rem === 16px)
      '<img src="some/url-5.gif" style="width: 20px; height: 20px;" /><br/>' + // large enough
      '<img src="some/url-6.gif" width="20" /><br/>' + // missing height, might be large
      '<img src="some/url-7.gif" height="20" /><br/>' + // missing width, might be large
      '<img src="some/url--1.gif" alt="A" /><br/>' + // preserves alt="" text
      '<img src="some/url--2.gif" title="A" /><br/>' + // moves title="" text to alt=""
      '<img src="some/url--3.gif" alt="A" title="A" /><br/>' + // removes redundant title="" text
      '<img src="some/url--4.gif" alt="A" title="B" /><br/>' + // removes significant title="" text
      '<img src="some/url--5.gif" alt="" /><br/>' + // removes empty alt-text
      'x',
    expected:
      '<p>' +
      '<img src="some/url-1.gif" /><br/> ' +
      '<img src="some/url-2.gif" width="20" height="20" /><br/> ' +
      '<img src="some/url-3.gif" width="12" /><br/> ' +
      '<img src="some/url-4.gif" width="16" height="32" /><br/> ' +
      '<img src="some/url-5.gif" width="20" height="20" /><br/> ' +
      '<img src="some/url-6.gif" width="20" /><br/> ' +
      '<img src="some/url-7.gif" height="20" /><br/> ' +
      '<img src="some/url--1.gif" alt="A" /><br/> ' +
      '<img src="some/url--2.gif" alt="A" /><br/> ' +
      '<img src="some/url--3.gif" alt="A" /><br/> ' +
      '<img src="some/url--4.gif" alt="A" /><br/> ' +
      '<img src="some/url--5.gif" /><br/> ' +
      'x</p>',
  },

  'Sorts attributes': {
    input: '<p><img height="200" width="100" src="A" alt="B" /></p>',
    expected: '<p><img src="A" width="100" height="200" alt="B" /></p>',
  },

  // ===========================================================================
  // Lists

  'Unwraps lists nested just for layout': {
    input:
      // Example from https://www.reglugerd.is/reglugerdir/allar/nr/0043-2016
      '<ol><li style="list-style-type: none;">' +
      '<ol><li style="list-style-type: none;">' +
      '<ol><li style="list-style-type: none;">' +
      '  <ol>' +
      '    <li style="text-align: left;">A</li>' +
      '    <li style="text-align: left;">B</li>' +
      '  </ol>' +
      '</li></ol>' +
      '</li></ol>' +
      '</li></ol>' +
      '',
    expected: '<ol> <li>A</li> <li>B</li> </ol>',
  },

  'Merges unstyled <li>s with their previousSibling <li>': {
    input:
      // Example from https://www.reglugerd.is/reglugerdir/allar/nr/0655-2018
      '<ol style="list-style-type: lower-alpha;">' +
      '  <li style="text-align: justify;"><p>A</p> Foo</li>' +
      '  <li style="list-style-type: none;">' +
      '    Bar' +
      '    <ol>' +
      '      <li style="text-align: justify;">A.1</li>' +
      '      <li style="text-align: justify;">A.2</li>' +
      '      <li style="text-align: justify;">A.3</li>' +
      '    </ol>' +
      '  </li>' +
      '  <li value="2">B</li>' +
      '</ol>' +
      '',
    expected:
      '<ol type="a">' +
      '  <li>' +
      '    <p>A</p>' +
      '    <p>Foo</p>' +
      '    <p>Bar</p> ' +
      '    <ol>' +
      '      <li>A.1</li>' +
      '      <li>A.2</li>' +
      '      <li>A.3</li>' +
      '    </ol>' +
      '  </li>' +
      '  <li>B</li>' + // strip off the (now redundant) `value="2"`
      '</ol>' +
      '',
  },

  // ===========================================================================
  // Bad Content/Markup Spaecial casing

  'Demotes H1 to H2': {
    input:
      '<h1 align="center" style="text-align:center"><span lang="IS" style="mso-ansi-language: IS">REGLUGERÐ</span></h1>',
    expected: '<h2 align="center">REGLUGERÐ</h2>',
  },

  'Zaps `acronym,big,center,form,tt,dir,dl,dt,font` because there are no significant can be found':
    {
      input:
        '<acronym>B</acronym>' +
        '<big>C</big>' +
        '<center>D</center>' +
        '<form>E</form>' +
        '<tt>F</tt>' +
        '<dir>G</dir>' +
        '<dl>H</dl>' +
        '<dt>I</dt>' +
        '<font>J</font>' +
        '',
      expected: '<p>BCDEFGHIJ</p>',
    },

  'Zaps <cite>s but inserts <br> (based on actual use in the srouce docs)': {
    input: '<cite>A</cite> <cite>B</cite> <cite>C</cite> <cite>D</cite>',
    expected: '<p>A<br/> B<br/> C<br/> D</p>',
  },

  'Wraps orphaned <li>s into a plain <ul>': {
    input:
      '<p>...</p>' +
      '<li>A</li>' +
      'B' +
      '<li>C</li>' +
      '<li>D</li>' +
      '<ol><li>H</li></ol>' +
      '<div>E</div>' +
      '<li>F</li>',
    expected:
      '<p>...</p>' +
      '<ul><li>A</li></ul>' +
      '<p>B</p>' +
      '<ul><li>C</li>' +
      '<li>D</li></ul>' +
      '<ol><li>H</li></ol>' +
      '<p>E</p>' +
      '<ul><li>F</li></ul>',
  },

  'Converts `address,align,code` to <div>s/<p>s (based on actual usage in the srouce docs)':
    {
      input:
        '<address>A</address><div><address>B</address></div>' +
        '<align>C</align>' + // WAT!?
        '<code>D</div>' + // Weird. Yes.
        '',
      expected: '<p>A</p><p>B</p><p>C</p><p>D</p>',
    },

  'Converts old-school <strike> into <s>': {
    input: '<strike>A</strike>',
    expected: '<p><s>A</s></p>',
  },

  'Zaps <blockquote>s turning them selectively into ol/uls': {
    // https://www.reglugerd.is/reglugerdir/allar/nr/0406-1978
    // https://www.reglugerd.is/reglugerdir/allar/nr/0368-2008
    // https://www.reglugerd.is/reglugerdir/allar/nr/0958-2007
    // https://www.reglugerd.is/reglugerdir/allar/nr/0287-2007
    // https://www.reglugerd.is/reglugerdir/allar/nr/0600-2009
    // https://www.reglugerd.is/reglugerdir/allar/nr/0236-2007
    input:
      '<blockquote><p>A</p></blockquote>' + // single paragraph ==> simply unwrap
      '<blockquote><p>A1</p><ul><li>A2</li></ul></blockquote>' + // non-paragraph content found ==> simply unwrap
      '<blockquote><p>B1</p><p>B2</p><p>B3</p></blockquote>' +
      '<blockquote><blockquote><blockquote><p>BB1</p><p>BB2</p><p>BB3</p></blockquote></blockquote></blockquote>' +
      '<blockquote><p>C1<br/><em>C2</em><br/>C3<br/></p></blockquote>' +
      '<blockquote><p>2.1. D1</p><p>2.1.1. D2</p><p>2.1.3. D3</p></blockquote>' + // complex marker ==> simply unwrapped
      '<blockquote><p>1. E1</p><p>2. E2</p></blockquote>' +
      '<blockquote><p>1) F1<br/>2) F2</p></blockquote>' +
      '<blockquote><p>1&nbsp;G1<br/>2&nbsp;G2</p></blockquote>' +
      '<blockquote><p>1.H1</p><p>2.H2</p></blockquote>' +
      '<blockquote><p>a.&nbsp;I1</p><p>b. I2</p></blockquote>' +
      '<blockquote><p>a) J1<br/>b) J2</p></blockquote>' +
      '<blockquote><p>A. K1</p><p>B. K2</p></blockquote>' +
      '<blockquote><p>A) L1<br/>B) L2</p></blockquote>' +
      '<blockquote><p>i. M1</p><p>ii. M2</p></blockquote>' +
      '<blockquote><p>i) N1<br/>ii) N2</p></blockquote>' +
      '<blockquote><p>I. O1</p><p>II. O2</p></blockquote>' +
      '<blockquote><p>I) P1<br/>II) P2</p></blockquote>' +
      '<blockquote><p>- Q1</p><p>- Q2</p></blockquote>' +
      '<blockquote><p>–&nbsp;R1<br/>– R2</p></blockquote>' +
      '<blockquote><p>S</p><p>– S1<br/>– S2</p> SS</blockquote>' +
      '<blockquote><p>- T1</p><p>- T2</p><p>1. T3</p></blockquote>' + // mismatching marker types ==> simple unwrao
      '<blockquote><p>Z</p><ul><li>Z1</li></ul></blockquote>' + // contains a non-paragraph ==> simply unwrap
      '',
    expected:
      '<p>A</p>' +
      '<p>A1</p><ul><li>A2</li></ul></ul>' +
      '<ul data-autogenerated=""><li>B1</li><li>B2</li><li>B3</li></ul>' +
      '<ul data-autogenerated=""><li>BB1</li><li>BB2</li><li>BB3</li></ul>' +
      '<ul data-autogenerated=""><li>C1</li><li><em>C2</em></li><li>C3</li></ul>' +
      '<p>2.1. D1</p><p>2.1.1. D2</p><p>2.1.3. D3</p>' +
      '<ol data-autogenerated=""><li>E1</li><li>E2</li></ol>' +
      '<ol data-autogenerated=""><li>F1</li><li>F2</li></ol>' +
      '<ul data-autogenerated=""><li>1 G1</li><li>2 G2</li></ul>' +
      '<ul data-autogenerated=""><li>1.H1</li><li>2.H2</li></ul>' +
      '<ol type="a" data-autogenerated=""><li>I1</li><li>I2</li></ol>' +
      '<ol type="a" data-autogenerated=""><li>J1</li><li>J2</li></ol>' +
      '<ol type="A" data-autogenerated=""><li>K1</li><li>K2</li></ol>' +
      '<ol type="A" data-autogenerated=""><li>L1</li><li>L2</li></ol>' +
      '<ol type="i" data-autogenerated=""><li>M1</li><li>M2</li></ol>' +
      '<ol type="i" data-autogenerated=""><li>N1</li><li>N2</li></ol>' +
      '<ol type="I" data-autogenerated=""><li>O1</li><li>O2</li></ol>' +
      '<ol type="I" data-autogenerated=""><li>P1</li><li>P2</li></ol>' +
      '<ul data-autogenerated=""><li>Q1</li><li>Q2</li></ul>' +
      '<ul data-autogenerated=""><li>R1</li><li>R2</li></ul>' +
      '<p>S</p><ul data-autogenerated=""><li>S1</li><li>S2</li></ul><p>SS</p>' +
      '<p>- T1</p><p>- T2</p><p>1. T3</p>' + // mismatching marker types ==> simple unwrao
      '<p>Z</p><ul><li>Z1</li></ul>' +
      '',
  },

  'Saves `class="__cf_email__"` markers (legacy spam-protection thing': {
    input:
      '<a><span class="__cf_email__" data-cfemail="4134352920273237012728322a2832352e27206f">[email protected]</span></a> ' +
      '<a class="__cf_email__" data-cfemail="352920273237012728322a2832352e27206f2832">[email protected]</a> ' +
      '',
    expected:
      '<p>' +
      '<span class="__cf_email__" data-cfemail="4134352920273237012728322a2832352e27206f">[email protected]</span> ' +
      '<span class="__cf_email__" data-cfemail="352920273237012728322a2832352e27206f2832">[email protected]</span> ' +
      '</p>',
  },

  'Does not collapse spaces inside <pre>s, respects newlines but converts &nbsp; to normal space':
    {
      input:
        '' +
        '<pre>' +
        '<span lang="EN-US">Boltar, rær: <b>fjöldi, </b> þvermál' +
        '<span style="mso-spacerun: yes">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>' +
        ' 6, sérhver&nbsp; 20 mm að þvermáli og</span>\n' +
        '</pre>',
      expected:
        '' +
        '<pre>' +
        'Boltar, rær: <strong>fjöldi, </strong> þvermál' +
        '                     ' +
        ' 6, sérhver  20 mm að þvermáli og\n' +
        '</pre>',
    },

  'Collapses adjacent <pre>s into one': {
    input:
      '<pre>A  A</pre>' + // standalone pre with double spaces
      '<p>B</p>' +
      '<pre>\n' +
      '<span lang="EN-US"><![if !supportEmptyParas]>&nbsp;<![endif]></span>' +
      '\n</pre>' +
      '<pre>\n' +
      '<span lang="EN-US">Lýsing<span style="mso-spacerun: yes">&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</span> Stærð</span>' +
      '\n</pre>' +
      '<pre>\n' +
      '<span lang="EN-US"><![if !supportEmptyParas]>&nbsp;<![endif]></span>' +
      '\n</pre>' +
      '<pre>\n' +
      ' <span lang="EN-US">============================================================================================</span>' +
      '\n</pre>' +
      '<pre>\n' +
      '<span lang="EN-US"><![if !supportEmptyParas]>&nbsp;<![endif]></span>' +
      '\n</pre>' +
      '<pre>\n' +
      '<span lang="EN-US">Ytra þvermál<span style="mso-spacerun: yes">&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</span> 215 mm<span style="mso-spacerun: yes">&nbsp;</span></span>' +
      '\n</pre>' +
      '<pre>\n' +
      '<span lang="EN-US"><![if !supportEmptyParas]>&nbsp;<![endif]></span>' +
      '\n</pre>' +
      '<pre>\n' +
      '<span lang="EN-US"><![if !supportEmptyParas]>&nbsp;<![endif]></span>' +
      '\n</pre>' +
      '<pre>\n' +
      '<span lang="EN-US">Innra þvermál<span style="mso-spacerun: yes">&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; </span> Samkvæmt ytra þvermáli röralagnar<span style="mso-spacerun: yes">&nbsp;</span></span>' +
      '\n</pre>' +
      '<pre>\n' +
      '<span lang="EN-US"><![if !supportEmptyParas]>&nbsp;<![endif]></span>' +
      '\n</pre>' +
      '<p>C</p>' +
      '<pre>\n' +
      '<span lang="EN-US"><![if !supportEmptyParas]>&nbsp;<![endif]></span>' +
      '\n</pre>' +
      '<p>D</p>' +
      '<pre align="center">&nbsp;E</pre>' + // standalone pre with leading &nbsp; space
      '<p>F</p>' +
      '<pre align="center">G</pre>' + // standalone pre with no significant spacing
      ' H ' +
      '<pre>I</pre>', // standalone pre (because it's adjacent to a non-empty text-node)

    expected:
      '<pre>A  A</pre>' +
      '<p>B</p>' +
      '<pre>' +
      '\n' +
      'Lýsing                                            Stærð\n' +
      '\n' +
      ' ============================================================================================\n' +
      '\n' +
      'Ytra þvermál                                      215 mm \n' +
      '\n' +
      '\n' +
      'Innra þvermál                                     Samkvæmt ytra þvermáli röralagnar \n' +
      '\n' +
      '</pre>' +
      '<p>C</p>' +
      '<p>D</p>' +
      '<pre> E</pre>' + // align attributes are stripped off <pre>s
      '<p>F</p>' +
      '<p align="center">G</p>' +
      '<p>H</p>' +
      '<p>I</p>',
  },

  // ===========================================================================
  // Table magic

  'Flags layout tables': {
    input:
      '<div><table border="0"><td width="50">X</td><td width="450">Y</td></table></div>' +
      '<div><table style="border: 0px solid red"><td width="50">A</td><td width="450">B</td></table></div>' +
      '<div><table style="border: 1px solid red"><td width="50">C</td><td width="450">D</td></table></div>' +
      '<div><table><td width="50">E</td><td width="450">F</td></table></div>' +
      '<div><table border="1"><td width="50">G</td><td width="450">H</td></table></div>' +
      '',
    expected:
      '<table class="layout"><tbody><tr><td>X</td><td>Y</td></tr></tbody></table>' +
      '<table class="layout"><tbody><tr><td>A</td><td>B</td></tr></tbody></table>' +
      '<table><tbody><tr><td>C</td><td>D</td></tr></tbody></table>' +
      '<table><tbody><tr><td>E</td><td>F</td></tr></tbody></table>' +
      '<table><tbody><tr><td>G</td><td>H</td></tr></tbody></table>' +
      '',
  },

  'Flags list layout tables': {
    input:
      '<table border="0">' +
      '  <tr><td><strong>1. </strong></td><td colspan="2">AA</td></tr>' +
      '  <tr><td></td><td>i .</td><td>AAA</td></tr>' +
      '  <tr><td></td><td>a)</td><td>AAB</td></tr>' +
      '  <tr><td></td><td>–</td><td>AAC</td></tr>' +
      '  <tr><td>1.23.4.</td><td colspan="2">AB</td></tr>' +
      '</table>' +
      '<table border="0">' +
      '  <tr><td>1.</td><td colspan="2">BA</td></tr>' +
      '  <tr><td></td><td>Foo</td><td>BAA</td></tr>' + // "Foo" is not a likely list-item "marker" so the test fails
      '</table>' +
      '<table border="1"><tr><td>1.</td><td>CA</td></tr></table>' + // not a layout table
      '',
    expected:
      '<table class="layout layout--list"><tbody>' +
      '  <tr><td><strong>1.</strong></td><td colspan="2">AA</td></tr>' +
      '  <tr><td></td><td>i .</td><td>AAA</td></tr>' +
      '  <tr><td></td><td>a)</td><td>AAB</td></tr>' +
      '  <tr><td></td><td>–</td><td>AAC</td></tr>' +
      '  <tr><td>1.23.4.</td><td colspan="2">AB</td></tr>' +
      '</tbody></table>' +
      '<table class="layout"><tbody>' +
      '  <tr><td>1.</td><td colspan="2">BA</td></tr>' +
      '  <tr><td></td><td>Foo</td><td>BAA</td></tr>' +
      '</tbody></table>' +
      '<table><tbody><tr><td>1.</td><td>CA</td></tr></tbody></table>' +
      '',
  },

  // ===========================================================================
  // Footnote cleanup

  'Detects and cleans up footnote references': {
    input:
      '<p>A <a id="_ftnref1" style="mso-footnote-id:ftn1" href="#_ftn1" name="_ftnref1" title="">' +
      '<span class="MsoFootnoteReference"><span style="vertical-align:baseline;' +
      'vertical-align:baseline">1</span></span></a><span class="MsoFootnoteReference">' +
      '<span style="vertical-align:baseline;vertical-align: baseline">)</span></span></p>',
    expected:
      '<p>A <sup class="footnote-reference"><a id="_ftnref1" href="#_ftn1">1</a>)</sup></p>',
  },

  'Detects and cleans up footnotes': {
    input:
      '<div style="mso-element:footnote" id="ftn1"><p class="MsoFootnoteText">' +
      '<a id="_ftn1" style="mso-footnote-id:ftn1" href="#_ftnref1" name="_ftn1" title="">' +
      '<span class="MsoFootnoteReference">' +
      '<span lang="EN-US" style="vertical-align:baseline;vertical-align:baseline">1)</span>' +
      '</span></a> ' +
      '<span lang="EN-US" style="font-size:8.5pt">CAS: Chemical Abstract Service - nafn sem ' +
      'gefið er upp í CAS Chemical Registry System.</span>' +
      '</p></div>',
    expected:
      '<p class="footnote" id="ftn1">' +
      '<sup class="footnote__marker"><a id="_ftn1" href="#_ftnref1">1)</a></sup> ' +
      'CAS: Chemical Abstract Service - nafn sem gefið er upp í CAS Chemical Registry System.' +
      '</p>',
  },

  // ===========================================================================
  // Semantic Guessing

  'Auto-guesses simple article__title': {
    input:
      '<p align="center" style="&#39;text-align:center;tab-stops:110.85pt" right="right" left="left" right="right"><span lang="IS">1. gr.</span></p>' +
      '<p style="text-align:  center">7. gr .</p>' +
      '<p style="text-align:  center">9. gr</p>' +
      '<p style="text-align:  center">10. gr <br/> Name</p>' +
      '<p style="text-align:  center">11. gr - Name</p>' +
      '<p style="text-align:  center">12. gr . – Name</p>' + // en-dash/em-dash also works
      '<p style="text-align:  center">14. gr.</p>' +
      '<p align="center">A B.</p>' +
      // '<p align="center">15. gr. .</p>' + // !!!??
      '<p>1. gr.</p>' +
      '<p align="center">A – B</p>' +
      '',
    expected:
      '<h3 class="article__title">1. gr.</h3>' +
      '<h3 class="article__title">7. gr.</h3>' +
      '<h3 class="article__title">9. gr.</h3>' +
      '<h3 class="article__title">10. gr. <em class="article__name">Name</em></h3>' +
      '<h3 class="article__title">11. gr. <em class="article__name">Name</em></h3></h3>' +
      '<h3 class="article__title">12. gr. <em class="article__name">Name</em></h3></h3>' +
      '<h3 class="article__title">14. gr. <em class="article__name">A B.</em></h3>' +
      // '<h3 class="article__title">15. gr. <em class="article__name">.</em></h3>' + // !!!??
      '<p>1. gr.</p>' +
      '<p align="center">A – B</p>' +
      '',
  },

  'Auto-guesses complex article title and name together': {
    input:
      '<p style="text-align:  center">1. gr .<br/> A</p>' +
      '<p style="text-align:  center"><strong>2. gr .<br/> B<strong></p>' +
      '',
    expected:
      '<h3 class="article__title">1. gr. <em class="article__name">A</em></h3>' +
      '<h3 class="article__title">2. gr. <em class="article__name">B</em></h3>' +
      '',
  },

  'DOES NOT ATTEMPT to auto-guess `.section__title`s since they are soo uncommon':
    {
      input:
        '<p style="text-align: center">1. HLUTI</p>' +
        '<p align="center"><b>2. HLUTI</b></p>' +
        '',
      expected:
        '<p align="center">1. HLUTI</p>' +
        '<p align="center"><strong>2. HLUTI</strong></p>' +
        '',
    },

  'Auto-guesses slightly silly/unorthodox article titles': {
    input:
      '<p style="text-align:  center">4a. gr .</p>' +
      '<p style="text-align:  center">4b. gr .<br/> A</p>' +
      '<p style="text-align:  center">1.1.1. gr.</p>' +
      '<p style="text-align:  center">3.11.79. gr .</p>' +
      '<p style="text-align:  center">7.1.1b. gr.</p>' +
      '<p style="text-align:  center"><strong>2.1. gr .<br/> B<strong></p>' +
      '',
    expected:
      '<h3 class="article__title">4a. gr.</h3>' +
      '<h3 class="article__title">4b. gr. <em class="article__name">A</em></h3>' +
      '<h3 class="article__title">1.1.1. gr.</h3>' +
      '<h3 class="article__title">3.11.79. gr.</h3>' +
      '<h3 class="article__title">7.1.1b. gr.</h3>' +
      '<h3 class="article__title">2.1. gr. <em class="article__name">B</em></h3>' +
      '',
  },

  'Auto-guesses H2/H3/h4 class="Section1" as article/chapter titles': {
    input:
      '<h4 class="Section1">7. gr .</h4>' +
      '<h3 class="Section1">I. KAFLI</h3>' +
      '<h3 class="Section1">9. gr</h3>' +
      '<h4 class="Section1">1. gr .<br/> A</h4>' +
      '<h3 class="Section1"><strong>2. gr .<br/> B</strong></h3>' +
      '<h4 class="Section1"><span>3. gr. - CC</span></h4>' + // h3.Section1 og h4.Section1 er alltaf significant!
      '<h4 class="Section1">B</h4>' + // leftover "Section1" class-names are removed
      '',
    expected:
      '<h3 class="article__title">7. gr.</h3>' +
      '<h2 class="chapter__title">I. KAFLI</h2>' +
      '<h3 class="article__title">9. gr.</h3>' +
      '<h3 class="article__title">1. gr. <em class="article__name">A</em></h3>' +
      '<h3 class="article__title">2. gr. <em class="article__name">B</em></h3>' +
      '<h3 class="article__title">3. gr. <em class="article__name">CC</em></h3>' +
      '<h4>B</h4>' +
      '',
  },

  'Finds article__title and article__name based on class-name': {
    input:
      '<p class="Grein">1. gr .</p>' +
      '<p class="grein">101. gr .</p>' +
      '<p class="Grein" align="center">I. Kafli</p>' + // class="Grein" trumps content-guessing
      '<p class="Grein">3. gr</p>' +
      '<p align="center">A</p>' +
      '<p align="center">4. gr.</p>' +
      '<p class="Greinaheiti">B</p>' +
      '<p align="center">104. gr.</p>' +
      '<p class="greinaheiti">B2</p>' +
      '',
    expected:
      '<h3 class="article__title">1. gr.</h3>' +
      '<h3 class="article__title">101. gr.</h3>' +
      '<h3 class="article__title">I. Kafli</h3>' +
      '<h3 class="article__title">3. gr. <em class="article__name">A</em></h3>' +
      '<h3 class="article__title">4. gr. <em class="article__name">B</em></h3>' +
      '<h3 class="article__title">104. gr. <em class="article__name">B2</em></h3>' +
      '',
  },

  'Finds chapter__title and chapter__name based on class-name': {
    input:
      '<p class="Kafli">I. Kafli</p>' +
      '<p class="Kafli">3. gr</p>' + // className trumps content
      '<p align="center">II. Kafli</p>' +
      '<p class="Kaflaheiti">4. gr</p>' + // className trumps content
      '',
    expected:
      '<h2 class="chapter__title">I. Kafli</h2>' +
      '<h2 class="chapter__title">3. gr</h2>' +
      '<h2 class="chapter__title">II. Kafli <em class="chapter__name">4. gr</em></h2>' +
      '',
  },

  'Auto-guess provisional articles': {
    input:
      '<div style="text-align:center">Ákvæði til bráðabirgða .</div>' +
      '<p align="center"><em>ÁKVÆÐI TIL BRÁÐABIRGÐA</em></p>' +
      '',
    expected:
      '<h3 class="article__title article__title--provisional">Ákvæði til bráðabirgða.</h3>' +
      '<h3 class="article__title article__title--provisional">ÁKVÆÐI TIL BRÁÐABIRGÐA.</h3>' +
      '',
  },

  'Auto-guesses simple chapter': {
    input:
      '<p align="center" style="&#39;text-align:center;tab-stops:-72.0pt" right="right"><span lang="IS">I. kafli.</span></p>' +
      '<p align="center">II. Um skipulag kirkjugarða</p>' +
      '<p align="center">III.  Kafli.  </p>' +
      '<p align="center">A B</p>' +
      '<p style="text-align:  center">V. Kafli</p>' +
      '<p align="center">X. Kafli</p>' +
      '<p align="center">XIV. Kafli</p>' +
      '<p>VI. Kafli.</p>' +
      '<p align="center">IIV. Kafli.</p>' + // invalid roman numeral
      '',
    expected:
      '<h2 class="chapter__title">I. kafli.</h2>' +
      '<h2 class="chapter__title">II. Um skipulag kirkjugarða</h2>' +
      '<h2 class="chapter__title">III. Kafli. <em class="chapter__name">A B</em></h2>' +
      '<h2 class="chapter__title">V. Kafli</h2>' +
      '<h2 class="chapter__title">X. Kafli</h2>' +
      '<h2 class="chapter__title">XIV. Kafli</h2>' +
      '<p>VI. Kafli.</p>' +
      '<p align="center">IIV. Kafli.</p>' +
      '',
  },

  'Auto-guess complex chapter title and article title together': {
    input:
      '<div align="center"> <strong>II. Nafn.</strong><br /> 8. gr.</div>' +
      '<div align="center">V. Kafli  <strong><br/> Nafn</strong><br /> 12. gr.</div>' +
      '<div align="center"><strong>IX. Foo <br />ABC.</strong></div>' +
      '',
    expected:
      '<h2 class="chapter__title">II. Nafn.</h2>' +
      '<h3 class="article__title">8. gr.</h3>' +
      '<h2 class="chapter__title">V. Kafli <em class="chapter__name">Nafn</em></h2>' +
      '<h3 class="article__title">12. gr.</h3>' +
      '<h2 class="chapter__title">IX. Foo <em class="chapter__name">ABC.</em></h2>' +
      '',
  },

  'Auto-guess decimal number-based chapter title': {
    input:
      '<div align="center">1. Kafli</div>' +
      '<div align="center">1b. Kafli</div>' +
      '<div align="center"><strong>9. Kafli</strong></div>' +
      '<div align="center">30. Kafli  <strong><br/> Nafn</strong><br /> 12b. gr.</div>' +
      '<p>...</p>' + // to seperate the below negatives for the chapter__name auto-guesser
      '<div align="center"> <strong>1. Nafn.</strong><br /> 8. gr.</div>' + // must be "kafli"
      '',
    expected:
      '<h2 class="chapter__title">1. Kafli</h2>' +
      '<h2 class="chapter__title">1b. Kafli</h2>' +
      '<h2 class="chapter__title">9. Kafli</h2>' +
      '<h2 class="chapter__title">30. Kafli <em class="chapter__name">Nafn</em></h2>' +
      '<h3 class="article__title">12b. gr.</h3>' +
      '<p>...</p>' +
      '<p align="center"><strong>1. Nafn.</strong><br /> 8. gr.</p>' +
      '',
  },

  'Auto-guess appendix chapters': {
    input:
      '<div align="center">VIÐAUKI<br /><strong>A B C</strong></div>' +
      '<div align="center"><strong>Viðauki <br /> D</strong></div>' +
      '<p align="center">Viðauki .</p>' +
      '',
    expected:
      '<h2 class="chapter__title chapter__title--appendix">VIÐAUKI <em class="chapter__name">A B C</em></h2>' +
      '<h2 class="chapter__title chapter__title--appendix">Viðauki <em class="chapter__name">D</em></h2>' +
      '<h2 class="chapter__title chapter__title--appendix">Viðauki.</h2>' +
      '',
  },

  'Also checks H2, H3, etc. for article/chapter titles/names': {
    input:
      '<h2 align="center" style="&#39;text-align:center;tab-stops:110.85pt" right="right" left="left" right="right"><span lang="IS">1. gr.</span></h2>' +
      '<h3 style="text-align:  center">7. gr .</h3>' +
      '<h4 style="text-align:  center">9. gr</h4>' +
      '<h2 align="center" style="&#39;text-align:center;tab-stops:-72.0pt" right="right"><span lang="IS">I. kafli.</span></h2>' +
      '<h3 align="center">II. Um skipulag kirkjugarða</h3>' +
      '<h3 class="Kaflaheiti">BBB</h3>' +
      '<h4 align="center">III.  Kafli.  </h4>' +
      '',
    expected:
      '<h3 class="article__title">1. gr.</h3>' +
      '<h3 class="article__title">7. gr.</h3>' +
      '<h3 class="article__title">9. gr.</h3>' +
      '<h2 class="chapter__title">I. kafli.</h2>' +
      '<h2 class="chapter__title">II. Um skipulag kirkjugarða <em class="chapter__name">BBB</em></h2>' +
      '<h2 class="chapter__title">III. Kafli.</h2>' +
      '',
  },

  // ===========================================================================
  // Top and bottom related parsing

  'Normalizes signature-related tag- and class-names': {
    input:
      '<p class="undirritun1">A</p>' +
      '<p class="undirritun2">B</p>' +
      '<p class="fhundirskr">C</p>' +
      '<h3 class="Dags" align="center">D 2020</h3>' +
      '<h4 class="FHUndirskr" align="center">E</h4>' +
      '<h5 class="Undirritun1" align="center">F</h5>' +
      '<h6 class="Undirritun2" align="right">G</h6>' +
      '',
    expected:
      '<p class="Undirritun">A</p>' +
      '<p class="Undirritun">B</p>' +
      '<p class="FHUndirskr">C</p>' +
      '<p class="Dags" align="center">D 2020</p>' +
      '<p class="FHUndirskr" align="center">E</p>' +
      '<p class="Undirritun" align="center">F</p>' +
      '<p class="Undirritun" align="right">G</p>' +
      '',
  },

  'Guesses class="Dags" based on text content': {
    input:
      '<p align="center">Félagsmálaráðuneytinu, 12. febrúar 1999</p>' +
      '<p align="center">Félagsmálaráðuneytinu, 12. apríl 1980.</p>' +
      '<p align="center">Félagsmálaráðuneytið, 30. júní 1932,</p>' +
      '<p align="center"><em>Umhverfis- og auðlindaráðuneytinu, 29. nóvember 2017.</em></p>' +
      '<p align="center"><em>Umhverfis- og auðlindaráðuneytinu, 29. nóvember 2017,</em><br/>f.h.r.</p>' + // too complex don't touch!
      '',
    expected:
      '<p class="Dags" align="center">Félagsmálaráðuneytinu, 12. febrúar 1999</p>' +
      '<p class="Dags" align="center">Félagsmálaráðuneytinu, 12. apríl 1980.</p>' +
      '<p class="Dags" align="center">Félagsmálaráðuneytið, 30. júní 1932,</p>' +
      '<p class="Dags" align="center"><em>Umhverfis- og auðlindaráðuneytinu, 29. nóvember 2017.</em></p>' +
      '<p align="center"><em>Umhverfis- og auðlindaráðuneytinu, 29. nóvember 2017,</em><br/> f.h.r.</p>' + // too complex don't touch!
      '',
  },

  'Removes class="Dags" if text does not contain a year': {
    input:
      '<p class="Dags" align="center">Lorem ipsum</p>' +
      '<p class="Dags" align="center">Something 1975 something</p>' +
      '',
    expected:
      '<p align="center">Lorem ipsum</p>' +
      '<p class="Dags" align="center">Something 1975 something</p>' +
      '',
  },

  'Guesses `FHUndirskr` markers': {
    input:
      '<p align="center">F.h.r.</p>' +
      '<p align="right">F. h. r.</p>' +
      '<p align="center">F. h. r</p>' +
      '<h5 align="center">F. H. R.</h5>' +
      '<p class="Dags" align="center">F. h. r.</p>' +
      '<p align="center">F. h. ferðamála-, iðnaðar- og nýsköpunarráðherra,</p>' +
      '<p align="center">F.h. fjármálaráðherra</p>' +
      '<p>F.h. fjármálaráðherra</p>' + // does not have align="" attribute
      '',
    expected:
      '<p class="FHUndirskr" align="center">F.h.r.</p>' +
      '<p class="FHUndirskr" align="right">F. h. r.</p>' +
      '<p class="FHUndirskr" align="center">F. h. r</p>' +
      '<p class="FHUndirskr" align="center">F. H. R.</p>' +
      '<p class="FHUndirskr" align="center">F. h. r.</p>' +
      '<p class="FHUndirskr" align="center">F. h. ferðamála-, iðnaðar- og nýsköpunarráðherra,</p>' +
      '<p class="FHUndirskr" align="center">F.h. fjármálaráðherra</p>' +
      '<p>F.h. fjármálaráðherra</p>' +
      '',
  },

  'Detects `doc__title` via class-name': {
    input:
      '<p class="MsoTitle" align="center"><strong>ABC</strong></p>' +
      '<p class="MsoTitle">DEF</p>' + // align="center" gets added
      '<p class="MsoTitle" align="center">Ghi</p>' + // not in ALL CAPS
      '<p class="MsoTitle"><em>Jkl</em></p>' + // not in ALL CAPS
      '',
    expected:
      '<p class="doc__title" align="center"><strong>ABC</strong></p>' +
      '<p class="doc__title" align="center">DEF</p>' +
      '<p align="center">Ghi</p>' +
      '<p><em>Jkl</em></p>' +
      '',
  },

  'Removes span-wrapped spaces non-destructively': {
    input: '<p>A<span> </span>B</p>',
    expected: '<p>A B</p>',
  },

  ...universalTests,
});
