/*
  The paste and Word (.docx) import pipeline, shared by both editors
  (`EditorFrame` on TinyMCE and EditorV2 on Tiptap) so they run identical
  code. Editor-agnostic: the callers own interception, guards, loading state
  and insertion.

    paste: fixAlphabeticalLists → cleanPastedHtml → uploadInlineImages (no limit)
    Word:  prepareWordDocument (mammoth + fixAlphabeticalLists)
           → cleanPastedHtml → uploadInlineImages (20 at a time)

  `preparePastedHtml`/`prepareWordHtml` always resolve asynchronously.
  EditorFrame composes the same steps itself, guarded by `hasInlineImages`,
  so image-less content is still inserted synchronously there.

  Internal module, not exported from the package entry points.
*/

import mammoth from 'mammoth';

import { base64ToBlob, convertFileToBlobInfo } from './_utils/fileHandlers';
import dirtyClean from './dirtyClean-browser';
import { HTMLText } from './types';

// ---------------------------------------------------------------------------

/**
 * The parts of an upload handler the pipeline uses. Structural, so this
 * module needs no TinyMCE types; `EditorFileUploader` (TinyMCE's
 * `images_upload_handler`) satisfies it.
 */
export type PasteImageUploader = (
  blobInfo: ReturnType<typeof convertFileToBlobInfo>,
  success: (url: string) => void,
  failure: (err: string) => void,
) => void;

export type UploadInlineImagesOptions = {
  /** Max uploads in flight at once. Default: no limit. */
  concurrency?: number;
};

/** Concurrency the Word import has always used. */
export const WORD_IMAGE_UPLOAD_CONCURRENCY = 20;

// ---------------------------------------------------------------------------

/** Elements that load or run something; never part of a regulation text. */
const ACTIVE_ELEMENTS =
  'script, style, iframe, frame, frameset, object, embed, applet, link, meta, base, form, noscript, template';

/**
 * Clipboard HTML made safe to touch. It comes from anywhere, and the rest of
 * the pipeline parses it with the page's own document (`innerHTML`), where
 * `<img src=x onerror=…>` would run. So it is parsed here in an inert
 * document (`DOMParser`: nothing loads, nothing runs), and active elements,
 * `on*` handlers and `javascript:` URLs are removed before anything else
 * sees it. The rest of the pipeline is unchanged.
 */
export function sanitizeClipboardHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(ACTIVE_ELEMENTS).forEach((elm) => elm.remove());
  doc.body.querySelectorAll('*').forEach((elm) => {
    Array.from(elm.attributes).forEach(({ name, value }) => {
      if (
        /^on/i.test(name) ||
        (/^(href|src|xlink:href|action|formaction)$/i.test(name) &&
          /^\s*(javascript|vbscript):/i.test(value))
      ) {
        elm.removeAttribute(name);
      }
    });
  });
  return doc.body.innerHTML;
}

/** List numbering written as text at the start of an item, by type. */
const MARKERS: Record<'a' | 'A' | 'i' | 'I', RegExp> = {
  a: /^\s*[a-z][.)]\s*/,
  A: /^\s*[A-Z][.)]\s*/,
  i: /^\s*(?:x{0,3})(?:ix|iv|v?i{0,3})[.)]\s*/,
  I: /^\s*(?:X{0,3})(?:IX|IV|V?I{0,3})[.)]\s*/,
};

/**
 * The list type the first item's marker says, if any. "i." and "I." start
 * roman lists (a lettered list starts at "a."); any other single letter is
 * lettered; other roman numerals ("ii.", "iv.") are roman.
 */
const listTypeOf = (first: string): keyof typeof MARKERS | undefined => {
  const marker = /^([a-zA-Z]+)[.)]\s/.exec(first)?.[1];
  if (!marker) {
    return undefined;
  }
  if (marker === 'i' || marker === 'I') {
    return marker;
  }
  if (marker.length === 1) {
    return marker === marker.toLowerCase() ? 'a' : 'A';
  }
  if (/^[ivx]+$/.test(marker)) {
    return 'i';
  }
  if (/^[IVX]+$/.test(marker)) {
    return 'I';
  }
  return undefined;
};

/**
 * Removes a marker from the start of an element's text, keeping its markup:
 * the characters are taken off the leading text nodes, wherever they are.
 */
