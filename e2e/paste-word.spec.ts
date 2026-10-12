/*
  Pasting (Word HTML, plain text from a PDF, images, copying within the
  editor) and importing a Word document. All through the pipeline the two
  editors share, src/_editorPaste.ts.
*/

import { join } from 'path';
import { expect, test } from '@playwright/test';

import { clickEnd, openEditor, paste, tool, value } from './helpers';

const TEXT = '<p>Fyrir.</p>';

/** What Word puts on the clipboard, trimmed to its typical parts. */
const WORD_HTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office">
<body lang=IS>
<!--StartFragment-->
<p class=MsoNormal align=center style='text-align:center'><b>1. gr.<o:p></o:p></b></p>
<p class=MsoNormal><span style='font-family:"Times New Roman",serif'>Ráðherra setur
reglugerð um <i>innflutning</i>.<o:p></o:p></span></p>
<!--EndFragment-->
</body></html>`;

test.describe('paste', () => {
  test('from Word: cleaned, "N. gr." becomes an article title', async ({
    page,
  }) => {
    await openEditor(page, { html: TEXT });
    await clickEnd(page, 'Fyrir.');
    await paste(page, { html: WORD_HTML });
    await expect
      .poll(() => value(page))
      .toContain('<h3 class="article__title">1. gr.</h3>');
    const html = await value(page);
    expect(html).toContain('Ráðherra setur reglugerð um <em>innflutning</em>.');
    expect(html).not.toMatch(/Mso|mso-|o:p|font-family|<b>|<i>/);
  });

  test('plain text from a PDF goes through the same pipeline', async ({
    page,
  }) => {
    await openEditor(page, { html: TEXT });
    await clickEnd(page, 'Fyrir.');
    await paste(page, {
      text: '3. gr.\n\nRáðherra setur reglugerð.\nNý lína.',
    });
    await expect
      .poll(() => value(page))
      .toContain('<h3 class="article__title">3. gr.</h3>');
    // dirtyClean puts a space after each <br>, in both editors.
    expect(await value(page)).toContain(
      'Ráðherra setur reglugerð.<br> Ný lína.',
    );
  });

  test('pasted images are uploaded', async ({ page }) => {
    await openEditor(page, { html: TEXT, uploads: 'ok' });
    await clickEnd(page, 'Fyrir.');
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await paste(page, {
      html: `<p>Mynd: <img src="${png}" alt="Kort"> og <img src="/til/fyrir.png" alt="Fyrir"></p>`,
    });
    await expect.poll(() => value(page)).toMatch(/src="\/files\/\d+\.png"/);
    const html = await value(page);
    expect(html).toContain('alt="Kort"');
    // The ordinary image beside it is kept (a regex used to drop it).
    expect(html).toContain('<img src="/til/fyrir.png" alt="Fyrir">');
    expect(html).not.toContain('base64');
    expect(await page.evaluate(() => window.__uploads.length)).toBe(1);
  });

  test.describe('copying within the editor', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('keeps the structure', async ({ page }) => {
      await openEditor(page, {
        html: '<h3 class="article__title">1. gr.</h3><p>Texti.</p><p>Endir.</p>',
      });
      // Select from the start of the title to the end of its paragraph.
      await page.locator('.editor[contenteditable]').click();
      await page.evaluate(() => {
        const root = document.querySelector('.editor[contenteditable]')!;
        const range = document.createRange();
        range.setStart(root.querySelector('h3')!.firstChild!, 0);
        const p = root.querySelector('p')!.firstChild as Text;
        range.setEnd(p, p.length);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(range);
      });
      await page.waitForTimeout(50);
      await page.keyboard.press('ControlOrMeta+c');
      await clickEnd(page, 'Endir.');
      await page.keyboard.press('Enter');
      await page.keyboard.press('ControlOrMeta+v');
      await expect
        .poll(() => value(page))
        .toBe(
          '<h3 class="article__title">1. gr.</h3><p>Texti.</p><p>Endir.</p>' +
            '<h3 class="article__title">1. gr.</h3><p>Texti.</p>',
        );
    });
  });
});

test('Word import: a .docx goes in through the same pipeline', async ({
  page,
}) => {
  await openEditor(page, { html: TEXT });
  await clickEnd(page, 'Fyrir.');
  const chooser = page.waitForEvent('filechooser');
  await tool(page, 'Færa inn Word skjal').click();
  const fc = await chooser;
  await fc.setFiles(join(__dirname, 'fixtures', 'regulation.docx'));
  await expect
    .poll(() => value(page))
    .toContain('<h3 class="article__title">2. gr.</h3>');
  const html = await value(page);
  expect(html).toContain('<h3 class="article__title">1. gr.</h3>');
  expect(html).toContain('<strong>Gildissvið.</strong>');
  expect(html).toContain('Fyrsta lið með <strong>feitletrun</strong>');

  // The same file can be chosen again.
  const again = page.waitForEvent('filechooser');
  await tool(page, 'Færa inn Word skjal').click();
  await (await again).setFiles(join(__dirname, 'fixtures', 'regulation.docx'));
  await expect
    .poll(async () => (await value(page)).split('2. gr.').length - 1)
    .toBe(2);
});
