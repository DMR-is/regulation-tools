import { readFileSync } from 'fs';
import { join } from 'path';

import { asDiv } from '../_cleanup/serverDOM';
import { execute as htmldiff } from '../htmldiff-js';
import { align } from '../_structuredDiff/align';
import { describeChanges } from '../_structuredDiff/describe';
import { parseSections } from '../_structuredDiff/parse';
import { isWellNested } from '../_structuredDiff/render';
import { getStructuredDiff } from '../structuredDiff';
import getStructuredDiffServer from '../structuredDiff-server';
import { HTMLText } from '../types';

const diff = (a: string, b: string) =>
  getStructuredDiff(a as HTMLText, b as HTMLText, { asDiv });

const blockOps = (a: string, b: string) =>
  diff(a, b)
    .sections.flatMap((s) => s.blocks)
    .map((op) => op.type);

const fixture = (date: string) =>
  readFileSync(
    join(__dirname, 'structuredDiff', '0678-2009', `${date}.html`),
    'utf8',
  ) as HTMLText;

// ---------------------------------------------------------------------------

describe('entry points', () => {
  it('structuredDiff-server is getStructuredDiff with jsdom built in', () => {
    const a = fixture('2018-10-31');
    const b = fixture('2019-01-05');
    expect(getStructuredDiffServer(a, b).diff).toBe(
      getStructuredDiff(a, b, { asDiv }).diff,
    );
  });
});

describe('parseSections', () => {
  it('splits on <h3> articles and numbered em-only sub-headings', () => {
    const sections = parseSections(
      '<h3 class="article__title">11. gr. <em class="article__name">Virki.</em></h3>' +
        '<p>Inngangur.</p>' +
        '<p><em>11.2 Lágspennuvirki.</em></p>' +
        '<p>Fyrsta.</p><ol><li>liður</li></ol><p>Önnur.</p>',
      asDiv,
    );
    expect(sections.map((s) => [s.key, s.label])).toEqual([
      ['gr:11', '11. gr.'],
      ['sub:11.2', '11.2. gr.'],
    ]);
    // A list belongs to the paragraph before it, so "Önnur." is 2. mgr.
    expect(sections[1]!.blocks.map((b) => [b.kind, b.mgr])).toEqual([
      ['paragraph', 1],
      ['list', 1],
      ['paragraph', 2],
    ]);
  });

  it('keys lettered articles apart from the article they follow', () => {
    const sections = parseSections(
      '<h3>24. gr. Brennsluver.</h3><p>a</p>' +
        '<h3>24. gr. a Gildissvið.</h3><p>b</p>' +
        '<h3>1. gr. Skilgreiningar.</h3><p>c</p>',
      asDiv,
    );
    expect(sections.map((s) => [s.key, s.label])).toEqual([
      ['gr:24', '24. gr.'],
      ['gr:24a', '24. gr. a'],
      ['gr:1', '1. gr.'],
    ]);
  });

  it('does not treat a definition paragraph as a sub-heading', () => {
    const [section] = parseSections(
      '<p><em>Heildarskoðun:</em> Skoðun á öllum raflögnum.</p>',
      asDiv,
    );
    expect(section!.key).toBe('pre');
    expect(section!.blocks).toHaveLength(1);
  });
});

describe('align', () => {
  const same = (x: string, y: string) => x === y;
  const sim = (x: string, y: string) => (x[0] === y[0] ? 0.9 : 0);

  it('pairs a changed item and leaves unrelated ones as insert/delete', () => {
    expect(
      align(['a', 'b1', 'c'], ['a', 'b2', 'x', 'c'], same, sim, 0.5),
    ).toEqual([
      { type: 'equal', a: 0, b: 0 },
      { type: 'modify', a: 1, b: 1 },
      { type: 'insert', b: 2 },
      { type: 'equal', a: 2, b: 3 },
    ]);
  });
});

// ---------------------------------------------------------------------------

describe('getStructuredDiff', () => {
  // The case the word-level diff gets wrong: a new paragraph that shares
  // most of its words with its neighbours.
  const old =
    '<p>Hleðslustöð: Raffang sem hleður rafknúin ökutæki.</p>' +
    '<p>Venjuleg hleðslustöð: Hleðslustöð þar sem mögulegt er að yfirfæra raforku með afli sem er 22 kW eða minna.</p>';
  const neu =
    '<p>Hleðslustöð: Raffang sem hleður rafknúin ökutæki.</p>' +
    '<p>Hraðhleðslustöð: Hleðslustöð þar sem mögulegt er að yfirfæra raforku með afli sem er meira en 22 kW.</p>' +
    '<p>Venjuleg hleðslustöð: Hleðslustöð þar sem mögulegt er að yfirfæra raforku með afli sem er 22 kW eða minna.</p>';

  it('sees a new paragraph that shares words with its neighbours as one insert', () => {
    expect(blockOps(old, neu)).toEqual(['equal', 'insert', 'equal']);
    expect(describeChanges(diff(old, neu))).toEqual([
      'Á eftir 1. mgr. (inngangur) kemur ný málsgrein.',
    ]);
  });

  it('pairs a reworded paragraph as modify and word-diffs only inside it', () => {
    const d = diff(
      '<p>Eindagi er 10. dagur mánaðar.</p><p>Óbreytt.</p>',
      '<p>Eindagi er 15. dagur næsta mánaðar.</p><p>Óbreytt.</p>',
    );
    expect(d.sections[0]!.blocks.map((b) => b.type)).toEqual([
      'modify',
      'equal',
    ]);
    expect(d.diff).toContain('<p>Óbreytt.</p>');
    expect(d.diff).toContain('<ins class="diffins">');
  });

  it('keeps an unrelated paragraph in the same position as one replace', () => {
    const d = diff(
      '<p>Gamall texti um eitt.</p><p>Óbreytt.</p>',
      '<p>Allt annað efni hér.</p><p>Óbreytt.</p>',
    );
    const ops = d.sections[0]!.blocks;
    expect(ops.map((b) => b.type)).toEqual(['replace', 'equal']);
    // Nothing in common: shown as whole-block delete + insert.
    expect(ops[0]!.diff).toBe(
      '<p><del class="diffdel">Gamall texti um eitt.</del></p>' +
        '<p><ins class="diffins">Allt annað efni hér.</ins></p>',
    );
    expect(describeChanges(d)).toEqual(['1. mgr. (inngangur) orðast svo.']);
  });
});

