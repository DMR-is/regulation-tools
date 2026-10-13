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

import { inertDocument } from './_utils/inert';
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

/**
 * Elements that load or run something, and elements that mutation XSS uses
 * to turn text into markup when HTML is parsed a second time (MathML and
 * SVG, whose namespace rules differ, and the raw-text elements). None of
 * them belongs in a regulation text.
 */
const ACTIVE_ELEMENTS = [
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'link',
  'meta',
  'base',
  'form',
  'noscript',
  'template',
  'math',
  'svg',
  'xmp',
  'noembed',
  'noframes',
  'plaintext',
  'textarea',
  'title',
].join(', ');

const URL_ATTRS = /^(href|src|xlink:href|action|formaction|srcset|poster)$/i;

/**
 * Schemes a link or image may use; anything else (javascript:, data:, …)
 * goes. `file:` stays: Word refers to the images it copies as
 * `file:///…/clip_image001.png`, and the `fsImages` warning asks the editor
 * to upload them. It cannot run script.
 */
const SAFE_SCHEMES = /^(https?|mailto|tel|file):/i;

/**
 * Whether a URL attribute may stay. Browsers ignore tabs, newlines and
 * control characters inside a scheme (`java&#9;script:`), so they are
 * removed before the check. Relative URLs and fragments are fine; images
 * may also be base64 data, which the paste pipeline uploads.
 */
const isSafeUrl = (name: string, value: string) => {
  const url = value.replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return true; // relative, or a fragment
  }
  if (name.toLowerCase() === 'src' && /^data:image\//i.test(url)) {
    return true;
  }
  return SAFE_SCHEMES.test(url);
};

const sanitizeOnce = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(ACTIVE_ELEMENTS).forEach((elm) => elm.remove());
  doc.body.querySelectorAll('*').forEach((elm) => {
    Array.from(elm.attributes).forEach(({ name, value }) => {
      if (
        /^on/i.test(name) ||
        (URL_ATTRS.test(name) && !isSafeUrl(name, value))
      ) {
        elm.removeAttribute(name);
      }
    });
  });
  return doc.body.innerHTML;
};

/**
 * Clipboard HTML made safe to touch. It is parsed in an inert document
 * (`DOMParser`: nothing loads, nothing runs), active elements, `on*`
 * handlers and unsafe URLs are removed, and this repeats until the result
 * stops changing: mutation XSS relies on HTML that reads differently when
 * it is serialised and parsed again, as the rest of the pipeline does. The
 * pipeline also parses only in an inert document (`inertDocument`), as a
 * second line of defence.
 */
export function sanitizeClipboardHtml(html: string): string {
  let clean = html;
  for (let i = 0; i < 5; i++) {
    const next = sanitizeOnce(clean);
    if (next === clean) {
      return clean;
    }
    clean = next;
  }
  // Still changing after five passes: nothing a real paste does.
  return '';
}

/** List numbering written as text at the start of an item, by type. */
const MARKERS: Record<'a' | 'A' | 'i' | 'I', RegExp> = {
  a: /^\s*[a-z][.)]\s*/,
  A: /^\s*[A-Z][.)]\s*/,
  i: /^\s*(?:x{0,3})(?:ix|iv|v?i{0,3})[.)]\s*/,
  I: /^\s*(?:X{0,3})(?:IX|IV|V?I{0,3})[.)]\s*/,
};

const markerOf = (text: string) => /^([a-zA-Z]+)[.)]\s/.exec(text)?.[1];

const toRoman = (n: number) =>
  (
    [
      [10, 'x'],
      [9, 'ix'],
      [5, 'v'],
      [4, 'iv'],
      [1, 'i'],
    ] as const
  ).reduce((out, [value, numeral]) => {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
    return out;
  }, '');

/**
 * The list type the items' markers say, if any. A single letter that is
 * also a roman numeral ("i.", "v.", "x.") is told apart by the next item:
 * "j." after "i." is lettered (a list resuming after an interrupting
 * paragraph), "vi." after "v." is roman. With no next item, "i." is roman
 * and other letters are letters. Longer roman numerals are roman.
 */
const listTypeOf = (
  first: string,
  second: string,
): keyof typeof MARKERS | undefined => {
  const marker = markerOf(first);
  if (!marker) {
    return undefined;
  }
  const lower = marker.toLowerCase();
  const upper = marker !== lower;
  const letters = upper ? 'A' : 'a';
  const romans = upper ? 'I' : 'i';
  if (marker.length === 1) {
    const isRoman = /^[ivx]$/.test(lower);
    if (!isRoman) {
      return letters;
    }
    const next = markerOf(second)?.toLowerCase();
    if (next === String.fromCharCode(lower.charCodeAt(0) + 1)) {
      return letters;
    }
    if (next === toRoman(startOf(lower, 'i') + 1)) {
      return romans;
    }
    return lower === 'i' ? romans : letters;
  }
  return /^[ivx]+$/.test(lower) ? romans : undefined;
};

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10 };

/** The number the first marker stands for: "c." is 3, "iv." is 4. */
const startOf = (marker: string, type: keyof typeof MARKERS) => {
  const m = marker.toLowerCase();
  if (type === 'a' || type === 'A') {
    return m.charCodeAt(0) - 96;
  }
  return [...m].reduce((sum, c, i) => {
    const value = ROMAN[c]!;
    const next = ROMAN[m[i + 1] || ''] || 0;
    return sum + (value < next ? -value : value);
  }, 0);
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
  const div = inertDocument().createElement('div');
  div.innerHTML = html;

  div.querySelectorAll('ol').forEach((ol) => {
    const listItems = Array.from(ol.children).filter(
      (elm) => elm.tagName === 'LI',
    );
    const first = listItems[0]?.textContent?.trim() || '';
    const second = listItems[1]?.textContent?.trim() || '';
    const type = listTypeOf(first, second);
    if (!type) {
      return;
    }
    ol.setAttribute('type', type);
    // A list that resumes at "c." starts there, not at "a.".
    const start = startOf(markerOf(first)!, type);
    if (start > 1 && !ol.hasAttribute('start')) {
      ol.setAttribute('start', String(start));
    }
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
  const div = inertDocument().createElement('div');
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
  // Loaded when a Word document is imported, not with the editor.
  const { default: mammoth } = await import('mammoth');
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
