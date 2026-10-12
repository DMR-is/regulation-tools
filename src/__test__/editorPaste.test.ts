import './editorV2-dom';

import mammoth from 'mammoth';

import type * as EditorPaste from '../_editorPaste';

jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    convertToHtml: jest.fn(),
    images: { imgElement: jest.fn((fn: unknown) => ({ fn })) },
  },
}));

// `dirtyClean-browser` binds these DOM globals when it loads, so they must
// exist before `_editorPaste` is required.
const g = globalThis as Record<string, unknown>;
const win = g.window as Record<string, unknown>;
g.Node ??= win.Node;
g.Text ??= win.Text;
g.DocumentFragment ??= win.DocumentFragment;

const {
  cleanPastedHtml,
  fixAlphabeticalLists,
  hasInlineImages,
  prepareWordDocument,
  preparePastedHtml,
  plainTextToHtml,
  prepareWordHtml,
  uploadInlineImages,
  WORD_IMAGE_UPLOAD_CONCURRENCY,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('../_editorPaste') as typeof EditorPaste;

// ---------------------------------------------------------------------------

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==';
const img = (n: number) => `<img src="${PNG}" data-n="${n}">`;

type Upload = {
  name: string;
  success: (url: string) => void;
  failure: (err: string) => void;
};

/** An uploader that holds every upload until the test settles it. */
const makeUploader = () => {
  const pending: Array<Upload> = [];
  const calls: Array<string> = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const uploader = jest.fn<void, Parameters<EditorPaste.PasteImageUploader>>(
    (blobInfo, success, failure) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const name = blobInfo.filename() as string;
      calls.push(name);
      pending.push({
        name,
        success: (url) => {
          inFlight--;
          success(url);
        },
        failure: (err) => {
          inFlight--;
          failure(err);
        },
      });
    },
  );
  return {
    uploader,
    pending,
    calls,
    getMaxInFlight: () => maxInFlight,
  };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Settles uploads in arrival order until `done` resolves. */
const drain = async <T>(
  done: Promise<T>,
  pending: Array<Upload>,
  settle: (u: Upload, i: number) => void,
): Promise<T> => {
  let finished = false;
  done.then(() => {
    finished = true;
  });
  let i = 0;
  while (!finished) {
    const u = pending.shift();
    if (u) {
      settle(u, i++);
    }
    await flush();
  }
  return done;
};

let consoleErrorSpy: jest.SpyInstance;
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// ---------------------------------------------------------------------------

describe('fixAlphabeticalLists', () => {
  it('detects lower-alpha lists and strips the prefixes', () => {
    expect(
      fixAlphabeticalLists('<ol><li>a. fyrsti</li><li>b) annar</li></ol>'),
    ).toBe('<ol type="a"><li>fyrsti</li><li>annar</li></ol>');
  });

  it('detects upper-alpha lists', () => {
    expect(
      fixAlphabeticalLists('<ol><li>A. fyrsti</li><li>B. annar</li></ol>'),
    ).toBe('<ol type="A"><li>fyrsti</li><li>annar</li></ol>');
  });

  it('detects lower-roman lists', () => {
    expect(
      fixAlphabeticalLists('<ol><li>ii. annar</li><li>iii. þriðji</li></ol>'),
    ).toBe('<ol type="i"><li>annar</li><li>þriðji</li></ol>');
  });

  it('detects upper-roman lists', () => {
    expect(
      fixAlphabeticalLists('<ol><li>II. annar</li><li>III. þriðji</li></ol>'),
    ).toBe('<ol type="I"><li>annar</li><li>þriðji</li></ol>');
  });

  it('leaves plain ordered lists and unordered lists alone', () => {
    const html =
      '<ol><li>fyrsti</li><li>annar</li></ol><ul><li>a. stafur</li></ul>';
    expect(fixAlphabeticalLists(html)).toBe(html);
  });
});

// ---------------------------------------------------------------------------

describe('cleanPastedHtml', () => {
  it('turns "N. gr." paragraphs into article titles', () => {
    expect(cleanPastedHtml('<p>1. gr. Texti greinar.</p><p>2. gr.</p>')).toBe(
      '<h3 class="article__title">1. gr. </h3><p>Texti greinar.</p>' +
        // A paragraph that is only "2. gr." leaves no empty <p> behind.
        '<h3 class="article__title">2. gr.</h3>',
    );
  });

  it('skips the heading detection when article titles already exist', () => {
    const out = cleanPastedHtml(
      '<h3 class="article__title">1. gr.</h3><p>2. gr. Texti.</p>',
    );
    expect(out).toContain('<p>2. gr. Texti.</p>');
    expect(out.match(/article__title/g)).toHaveLength(1);
  });

  it('does not wrap inline snippets in a paragraph', () => {
    expect(cleanPastedHtml('Texti með <strong>feitletrun</strong>')).toBe(
      'Texti með <strong>feitletrun</strong>',
    );
  });

  it('keeps block content in paragraphs', () => {
    expect(cleanPastedHtml('<div>Texti</div>')).toMatch(/^<p>Texti<\/p>$/);
  });
});

// ---------------------------------------------------------------------------

describe('uploadInlineImages', () => {
  it('detects base64 images', () => {
    expect(hasInlineImages(`<p>${img(1)}</p>`)).toBe(true);
    expect(hasInlineImages('<p><img src="/a.png"></p>')).toBe(false);
    expect(hasInlineImages('<p>data:image/png;base64,AAAA</p>')).toBe(false);
  });

  it('replaces uploaded images with their URL', async () => {
    const { uploader, pending } = makeUploader();
    const result = await drain(
      uploadInlineImages(`<p>A ${img(1)} B</p>`, uploader),
      pending,
      (u) => u.success('/files/x.png'),
    );
    expect(uploader).toHaveBeenCalledTimes(1);
    // The image keeps its own attributes; only `src` (and a missing alt) change.
    expect(result).toMatch(
      /^<p>A <img src="\/files\/x\.png" data-n="1" alt="\d+\.png"> B<\/p>$/,
    );
  });

  it('marks failed uploads and still resolves', async () => {
    const { uploader, pending } = makeUploader();
    const result = await drain(
      uploadInlineImages(`<p>${img(1)}</p><p>${img(2)}</p>`, uploader),
      pending,
      (u, i) => (i === 0 ? u.failure('nope') : u.success('/ok.png')),
    );
    expect(result).toMatch(
      new RegExp(
        '^<p><span class="image-upload-failed">\\[Image upload failed\\]</span></p>' +
          '<p><img src="/ok\\.png" data-n="2" alt="\\d+\\.png"></p>$',
      ),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Image upload failed:',
      'nope',
    );
  });

  it('keeps images in document order, whatever order uploads finish in', async () => {
    const { uploader, pending } = makeUploader();
    const html = [1, 2, 3].map((n) => `<p>${img(n)}</p>`).join('');
    const done = uploadInlineImages(html, uploader);
    // Uploads start in document order …
    const started = pending.splice(0);
    expect(started).toHaveLength(3);
    // … and finish in reverse
    started[2]!.success('/3.png');
    started[1]!.success('/2.png');
    started[0]!.success('/1.png');
    const result = await done;
    expect(result.match(/src="([^"]+)"/g)).toEqual([
      'src="/1.png"',
      'src="/2.png"',
      'src="/3.png"',
    ]);
  });

  it('starts every upload at once without a concurrency limit', () => {
    const { uploader, getMaxInFlight } = makeUploader();
    const html = Array.from({ length: 30 }, (_, n) => img(n)).join('');
    void uploadInlineImages(html, uploader);
    // Synchronously, as the TinyMCE paste handler always has
    expect(uploader).toHaveBeenCalledTimes(30);
    expect(getMaxInFlight()).toBe(30);
  });

  it('honours the concurrency limit', async () => {
    const { uploader, pending, getMaxInFlight } = makeUploader();
    const html = Array.from({ length: 7 }, (_, n) => `<p>${img(n)}</p>`).join(
      '',
    );
    const done = uploadInlineImages(html, uploader, { concurrency: 3 });
    expect(uploader).toHaveBeenCalledTimes(3);
    const result = await drain(done, pending, (u, i) => u.success(`/${i}.png`));
    expect(uploader).toHaveBeenCalledTimes(7);
    expect(getMaxInFlight()).toBe(3);
    expect(result.match(/src="([^"]+)"/g)).toEqual(
      Array.from({ length: 7 }, (_, i) => `src="/${i}.png"`),
    );
  });
});