// ---------------------------------------------------------------------------
// Cases the word-level getDiff used to handle better.

describe('loose top-level text', () => {
  it('is kept and diffed, never dropped', () => {
    const d = diff(
      '<p>Fyrsta.</p>Laus texti án p.<p>Annað.</p>',
      '<p>Fyrsta.</p>Laus texti breyttur.<p>Annað.</p>',
    );
    const ops = d.sections[0]!.blocks;
    expect(ops.map((b) => [b.type, b.new?.kind])).toEqual([
      ['equal', 'paragraph'],
      ['modify', 'text'],
      ['equal', 'paragraph'],
    ]);
    expect(d.diff).toContain(
      'Laus texti <del class="diffmod">án p</del><ins class="diffmod">breyttur</ins>.',
    );
    expect(isWellNested(d.diff)).toBe(true);
  });

  it('keeps inline markup in a loose run together, and counts it as a paragraph', () => {
    const [section] = parseSections(
      'Laus <em>texti</em> hér.<br>Meira.<p>Næsta.</p>',
      asDiv,
    );
    expect(section!.blocks.map((b) => [b.kind, b.mgr, b.text])).toEqual([
      ['text', 1, 'Laus texti hér.Meira.'],
      ['paragraph', 2, 'Næsta.'],
    ]);
  });

  it('shows wrapping loose text in a <p> as a format change', () => {
    const op = diff('Texti hér.', '<p>Texti hér.</p>').sections[0]!.blocks[0]!;
    expect([op.type, op.change]).toEqual(['modify', 'format']);
  });

  it('is marked when a whole loose run is inserted', () => {
    const d = diff('<p>Fyrsta.</p>', '<p>Fyrsta.</p>Ný laus lína.');
    expect(d.diff).toContain('<ins class="diffins">Ný laus lína.</ins>');
  });
});

describe('split and merge', () => {
  const A =
    'Umsókn skal send til stofnunarinnar á rafrænu formi ásamt fylgigögnum.';
  const B =
    'Stofnunin skal afgreiða umsóknina innan fjögurra vikna frá móttöku hennar.';

  it('sees one paragraph split in two', () => {
    const d = diff(
      `<p>${A} ${B}</p><p>Óbreytt.</p>`,
      `<p>${A}</p><p>${B}</p><p>Óbreytt.</p>`,
    );
    const [op] = d.sections[0]!.blocks;
    expect(op!.type).toBe('split');
    expect(op!.newBlocks!.map((b) => b.text)).toEqual([A, B]);
    // No sentence shown as both deleted and re-inserted.
    expect(op!.diff).not.toContain(
      'afgreiða umsóknina innan fjögurra vikna frá móttöku hennar.</del>',
    );
    expect(isWellNested(d.diff)).toBe(true);
    expect(describeChanges(d)).toEqual([
      '1. mgr. (inngangur) skiptist í 2 málsgreinar.',
    ]);
  });

  it('sees two paragraphs merged into one', () => {
    const d = diff(`<p>${A}</p><p>${B}</p>`, `<p>${A} ${B}</p>`);
    const [op] = d.sections[0]!.blocks;
    expect(op!.type).toBe('merge');
    expect(op!.oldBlocks!.map((b) => b.mgr)).toEqual([1, 2]);
    expect(op!.diff).not.toContain(
      'afgreiða umsóknina innan fjögurra vikna frá móttöku hennar.</del>',
    );
    expect(describeChanges(d)).toEqual([
      '1. og 2. mgr. (inngangur) sameinast í eina málsgrein.',
    ]);
  });

  it('sees a split with a small edit', () => {
    const [op] = diff(
      `<p>${A} ${B}</p>`,
      `<p>${A}</p><p>${B.replace('fjögurra', 'sex')}</p>`,
    ).sections[0]!.blocks;
    expect(op!.type).toBe('split');
    expect(op!.diff).toContain(
      '<del class="diffmod">fjögurra</del><ins class="diffmod">sex</ins>',
    );
  });

  it('keeps a reworded paragraph plus an unrelated new one as modify + insert', () => {
    const ops = diff(
      `<p>${A}</p>`,
      `<p>${A.replace(
        'rafrænu',
        'stafrænu',
      )}</p><p>Algjörlega ný málsgrein um annað efni.</p>`,
    ).sections[0]!.blocks.map((b) => b.type);
    expect(ops).toEqual(['modify', 'insert']);
  });
});

