import { IntPositive, ISODate, RegName, RegQueryName } from '../types';

// ---------------------------------------------------------------------------

const reRegQueryNameFlex = /^\d{1,4}-\d{4}$/;

/** Returns a fully zero-padded RegQueryName.
 *
 * Returns `undefined` if the slug doesn't roughly look like a valid regulation number
 *
 *  Example: '23-2020' --> '0023-2020'
 *  Example: '0123-202' --> undefined
 */
export const assertNameSlug = (slug?: string): RegQueryName | undefined => {
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
export const assertRegName = (slug?: string): RegName | undefined => {
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
export const assertISODate = (maybeISODate?: string): ISODate | undefined => {
  if (smellsLikeISODate(maybeISODate)) {
    const date = new Date(maybeISODate).toISOString().slice(0, 10) as ISODate;
    if (date === maybeISODate) {
      return date;
    }
  }
};

// ---------------------------------------------------------------------------

export const assertPosInt = (
  maybeNumber?: string | number,
): IntPositive | undefined => {
  const num = Number(maybeNumber);
  return num && num > 0 && num === Math.floor(num)
    ? (num as IntPositive)
    : undefined;
};
