/**
 * The class names diff markup uses, from both getDiff (htmldiff) and
 * getStructuredDiff, so code that styles or reads a diff need not hard-code
 * them. Default styles for all of them ship in `diff.css`.
 */
export const DIFF_CLASSES = {
  /** `<ins>`: text added. */
  ins: 'diffins',
  /** `<del>`: text removed. */
  del: 'diffdel',
  /** `<del>` then `<ins>`: a word replaced — old, then new. */
  mod: 'diffmod',
  /** `<ins>`: formatting changed, text did not. */
  format: 'mod',
  /** `<ins>` at the new position, `<del>` at the old: a block moved. */
  move: 'diffmove',
} as const;
