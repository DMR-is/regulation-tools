import { asDiv } from '../_cleanup/serverDOM';
import { numbersIn } from '../_amendingMismatches/text';
import { execute as htmldiff } from '../htmldiff-js';
import {
  AmendedRegulation,
  AmendingMismatch,
  findAmendingMismatches,
} from '../amendingMismatches';
import findAmendingMismatchesServer from '../amendingMismatches-server';
import { getStructuredDiff } from '../structuredDiff';
import { HTMLText } from '../types';

const change = (before: string, after: string, name = '1170/2012') => ({
  name,
  diff: getStructuredDiff(before as HTMLText, after as HTMLText, { asDiv })
    .diff,
});

const check = (amending: string, ...changes: Array<AmendedRegulation>) =>
  findAmendingMismatches(amending as HTMLText, changes, { asDiv });

const texts = (ms: Array<AmendingMismatch>) =>
  ms.map((m) => `${m.type}: ${m.text}`);

const article = (n: number, ...ps: Array<string>) =>
  `<h3 class="article__title">${n}. gr.</h3>` +
  ps.map((p) => `<p>${p}</p>`).join('');

const gildistaka = (n: number) =>
  article(
    n,
    'Reglugerð þessi, sem sett er samkvæmt heimild í lögum um talnagetraunir nr. 26/1986, öðlast gildi 29. mars 2023.',
  );

// ---------------------------------------------------------------------------

const BASE_5 =
  '<h3>5. gr.</h3><p>Verð fyrir hvern leik er kr. 150, í Vikinglottó kr. 110 og í EuroJackpot 310 kr. Aðeins er unnt að gerast þátttakandi hjá söluaðilum, sbr. 1. mgr. 3. gr.</p>';
const AFTER_5 = BASE_5.replace('kr. 110', 'kr. 115');
const PRICE = change(BASE_5, AFTER_5);

describe('an amount changed in one place only', () => {
  it('agrees when the text makes the recorded change', () => {
    const text =
      article(
        1,
        'Í stað orðanna „í Vikinglottó kr. 110“ í 1. málsl. 1. mgr. 5. gr. reglugerðarinnar kemur: í Vikinglottó kr. 115.',
      ) + gildistaka(2);
    expect(check(text, PRICE)).toEqual([]);
  });

  it('warns both ways when the text gives another amount', () => {
    const text =
      article(
        1,
        'Í stað orðanna „í Vikinglottó kr. 110“ í 1. málsl. 1. mgr. 5. gr. reglugerðarinnar kemur: í Vikinglottó kr. 120.',
      ) + gildistaka(2);
    expect(check(text, PRICE)).toEqual([
      {
        type: 'missingFromText',
        kind: 'number',
        text: '115',
        context: expect.stringContaining('Vikinglottó kr. 115'),
        regulation: '1170/2012',
        section: '5. gr.',
      },
      {
        type: 'notInChanges',
        kind: 'number',
        text: '120',
        context: expect.stringContaining('kemur: í Vikinglottó kr. 120'),
        section: '1. gr.',
      },
    ]);
  });

  it('warns when the base changed and the text says nothing of it', () => {
    const text =
      article(1, 'Í stað „kr. 150“ í 1. mgr. 5. gr. kemur: kr. 160.') +
      gildistaka(2);
    const both = change(BASE_5, AFTER_5.replace('kr. 150', 'kr. 160'));
    expect(texts(check(text, both))).toEqual(['missingFromText: 115']);
  });

  it('treats 7.500 and 7500, 1,20 and 1,2 as the same', () => {
    const base =
      '<h3>2. gr.</h3><p>Gjaldið er 5.000 kr. og breiddin 1,0 m.</p>';
    const after =
      '<h3>2. gr.</h3><p>Gjaldið er 7.500 kr. og breiddin 1,2 m.</p>';
    const text = article(
      1,
      'Í stað „5000 kr.“ kemur: 7500 kr. Í stað „1,00 m“ kemur: 1,20 m.',
    );
    expect(check(text, change(base, after))).toEqual([]);
  });
});

