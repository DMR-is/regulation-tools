/*
  An inert document for parsing HTML that may not be trusted. Internal: not
  re-exported from `utils`.
*/

let inert: Document | undefined;
let baseURI: string | undefined;

/**
 * A document with no browsing context, for parsing HTML that may not be
 * trusted (a paste, the source dialog, a stored text). Nothing in it loads
 * or runs: `<img src=x onerror=…>` set as `innerHTML` here does nothing,
 * where in the page's own document it would run.
 */
export const inertDocument = (): Document => {
  if (!inert) {
    inert = document.implementation.createHTMLDocument('');
    inert.head.append(inert.createElement('base'));
  }
  // Relative URLs resolve against the page, as they did when this parsed
  // with the page's own document (dirtyClean reads `img.src`, resolved).
  // Set only when the page's URL changed: the structured diff calls this
  // thousands of times.
  if (baseURI !== document.baseURI) {
    baseURI = document.baseURI;
    inert.querySelector('base')!.href = baseURI;
  }
  return inert;
};
