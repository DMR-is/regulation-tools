/*
  Reading the changes recorded on a base regulation (its diff HTML) for
  findAmendingMismatches.
*/

import { ARTICLE_RE, DIVISION_RE } from '../_structuredDiff/parse';
import { AsDiv } from '../_structuredDiff/types';
import { HTMLText } from '../types';
import { isHeading } from './amending';
import { numbersIn, Sides, sidesOf, valueKey } from './text';

export type Change = {
  /** The base regulation's name, when given. */
  regulation?: string;
  /** The section the change is in, as the diff names it (old numbering). */
  section?: string;
  heading: boolean;
  sides: Sides;
};

/** A changed element of a diff, not part of the signature, not equal. */
const isChanged = (el: Element) => {
  const type = el.getAttribute('data-diff');
  return !!type && type !== 'equal' && !el.hasAttribute('data-diff-signature');
};

/**
 * The changed elements of one base regulation's diff. A diff without
 * `data-diff` attributes (from `getDiff`) counts as changed throughout.
 */
export const readChanges = (
  diff: HTMLText,
  regulation: string | undefined,
  asDiv: AsDiv,
): Array<Change> => {
  const root = asDiv(diff);
  const structured = !!root.querySelector('[data-diff]');
  const out: Array<Change> = [];
  let section: string | undefined;
  for (const el of Array.from(root.children)) {
    section = el.getAttribute('data-diff-section') || section;
    if (structured && !isChanged(el)) {
      continue;
    }
    out.push({
      regulation,
      section,
      heading: isHeading(el),
      sides: sidesOf(el),
    });
  }
  return out;
};

/** The numbers a change brings in: inserted, and not in the block before. */
export const newNumbers = ({ sides }: Change) => {
  const before = new Set(numbersIn(sides.old).map(valueKey));
  return numbersIn(sides.new).filter(
    (t) =>
      sides.inserted
        .subarray(t.index, t.index + t.raw.length)
        .some((x) => x === 1) && !before.has(valueKey(t)),
  );
};

/**
 * A heading's label, which amending text writes apart from the title:
 * "6. gr. a." in "6. gr. a. Gildistaka.", "IV. KAFLI", "Ákvæði til bráðabirgða".
 */
export const stripLabel = (text: string) =>
  text
    .replace(ARTICLE_RE, '')
    .replace(DIVISION_RE, '')
    .replace(
      /^(?:ákvæði til bráðabirgða|bráðabirgðaákvæði|viðauki|fylgiskjal)\s*[IVXLC\d.]*/iu,
      '',
    )
    .replace(/^[\s.,;:-]+/, '');
