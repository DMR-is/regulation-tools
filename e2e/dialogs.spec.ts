/*
  The dialogs and inserts: links (with uploading a PDF), images, special
  characters, horizontal rule, HTML source, search and replace, autolink.
*/

import { expect, Page, test } from '@playwright/test';

import { clickEnd, openEditor, selectText, tool, value } from './helpers';

const TEXT = '<p>Sjá reglugerð um innflutning.</p>';

const dialog = (page: Page) => page.locator('dialog[open]');

test.describe('links', () => {
  test('link selected text, edit it, remove it', async ({ page }) => {
    await openEditor(page, { html: TEXT });
    await selectText(page, 'reglugerð');
    await tool(page, 'Setja inn/breyta hlekk').click();
    await dialog(page).getByLabel('Hlekkur').fill('https://www.reglugerd.is');
    await dialog(page).getByRole('button', { name: 'Vista' }).click();
    expect(await value(page)).toBe(
      '<p>Sjá <a href="https://www.reglugerd.is">reglugerð</a> um innflutning.</p>',
    );

    await selectText(page, 'reglugerð');
    await tool(page, 'Setja inn/breyta hlekk').click();
    await expect(dialog(page).getByLabel('Hlekkur')).toHaveValue(
      'https://www.reglugerd.is',
    );
    await dialog(page).getByRole('button', { name: 'Fjarlægja hlekk' }).click();
    expect(await value(page)).toBe(TEXT);
  });

  test('a link to an uploaded PDF, inserted with its file name', async ({
    page,
  }) => {
    await openEditor(page, { html: TEXT, uploads: 'ok' });
    await clickEnd(page, 'innflutning.');
    await page.keyboard.type(' ');
    await tool(page, 'Setja inn/breyta hlekk').click();
    const chooser = page.waitForEvent('filechooser');
    await dialog(page)
      .getByRole('button', { name: 'Hlaða upp skjali ↑' })
      .click();
    const fc = await chooser;
    expect(fc.isMultiple()).toBe(false);
    await fc.setFiles({
      name: 'fylgiskjal.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    });
    await expect(dialog(page).getByLabel('Hlekkur')).toHaveValue(
      '/files/fylgiskjal.pdf',
    );
    await dialog(page).getByRole('button', { name: 'Vista' }).click();
    expect(await value(page)).toContain(
      '<a href="/files/fylgiskjal.pdf">fylgiskjal.pdf</a>',
    );
  });

  test('a typed URL becomes a link (autolink)', async ({ page }) => {
    await openEditor(page, { html: TEXT });
    await clickEnd(page, 'innflutning.');
    await page.keyboard.type(' Sjá https://www.reglugerd.is ');
    expect(await value(page)).toContain(
      '<a href="https://www.reglugerd.is">https://www.reglugerd.is</a>',
    );
  });
});

test.describe('images', () => {
  const chooseImage = async (page: Page) => {
    const chooser = page.waitForEvent('filechooser');
    await dialog(page).getByRole('button', { name: 'Hlaða upp mynd ↑' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'kort.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake'),
    });
  };
  // ProseMirror adds a hidden separator image after an inline image at the
  // end of a line, for the cursor.
  const image = (page: Page) =>
    page.locator('.editor[contenteditable] img:not(.ProseMirror-separator)');

  test('upload an image, its alt text from the file name', async ({ page }) => {
    await openEditor(page, { html: TEXT, uploads: 'ok' });
    await clickEnd(page, 'innflutning.');
    await tool(page, 'Setja inn/breyta mynd').click();
    await chooseImage(page);
    await expect(dialog(page).getByLabel('Slóð myndar')).toHaveValue(
      '/files/kort.png',
    );
    await expect(dialog(page).getByLabel('Lýsing myndar')).toHaveValue('kort');
    await dialog(page).getByRole('button', { name: 'Vista' }).click();
    await expect(image(page)).toHaveAttribute('src', '/files/kort.png');
    expect(await value(page)).toContain(
      '<img src="/files/kort.png" alt="kort">',
    );
  });

  test('alt text typed before inserting', async ({ page }) => {
    await openEditor(page, { html: TEXT, uploads: 'ok' });
    await clickEnd(page, 'innflutning.');
    await tool(page, 'Setja inn/breyta mynd').click();
    await dialog(page).getByLabel('Lýsing myndar').fill('Kort af svæðinu');
    await chooseImage(page);
    // A description already typed is kept, not replaced by the file name.
    await expect(dialog(page).getByLabel('Lýsing myndar')).toHaveValue(
      'Kort af svæðinu',
    );
    await dialog(page).getByLabel('Lýsing myndar').press('Enter');
    expect(await value(page)).toContain(
      '<img src="/files/kort.png" alt="Kort af svæðinu">',
    );
  });

  test('edit the alt text of an image already in the text', async ({
    page,
  }) => {
    await openEditor(page, {
      html: '<p>Sjá kort: <img src="/files/kort.png" alt="kort"> hér.</p>',
    });
    await image(page).click();
    await expect(tool(page, 'Setja inn/breyta mynd')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await tool(page, 'Setja inn/breyta mynd').click();
    await expect(dialog(page).getByLabel('Lýsing myndar')).toHaveValue('kort');
    await dialog(page).getByLabel('Lýsing myndar').fill('Kort af svæðinu');
    await dialog(page).getByRole('button', { name: 'Vista' }).click();
    expect(await value(page)).toBe(
      '<p>Sjá kort: <img src="/files/kort.png" alt="Kort af svæðinu"> hér.</p>',
    );
  });

  test('a failed upload inserts nothing', async ({ page }) => {
    await openEditor(page, { html: TEXT, uploads: 'fail' });
    const errors: Array<string> = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await clickEnd(page, 'innflutning.');
    await tool(page, 'Setja inn/breyta mynd').click();
    await chooseImage(page);
    await expect.poll(() => errors.length).toBeGreaterThan(0);
    // Shown to the person editing, not only logged.
    await expect(dialog(page).getByRole('alert')).toContainText('myndinni');
    await expect(
      dialog(page).getByRole('button', { name: 'Vista' }),
    ).toBeDisabled();
    await dialog(page).getByRole('button', { name: 'Hætta við' }).click();
    expect(await value(page)).toBe(TEXT);
  });
});

test('special characters and a horizontal rule', async ({ page }) => {
  await openEditor(page, { html: TEXT });
  await clickEnd(page, 'innflutning.');
  await tool(page, 'Annað').click();
  await tool(page, 'Sértákn').click();
  await dialog(page).getByRole('button', { name: 'Greinarmerki' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await tool(page, 'Annað').click();
  await tool(page, 'Lárétt lína').click();
  // An empty paragraph after the rule gives the cursor a place to go;
  // cleanup removes it on save.
  expect(await value(page)).toBe(
    '<p>Sjá reglugerð um innflutning.§</p><hr><p></p>',
  );
});

test.describe('HTML source', () => {
  test('edit the source', async ({ page }) => {
    await openEditor(page, { html: TEXT });
    await tool(page, 'Annað').click();
    await tool(page, 'HTML kóði').click();
    const code = dialog(page).locator('textarea');
    await expect(code).toHaveValue(TEXT);
    await code.fill('<h3 class="article__title">1. gr.</h3><p>Nýtt.</p>');
    await dialog(page).getByRole('button', { name: 'Vista' }).click();
    expect(await value(page)).toBe(
      '<h3 class="article__title">1. gr.</h3><p>Nýtt.</p>',
    );
  });

  test('warns before dropping what the editor cannot hold', async ({
    page,
  }) => {
    await openEditor(page, { html: TEXT });
    await tool(page, 'Annað').click();
    await tool(page, 'HTML kóði').click();
    await dialog(page)
      .locator('textarea')
      .fill('<p>a</p><div class="box">b</div>');
    await dialog(page).getByRole('button', { name: 'Vista' }).click();
    await expect(dialog(page)).toContainText('<div class="box">b</div>');
    expect(await value(page)).toBe(TEXT); // nothing saved yet
    await dialog(page).getByRole('button', { name: 'Vista samt' }).click();
    expect(await value(page)).toBe('<p>a</p><p>b</p>');
  });
});

test('search and replace', async ({ page }) => {
  await openEditor(page, {
    html: '<p>Ráðherra setur reglugerð.</p><p>ráðherra <strong>skal</strong> birta.</p>',
    toolbar: 'searchreplace',
  });
  await tool(page, 'Leita og skipta út').click();
  await dialog(page).getByLabel('Leita að').fill('ráðherra');
  await expect(dialog(page)).toContainText('1 af 2');
  // Enter goes to the first match, not past it.
  await dialog(page).getByLabel('Leita að').press('Enter');
  await expect(dialog(page)).toContainText('1 af 2');
  await dialog(page).getByLabel('Leita að').press('Enter');
  await expect(dialog(page)).toContainText('2 af 2');
  await expect(page.locator('.regtools-search-match')).toHaveCount(2);
  await dialog(page).getByLabel('Hástafanæmt').check();
  await expect(dialog(page)).toContainText('1 af 1');
  await dialog(page).getByLabel('Hástafanæmt').uncheck();
  await dialog(page).getByLabel('Skipta út fyrir').fill('ráðuneytið');
  await dialog(page).getByRole('button', { name: 'Skipta út öllum' }).click();
  expect(await value(page)).toBe(
    '<p>ráðuneytið setur reglugerð.</p><p>ráðuneytið <strong>skal</strong> birta.</p>',
  );
  await dialog(page).getByRole('button', { name: 'Loka' }).click();
  await expect(page.locator('.regtools-search-match')).toHaveCount(0);
});
