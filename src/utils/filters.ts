/** Type-guarding filter function to weed out nully values. */
export const isNonNull = <T>(val: T): val is Exclude<T, undefined | null> =>
  val !== null;

export const isDate = (date: unknown): date is Date =>
  date instanceof Date && !isNaN(date.valueOf());