describe('heavy rewrite in the same position', () => {
  const OLD =
    'Umsókn skal send til stofnunarinnar á rafrænu formi ásamt öllum fylgigögnum sem tilgreind eru í viðauka.';
  const NEW =
    'Umsækjandi skal senda umsókn til ráðuneytisins á pappír, og skulu fylgigögn sem tilgreind eru fylgja.';

  it('stays a replace, shown as a word diff when enough words are shared', () => {
    const [op] = diff(`<p>${OLD}</p>`, `<p>${NEW}</p>`).sections[0]!.blocks;
    expect(op!.type).toBe('replace');
    // Word-level: shared words stand unmarked inside one paragraph.
    expect(op!.diff).toMatch(/^<p>/);
    expect(op!.diff).toContain(' sem tilgreind eru ');
    expect(isWellNested(op!.diff!)).toBe(true);
  });

  it('calls a long phrase deleted an edit, not a replace, as 0785/2014 2. mgr. 9.4. gr.', () => {
    const d = diff(
      '<p>Ágreining um gjaldskyldu eða gjaldstofn samkvæmt þessari grein má bera undir úrskurðarnefnd skipulags- og byggingarmála, að því undanskildu að ágreining um gjaldskyldu eða gjaldstofn vegna þeirra raffanga er heyra undir markaðseftirlit Neytendastofu má bera undir áfrýjunarnefnd neytendamála.</p>',
      '<p>Ágreining um gjaldskyldu eða gjaldstofn samkvæmt þessari grein má bera undir úrskurðarnefnd umhverfis- og auðlindamála.</p>',
    );
    const [op] = d.sections[0]!.blocks;
    expect([op!.type, op!.change]).toEqual(['modify', 'text']);
    expect(describeChanges(d)).toEqual([
      '1. mgr. (inngangur) breytist (orðalag).',
    ]);
  });

  it('shows whole-block delete + insert when only filler words are shared', () => {
    const [op] = diff(
      '<p>Ráðherra skal birta auglýsingu um gjaldskrána.</p>',
      '<p>Eftirlitsaðili skal hafa aðgang að gögnum fyrirtækisins.</p>',
    ).sections[0]!.blocks;
    expect(op!.type).toBe('replace');
    expect(op!.diff).toContain('<del class="diffdel">Ráðherra');
    expect(op!.diff).toContain('<ins class="diffins">Eftirlitsaðili');
  });

  it('never pairs two different defined terms, as 1055/2017 "Seljandi" → "Setning á markað"', () => {
    const d = diff(
      '<p><em>Rekstraraðili:</em> Óbreytt.</p>' +
        '<p><em>Seljandi:</em> Framleiðandi raffangs, umboðsmaður framleiðanda eða innflytjandi.</p>',
      '<p><em>Rekstraraðili:</em> Óbreytt.</p>' +
        '<p><em>Setning á markað:</em> Það að raffang er boðið fram í fyrsta sinn á markaði.</p>',
    );
    expect(d.sections[0]!.blocks.map((b) => b.type)).toEqual([
      'equal',
      'delete',
      'insert',
    ]);
  });

  it('pairs the same term redefined as a replace', () => {
    const [, op] = diff(
      '<p><em>A:</em> x.</p><p><em>Innri öryggisstjórnun:</em> Sjá öryggisstjórnun.</p>',
      '<p><em>A:</em> x.</p><p><em>Innri öryggisstjórnun:</em> Skilgreint eftirlitskerfi til að tryggja gæði vinnu.</p>',
    ).sections[0]!.blocks;
    expect(op!.type).toBe('replace');
    expect(op!.old!.term).toBe('Innri öryggisstjórnun');
  });

  it('pairs a redefined term even among other new definitions, as 1055/2017 "Innri öryggisstjórnun"', () => {
    const ops = diff(
      '<p><em>Faggilding:</em> Óbreytt.</p>' +
        '<p><em>Innri öryggisstjórnun:</em> Sjá öryggisstjórnun.</p>' +
        '<p><em>Landsskrá:</em> Óbreytt.</p>',
      '<p><em>Faggilding:</em> Óbreytt.</p>' +
        '<p><em>Framleiðandi:</em> Einstaklingur eða lögaðili sem framleiðir rafföng.</p>' +
        '<p><em>Innflytjandi:</em> Einstaklingur eða lögaðili með staðfestu á Íslandi.</p>' +
        '<p><em>Innri öryggisstjórnun:</em> Skilgreint eftirlitskerfi til að tryggja gæði vinnu.</p>' +
        '<p><em>Landsskrá:</em> Óbreytt.</p>',
    ).sections[0]!.blocks.map((b) => [b.type, b.new?.term ?? b.old?.term]);
    expect(ops).toEqual([
      ['equal', 'Faggilding'],
      ['insert', 'Framleiðandi'],
      ['insert', 'Innflytjandi'],
      ['replace', 'Innri öryggisstjórnun'],
      ['equal', 'Landsskrá'],
    ]);
  });

  it('pairs a lightly edited redefinition as modify', () => {
    const redef = diff(
      '<p><em>A:</em> x.</p>' +
        '<p><em>Innflytjandi:</em> Einstaklingur eða lögaðili með staðfestu innan EES sem setur rafföng á markað.</p>',
      '<p><em>A:</em> x.</p><p><em>B:</em> Ný.</p>' +
        '<p><em>Innflytjandi:</em> Einstaklingur eða lögaðili með staðfestu á Íslandi sem setur rafföng á markað.</p>',
    ).sections[0]!.blocks.find((b) => b.new?.term === 'Innflytjandi');
    expect(redef!.type).toBe('modify');
  });

  it('pairs by position only when both sides have the same number of blocks', () => {
    const ops = diff(
      '<p>Gamall texti um eitt.</p>',
      '<p>Allt annað efni hér.</p><p>Og enn önnur ný lína.</p>',
    ).sections[0]!.blocks.map((b) => b.type);
    expect(ops).toEqual(['delete', 'insert', 'insert']);
  });
});