// ---------------------------------------------------------------------------

describe('pipelines', () => {
  it('preparePastedHtml cleans and fixes lists, without uploading when there are no images', async () => {
    const { uploader } = makeUploader();
    const result = await preparePastedHtml(
      '<p>1. gr.</p><ol><li>a. fyrsti</li></ol>',
      uploader,
    );
    expect(uploader).not.toHaveBeenCalled();
    expect(result).toContain('<h3 class="article__title">1. gr.</h3>');
    expect(result).toContain('<li>fyrsti</li>');
    expect(result).not.toContain('a. fyrsti');
  });

  it('prepareWordHtml does not call the uploader when there are no images', async () => {
    const { uploader } = makeUploader();
    const result = await prepareWordHtml('<p>Texti</p>', uploader);
    expect(uploader).not.toHaveBeenCalled();
    expect(result).toBe('<p>Texti</p>');
  });

  it('prepareWordHtml uploads with the Word concurrency limit', async () => {
    const { uploader, pending, getMaxInFlight } = makeUploader();
    const html = Array.from(
      { length: WORD_IMAGE_UPLOAD_CONCURRENCY + 5 },
      (_, n) => `<p>${img(n)}</p>`,
    ).join('');
    const done = prepareWordHtml(html, uploader);
    expect(uploader).toHaveBeenCalledTimes(WORD_IMAGE_UPLOAD_CONCURRENCY);
    await drain(done, pending, (u) => u.success('/x.png'));
    expect(getMaxInFlight()).toBe(WORD_IMAGE_UPLOAD_CONCURRENCY);
    expect(uploader).toHaveBeenCalledTimes(WORD_IMAGE_UPLOAD_CONCURRENCY + 5);
  });

  it('prepareWordDocument converts with base64 images and fixes lists', async () => {
    const convertToHtml = mammoth.convertToHtml as jest.Mock;
    convertToHtml.mockResolvedValueOnce({
      value: '<ol><li>a. fyrsti</li><li>b. annar</li></ol>',
      messages: [],
    });
    const buffer = new ArrayBuffer(8);

    const result = await prepareWordDocument(buffer);

    expect(result).toBe('<ol type="a"><li>fyrsti</li><li>annar</li></ol>');
    expect(convertToHtml).toHaveBeenCalledWith(
      { arrayBuffer: buffer },
      { convertImage: expect.anything() },
    );
    const imgElement = mammoth.images.imgElement as jest.Mock;
    const toSrc = imgElement.mock.calls[0][0] as (image: {
      contentType: string;
      read: (enc: string) => Promise<string>;
    }) => Promise<{ src: string }>;
    await expect(
      toSrc({ contentType: 'image/png', read: async () => 'AAAA' }),
    ).resolves.toEqual({ src: 'data:image/png;base64,AAAA' });
  });

  it('prepareWordDocument rejects when mammoth fails', async () => {
    (mammoth.convertToHtml as jest.Mock).mockRejectedValueOnce(
      new Error('bad docx'),
    );
    await expect(prepareWordDocument(new ArrayBuffer(0))).rejects.toThrow(
      'bad docx',
    );
  });
});

