import { asDiv } from './_cleanup/serverDOM';
import {
  AmendedRegulation,
  AmendingMismatch,
  findAmendingMismatches,
} from './amendingMismatches';
import { HTMLText } from './types';

export type * from './amendingMismatches';

/** `findAmendingMismatches` for Node, parsing with jsdom. */
const findAmendingMismatchesServer = (
  amendingHtml: HTMLText,
  regulations: ReadonlyArray<AmendedRegulation>,
): Array<AmendingMismatch> =>
  findAmendingMismatches(amendingHtml, regulations, { asDiv });

export default findAmendingMismatchesServer;