describe('renumbering', () => {
  const sub = (n: string, title: string, body: string) =>
    `<p><em>${n} ${title}</em></p><p>${body}</p>`;

  it('pairs sub-articles by title when a new one shifts the numbers, as 1055/2017 7.6 → 7.7', () => {
    const d = diff(
      sub('7.5', 'Markaðssetning.', 'Texti um markaðssetningu raffanga.') +
        sub(
          '7.6',
          'Opinber markaðsgæsla.',
          'Mannvirkjastofnun annast markaðseftirlit.',
        ) +
        sub('7.7', 'Markaðsskoðun.', 'Skoðun og rannsókn raffanga.'),
      sub('7.5', 'Markaðssetning.', 'Texti um markaðssetningu raffanga.') +
        sub(
          '7.6',
          'ESB-samræmisyfirlýsing.',
          'Ný grein um samræmisyfirlýsingu.',
        ) +
        sub(
          '7.7',
          'Opinber markaðsgæsla.',
          'Mannvirkjastofnun annast markaðseftirlit.',
        ) +
        sub('7.8', 'Markaðsskoðun.', 'Skoðun og rannsókn raffanga.'),
    );
    expect(
      d.sections.map((s) => [
        s.type,
        s.old?.label,
        s.new?.label,
        !!s.renumbered,
      ]),
    ).toEqual([
      ['equal', '7.5. gr.', '7.5. gr.', false],
      ['insert', undefined, '7.6. gr.', false],
      ['modify', '7.6. gr.', '7.7. gr.', true],
      ['modify', '7.7. gr.', '7.8. gr.', true],
    ]);
    // Only the number changed: no paragraph ops, no heading change, no moves.
    expect(d.sections[2]!.blocks.map((b) => b.type)).toEqual(['equal']);
    expect(d.sections[2]!.headingChanged).toBe(false);
    expect(describeChanges(d)).toEqual([
      'Á eftir 7.5. gr. kemur ný grein, 7.6. gr.',
      '7.6. gr. verður 7.7. gr.',
      '7.7. gr. verður 7.8. gr.',
    ]);
  });

  it('reads multi-level article numbers, so a changed title is not a renumbering, as 0112/2012 6.12.8. gr.', () => {
    const d = diff(
      '<h3 class="article__title">6.12.8. gr. <em>Sorpgerði, sorpskýli og neðanjarðar sorplausnir.</em></h3><p>Texti.</p>',
      '<h3 class="article__title">6.12.8. gr. <em>Sorpgerði og sorpskýli.</em></h3><p>Texti.</p>',
    );
    expect(
      d.sections.map((s) => [
        s.old?.label,
        s.new?.label,
        s.renumbered,
        s.headingChanged,
      ]),
    ).toEqual([['6.12.8. gr.', '6.12.8. gr.', false, true]]);
  });

  it('keys chapters by number, roman or dotted', () => {
    const chapter = (h: string) =>
      `<h2 class="chapter__title">${h}</h2><p>Texti um efnið hér.</p>`;
    const same = diff(
      chapter('V. KAFLI <em>Aðgerðir eftir kröfu.</em>'),
      chapter('V. KAFLI <em>Málsmeðferð eftir kröfu.</em>'),
    );
    expect([
      same.sections[0]!.old!.label,
      same.sections[0]!.renumbered,
      same.sections[0]!.headingChanged,
    ]).toEqual(['V. kafli', false, true]);
    const moved = diff(
      chapter('IV. KAFLI <em>Heilsugæslustöðvar.</em>'),
      chapter('V. KAFLI <em>Heilsugæslustöðvar.</em>'),
    );
    expect([moved.sections[0]!.renumbered, describeChanges(moved)]).toEqual([
      true,
      ['IV. kafli verður V. kafli'],
    ]);
    const dotted = parseSections(
      '<h2 class="chapter__title">1.1. KAFLI <em>Markmið.</em></h2><h2 class="section__title">1. HLUTI ALMENN ÁKVÆÐI</h2>',
      asDiv,
    );
    expect(dotted.map((s) => [s.key, s.label])).toEqual([
      ['h2:kafli:1.1', '1.1. kafli'],
      ['h2:hluti:1', '1. hluti'],
    ]);
  });

  it('still pairs a same-numbered article whose title and body were both rewritten', () => {
    const d = diff(
      '<h3>1. gr. <em>Gildissvið.</em></h3><p>Reglugerðin gildir um rafföng.</p>',
      '<h3>1. gr. <em>Markmið.</em></h3><p>Markmið reglugerðarinnar er öryggi fólks.</p>',
    );
    expect(
      d.sections.map((s) => [s.type, s.headingChanged, s.renumbered]),
    ).toEqual([['modify', true, false]]);
  });

  it('matches untitled articles by number', () => {
    const d = diff(
      '<h3>1. gr.</h3><p>Fyrsta.</p><h3>2. gr.</h3><p>Önnur.</p>',
      '<h3>1. gr.</h3><p>Fyrsta.</p><h3>2. gr.</h3><p>Önnur breytt.</p>',
    );
    expect(d.sections.map((s) => [s.type, s.old?.label, s.new?.label])).toEqual(
      [
        ['equal', '1. gr.', '1. gr.'],
        ['modify', '2. gr.', '2. gr.'],
      ],
    );
  });
});

describe('signature block', () => {
  const body =
    '<h3>47. gr. <em>Gildistaka.</em></h3><p>Reglugerð þessi öðlast þegar gildi.</p>';
  const signature =
    '<p class="Dags" align="center"><em>Fjármála- og efnahagsráðuneytinu, 27. október 2017.</em></p>' +
    '<p class="FHUndirskr" align="center">F. h. r.</p>' +
    '<p align="center"><strong>Sigurður H. Helgason.</strong></p>' +
    '<p align="right"><em>Hrafn Hlynsson.</em></p>';

  it('is its own section, not paragraphs of the last article', () => {
    const sections = parseSections(body + signature, asDiv);
    expect(
      sections.map((s) => [s.label, s.signature, s.blocks.length]),
    ).toEqual([
      ['47. gr.', undefined, 1],
      ['Undirritun', true, 4],
    ]);
  });

  it('is shown deleted, as 0950/2017, but left out of the amending phrases', () => {
    const d = diff(body + signature, body);
    expect(d.diff).toContain(
      '<p class="Dags" align="center" data-diff="delete" data-diff-mgr="1" data-diff-signature="true" data-diff-side="old"><del class="diffdel"><em>Fjármála- og efnahagsráðuneytinu, 27. október 2017.</em></del></p>',
    );
    expect(describeChanges(d)).toEqual([]);
  });

  it('recognises an unclassed date line by its text', () => {
    const [, sig] = parseSections(
      body + '<p><em>Umhverfisráðuneytinu, 29. júlí 2009.</em></p><p>Nafn.</p>',
      asDiv,
    );
    expect(sig!.signature).toBe(true);
  });
});

