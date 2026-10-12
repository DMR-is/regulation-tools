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

/**
 * Post-process HTML from mammoth to detect and fix alphabetical lists
 * that were converted to numbered lists
 */
export function fixAlphabeticalLists(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;

  // Find all ordered lists
  const orderedLists = div.querySelectorAll('ol');

  orderedLists.forEach((ol) => {
    const listItems = ol.querySelectorAll('li');
    if (listItems.length === 0) return;

    // Check first item for alphabetical pattern
    const firstItemText = listItems[0]?.textContent?.trim() || '';

    // Patterns: "a.", "a)", "A.", "A)", or just starting with a letter followed by punctuation
    const lowerAlphaMatch = /^([a-z])[.)]\s/.exec(firstItemText);
    const upperAlphaMatch = /^([A-Z])[.)]\s/.exec(firstItemText);
    const lowerRomanMatch = /^(i{1,3}|iv|v|vi{1,3}|ix|x)[.)]\s/i.exec(
      firstItemText,
    );
    const upperRomanMatch = /^(I{1,3}|IV|V|VI{1,3}|IX|X)[.)]\s/.exec(
      firstItemText,
    );

    if (lowerAlphaMatch) {
      ol.setAttribute('type', 'a');
    } else if (upperAlphaMatch) {
      ol.setAttribute('type', 'A');
    } else if (
      lowerRomanMatch &&
      firstItemText === firstItemText.toLowerCase()
    ) {
      ol.setAttribute('type', 'i');
    } else if (upperRomanMatch && /^[IVX]/.test(firstItemText)) {
      ol.setAttribute('type', 'I');
    }

    // Remove the letter/number prefix from list items if it exists
    if (
      lowerAlphaMatch ||
      upperAlphaMatch ||
      lowerRomanMatch ||
      upperRomanMatch
    ) {
      listItems.forEach((li) => {
        const text = li.textContent?.trim() || '';
        const cleanedText = text.replace(/^[a-zA-Z\d]+[.)]\s*/, '');
        if (cleanedText !== text) {
          li.textContent = cleanedText;
        }
      });
    }
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
      content = content.replace(
        /<p>(\d+\.\s+gr\.(\s+)?)(<br\s+?\/>)?/g,
        '<h3 class="article__title">$1</h3><p>',
      );
    }
  }

  return content;
}

// ---------------------------------------------------------------------------

// NOTE: a fresh RegExp per call, since the `g` flag makes it stateful
const getImgTagRegex = () =>
  /<img.*?src=["'](data:image\/(png|jpeg|svg\+xml);base64,.*?)["'].*?>/g;

/**
 * Whether `uploadInlineImages` would find any base64 images to upload.
 * Lets a caller insert image-less content synchronously.
 */
export const hasInlineImages = (html: string): boolean =>
  getImgTagRegex().test(html);

type ImageInfo = {
  base64: string;
  placeholder: string;
};

/**
 * Uploads every base64 `<img>` in `html` through `fileUploader` and returns
 * the HTML with each replaced by `<img src alt>` (or a failure marker).
 * Uploads start in document order, synchronously up to the concurrency
 * limit, and the promise never rejects on a failed upload.
 */
export async function uploadInlineImages(
  html: string,
  fileUploader: PasteImageUploader,
  opts: UploadInlineImagesOptions = {},
): Promise<string> {
  const concurrencyLimit = opts.concurrency ?? Infinity;

  const imgTagRegex = getImgTagRegex();
  let match: RegExpExecArray | null;
  const images: Array<ImageInfo> = [];
  let contentWithPlaceholders = html;

  // Extract images from the content
  while ((match = imgTagRegex.exec(html)) !== null) {
    const placeholder = `__IMAGE_PLACEHOLDER_${images.length}__`;
    if (match[1]) {
      images.push({ base64: match[1], placeholder });
    }
    contentWithPlaceholders = contentWithPlaceholders.replace(
      match[0],
      placeholder,
    );
  }

  // Upload single image
  const uploadImage = async (image: ImageInfo): Promise<void> => {
    const { base64, placeholder } = image;
    const { file, filename } = base64ToBlob(base64);
    if (file) {
      const blobInfo = convertFileToBlobInfo(file);
      return new Promise<void>((resolve) => {
        fileUploader(
          blobInfo,
          (url: string) => {
            // Replace the placeholder with the uploaded image URL
            contentWithPlaceholders = contentWithPlaceholders.replace(
              placeholder,
              `<img src="${url}" alt="${filename}" />`,
            );
            resolve();
          },
          (error: string) => {
            console.error('Image upload failed:', error);
            // Replace the placeholder with a failure message or icon
            contentWithPlaceholders = contentWithPlaceholders.replace(
              placeholder,
              `<span class="image-upload-failed">[Image upload failed]</span>`,
            );
            resolve(); // Resolve even on error to ensure all promises complete
          },
        );
      });
    } else {
      return Promise.resolve();
    }
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

  return contentWithPlaceholders;
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
  uploadInlineImages(cleanPastedHtml(fixAlphabeticalLists(html)), fileUploader);

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
