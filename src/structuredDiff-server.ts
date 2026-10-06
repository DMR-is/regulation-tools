import { asDiv } from './_cleanup/serverDOM';
import { getStructuredDiff, StructuredDiffOptions } from './structuredDiff';
import { HTMLText } from './types';

export type * from './structuredDiff';

/** `getStructuredDiff` for Node, parsing with jsdom. */
const getStructuredDiffServer = (
  older: HTMLText,
  newer: HTMLText,
  opts?: Omit<StructuredDiffOptions, 'asDiv'>,
) => getStructuredDiff(older, newer, { ...opts, asDiv });

export default getStructuredDiffServer;