describe('plainTextToHtml (as TinyMCE 5 converted plain-text pastes)', () => {
  const NBSP = '\u00a0';

  test('one block: no paragraph, line breaks as <br />', () => {
    expect(plainTextToHtml('Fyrsta lína\nönnur lína')).toBe(
      'Fyrsta lína<br />önnur lína',
    );
  });

  test('blank lines make paragraphs; Windows line endings too', () => {
    expect(plainTextToHtml('3. gr.\r\n\r\nTexti greinar.\r\nNý lína')).toBe(
      '<p>3. gr.</p><p>Texti greinar.<br />Ný lína</p>',
    );
  });

  test('escapes HTML, so pasted text stays text', () => {
    expect(plainTextToHtml('a < b & "c" > d')).toBe(
      'a &lt; b &amp; &quot;c&quot; &gt; d',
    );
  });

  test('keeps runs of spaces and tabs with non-breaking spaces', () => {
    // As TinyMCE's normalizeWhitespace: a single space stays a space; the
    // second of two, a leading or a trailing space becomes a nbsp.
    expect(plainTextToHtml('a  b')).toBe(`a ${NBSP}b`);
    expect(plainTextToHtml(' a ')).toBe(`${NBSP}a${NBSP}`);
    expect(plainTextToHtml('a\tb')).toBe(`a ${NBSP} ${NBSP}b`);
    expect(plainTextToHtml('a \nb')).toBe(`a${NBSP}<br />b`);
  });

  test('a plain-text paste goes through the same pipeline as HTML', async () => {
    const uploader = jest.fn();
    const html = await preparePastedHtml(
      plainTextToHtml('3. gr.\n\nRáðherra setur reglugerð.'),
      uploader,
    );
    expect(html).toContain('<h3 class="article__title">3. gr.');
    expect(html).toContain('Ráðherra setur reglugerð.');
    expect(uploader).not.toHaveBeenCalled();
  });
});

