import { splitSentences } from '../_structuredDiff/sentences';

describe('splitSentences', () => {
  it('splits at a full stop before a capital', () => {
    expect(splitSentences('Fyrsta setning. Önnur setning. Þriðja.')).toEqual([
      'Fyrsta setning.',
      'Önnur setning.',
      'Þriðja.',
    ]);
  });

  // Real sentences from the corpus.
  it.each([
    [
      'ordinals and a continuing reference',
      'Samkvæmt 3. mgr. 12. gr. laga um raforku skal fylgja. Næsta setning.',
      2,
    ],
    ['a date', 'Gildir frá 27. október 2017 og áfram. Næsta setning.', 2],
    [
      'skv. before a standard',
      'Stærðir uppdrátta skulu vera skv. ÍST 1, þ.e. A0, A1 eða A2. Næsta setning.',
      2,
    ],
    [
      'sbr. before a roman numeral',
      'Með síðari breytingum, sbr. XIII. kafla laga um mannvirki. Næsta setning.',
      2,
    ],
    [
      'a.m.k. before a class code',
      'Herbergi skal vera sjálfstætt brunahólf, a.m.k. EI 60 að lágmarki. Hurðir skulu vera þéttar.',
      2,
    ],
    [
      'þ.m.t. before a name',
      'Önnur lögbær yfirvöld, þ.m.t. Lyfjastofnun, að því að finna þau. Næsta setning.',
      2,
    ],
    [
      'an initial',
      'Undirritað af Sigurði H. Helgasyni ráðuneytisstjóra. Næsta setning.',
      2,
    ],
  ])('does not split after %s', (_, text, count) => {
    expect(splitSentences(text)).toHaveLength(count);
  });

  it.each([
    [
      'mgr.',
      'Skila skal gögnum sem tilgreind eru í 2. mgr. Á seinna stigi skal skila fleiri gögnum.',
    ],
    [
      'málsl.',
      'Lyfta skal uppfylla kröfur 1. málsl. Þegar vikið er frá kröfum skal rökstyðja það.',
    ],
    [
      'o.fl.',
      'Sjá lög nr. 24/2006 um faggildingu o.fl. Raflagnir skulu vera vottaðar.',
    ],
    [
      'kr.',
      'Hámark dagsekta skal vera 500.000 kr. á dag. Gjaldið rennur í ríkissjóð.',
    ],
  ])('ends a sentence after a reference or amount: %s', (_, text) => {
    expect(splitSentences(text)).toHaveLength(2);
  });

  it('ends a sentence at a regulation number', () => {
    expect(
      splitSentences('Sjá reglugerð (ESB) nr. 2020/1234. Næsta setning.'),
    ).toEqual(['Sjá reglugerð (ESB) nr. 2020/1234.', 'Næsta setning.']);
  });

  it('does not split before a one-letter code', () => {
    expect(
      splitSentences('Honum skal skipt með a.m.k. E 30 hurðum. Næsta setning.'),
    ).toHaveLength(2);
  });

  // Known limitation, pinned so a change to it is deliberate.
  it('keeps a sentence ending in a number joined to the next one', () => {
    expect(
      splitSentences('Sýna skal stærð, sbr. ÍST 50. Sýna skal lóð.'),
    ).toHaveLength(1);
  });

  it('keeps one sentence whole', () => {
    expect(splitSentences('Bara ein setning án enda')).toEqual([
      'Bara ein setning án enda',
    ]);
  });

  // The three sentences of 1. mgr. 9.4. gr. of 0678/2009 before 0494/2010,
  // which then said: "a. 2. málsl. orðast svo … b. 3. málsl. fellur brott."
  it('splits 1. mgr. 9.4. gr. of 0678/2009 into the three málsliðir 0494/2010 counts', () => {
    expect(
      splitSentences(
        'Gjalddagi gjalda samkvæmt þessari grein er 1. dagur næsta mánaðar eftir að rafveita innheimtir gjaldið. Eindagi er 1. dagur þarnæsta mánaðar eftir gjalddaga. Dráttarvextir reiknast frá gjalddaga.',
      ),
    ).toHaveLength(3);
  });
});
