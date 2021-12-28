import qq from '@hugsmidjan/qj/qq';

import { asDiv } from './_cleanup/serverDOM';
import { dePrettify } from './_cleanup/text';
import { HTMLText, Regulation, RegulationTextProps } from './types';

// ===========================================================================

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

// ===========================================================================

export const extractAppendixesAndComments = (
  text: HTMLText,
): RegulationTextProps => {
  text = dePrettify(text);
  const root = asDiv(text);
  const appendixElms = qq('.appendix', root);
  appendixElms.forEach((elm) => elm.remove());
  const commentsElms = qq('.comments', root);
  commentsElms.forEach((elm) => elm.remove());
  return {
    text: root.innerHTML.trim() as HTMLText,
    appendixes: appendixElms.map((elm) => {
      const titleElm = elm.querySelector('.appendix__title');
      const title = (titleElm?.textContent || '').replace(/\n/g, ' ').trim();
      titleElm?.remove();
      return {
        title,
        text: elm.innerHTML.trim() as HTMLText,
      };
    }),
    comments: (commentsElms.length
      ? commentsElms[0]!.innerHTML.trim()
      : '') as HTMLText,
  };
};

// ===========================================================================

export const eliminateComments = (text: HTMLText): HTMLText =>
  text.replace(/<section class="comments">[^]+?<\/section>/g, '') as HTMLText;
