import qq from '@hugsmidjan/qj/qq';

import { asDiv } from './_cleanup/serverDOM';
import { dePrettify } from './_cleanup/text';
import { HTMLText, RegulationTextProps } from './types';

if (typeof window !== 'undefined') {
  console.error('This module does not run in the browser');
}

// ===========================================================================

export { combineTextAppendixesComments } from './_utils/dom';

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
      ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        commentsElms[0]!.innerHTML.trim()
      : '') as HTMLText,
  };
};

// ===========================================================================

export const eliminateComments = (text: HTMLText): HTMLText =>
  text.replace(/<section class="comments">[^]+?<\/section>/g, '') as HTMLText;
