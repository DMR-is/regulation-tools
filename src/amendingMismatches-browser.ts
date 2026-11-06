import { asDiv } from './_utils/dom';
import {
  AmendedRegulation,
  AmendingMismatch,
  findAmendingMismatches,
} from './amendingMismatches';
import { HTMLText } from './types';

export type * from './amendingMismatches';

/** `findAmendingMismatches` for the browser, parsing with an inert document. */
const findAmendingMismatchesBrowser = (
  amendingHtml: HTMLText,
  regulations: ReadonlyArray<AmendedRegulation>,
): Array<AmendingMismatch> =>
  findAmendingMismatches(amendingHtml, regulations, { asDiv });

export default findAmendingMismatchesBrowser;