/*
  The problems found when the pipeline was moved here (see
  docs/plan-tiptap-editor.md, "Existing problems in the paste/Word
  pipeline"), each pinned as fixed.
*/
describe('fixed pipeline problems', () => {
  test('1. an ordinary image before a pasted one is kept', async () => {
    const { uploader, pending } = makeUploader();
    const result = await drain(
      uploadInlineImages(
        `<p><img src="/x.png" alt="x"> og ${img(1)}</p>`,
        uploader,
      ),
      pending,
      (u) => u.success('/files/new.png'),
    );
    expect(uploader).toHaveBeenCalledTimes(1);
    expect(result).toContain('<img src="/x.png" alt="x">');
    expect(result).toContain('src="/files/new.png"');
  });

  test('2. GIF and WebP are uploaded too', async () => {
    const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    const { uploader, pending } = makeUploader();
    const result = await drain(
      uploadInlineImages(`<p><img src="${GIF}"></p>`, uploader),
      pending,
      (u) => u.success('/files/x.gif'),
    );
    expect(uploader).toHaveBeenCalledTimes(1);
    expect(result).not.toContain('base64');
  });

  test('3. data that cannot be uploaded becomes the failure marker, never a placeholder', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const uploader = jest.fn();
    const result = await uploadInlineImages(
      '<p><img src="data:image/png;base64,not*base64"></p>',
      uploader,
    );
    expect(uploader).not.toHaveBeenCalled();
    expect(result).toBe(
      '<p><span class="image-upload-failed">[Image upload failed]</span></p>',
    );
    expect(result).not.toContain('PLACEHOLDER');
    error.mockRestore();
  });

  test('4. a URL with $& or quotes is inserted as it is, and alt text is kept', async () => {
    const { uploader, pending } = makeUploader();
    const result = await drain(
      uploadInlineImages(`<p><img src="${PNG}" alt="Kort"></p>`, uploader),
      pending,
      (u) => u.success('/files/a$&b"c.png'),
    );
    expect(result).toBe(
      '<p><img src="/files/a$&amp;b&quot;c.png" alt="Kort"></p>',
    );
  });

  test('5. list items keep their formatting, links and nested lists', () => {
    expect(
      fixAlphabeticalLists(
        '<ol><li>a. <strong>Feitt</strong> og <a href="/x">hlekkur</a></li>' +
          '<li>b. Liður<ol><li>undirliður</li></ol></li></ol>',
      ),
    ).toBe(
      '<ol type="a"><li><strong>Feitt</strong> og <a href="/x">hlekkur</a></li>' +
        '<li>Liður<ol><li>undirliður</li></ol></li></ol>',
    );
  });

  test('5. a marker inside formatting is removed, the formatting kept', () => {
    expect(
      fixAlphabeticalLists(
        '<ol><li><em>a.</em> Texti</li><li>b. Annar</li></ol>',
      ),
    ).toBe('<ol type="a"><li><em></em>Texti</li><li>Annar</li></ol>');
  });

  test('5. "i." starts a roman list; other letters stay letters', () => {
    expect(
      fixAlphabeticalLists('<ol><li>i. fyrsti</li><li>ii. annar</li></ol>'),
    ).toBe('<ol type="i"><li>fyrsti</li><li>annar</li></ol>');
    expect(fixAlphabeticalLists('<ol><li>v. Liður</li></ol>')).toBe(
      '<ol type="a"><li>Liður</li></ol>',
    );
  });

  test("5. only markers of the list's own type are removed", () => {
    expect(
      fixAlphabeticalLists(
        '<ol><li>a. Liður</li><li>Ráðherra) setur</li><li>1. tala</li></ol>',
      ),
    ).toBe(
      '<ol type="a"><li>Liður</li><li>Ráðherra) setur</li><li>1. tala</li></ol>',
    );
  });

  test('6. "N. gr." followed by <br> without a slash', () => {
    expect(cleanPastedHtml('<p>3. gr.<br>Texti.</p><p>Meira.</p>')).toBe(
      '<h3 class="article__title">3. gr.</h3><p>Texti.</p><p>Meira.</p>',
    );
  });
});