describe('list items', () => {
  const items = (...xs: Array<string>) =>
    xs.map((x) => `<li>${x}</li>`).join('');
  const A =
    'Reglugerð (ESB) nr. 1 um lofthæfi loftfara og tengdra framleiðsluvara.';
  const B = 'Reglugerð (ESB) nr. 2 um breytingu á reglugerð nr. 1 um lofthæfi.';
  const C =
    'Reglugerð (ESB) nr. 3 um framkvæmd hönnunar- og framleiðslufyrirtækja.';

  it('sees a new töluliður as one inserted item, as 0380/2013', () => {
    const d = diff(
      `<p>Innleiddar eru:</p><ol>${items(A, B)}</ol>`,
      `<p>Innleiddar eru:</p><ol>${items(A, B, C)}</ol>`,
    );
    const op = d.sections[0]!.blocks[1]!;
    expect(op.items!.map((i) => [i.type, i.old?.item ?? i.new?.item])).toEqual([
      ['equal', 1],
      ['equal', 2],
      ['insert', 3],
    ]);
    expect(op.diff).toBe(
      `<ol>${items(
        A,
        B,
      )}<li data-diff="insert" data-diff-after-item="2" data-diff-side="new"><ins class="diffins">${C}</ins></li></ol>`,
    );
    expect(describeChanges(d)).toEqual([
      'Á eftir 2. tölul. 1. mgr. (inngangur) kemur nýr töluliður.',
    ]);
  });

  it('names deleted and changed items, lettered lists as stafliðir', () => {
    const d = diff(
      `<p>Skilyrði:</p><ol type="a">${items(A, B, C)}</ol>`,
      `<p>Skilyrði:</p><ol type="a">${items(
        A.replace('lofthæfi', 'lofthæfni'),
        C,
      )}</ol>`,
    );
    expect(describeChanges(d)).toEqual([
      'a-liður 1. mgr. (inngangur) breytist.',
      'b-liður 1. mgr. (inngangur) fellur brott.',
    ]);
  });

  it('word-diffs only the item that changed in a long list', () => {
    const many = Array.from(
      { length: 700 },
      (_, i) =>
        `Efni nr. ${i + 1} með lýsingu og skráningarnúmeri ${1000 + i}.`,
    );
    const changed = [...many];
    changed[350] = changed[350]!.replace('lýsingu', 'nákvæmri lýsingu');
    const op = diff(
      `<ol>${items(...many)}</ol>`,
      `<ol>${items(...changed)}</ol>`,
    ).sections[0]!.blocks[0]!;
    expect(
      op
        .items!.filter((i) => i.type !== 'equal')
        .map((i) => [i.type, i.new!.item]),
    ).toEqual([['modify', 351]]);
    expect((op.diff!.match(/<ins/g) || []).length).toBe(1);
  });
});

describe('sentences and word edits', () => {
  const OLD =
    'Gjalddagi gjaldsins er 15. dagur næsta mánaðar. Gjalddagi annarra gjalda er 20 dagar eftir dagsetningu reiknings. Eindagi er 10 dögum síðar. Dráttarvextir reiknast frá gjalddaga.';
  const NEW =
    'Gjalddagi gjaldsins er 15. dagur næsta mánaðar. Eindagi er 15. dagur næsta mánaðar eftir gjalddaga. Dráttarvextir reiknast frá gjalddaga.';

  it('reports changed sentences as amending text counts them, as 0494/2010 9.4. gr.', () => {
    const d = diff(`<p>${OLD}</p>`, `<p>${NEW}</p>`);
    const [op] = d.sections[0]!.blocks;
    expect(op!.sentences).toEqual([
      { type: 'replace', old: 2, new: 2 },
      { type: 'delete', old: 3, new: undefined },
    ]);
    expect(describeChanges(d)).toEqual([
      '2. málsl. 1. mgr. (inngangur) orðast svo.',
      '3. málsl. 1. mgr. (inngangur) fellur brott.',
    ]);
    const [attrs] = Array.from(asDiv(d.diff).children);
    expect(attrs!.getAttribute('data-diff-sentences')).toBe(
      'replace:2 delete:3',
    );
  });

  it('reports a sentence added at the end, as 1049/2020 "bætast tveir nýir málsliðir"', () => {
    const d = diff(
      '<p>Raflagnir skulu varðar með bilunarstraumsrofa.</p>',
      '<p>Raflagnir skulu varðar með bilunarstraumsrofa. Rofar skulu hæfa þeim straumi sem vænta má. Rofa af gerð AC skal ekki nota.</p>',
    );
    expect(d.sections[0]!.blocks[0]!.sentences).toEqual([
      { type: 'insert', new: 2, afterOld: 1 },
      { type: 'insert', new: 3, afterOld: 1 },
    ]);
    expect(describeChanges(d)).toEqual([
      'Við 1. mgr. (inngangur) bætast 2 nýir málsliðir.',
    ]);
  });

  it('lists word edits with their spaces and the word before them', () => {
    const [op] = diff(
      '<p>Eindagi er 10 dögum síðar samkvæmt ÍST 200:2006 og reglum.</p>',
      '<p>Eindagi er 15 dögum síðar samkvæmt ÍST HD 60364 og reglum.</p>',
    ).sections[0]!.blocks;
    expect(op!.edits).toEqual([
      { type: 'replace', old: '10', new: '15', before: 'er' },
      { type: 'replace', old: '200:2006', new: 'HD 60364', before: 'ÍST' },
    ]);
    expect(
      describeChanges(
        diff('<p>Sjá ÍST 200:2006 hér.</p>', '<p>Sjá ÍST HD 60364 hér.</p>'),
      ),
    ).toEqual(['Í stað „200:2006" í 1. mgr. (inngangur) kemur: HD 60364.']);
  });
});