describe('what the text gives that is not a value', () => {
  const base =
    '<h3>14. gr.</h3><p>Ráðherra setur reglur.</p><p>Gjaldið er 2.000 kr.</p>';
  const after =
    '<h3>14. gr.</h3><p>Ráðherra setur reglur.</p><p>Gjaldið er 3.000 kr.</p>';

  it('skips places, references, ordinals and its own gildistaka', () => {
    const text =
      article(
        1,
        'Í stað „2.000 kr.“ í 2. mgr. 14. gr. reglugerðar nr. 1170/2012, sbr. 1., 3. og 5. mgr. 9. gr., kemur: 3.000 kr.',
        'Á eftir 4. mgr. koma 8 nýjar málsgreinar, sbr. 6. breytingu á reglugerðinni.',
      ) +
      article(
        2,
        'Reglugerð þessi er sett til innleiðingar á reglugerð (ESB) 2015/1535 frá 9. september 2015.',
      ) +
      gildistaka(3) +
      '<p class="Dags">Dómsmálaráðuneytinu, 21. mars 2023.</p>';
    expect(check(text, change(base, after))).toEqual([]);
  });

  it('skips the date of an act it cites', () => {
    const text = article(
      1,
      'Í stað „2.000 kr.“ í 14. gr. reglugerðarinnar, sbr. reglugerð nr. 278 6. mars 2013, kemur: 3.000 kr.',
    );
    expect(check(text, change(base, after))).toEqual([]);
  });
});

describe('dates', () => {
  const base =
    '<h3>3. gr.</h3><p>Heimildin gildir til og með 31. ágúst 2020 og er bundin skilyrðum.</p>';

  it('accepts a date the text changes in part', () => {
    const month = change(base, base.replace('ágúst', 'október'));
    expect(
      check(
        article(1, 'Í stað orðsins „ágúst“ í 1. mgr. 3. gr. kemur: október.'),
        month,
      ),
    ).toEqual([]);
    const year = change(base, base.replace('2020', '2021'));
    expect(
      check(article(1, 'Í stað „2020“ í 1. mgr. 3. gr. kemur: 2021.'), year),
    ).toEqual([]);
  });

  it('warns when the text gives another date', () => {
    const later = change(base, base.replace('31. ágúst', '30. september'));
    const text = article(
      1,
      'Í stað „31. ágúst 2020“ í 1. mgr. 3. gr. kemur: 31. október 2020.',
    );
    expect(texts(check(text, later))).toEqual([
      'missingFromText: 30. september 2020',
      'notInChanges: 31. október 2020',
    ]);
  });

  it('counts the date of each act listed: a shared date hides no slip', () => {
    const item = (nr: string, date: string) =>
      `<li>Framkvæmdarreglugerð (ESB) nr. ${nr}/2014 frá ${date} um breytingu á reglugerð (ESB) nr. 37/2010.</li>`;
    const list = (...items: Array<string>) =>
      `<h3>1. gr.</h3><p>Reglugerðirnar eru:</p><ol>${items.join('')}</ol>`;
    const before = list(item('600', '1. júní 2014'));
    const after = list(
      item('600', '1. júní 2014'),
      item('676', '19. júní 2014'),
      item('677', '19. júní 2014'),
    );
    const lead = 'Við 1. gr. bætast tveir nýir töluliðir, svohljóðandi:';
    const text = (d1: string, d2: string) =>
      `<h3>1. gr.</h3><p>${lead}</p><ol start="2">${item('676', d1)}${item(
        '677',
        d2,
      )}</ol>`;
    expect(
      check(text('19. júní 2014', '19. júní 2014'), change(before, after)),
    ).toEqual([]);
    expect(
      texts(
        check(text('20. júní 2014', '19. júní 2014'), change(before, after)),
      ),
    ).toEqual(['missingFromText: 19. júní 2014']);
  });
});

