import qq from '@hugsmidjan/qj/qq';

import { HTMLText, Regulation } from '../types';

export const styleValueToTypeAttrMap: Record<string, string | undefined> = {
  circle: 'circle',
  square: 'square',
  'lower-latin': 'a',
  'upper-latin': 'A',
  'lower-alpha': 'a',
  'upper-alpha': 'A',
  'lower-roman': 'i',
  'upper-roman': 'I',
};
export const typeAttrToStyleValueMap: typeof styleValueToTypeAttrMap =
  Object.fromEntries(
    Object.entries(styleValueToTypeAttrMap).map(([a, b]) => [b, a]),
  );

// ---------------------------------------------------------------------------

export const asDiv = (html: string) => {
  const div = document.createElement('div') as HTMLDivElement & {
    qq: typeof qq;
  };
  div.innerHTML = html;
  div.qq = <S extends string>(selector: S, root: Element | null = div) =>
    qq(selector, root);
  return div;
};

// ---------------------------------------------------------------------------

export const document_base_url =
  typeof document !== 'undefined'
    ? document.location.href.replace(/^(https?:\/\/[^/]+).+/i, '$1')
    : '';

// ---------------------------------------------------------------------------

export const combineTextAppendixesComments = (
  text: HTMLText,
  appendixes: Regulation['appendixes'] | undefined,
  comments: HTMLText | undefined,
): HTMLText => {
  const wrappedAppendixes = (appendixes || [])
    .map(
      ({ title, text }) =>
        `<section class="appendix">` +
        `  <h2 class="appendix__title">${title.replace(/</g, '&lt;')}</h2>` +
        `  ${text}` +
        `</section>`,
    )
    .join('');

  const wrappedComments =
    comments && `<section class="comments">${comments}</section>`;

  return (text + wrappedAppendixes + wrappedComments) as HTMLText;
};
