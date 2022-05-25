/** Cleans up/normalizes Regulation titles
 *
 * It should be safe to run multiple times on the same title
 */
export const cleanTitle = (title: string) =>
  title
    // Remove all newlines
    .replace(/[\r\n]+/g, ' ')
    .trim()
    // Replace capitalized REGLUGERÐ with Reglugerð
    .replace(/^REGLUGERÐ/, 'Reglugerð')
    // collapse and normalize spaces
    .replace(/\s\s+/g, ' ')
    // Remove soft-hypoens (&shy; char-code 173, \u00ad)
    .replace(/\u00ad/g, '');