describe('wording', () => {
  const base =
    '<h3>2. gr.</h3><p>Umsókn skal send Siglingastofnun Íslands innan mánaðar.</p>';
  const after =
    '<h3>2. gr.</h3><p>Umsókn skal send Samgöngustofu innan mánaðar og fylgja henni öll gögn sem máli skipta.</p>';

  it('agrees with new wording the text gives, in any inflection', () => {
    const text = article(
      1,
      'Í stað orðanna „Siglingastofnun Íslands“ kemur, í viðeigandi beygingarfalli: Samgöngustofa.',
      'Við 2. gr. bætast orðin: og fylgja henni öll gögn sem máli skipta.',
    );
    expect(check(text, change(base, after))).toEqual([]);
  });

  it('warns about wording the text leaves out', () => {
    const text = article(
      1,
      'Í stað orðanna „Siglingastofnun Íslands“ kemur, í viðeigandi beygingarfalli: Samgöngustofa.',
    );
    expect(check(text, change(base, after))).toEqual([
      expect.objectContaining({
        type: 'missingFromText',
        text: expect.stringContaining(
          'og fylgja henni öll gögn sem máli skipta',
        ),
        section: '2. gr.',
      }),
    ]);
  });

  it('reads a new article’s heading without its number', () => {
    const before = '<h3>6. gr.</h3><p>Texti.</p>';
    const added =
      before +
      '<h3>6. gr. a</h3><h4>Gildistaka tiltekinna EES-gerða.</h4><p>Ráðherra birtir skrá yfir gerðirnar.</p>';
    const text = article(
      1,
      'Á eftir 6. gr. reglugerðarinnar kemur ný grein, 6. gr. a, Gildistaka tiltekinna EES-gerða, svohljóðandi:',
      'Ráðherra birtir skrá yfir gerðirnar.',
    );
    expect(check(text, change(before, added))).toEqual([]);
  });

  it('leaves a moved paragraph alone', () => {
    const p1 =
      '<p>Fyrsta málsgrein um umsóknir og fresti til að skila þeim.</p>';
    const p2 = '<p>Önnur málsgrein um gjöld og hvernig þau eru innheimt.</p>';
    const moved = change(
      `<h3>4. gr.</h3>${p1}${p2}`,
      `<h3>4. gr.</h3>${p2}${p1}`,
    );
    expect(
      check(article(1, '1. mgr. 4. gr. verður 2. mgr. greinarinnar.'), moved),
    ).toEqual([]);
  });
});

describe('input', () => {
  it('reads a getDiff diff (no data-diff attributes) as changed throughout', () => {
    const diff = htmldiff(BASE_5, AFTER_5) as HTMLText;
    expect(diff).not.toContain('data-diff');
    const text = article(1, 'Í stað „kr. 110“ kemur: kr. 120.');
    expect(texts(check(text, { diff }))).toEqual([
      'missingFromText: 115',
      'notInChanges: 120',
    ]);
  });

  it('looks for a stated amount in every regulation passed', () => {
    const other = change(
      '<h3>1. gr.</h3><p>Gjaldið er 900 kr.</p>',
      '<h3>1. gr.</h3><p>Gjaldið er 950 kr.</p>',
      '0037/2009',
    );
    const text =
      article(1, 'Í stað „kr. 110“ kemur: kr. 115.') +
      article(2, 'Í stað „900 kr.“ kemur: 950 kr.');
    expect(check(text, PRICE, other)).toEqual([]);
  });

  it('ignores the signature of a base regulation', () => {
    const base = '<h3>1. gr.</h3><p>Gjaldið er 900 kr.</p>';
    const after =
      base + '<p class="Dags">Ráðuneytinu, 1. janúar 2027.</p><p>Ráðherra.</p>';
    expect(check(article(1, 'Texti.'), change(base, after))).toEqual([]);
  });

  it('amendingMismatches-server binds asDiv', () => {
    const text = article(1, 'Í stað „kr. 110“ kemur: kr. 120.');
    expect(findAmendingMismatchesServer(text as HTMLText, [PRICE])).toEqual(
      check(text, PRICE),
    );
  });
});