const stripMarker = (elm: Element, marker: RegExp) => {
  const match = marker.exec(elm.textContent || '');
  if (!match || !match[0].trim()) {
    return;
  }
  let remove = match[0].length;
  const walker = elm.ownerDocument.createTreeWalker(elm, 4 /* SHOW_TEXT */);
  while (remove > 0 && walker.nextNode()) {
    const text = walker.currentNode as Text;
    const take = Math.min(remove, text.data.length);
    text.data = text.data.slice(take);
    remove -= take;
  }
};

/**
 * Post-process HTML from mammoth and pastes: an ordered list whose items
 * carry their numbering as text ("a. …", "i) …") gets that numbering as its
 * `type`, and the markers are taken out of the items' text. The items keep
 * their formatting, links and nested lists.
 */
export function fixAlphabeticalLists(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;

  div.querySelectorAll('ol').forEach((ol) => {
    const listItems = Array.from(ol.children).filter(
      (elm) => elm.tagName === 'LI',
    );
    const first = listItems[0]?.textContent?.trim() || '';
    const type = listTypeOf(first);
    if (!type) {
      return;
    }
    ol.setAttribute('type', type);
    listItems.forEach((li) => stripMarker(li, MARKERS[type]));
  });

  return div.innerHTML;
}

// ---------------------------------------------------------------------------

/**
 * Runs `dirtyClean` on pasted/imported HTML. Inline snippets lose the `<p>`
 * wrapper so they merge into the current paragraph; block content without
 * existing article titles gets `<p>N. gr. …` promoted to article headings.
 */
export function cleanPastedHtml(content: string): string {
  // Clean the content
  const isInlineSnippet =
    !/<(?:p|div|ul|ol|li|table|tbody|thead|caption|tfoot|tr|td|th|blockquote|section|h[1-6])[ >]/i.test(
      content,
    );
  content = dirtyClean(content as HTMLText);

  if (isInlineSnippet) {
    content = content.replace(/^<p>/, '').replace(/<\/p>$/, '');
  } else {
    if (!/article__title/.test(content)) {
      // A paragraph starting "N. gr." becomes an article title; the rest of
      // the paragraph, if any, stays a paragraph after it.
      content = content.replace(
        /<p>(\d+\.\s+gr\.(\s+)?)(<br\s*\/?>\s*)?(<\/p>)?/g,
        (_, title: string, _space, _br, end?: string) =>
          `<h3 class="article__title">${title}</h3>` + (end ? '' : '<p>'),
      );
    }
  }

  return content;
}

// ---------------------------------------------------------------------------

/** Inline images to upload: base64 data URIs only, as before. */
const INLINE_IMAGES = 'img[src^="data:image/"][src*=";base64,"]';

/**
 * Whether `uploadInlineImages` would find any base64 images to upload.
 * Lets a caller insert image-less content synchronously.
 */
export const hasInlineImages = (html: string): boolean =>
  /data:image\//.test(html) && !!asContainer(html).querySelector(INLINE_IMAGES);

const asContainer = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
};

const failureMarker = (doc: Document) => {
  const span = doc.createElement('span');
  span.className = 'image-upload-failed';
  span.textContent = '[Image upload failed]';
  return span;
};

/**
 * Uploads every base64 `<img>` in `html` through `fileUploader` and returns
 * the HTML with each one's `src` set to its uploaded URL, or the image
 * replaced by a failure marker. The images are found as elements, not by
 * pattern, so other images are never touched. Uploads start in document
 * order, synchronously up to the concurrency limit, and the promise never
 * rejects on a failed upload.
 */
