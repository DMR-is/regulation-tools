import translate, { Messages } from 'translate.js';
import { plural_IS } from 'translate.js/pluralize';
import { RegName } from '../types';

const THIN_SPACE = ' ';
const HAIR_SPACE = ' ';
const SPACE = HAIR_SPACE;

/** Pretty-formats a Regulation `name` for human consumption
 *
 * Chops off leading zeros.
 */
export const prettyName = (regulationName: RegName) =>
  regulationName.replace(/^0+/, '');

// ---------------------------------------------------------------------------

const translateOpts = {
  debug: true,
  pluralize: plural_IS,
};

export const getTexts = <M extends Messages>(texts: M) =>
  translate<M>(texts, translateOpts);