describe('review of #18', () => {
  const fee = '<h3>5. gr.</h3><p>Gjaldið er kr. 1.500 á ári.</p>';
  const raised = change(fee, fee.replace('1.500', '1.800'));

  it('reads "komi:" as an instruction, as older texts write it', () => {
    const komi = (amount: string) =>
      article(
        1,
        `Í stað „kr. 1.500“ í 5. gr. reglugerðarinnar komi: kr. ${amount}.`,
        // Unread as an instruction, the article would count as the text's own.
        'Reglugerð þessi öðlast þegar gildi.',
      );
    expect(check(komi('1.800'), raised)).toEqual([]);
    expect(texts(check(komi('1.900'), raised))).toEqual([
      'missingFromText: 1.800',
      'notInChanges: 1.900',
    ]);
  });

  it('still counts an article whose verb it does not know', () => {
    const text = article(
      1,
      'Fjárhæðin í 5. gr. reglugerðarinnar hækkar í kr. 1.900.',
    );
    expect(texts(check(text, raised))).toEqual([
      'missingFromText: 1.800',
      'notInChanges: 1.900',
    ]);
  });

  it('checks a changed month in a date without a year', () => {
    const base =
      '<h3>3. gr.</h3><p>Umsóknir skulu berast fyrir 1. ágúst ár hvert.</p>';
    const april = change(base, base.replace('ágúst', 'apríl'));
    const text = (month: string) =>
      article(1, `Í stað orðsins „ágúst“ í 3. gr. kemur: ${month}.`);
    expect(check(text('apríl'), april)).toEqual([]);
    expect(texts(check(text('október'), april))).toEqual([
      'missingFromText: apríl',
    ]);
  });

  it('takes no part of a date from the signature', () => {
    const base = '<h3>3. gr.</h3><p>Heimildin gildir til 31. ágúst 2020.</p>';
    const october = change(base, base.replace('ágúst', 'október'));
    const text =
      article(1, 'Í stað orðsins „ágúst“ í 3. gr. kemur: september.') +
      '<p class="Dags">Ráðuneytinu, 21. október 2020.</p>';
    expect(texts(check(text, october))).toEqual([
      'missingFromText: 31. október 2020',
    ]);
  });

  it('matches a year to a changed date, not an amount of money', () => {
    const base = '<h3>2. gr.</h3><p>Fresturinn rennur út 15. maí 2024.</p>';
    const year = change(base, base.replace('2024', '2025'));
    expect(
      check(article(1, 'Í stað „2024“ í 2. gr. kemur: 2025.'), year),
    ).toEqual([]);
    expect(
      texts(
        check(
          article(
            1,
            'Í stað „2024“ í 2. gr. kemur: 2025. Gjaldið er kr. 2025.',
          ),
          year,
        ),
      ),
    ).toEqual(['notInChanges: 2025']);
  });

  it('reads a long run of digits after a unit word in linear time', () => {
    const started = Date.now();
    // The run must be within reach of the number after it.
    numbersIn(`lið ${'1'.repeat(25)} x 5`);
    numbersIn(`lið ${'1 '.repeat(15)}x 5`);
    expect(Date.now() - started).toBeLessThan(100);
  });

  it('needs a small number only mentioned, a larger one as a value', () => {
    const base =
      '<h3>7. gr.</h3><p>Fresturinn er 14 dagar og gjaldið 900 kr.</p>';
    const small = change(base, base.replace('14 dagar', '99 dagar'));
    const large = change(base, base.replace('900 kr.', '100 kr.'));
    // 99 and 100 appear in the text only as article numbers.
    const text = article(
      1,
      'Ákvæði 99. gr. og 100. gr. reglugerðarinnar breytist.',
    );
    expect(check(text, small)).toEqual([]);
    expect(texts(check(text, large))).toEqual(['missingFromText: 100']);
  });

  it('leaves the signature out after an instruction article', () => {
    const text =
      article(1, 'Í stað „kr. 1.500“ í 5. gr. kemur: kr. 1.800.') +
      '<p class="Dags">Dómsmálaráðuneytinu, 21. mars 2023.</p>' +
      '<p>Jón Jónsson.</p>';
    expect(check(text, raised)).toEqual([]);
  });

  it('checks an appendix after the signature', () => {
    const base = '<h2>Viðauki I</h2><p>Gjaldskrá: 1.234 kr.</p>';
    const appendix = change(
      base,
      base.replace('1.234', '1.300'),
      '1170/2012 viðauki I',
    );
    const text = (amount: string) =>
      article(1, 'Viðauki I við reglugerðina orðast svo:') +
      '<p class="Dags">Dómsmálaráðuneytinu, 21. mars 2023.</p>' +
      `<h2>Viðauki I</h2><p>Gjaldskrá: ${amount} kr.</p>`;
    expect(check(text('1.300'), appendix)).toEqual([]);
    expect(texts(check(text('1.350'), appendix))).toEqual([
      'missingFromText: 1.300',
      'notInChanges: 1.350',
    ]);
  });

  it('knows its own provisions in other words than "öðlast gildi"', () => {
    const text =
      article(1, 'Í stað „kr. 1.500“ í 5. gr. kemur: kr. 1.800.') +
      article(
        2,
        'Með stoð í lögum nr. 26/1986 öðlast reglugerð þessi gildi 1. mars 2025.',
        'Reglugerð þessi gildir til 31. desember 2026.',
      ) +
      article(
        3,
        'Ákvæðum 1. gr. skal beita um umsóknir sem berast eftir 1. mars 2025.',
      ) +
      article(
        4,
        'Með reglugerð þessari eru innleiddar breytingar, dags. 20. júní 2019.',
      ) +
      article(5, 'Með stoð í ákvörðun ráðherra frá 1. mars 2025.');
    expect(check(text, raised)).toEqual([]);
  });

  it('reads "bæti" in a transitional provision as prose', () => {
    const text =
      article(1, 'Í stað „kr. 1.500“ í 5. gr. kemur: kr. 1.800.') +
      '<h3>Ákvæði til bráðabirgða.</h3>' +
      '<p>Umsókn er hafnað nema umsækjandi bæti úr annmörkum fyrir 1. júlí 2025.</p>';
    expect(check(text, raised)).toEqual([]);
  });

  it('reads an appendix titled in a paragraph after the signature', () => {
    const was = '<h2>Viðauki I</h2><p>Gjaldskrá: vottorð um búsetu.</p>';
    const now = was.replace(
      'búsetu',
      'búsetu og skráningu lögheimilis erlendis',
    );
    const text =
      article(1, 'Viðauki I við reglugerðina orðast svo:') +
      '<p class="Dags">Dómsmálaráðuneytinu, 21. mars 2023.</p>' +
      '<p><strong>Viðauki I</strong></p>' +
      '<p>Gjaldskrá: vottorð um búsetu og skráningu lögheimilis erlendis.</p>';
    expect(check(text, change(was, now, '1170/2012 viðauki I'))).toEqual([]);
  });

  it('reads an appendix’s own articles as its wording', () => {
    const was =
      '<h2>Fylgiskjal I</h2><h3>1. gr.</h3><p>Reglum þessum skal beita um ársreikninga.</p>';
    const now = was.replace('ársreikninga', 'ársreikninga og fjárhagsáætlanir');
    const text =
      article(1, 'Í stað fylgiskjals I kemur nýtt fylgiskjal I.') +
      '<p class="Dags">Ráðuneytinu, 15. febrúar 2021.</p>' +
      now;
    expect(check(text, change(was, now, '1212/2015 fylgiskjal I'))).toEqual([]);
  });

  it('returns nothing for nothing', () => {
    expect(findAmendingMismatches('' as HTMLText, [], { asDiv })).toEqual([]);
  });
});