export async function uploadInlineImages(
  html: string,
  fileUploader: PasteImageUploader,
  opts: UploadInlineImagesOptions = {},
): Promise<string> {
  const concurrencyLimit = opts.concurrency ?? Infinity;
  const container = asContainer(html);
  const images = Array.from(
    container.querySelectorAll<HTMLImageElement>(INLINE_IMAGES),
  );

  // Upload single image
  const uploadImage = async (img: HTMLImageElement): Promise<void> => {
    let blob: ReturnType<typeof base64ToBlob>;
    try {
      blob = base64ToBlob(img.getAttribute('src') || '');
    } catch {
      blob = { file: null, filename: '' };
    }
    const { file, filename } = blob;
    if (!file) {
      // Not data we can upload: a marker, never the raw data or a placeholder.
      img.replaceWith(failureMarker(container.ownerDocument));
      return;
    }
    return new Promise<void>((resolve) => {
      fileUploader(
        convertFileToBlobInfo(file),
        (url: string) => {
          img.setAttribute('src', url);
          // Pasted images keep their own alt text.
          img.getAttribute('alt') || img.setAttribute('alt', filename);
          resolve();
        },
        (error: string) => {
          console.error('Image upload failed:', error);
          img.replaceWith(failureMarker(container.ownerDocument));
          resolve(); // Resolve even on error to ensure all promises complete
        },
      );
    });
  };

  // Limit the number of concurrent uploads
  const queue = [...images];
  const activeUploads: Array<Promise<void>> = [];

  while (queue.length > 0 || activeUploads.length > 0) {
    while (queue.length > 0 && activeUploads.length < concurrencyLimit) {
      const image = queue.shift();
      if (image) {
        const uploadPromise = uploadImage(image).finally(() => {
          // Remove the promise from activeUploads once it completes
          activeUploads.splice(activeUploads.indexOf(uploadPromise), 1);
        });
        activeUploads.push(uploadPromise);
      }
    }
    // Wait for any of the active uploads to complete before adding more
    await Promise.race(activeUploads);
  }

  return container.innerHTML;
}

// ---------------------------------------------------------------------------

/**
 * Converts a .docx file to HTML with mammoth, images inlined as base64
 * data URIs (uploaded later by `uploadInlineImages`), and fixes its
 * alphabetical lists. Rejects if mammoth cannot read the file.
 */
export async function prepareWordDocument(
  arrayBuffer: ArrayBuffer,
): Promise<string> {
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async function (element) {
        const imageBuffer = await element.read('base64');
        return {
          src: 'data:' + element.contentType + ';base64,' + imageBuffer,
        };
      }),
    },
  );

  let docContent = result.value; // Extracted HTML content from the Word document
  // A .docx is as untrusted as the clipboard (mammoth keeps hyperlinks).
  docContent = sanitizeClipboardHtml(docContent);
  docContent = fixAlphabeticalLists(docContent); // Fix alphabetical lists
  return docContent;
}

/**
 * Plain text from the clipboard as HTML, the way TinyMCE 5's paste plugin
 * made it (`pasteText` → `normalizeWhitespace` → `toBlockElements`), so it
 * goes through the paste pipeline as it did in the current editor:
 * paragraphs at blank lines, `<br />` at single line breaks, tabs as four
 * spaces, and runs of spaces kept with non-breaking spaces.
 */
export function plainTextToHtml(text: string): string {
  const encoded = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '    ');

  const NBSP = '\u00a0';
  const isNewline = (i: number) => encoded[i] === '\n' || encoded[i] === '\r';
  let normalized = '';
  let prevIsSpace = false;
  for (let i = 0; i < encoded.length; i++) {
    const c = encoded[i]!;
    if (' \f\t\x0B'.includes(c) || c === NBSP) {
      if (
        prevIsSpace ||
        i === 0 ||
        i === encoded.length - 1 ||
        isNewline(i + 1)
      ) {
        normalized += NBSP;
        prevIsSpace = false;
      } else {
        normalized += ' ';
        prevIsSpace = true;
      }
    } else {
      normalized += c;
      prevIsSpace = c === '\n' || c === '\r';
    }
  }

  const paragraphs = normalized
    .split(/\n\n/)
    .map((p) => p.split(/\n/).join('<br />'));
  return paragraphs.length === 1
    ? paragraphs[0]!
    : paragraphs.map((p) => `<p>${p}</p>`).join('');
}

/** The full paste pipeline: returns the HTML to insert. */
export const preparePastedHtml = (
  html: string,
  fileUploader: PasteImageUploader,
): Promise<string> =>
  uploadInlineImages(
    cleanPastedHtml(fixAlphabeticalLists(sanitizeClipboardHtml(html))),
    fileUploader,
  );

/**
 * The full Word import pipeline, after `prepareWordDocument`: returns the
 * HTML to insert.
 */
export const prepareWordHtml = (
  html: string,
  fileUploader: PasteImageUploader,
): Promise<string> =>
  uploadInlineImages(cleanPastedHtml(html), fileUploader, {
    concurrency: WORD_IMAGE_UPLOAD_CONCURRENCY,
  });