describe('annotations: the operations in the diff HTML', () => {
  /** Each top-level element's data-diff attributes, as a consumer of the saved HTML reads them. */
  const read = (html: string) =>
    Array.from(asDiv(html).children).map((el) =>
      Object.fromEntries(
        Array.from(el.attributes)
          .filter((a) => a.name.startsWith('data-diff'))
          .map((a) => [a.name.replace('data-diff', 'd'), a.value]),
      ),
    );

  it('marks inserts, edits, replacements and untouched paragraphs', () => {
    const d = diff(
      '<h3>3. gr. <em>Umsóknir.</em></h3><p>Umsókn skal send rafrænt.</p><p>Gamall texti um eitt.</p><p>Óbreytt málsgrein.</p>',
      '<h3>3. gr. <em>Umsóknir.</em></h3><p>Umsókn skal send rafrænt til stofnunarinnar.</p><p>Allt annað efni hér.</p><p>Óbreytt málsgrein.</p><p>Ný málsgrein um frest.</p>',
    );
    expect(read(d.diff)).toEqual([
      { 'd-section': '3. gr.' },
      { d: 'modify', 'd-change': 'text', 'd-mgr': '1' },
      { d: 'replace', 'd-mgr': '2', 'd-side': 'old' },
      { d: 'replace', 'd-mgr': '2', 'd-side': 'new' },
      {},
      { d: 'insert', 'd-after-mgr': '3', 'd-side': 'new' },
    ]);
  });

  it('marks sub-headings as sections, and renumbering on the heading', () => {
    const d = diff(
      '<p><em>7.5 Markaðssetning.</em></p><p>Texti um markaðssetningu.</p><p><em>7.6 Opinber markaðsgæsla.</em></p><p>Eftirlit með rafföngum.</p>',
      '<p><em>7.5 Markaðssetning.</em></p><p>Texti um markaðssetningu.</p><p><em>7.6 Ný grein.</em></p><p>Alveg nýtt efni greinarinnar.</p><p><em>7.7 Opinber markaðsgæsla.</em></p><p>Eftirlit með rafföngum.</p>',
    );
    const headings = read(d.diff).filter((a) => a['d-section']);
    expect(headings).toEqual([
      { 'd-section': '7.5. gr.' },
      { 'd-section': '7.6. gr.', d: 'insert', 'd-side': 'new' },
      { 'd-section': '7.7. gr.', 'd-renumbered-from': '7.6. gr.' },
    ]);
  });

  it('marks both ends of a move with where the other end is', () => {
    const P =
      '<p>Þessi málsgrein fjallar um skyldur eftirlitsaðila og framkvæmd skoðana.</p>';
    const d = diff(
      `<h3>1. gr.</h3><p>Fyrsta.</p>${P}<h3>2. gr.</h3><p>Önnur.</p>`,
      `<h3>1. gr.</h3><p>Fyrsta.</p><h3>2. gr.</h3><p>Önnur.</p>${P}`,
    );
    expect(read(d.diff).filter((a) => a.d)).toEqual([
      { d: 'moved', 'd-mgr': '2', 'd-to': '2. gr., 2. mgr.', 'd-side': 'old' },
      { d: 'move', 'd-mgr': '2', 'd-from': '1. gr., 2. mgr.', 'd-side': 'new' },
    ]);
  });

  it('gives a merge every old paragraph number', () => {
    const A =
      'Umsókn skal send til stofnunarinnar á rafrænu formi ásamt fylgigögnum.';
    const B =
      'Stofnunin skal afgreiða umsóknina innan fjögurra vikna frá móttöku hennar.';
    const [first] = read(
      diff(`<p>${A}</p><p>${B}</p>`, `<p>${A} ${B}</p>`).diff,
    );
    expect(first).toMatchObject({ d: 'merge', 'd-mgr': '1,2' });
  });
});

describe('moves', () => {
  const VM =
    '<p><em>Vörumerki (trade mark):</em> Einkennismerki framleiðanda sem aðgreinir rafföng.</p>';
  const defs = (...terms: Array<string>) =>
    terms
      .map((t) => `<p><em>${t}:</em> Skilgreining á hugtakinu ${t}.</p>`)
      .join('');

  it('sees a definition moved into alphabetical order, as 1055/2017 "Vörumerki"', () => {
    const d = diff(
      defs('Virki', 'Vottun', 'Yfireftirlit', 'Öryggisstjórnun') + VM,
      defs('Virki', 'Vottun') + VM + defs('Yfireftirlit', 'Öryggisstjórnun'),
    );
    const ops = d.sections[0]!.blocks.filter((b) => b.type !== 'equal');
    expect(ops.map((b) => [b.type, b.movedFrom, b.movedTo])).toEqual([
      ['move', { label: '', mgr: 5 }, undefined],
      ['moved', undefined, { label: '', mgr: 3 }],
    ]);
    expect(d.diff).toContain('<ins class="diffmove">');
    expect(d.diff).toContain('<del class="diffmove">');
    expect(d.diff).not.toContain('diffins');
    expect(describeChanges(d)).toEqual([
      '5. mgr. (inngangur) færist og verður 3. mgr. (inngangur).',
    ]);
  });

  it('sees a paragraph moved to another article', () => {
    const P =
      '<p>Þessi málsgrein fjallar um skyldur eftirlitsaðila og framkvæmd skoðana.</p>';
    const d = diff(
      `<h3>1. gr.</h3><p>Fyrsta.</p>${P}<h3>2. gr.</h3><p>Önnur.</p>`,
      `<h3>1. gr.</h3><p>Fyrsta.</p><h3>2. gr.</h3><p>Önnur.</p>${P}`,
    );
    const moved = d.sections
      .flatMap((s) => s.blocks)
      .filter((b) => b.type === 'move' || b.type === 'moved');
    expect(moved.map((b) => [b.type, b.movedFrom ?? b.movedTo])).toEqual([
      ['moved', { label: '2. gr.', mgr: 2 }],
      ['move', { label: '1. gr.', mgr: 2 }],
    ]);
    expect(describeChanges(d)).toEqual([
      '2. mgr. 1. gr. færist og verður 2. mgr. 2. gr.',
    ]);
  });

  it('sees a moved-and-edited block, word-diffed at its new position', () => {
    const P =
      'Þessi málsgrein fjallar um skyldur eftirlitsaðila og framkvæmd reglulegra skoðana á virkjum.';
    const d = diff(
      `<h3>1. gr.</h3><p>${P}</p><h3>2. gr.</h3><p>Önnur.</p>`,
      `<h3>1. gr.</h3><h3>2. gr.</h3><p>Önnur.</p><p>${P.replace(
        'reglulegra',
        'árlegra',
      )}</p>`,
    );
    const move = d.sections
      .flatMap((s) => s.blocks)
      .find((b) => b.type === 'move')!;
    expect(move.change).toBe('text');
    expect(move.diff).toContain(
      '<del class="diffmod">reglulegra</del><ins class="diffmod">árlegra</ins>',
    );
    expect(isWellNested(d.diff)).toBe(true);
  });

  it('does not call a stock sentence that recurs across articles a move', () => {
    const STOCK =
      '<p>Húsnæðis- og mannvirkjastofnun skal gefa út leiðbeiningar um nánari útfærslu.</p>';
    const ops = diff(
      `<h3>1. gr.</h3><p>Fyrsta.</p>${STOCK}<h3>2. gr.</h3><p>Önnur.</p>${STOCK}<h3>3. gr.</h3><p>Þriðja.</p>`,
      `<h3>1. gr.</h3><p>Fyrsta.</p><h3>2. gr.</h3><p>Önnur.</p>${STOCK}<h3>3. gr.</h3><p>Þriðja.</p>${STOCK}`,
    )
      .sections.flatMap((s) => s.blocks)
      .map((b) => b.type);
    expect(ops).not.toContain('move');
  });

  it('leaves short lines as delete + insert', () => {
    const ops = diff(
      '<p>Sjá 2. gr.</p><p>Óbreytt málsgrein hér.</p>',
      '<p>Óbreytt málsgrein hér.</p><p>Sjá 2. gr.</p>',
    ).sections[0]!.blocks.map((b) => b.type);
    expect(ops).not.toContain('move');
  });
});

