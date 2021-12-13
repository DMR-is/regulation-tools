import { IntPositive, ISODate, RegName, RegQueryName, Year } from '../types';

// ---------------------------------------------------------------------------

const reRegQueryNameFlex = /^\d{1,4}-\d{4}$/;

/** Returns a fully zero-padded RegQueryName.
 *
 * Returns `undefined` if the slug doesn't roughly look like a valid regulation number
 *
 *  Example: '23-2020' --> '0023-2020'
 *  Example: '0123-202' --> undefined
 */
export const ensureNameSlug = (slug?: string): RegQueryName | undefined => {
  if (slug && reRegQueryNameFlex.test(slug)) {
    return (
      slug.length === 9 ? slug : ('000' + slug).slice(-9)
    ) as RegQueryName;
  }
};

// ---------------------------------------------------------------------------

/** Returns a fully zero-padded RegName.
 *
 * Returns `undefined` if the slug doesn't roughly look like a valid regulation number
 *
 *  Example: '23-2020' --> '0023/2020'
 *  Example: '23/2020' --> '0023/2020'
 *  Example: '0123-202' --> undefined
 */
export const ensureRegName = (slug?: string): RegName | undefined => {
  slug = slug && slug.replace('-', '/');
  if (slug && /^\d{1,4}\/\d{4}$/.test(slug)) {
    return (slug.length === 9 ? slug : ('000' + slug).slice(-9)) as RegName;
  }
};

// ---------------------------------------------------------------------------

const smellsLikeISODate = (maybeISODate?: string): maybeISODate is string =>
  /^\d{4}-\d{2}-\d{2}$/.test(maybeISODate || '');

/** Asserts that the incoming string is a valid ISODate.
 *
 * Returns undefined otherwise.
 *
 * Example: `2012-09-30` --> `2012-09-30`
 * Example: `2012-09-31` --> undefined
 */
export const ensureISODate = (maybeISODate?: string): ISODate | undefined => {
  if (smellsLikeISODate(maybeISODate)) {
    const date = new Date(maybeISODate).toISOString().slice(0, 10) as ISODate;
    if (date === maybeISODate) {
      return date;
    }
  }
};

/** Asserts that string|number evaluates to a number between 1900 and 2150
 *
 * Guards against "Infinity" and unreasonably off-sized values
 */
export const ensureReasonableYear = (
  maybeYear?: string | number,
): Year | undefined => {
  const yearCand = Number(maybeYear);
  return yearCand
    ? (Math.max(1900, Math.min(2150, yearCand)) as Year)
    : undefined;
};

/** Asserts that string|number is a positive integer
 *
 * Guards against NaN and "Infinity"
 */
export const ensurePosInt = (
  maybeNumber?: string | number,
): IntPositive | undefined => {
  const num = Number(maybeNumber);
  return num && num > 0 && num < Infinity && num === Math.floor(num)
    ? (num as IntPositive)
    : undefined;
};

// ---------------------------------------------------------------------------

/** @deprecated use `ensureNameSlug` instead  (Will be removed in v0.6) */
export const assertNameSlug = ensureNameSlug;
/** @deprecated use `ensureRegName` instead  (Will be removed in v0.6) */
export const assertRegName = ensureRegName;
/** @deprecated use `ensureISODate` instead  (Will be removed in v0.6) */
export const assertISODate = ensureISODate;
/** @deprecated use `ensurePosInt` instead  (Will be removed in v0.6) */
export const assertPosInt = ensurePosInt;
