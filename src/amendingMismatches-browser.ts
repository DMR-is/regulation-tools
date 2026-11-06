import { asDiv } from './_utils/dom';
import {
  AmendedRegulation,
  AmendingMismatch,
  findAmendingMismatches,
} from './amendingMismatches';
import { HTMLText } from './types';

export type * from './amendingMismatches';

/**
 * `findAmendingMismatches` for the browser, parsing with an inert document:
 * the amending text comes from the sender, and parsing it in the page's own
 * document would run its event handlers (`<img onerror>`).
 */
const findAmendingMismatchesBrowser = (
  amendingHtml: HTMLText,
  regulations: ReadonlyArray<AmendedRegulation>,
): Array<AmendingMismatch> =>
  findAmendingMismatches(amendingHtml, regulations, { asDiv });

export default findAmendingMismatchesBrowser;