// ---------------------------------------------------------------------------
// Format changes: same text, different markup. getDiff misses all but the
// inline one, and on ol → ul emits mis-nested `<ol><ul>…</ol></ul>`.

describe('format changes', () => {
  const changeOf = (a: string, b: string) =>
    diff(a, b)
      .sections.flatMap((s) => s.blocks)
      .filter((op) => op.type !== 'equal')
      .map((op) => [op.type, op.change]);

  const list = (tag: string) =>
    `<p>Skilyrði:</p>${tag}<li>fyrsta</li><li>annað</li>${
      tag.startsWith('<ol') ? '</ol>' : '</ul>'
    }`;

  it('sees a numbered list becoming a bullet list', () => {
    expect(changeOf(list('<ol>'), list('<ul>'))).toEqual([
      ['modify', 'format'],
    ]);
  });

  it('sees töluliðir becoming stafliðir (ol type="a")', () => {
    const d = diff(list('<ol>'), list('<ol type="a">'));
    const op = d.sections[0]!.blocks[1]!;
    expect([op.type, op.change, op.old!.shape, op.new!.shape]).toEqual([
      'modify',
      'format',
      'ol(li)',
      'ol[type=a](li)',
    ]);
  });

  it('sees a paragraph gaining a class', () => {
    expect(
      changeOf('<p>Texti hér.</p>', '<p class="indented">Texti hér.</p>'),
    ).toEqual([['modify', 'format']]);
  });

  it('sees inline formatting change (em → strong)', () => {
    expect(
      changeOf(
        '<p><em>Heiti:</em> texti.</p>',
        '<p><strong>Heiti:</strong> texti.</p>',
      ),
    ).toEqual([['modify', 'format']]);
  });

  it('reports wording and format changing together as both', () => {
    expect(
      changeOf(list('<ol>'), list('<ul>').replace('annað', 'annað atriði')),
    ).toEqual([['modify', 'both']]);
  });

  it('treats a new list item as content, not formatting, as 0380/2013 "bætist nýr töluliður"', () => {
    const op = diff(
      '<ol><li>Reglugerð nr. 1.</li><li>Reglugerð nr. 2.</li></ol>',
      '<ol><li>Reglugerð nr. 1.</li><li>Reglugerð nr. 2.</li><li>Reglugerð nr. 3.</li></ol>',
    ).sections[0]!.blocks[0]!;
    expect([op.type, op.change]).toEqual(['modify', 'text']);
    // Only the new item is marked; the existing ones are not re-inserted.
    expect(op.diff).not.toContain('<del');
    expect(op.diff).toContain('Reglugerð nr. 3.');
  });

  it('still sees a list item gaining formatting', () => {
    expect(
      changeOf(
        '<ol><li>fyrsta</li><li>annað</li></ol>',
        '<ol><li>fyrsta</li><li><em>annað</em></li></ol>',
      ),
    ).toEqual([['modify', 'format']]);
  });

  it('ignores class order and attributes that carry no meaning', () => {
    expect(
      changeOf(
        '<p class="a b" style="color:red" id="x">Texti.</p>',
        '<p class="b a">Texti.</p>',
      ),
    ).toEqual([]);
  });

  it('renders a format change as well-formed delete + insert', () => {
    const rendered = asDiv(diff(list('<ol>'), list('<ul>')).diff);
    expect(rendered.querySelectorAll('ol ul, ul ol')).toHaveLength(0);
    expect(rendered.querySelector('del ol, ol del')).not.toBeNull();
    expect(rendered.querySelector('ins ul, ul ins')).not.toBeNull();
  });

  describe('inline formatting stays word-level', () => {
    const P =
      'Rafföng skulu uppfylla kröfur staðalsins ÍST EN 61936 og vera merkt af framleiðanda.';
    const opOf = (a: string, b: string) => diff(a, b).sections[0]!.blocks[0]!;

    it('italicising one word and adding another', () => {
      const op = opOf(
        `<p>${P}</p>`,
        `<p>${P.replace('ÍST EN 61936', '<em>ÍST EN 61936</em>').replace(
          'merkt',
          'greinilega merkt',
        )}</p>`,
      );
      expect(op.change).toBe('both');
      expect(op.diff).toContain('<em><ins class="mod">ÍST EN 61936</ins></em>');
      expect(op.diff).toMatch(
        /<ins class="diffins">(&nbsp;|\s)?greinilega\s?<\/ins>/,
      );
      expect(op.diff).not.toContain('<del');
    });

    it('removing italics, as 1055/2017 did to "type"', () => {
      const op = opOf(
        '<p><em>Gerðarmerki:</em> gerðarmerking (<em>type</em>) eða númer.</p>',
        '<p><em>Gerðarmerki:</em> gerðarmerking (type) eða númer.</p>',
      );
      expect(op.change).toBe('format');
      expect(op.diff).toContain('(<ins class="mod">type</ins>)');
    });

    it('falls back to delete + insert when htmldiff mis-nests (em → strong)', () => {
      const op = opOf(
        '<p><em>Heiti:</em> texti.</p>',
        '<p><strong>Heiti:</strong> texti.</p>',
      );
      expect(op.change).toBe('format');
      expect(isWellNested(op.diff!)).toBe(true);
      expect(op.diff).toContain('<del');
      expect(op.diff).toContain('<ins');
    });

    it('still replaces whole blocks for block-level changes', () => {
      const op = opOf(
        '<p>Texti hér.</p>',
        '<p class="indented">Texti <em>hér</em>.</p>',
      );
      expect(op.diff).toContain('<del');
      expect(op.diff).not.toContain('class="mod"');
    });
  });

  it('keeps a wording-only change as a word-level diff', () => {
    const op = diff(
      '<ol><li>fyrsta</li></ol>',
      '<ol><li>fyrsta breytt</li></ol>',
    ).sections[0]!.blocks[0]!;
    expect(op.change).toBe('text');
    expect(op.diff).toBe(
      '<ol><li data-diff="modify" data-diff-change="text" data-diff-item="1">fyrsta<ins class="diffins">&nbsp;breytt</ins></li></ol>',
    );
  });
});

