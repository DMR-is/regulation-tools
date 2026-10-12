import { asDiv } from './_cleanup/serverDOM';
import {
  createStructuredDiffer as createDiffer,
  getStructuredDiff,
  StructuredDiffOptions,
} from './structuredDiff';
import { HTMLText } from './types';

export type * from './structuredDiff';

/** `getStructuredDiff` for Node, parsing with jsdom. */
const getStructuredDiffServer = (
  older: HTMLText,
  newer: HTMLText,
  opts?: Omit<StructuredDiffOptions, 'asDiv'>,
) => getStructuredDiff(older, newer, { ...opts, asDiv });

/** `createStructuredDiffer` for Node, parsing with jsdom. */
export const createStructuredDiffer = (
  older: HTMLText,
  opts?: Omit<StructuredDiffOptions, 'asDiv'>,
) => createDiffer(older, { ...opts, asDiv });

export default getStructuredDiffServer;
