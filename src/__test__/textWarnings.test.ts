import './editorV2-dom';

import { HTMLText } from '../types';
import { makeWarnings } from '../useTextWarnings';

const article = (title: string, name = 'Nafn.') =>
  `<h3 class="article__title">${title} <em class="article__name">${name}</em></h3>`;

const hasNumberingWarning = (titles: Array<string>) =>
  makeWarnings(titles.map((t) => article(t)).join('') as HTMLText).some(
    ({ id }) => id === 'articleNumbersWeird',
  );

describe('articleNumbersWeird', () => {
  it('accepts consecutive numbers', () => {
    expect(hasNumberingWarning(['1. gr.', '2. gr.', '3. gr.'])).toBe(false);
  });

  it('warns about a gap', () => {
    expect(hasNumberingWarning(['1. gr.', '3. gr.'])).toBe(true);
  });

  it.each([
    ['"2. gr. a"', ['1. gr.', '2. gr.', '2. gr. a', '3. gr.']],
    ['"2. gr. a."', ['1. gr.', '2. gr.', '2. gr. a.', '3. gr.']],
    ['a, b in a row', ['1. gr.', '1. gr. a', '1. gr. b.', '2. gr.']],
  ])('accepts lettered articles: %s', (_, titles) => {
    expect(hasNumberingWarning(titles)).toBe(false);
  });

  // 1108-2012: "10. gr. a. <em>Gildi eldri leyfa.</em>"
  it('accepts lettered articles as published', () => {
    const html = [
      article('1. gr.'),
      article('2. gr.'),
      article('2. gr. a.', 'Gildi eldri leyfa.'),
      article('3. gr.', 'Gildistaka.'),
    ].join('') as HTMLText;
    expect(
      makeWarnings(html).some(({ id }) => id === 'articleNumbersWeird'),
    ).toBe(false);
  });

  it.each([
    ['a letter after the wrong number', ['1. gr.', '2. gr.', '1. gr. a']],
    ['a skipped letter', ['1. gr.', '1. gr. b']],
    ['a repeated number', ['1. gr.', '1. gr.']],
  ])('warns about %s', (_, titles) => {
    expect(hasNumberingWarning(titles)).toBe(true);
  });

  it('does not read the article name as a letter', () => {
    expect(
      makeWarnings(
        (article('1. gr.') + article('1. gr.', 'a')) as HTMLText,
      ).some(({ id }) => id === 'articleNumbersWeird'),
    ).toBe(true);
  });
});
