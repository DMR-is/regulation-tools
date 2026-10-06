import { getStructuredDiff, StructuredDiffOptions } from './structuredDiff';
import { HTMLText } from './types';
import { asDiv } from './_utils/dom';

export type * from './structuredDiff';

/** `getStructuredDiff` for the browser, parsing with the page's own DOM. */
const getStructuredDiffBrowser = (
  older: HTMLText,
  newer: HTMLText,
  opts?: Omit<StructuredDiffOptions, 'asDiv'>,
) => getStructuredDiff(older, newer, { ...opts, asDiv });

export default getStructuredDiffBrowser;
