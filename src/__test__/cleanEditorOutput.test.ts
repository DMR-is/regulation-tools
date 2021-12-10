import { editorOutputCleaner, CleanerFn } from '../cleanupEditorOutput';
import {
	runCleanupFiletests,
	runCleanupMicroTests,
	universalTests,
} from './cleanup-test-utils';

// ---------------------------------------------------------------------------

runCleanupFiletests(editorOutputCleaner, {
	parentDir: __dirname + '/cleanEditorOutput',
	// filter: (fileNames) =>
	// 	fileNames
	// 		// .slice(0, 0)
	// 		.filter((fileName) => fileName === '2015-0010.html'),
});

// ---------------------------------------------------------------------------

const cleanTwice: CleanerFn = (html) =>
	editorOutputCleaner(editorOutputCleaner(html));
cleanTwice.prettify = editorOutputCleaner.prettify;

runCleanupFiletests(cleanTwice, {
	parentDir: __dirname + '/cleanEditorOutput',
	// filter: (fileNames) =>
	// 	fileNames
	// 		// .slice(0, 0)
	// 		.filter((fileName) => fileName === '2015-0010.html'),
});

// ---------------------------------------------------------------------------

runCleanupMicroTests(editorOutputCleaner, {
	'Collapses spaces between block-level elements': {
		input: '<p>A\t&nbsp;</p> <br/> \t<p>B</p>\n\n <p>C</p>',
		expected: '<p>A</p><p>B</p><p>C</p>',
	},

	'Pushes data-legacy-indenters outside elements just like any other space': {
		input:
			'<p>G<span data-legacy-indenter="">   </span></p>' +
			'<p><span data-legacy-indenter="">   </span> H</p>' +
			'<p><strong><span data-legacy-indenter="">   </span> </strong>I</p>' +
			'',
		expected:
			'<p>G</p>' +
			'<p><span data-legacy-indenter="">   </span>\nH</p>' +
			'<p><span data-legacy-indenter="">   </span>\nI</p>' +
			'',
	},

	'Normalizes article__title and article__name': {
		input:
			'<h3 class="article__title" align="center">1 gr. <em>A</em></h3>' +
			'<h2 class="chapter__title" style="text-align: center;">Kafli I. <em>B</em></h2>' +
			'<h2 class="section__title">1. HLUTI <em>E</em></h2>' +
			'<h3 class="article__title">2 gr. <b>C</b> <em><b>C1</b></em> <em>C2</em> C3</h3>' + // removes extra (non-em) elements and expand __name all the way to the end.
			'<h2 class="chapter__title">Kafli II. <b>D</b> <em><b>D1</b></em> <em>D2</em> D3</h2>' +
			'<h2 class="section__title">2. HLUTI <b>F</b> <em><b>F1</b></em> <em>F2</em> F3</h2>' +
			'<h2 class="subchapter__title">Undirkafli</h2>' +
			'<h2 class="subchapter__title">Undirkafli 2 <em>G</em></h2>' +
			'',
		expected:
			'<h3 class="article__title">1 gr. <em class="article__name">A</em></h3>' +
			'<h2 class="chapter__title">Kafli I. <em class="chapter__name">B</em></h2>' +
			'<h2 class="section__title">1. HLUTI <em class="section__name">E</em></h2>' +
			'<h3 class="article__title">2 gr. C <em class="article__name">C1 C2 C3</em></h3>' +
			'<h2 class="chapter__title">Kafli II. D <em class="chapter__name">D1 D2 D3</em></h2>' +
			'<h2 class="section__title">2. HLUTI F <em class="section__name">F1 F2 F3</em></h2>' +
			'<h2 class="subchapter__title">Undirkafli</h2>' +
			'<h2 class="subchapter__title">Undirkafli 2 <em class="subchapter__name">G</em></h2>' +
			'',
	},

	'Normalizes spacing before article__name/chapter__name': {
		input:
			'<h3 class="article__title">1 gr.<em>A</em></h3>' +
			'<h2 class="subchapter__title">Undirkafli<em>B</em></h2>' +
			'<h2 class="chapter__title">Kafli I.<em>C</em></h2>' +
			'<h2 class="section__title">Fyrsti hluti.<em>D</em></h2>' +
			'',
		expected:
			'<h3 class="article__title">1 gr. <em class="article__name">A</em></h3>' +
			'<h2 class="subchapter__title">Undirkafli <em class="subchapter__name">B</em></h2>' +
			'<h2 class="chapter__title">Kafli I. <em class="chapter__name">C</em></h2>' +
			'<h2 class="section__title">Fyrsti hluti. <em class="section__name">D</em></h2>' +
			'',
	},

	'Detects and cleans up footnote references': {
		input:
			'<p>A <sup class="footnote-reference"><a id="_ftnref1" href="#_ftn1">1</a>)</sup></p>',
		expected:
			'<p>A <sup class="footnote-reference"><a id="_ftnref1" href="#_ftn1">1</a>)</sup></p>',
	},

	'Detects and cleans up footnotes': {
		input:
			'<p class="footnote" id="ftn1">' +
			'<sup class="footnote__marker"><a id="_ftn1" href="#_ftnref1">1)</a></sup> ' +
			'CAS: Chemical Abstract Service - nafn sem gefið er upp í CAS Chemical Registry System.' +
			'</p>',
		expected:
			'<p class="footnote" id="ftn1">' +
			'<sup class="footnote__marker"><a id="_ftn1" href="#_ftnref1">1)</a></sup> ' +
			'CAS: Chemical Abstract Service - nafn sem gefið er upp í CAS Chemical Registry System.' +
			'</p>',
	},

	'Removes silly timestamps off the end of auto-uploaded images/files': {
		input:
			'<p><img src="https://files.reglugerd.is/files/2010/0123/AAA.1234.png?1614347821131" alt="A" /></p>' +
			'<p><img src="https://files.reglugerd.is/files/2010/0123/BBB.1234.png?some-other&_queryFILE_SERVER" alt="B" /></p>' +
			'<p><a href="https://files.reglugerd.is/files/2010/0123/CCC.1234.pdf?decafbad">C</a></p>' +
			'',
		expected:
			'<p><img src="https://files.reglugerd.is/files/2010/0123/AAA.1234.png" alt="A" /></p>' +
			'<p><img src="https://files.reglugerd.is/files/2010/0123/BBB.1234.png" alt="B" /></p>' +
			'<p><a href="https://files.reglugerd.is/files/2010/0123/CCC.1234.pdf">C</a></p>' +
			'',
	},
	'Pass local urls through unharmed, despite them being very, very bad practice "../../" ':
		{
			input:
				'<p><img src="../../files/2010/0123/AAA.1234.png?1614347821131" alt="A" /></p>' +
				'<p><a href="../files/2010/0123/BBB.1234.pdf?decafbad">B</a></p>' +
				'',
			expected:
				'<p><img src="../../files/2010/0123/AAA.1234.png?1614347821131" alt="A" /></p>' +
				'<p><a href="../files/2010/0123/BBB.1234.pdf?decafbad">B</a></p>' +
				'',
		},

	'Wraps bare text inside <blockquote> in a <p>': {
		input: '<blockquote>A<p>B</p>C</blockquote>',
		expected: '<blockquote><p>A</p><p>B</p><p>C</p></blockquote>',
	},

	...universalTests,
});
