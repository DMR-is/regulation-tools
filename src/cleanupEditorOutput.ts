import qq from '@hugsmidjan/qj/qq';
import zapElm from '@hugsmidjan/qj/zapElm';
import { Regulation, HTMLText, RegulationTextProps } from './types';
import { CleanerFn, makeMutators } from './_cleanup/cleanup-utils';
import { cleanTitle } from './cleanTitle';
/* eslint-disable @typescript-eslint/no-unused-vars */
import { asDiv, Node, Text, DocumentFragment, E } from './_cleanup/serverDOM';
/* eslint-ensable @typescript-eslint/no-unused-vars */
import { FILE_SERVER } from './constants';
import {
  // rename for @deprecation
  combineTextAppendixesComments as _combineTextAppendixesComments,
  extractAppendixesAndComments as _extractAppendixesAndComments,
  eliminateComments as _eliminateComments,
} from './textHelpers';

/** @deprecated import this method from `@island.is/regulations-tools/textHelpers` instead  (Will be removed in v0.6) */
export const extractAppendixesAndComments = _extractAppendixesAndComments;
/** @deprecated import this method from `@island.is/regulations-tools/textHelpers` instead  (Will be removed in v0.6) */
export const combineTextAppendixesComments = _combineTextAppendixesComments;
/** @deprecated import this method from `@island.is/regulations-tools/textHelpers` instead  (Will be removed in v0.6) */
export const eliminateComments = _eliminateComments;

// ---------------------------------------------------------------------------

export type { CleanerFn };

const M = makeMutators(asDiv, E, Node);

// ---------------------------------------------------------------------------

const flagIndents = (root: HTMLElement) => {
  qq<HTMLSpanElement>('span[data-legacy-indenter]', root).forEach((elm) => {
    // Decimate all non-space characters and HTML content!
    elm.textContent = elm.textContent
      // trim "normal-space" padding added by last run of M.rehydrateIndents()
      .replace(/(?:^ | $)/g, '');
    elm.setAttribute('data-legacy-indenter', String(elm.textContent.length));
    elm.textContent = '🍌';
    elm.before(' ');
    elm.after(' ');
  });
};

// ---------------------------------------------------------------------------

const cleanUploadedMediaUrls = (root: HTMLElement) => {
  // Strip cache-busting query-strings off uploaded image URLs
  qq<HTMLImageElement>('img[src^="' + FILE_SERVER + '/files/"]', root).forEach(
    (elm) => {
      elm.setAttribute(
        'src',
        (elm.getAttribute('src') as string).replace(/\?.+$/, ''),
      );
    },
  );
  qq<HTMLAnchorElement>('a[href^="' + FILE_SERVER + '/files/"]', root).forEach(
    (elm) => {
      elm.setAttribute(
        'href',
        (elm.getAttribute('href') as string).replace(/\?.+$/, ''),
      );
    },
  );
};

// ---------------------------------------------------------------------------

// Purge stuff accidentally saved/left in by early version of `cleanupEditorOutput`
const fixBadOldEditorCleanup = (root: HTMLElement) => {
  qq('[data-indenting]', root).forEach((elm) => {
    elm.removeAttribute('data-indenting');
  });
};

// ---------------------------------------------------------------------------

const normalizeTagNames = (root: HTMLElement) => {
  qq('section:not(.appendix)', root).forEach(zapElm);
  // Not sure if this is required
  qq('b', root).forEach(M._transmogrifyInto('strong'));
  qq('i', root).forEach(M._transmogrifyInto('em'));
};

// ---------------------------------------------------------------------------

const normalizeClassNames = (root: HTMLElement) => {
  // fyrsta útgáfa af dirtyClean vistaði Undirritun1 og Undirritun2
  qq('.Undirritun1, .Undirritun2', root).forEach((elm) => {
    elm.className = 'Undirritun';
  });

  qq<HTMLParagraphElement>('.doc__title', root).forEach((elm) => {
    // eslint-disable-next-line deprecation/deprecation
    elm.align = 'center';
  });
};

// ---------------------------------------------------------------------------

const setTitleNameEms = (root: HTMLElement) => {
  qq(
    '' +
      '.article__title *:not(em),' +
      '.subchapter__title *:not(em),' +
      '.chapter__title *:not(em),' +
      '.section__title *:not(em),' +
      '.article__title > em ~ em,' +
      '.subchapter__title > em ~ em,' +
      '.chapter__title > em ~ em,' +
      '.section__title > em ~ em',
    root,
  ).forEach(zapElm);

  qq<HTMLHeadingElement>(
    '.article__title, .subchapter__title, .chapter__title, .section__title',
    root,
  ).forEach((elm) => {
    elm.removeAttribute('align');
  });

  const expandToEnd = (elm: Element) => {
    while (elm.nextSibling) {
      elm.append(elm.nextSibling);
    }
  };
  const enforcePrecedingSpace = (elm: Element) => {
    if (!elm.previousSibling?.textContent.endsWith(' ')) {
      elm.before(' ');
    }
  };

  qq('.article__title em', root).forEach((elm) => {
    elm.className = 'article__name';
    expandToEnd(elm);
    enforcePrecedingSpace(elm);
  });
  qq('.subchapter__title em', root).forEach((elm) => {
    elm.className = 'subchapter__name';
    expandToEnd(elm);
    enforcePrecedingSpace(elm);
  });
  qq('.chapter__title em', root).forEach((elm) => {
    elm.className = 'chapter__name';
    expandToEnd(elm);
    enforcePrecedingSpace(elm);
  });
  qq('.section__title em', root).forEach((elm) => {
    elm.className = 'section__name';
    expandToEnd(elm);
    enforcePrecedingSpace(elm);
  });
};

