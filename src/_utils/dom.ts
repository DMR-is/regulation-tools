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

let inert: Document | undefined;

/**
 * A document with no browsing context, for parsing HTML that may not be
 * trusted (a paste, the source dialog, a stored text). Nothing in it loads
 * or runs: `<img src=x onerror=…>` set as `innerHTML` here does nothing,
 * where in the page's own document it would run.
 */
export const inertDocument = (): Document => {
  if (!inert) {
    inert = document.implementation.createHTMLDocument('');
    inert.head.append(inert.createElement('base'));
  }
  // Relative URLs resolve against the page, as they did when this parsed
  // with the page's own document (dirtyClean reads `img.src`, resolved).
  inert.querySelector('base')!.href = document.baseURI;
  return inert;
};

/** A `<div>` holding `html`, parsed in the inert document. */
export const asDiv = (html: string) => {
  const div = inertDocument().createElement('div') as HTMLDivElement & {
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