describe('numbersIn', () => {
  const kinds = (s: string) =>
    numbersIn(s).map(
      (t) => `${t.raw}:${t.kind}${t.ofReference ? ' (of a reference)' : ''}`,
    );

  it('tells values from places and references', () => {
    expect(kinds('kemur: 3.600.000. Í stað')).toEqual(['3.600.000:value']);
    expect(kinds('61., 62. og 63. tölul.')).toEqual([
      '61:place',
      '62:place',
      '63:place',
    ]);
    expect(kinds('Málsliðir 3 og 4 í')).toEqual(['3:place', '4:place']);
    expect(kinds('bætast 36 nýir töluliðir')).toEqual(['36:place']);
    expect(kinds('svohljóðandi: 6. Greiðslur')).toEqual(['6:place']);
    expect(kinds('nr. 25/2023. 14) Sjálfbærniþættir')).toEqual([
      '25:ref',
      '2023:ref (of a reference)',
      '14:place',
    ]);
    expect(kinds('í 3. línu í töflu')).toEqual(['3:place']);
    expect(kinds('kafla 2.3.4 orðast')).toEqual(['2.3.4:place']);
    expect(kinds('bls. 422')).toEqual(['422:ref']);
    expect(kinds('(Stjtíð. ESB L 58, 3.3.2011, bls. 53)')).toEqual([
      '58:ref',
      '3.3.2011:ref',
      '53:ref',
    ]);
    expect(kinds('Í flokknum 06 30 Gervihlutar')).toEqual([
      '06:place',
      '30:place',
    ]);
    expect(kinds('Gjaldið er kr.115 á ári.')).toEqual(['115:value']);
    expect(kinds('í lið B.3 og töflu A.12')).toEqual([]);
    expect(kinds('í undirkafla 4 og launaflokki 12')).toEqual([
      '4:place',
      '12:place',
    ]);
    expect(kinds('fyrir tímabilið 2025')).toEqual(['2025:value']);
    expect(
      kinds(
        'sjá https://eur-lex.europa.eu/TXT/?qid=1459959072574. Gjald 500 kr.',
      ),
    ).toEqual(['500:value']);
  });

  it('reads a date whole, and a cited act’s date as such', () => {
    expect(kinds('frestur til 1. janúar 2027')).toEqual([
      '1. janúar 2027:date',
    ]);
    expect(kinds('(ESB) 2017/736 frá 26. apríl 2017')).toEqual([
      '2017:ref',
      '736:ref',
      '26. apríl 2017:date (of a reference)',
    ]);
  });

  it('keeps a value in a table cell apart from the next row', () => {
    expect(kinds('viðvörunar)\n kr. \n 950 \n\nTafla verður')).toEqual([
      '950:value',
    ]);
    expect(kinds('Gjöld\n2.900.\nSkráning')).toEqual(['2.900:value']);
  });
});