// ---------------------------------------------------------------------------

const removeAutogeneratedWarnings = (root: HTMLElement) => {
  qq('[data-autogenerated]', root).forEach((elm) => {
    elm.removeAttribute('data-autogenerated');
  });
};

// ---------------------------------------------------------------------------

// NOTE: This is safe to run multiple times on the same text.
// a.k.a. an idempotent function
const cleanupEditorOutput = (html: HTMLText): HTMLText => {
  const root = asDiv(html);

  const mutators = [
    // M.__logOuterHTML(),
    flagIndents,
    M.removeCommentsAndUnescapeText,
    M.removeDisallowedElements,
    fixBadOldEditorCleanup,
    M.saveCFEmailMarkers,
    // zapNoisyElements,
    // insertBrAfterCite,
    // cleanupTables,
    M.cleanUpLists,
    M.cleanupBlockquotes,
    M.convertStylesToHtml,
    normalizeTagNames,
    normalizeClassNames,
    M.fixImages,
    cleanUploadedMediaUrls,

    M.removeUnwantedAttributes,

    M.reApplyStyleAttrs,

    // convertHacksToText,
    M.removeEmptyElms,
    M.zapRedundantDecendants,
    M.pushSpaceOutsideElements,
    M.trimSpacesAroundBlocks,
    M.paragraphizeStrayContent,
    M.trimBrs,
    M.max2AdjacentBrs,
    M.splitPsOnDoubleBrs,

    M.zapRedundantParagraphs,

    M.mergeAdjacentInlineElms,
    // detectFootnoteMarkers,
    // detectFootnotes,
    M.zapsLeftoverSpans, // DECIDE: do later to gain from mergeAdjacentInlineElms ???
    M.reverseLinkedFootnoteMarkers,
    M.injectSpaceAfterBr,

    /* Magic starts */

    setTitleNameEms,
    // detectBlockquoteLists,
    // guessDocTitle,
    // guessTablePurpose,

    // findChapterTitleByClasses,
    // findArticleTitleByClasses,

    // guessChapterTitles,
    // guessArticleTitles, // run instantly to avoid false-positive chapter names

    // findChapterNameByClasses,
    // guessChapterNames,

    // guessArticleTitles, // again as guessChapterNames might have left over something
    // findArticleNameByClasses,
    // guessArticleNames,

    // removeIncorrectDagsClass,
    // guessFHUndirskr,
    // guessDags,
    // normalizeSignatureTags,

    // cleanUpEmptyParagrphs,
    // removeSection1Classes,

    /* Magic ends */

    removeAutogeneratedWarnings,

    M.rehydrateIndents,

    M.sortAttributes,
  ];

  mutators.forEach((mutator) => mutator && mutator(root));

  return root.innerHTML as HTMLText;
};

// ===========================================================================

export const editorOutputCleaner: CleanerFn = (html) =>
  M.prettify(cleanupEditorOutput(html));

editorOutputCleaner.prettify = M.prettify;

// ===========================================================================

export const cleanupAllEditorOutputs = ({
  text,
  appendixes,
  comments,
}: RegulationTextProps): RegulationTextProps => ({
  text: cleanupEditorOutput(text),
  appendixes: appendixes.map(({ title, text }) => ({
    title: cleanTitle(title),
    text: cleanupEditorOutput(text),
  })),
  comments: cleanupEditorOutput(comments),
});

// ===========================================================================

export const cleanupAndCombineEditorOutputs = (
  text: HTMLText,
  appendixes: Regulation['appendixes'] | undefined,
  comments: HTMLText | undefined,
): HTMLText => {
  const clean = cleanupAllEditorOutputs({
    text,
    appendixes: appendixes || [],
    comments: comments || '',
  });
  const cleanCombined = _combineTextAppendixesComments(
    clean.text,
    clean.appendixes,
    clean.comments,
  );
  return M.prettify(cleanCombined) as HTMLText;
};

// ===========================================================================

/** Takes text_locked/migrated regulation text (with inlined/wrapped appendixes)
 * splits it up, runs each text segment (the main regulation text and each appendix.text)
 * through cleanupEditorOutput, recombines it and prettifies the whole thing.
 *
 * This is great for cleaning up (updating) older regulation text field values
 * in preparataion for change-diffing against RegulationChange effects...
 */
export const cleanupRegulationText = (regulationText: HTMLText): HTMLText => {
  const { text, appendixes, comments } = _extractAppendixesAndComments(
    regulationText as HTMLText,
  );
  return cleanupAndCombineEditorOutputs(text, appendixes, comments);
};