describe('isWellNested', () => {
  it.each([
    ['<p>a <em>b</em></p>', true],
    ['<p>a<br>b<br/>c</p>', true],
    ['<p><ins class="mod"><strong><ins class="mod">H:</strong> t.</p>', false],
    ['<ol><ul><li>a</li></ol></ul>', false],
    ['<p>a', false],
  ])('%s → %s', (html, expected) => {
    expect(isWellNested(html)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Real history of 0678/2009, checked against the amending regulations'
// own wording.

describe('0678/2009', () => {
  it.each([
    ['2018-10-31', '2019-01-05'],
    ['2019-01-05', '2020-10-30'],
  ])('renders %s → %s as well-nested HTML', (a, b) => {
    const { diff: rendered } = getStructuredDiff(fixture(a), fixture(b), {
      asDiv,
    });
    expect(isWellNested(rendered)).toBe(true);
  });

  it('1226/2018: the word diff marks untouched neighbours as edited', () => {
    // Documents the behaviour this replaces. htmldiff hands the new
    // definition's closing ". " to the paragraph before it, so an unchanged
    // definition reads as edited. If htmldiff ever stops doing this, revisit.
    const flat = htmldiff(fixture('2018-10-31'), fixture('2019-01-05'));
    const touched = Array.from(asDiv(flat).children)
      .filter((el) => el.querySelector('ins, del'))
      .map((el) => (el.textContent || '').trim().split(':')[0]);
    expect(touched).toContain('Heildarskoðun');

    const structured = getStructuredDiff(
      fixture('2018-10-31'),
      fixture('2019-01-05'),
      { asDiv },
    );
    const heildar = structured.sections
      .flatMap((s) => s.blocks)
      .find((b) => b.new?.text.startsWith('Heildarskoðun:'));
    expect(heildar?.type).toBe('equal');
  });

  it('1226/2018: three new definitions, three new sub-articles', () => {
    expect(
      describeChanges(
        getStructuredDiff(fixture('2018-10-31'), fixture('2019-01-05'), {
          asDiv,
        }),
      ),
    ).toEqual([
      // "Við 1. gr. reglugerðarinnar bætast þrjár nýjar skilgreiningar í réttri stafrófsröð"
      'Á eftir 11. mgr. 1. gr. koma 2 nýjar málsgreinar.',
      'Á eftir 39. mgr. 1. gr. kemur ný málsgrein.',
      // "Við 7. gr. reglugerðarinnar bætast tvær nýjar málsgreinar: 7.13 … 7.14 …"
      'Á eftir 7.12. gr. koma nýjar greinar, 7.13. gr., 7.14. gr.',
      // "Við 12. gr. reglugerðarinnar bætist ein ný málsgrein: 12.2 …"
      'Á eftir 12.1. gr. kemur ný grein, 12.2. gr.',
    ]);
  });

  it('1049/2020: matches the amending regulation operation for operation', () => {
    expect(
      describeChanges(
        getStructuredDiff(fixture('2019-01-05'), fixture('2020-10-30'), {
          asDiv,
        }),
      ),
    ).toEqual([
      // "Í stað heitisins "ÍST 200:2006" í 2. mgr. kemur: ÍST HD 60364 staðlaraðarinnar."
      'Í stað „200:2006" í 2. mgr. 11.1. gr. kemur: HD 60364 staðlaraðarinnar.',
      // "3. mgr. orðast svo: …"
      '3. mgr. 11.1. gr. breytist (orðalag).',
      // "Í stað heitisins "ÍST 200:2006" í 4. mgr. kemur: …"
      'Í stað „200:2006" í 4. mgr. 11.1. gr. kemur: HD 60364 staðlaraðarinnar.',
      // "4. mgr. fellur brott."
      '4. mgr. 11.2. gr. fellur brott.',
      // "Við 7. mgr., sem verður 6. mgr., bætast tveir nýir málsliðir"
      'Við 7. mgr. 11.2. gr. bætast 2 nýir málsliðir.',
      // "Við 8. mgr., sem verður 7. mgr., bætist einn nýr málsliður"
      'Við 8. mgr. 11.2. gr. bætist nýr málsliður.',
      // "Við bætast fjórar nýjar málsgreinar"
      'Við 11.2. gr. bætast 4 nýjar málsgreinar.',
      // "Í stað heitisins … í 2. lið 1. mgr. 11.3. gr. reglugerðarinnar kemur …"
      '2. tölul. 1. mgr. 11.3. gr. breytist.',
      // "Í stað heitisins "ÍST EN 50423-1:2005" og "ÍST EN 50423-3:2005" í 1. mgr. kemur …"
      '3. málsl. 1. mgr. 11.4. gr. orðast svo.',
      // "Í stað "töflu 52A í ÍST 200:2006" í 3. mgr. kemur: viðauka A, kafla 52 í ÍST HD 60364 staðlaröðinni."
      'Í stað „töflu 52A" í 3. mgr. 11.4. gr. kemur: viðauka A, kafla 52.',
      'Í stað „200:2006" í 3. mgr. 11.4. gr. kemur: HD 60364 staðlaröðinni.',
      // "Í stað heitisins "ÍST 200:2006" í 5. mgr. kemur: …"
      'Í stað „200:2006" í 5. mgr. 11.4. gr. kemur: HD 60364 staðlaraðarinnar.',
      // "Í stað heitisins "ÍST EN 50341-1:2001, …" í 13.1. gr. reglugerðarinnar kemur …"
      '2. málsl. 1. mgr. 13.1. gr. orðast svo.',
    ]);
  });
});
