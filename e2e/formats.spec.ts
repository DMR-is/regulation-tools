/*
  Formatting from the toolbar: inline marks, block formats, alignment,
  undo/redo, and the toolbar prop (docs/plan-tiptap-editor.md, the parity
  checklist).
*/

import { expect, test } from '@playwright/test';

import {
  clickEnd,
  menuItem,
  openEditor,
  selectText,
  tool,
  value,
} from './helpers';

const TEXT =
  '<h3 class="article__title">1. gr.</h3><p>Ráðherra setur reglugerð.</p><p>Önnur málsgrein.</p>';

test.describe('inline formatting', () => {
  test('bold and italic from their buttons', async ({ page }) => {
    await openEditor(page, { html: TEXT });
    await selectText(page, 'setur');
    await tool(page, 'Feitletrað').click();
    await selectText(page, 'reglugerð');
    await tool(page, 'Skáletrað').click();
    expect(await value(page)).toContain(
      '<p>Ráðherra <strong>setur</strong> <em>reglugerð</em>.</p>',
    );
    await expect(tool(page, 'Skáletrað')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('the "more formats" group: underline, strike, sup, sub, clear', async ({
    page,
  }) => {
    await openEditor(page, { html: TEXT });
    const more = async (label: string) => {
      await tool(page, 'Fleiri snið').click();
      await tool(page, label).click();
    };
    await selectText(page, 'Ráðherra');
    await more('Undirstrikað');
    await selectText(page, 'setur');
    await more('Yfirstrikað');
    await selectText(page, 'Önnur');
    await more('Hástafur');
    await selectText(page, 'málsgrein');
    await more('Lágstafur');
    expect(await value(page)).toContain(
      '<p><u>Ráðherra</u> <s>setur</s> reglugerð.</p><p><sup>Önnur</sup> <sub>málsgrein</sub>.</p>',
    );
    await selectText(page, 'Ráðherra');
    await more('Hreinsa sniðmát');
    expect(await value(page)).toContain('<p>Ráðherra <s>setur</s>');
  });

  test('keyboard shortcuts', async ({ page }) => {
    await openEditor(page, { html: TEXT });
    await selectText(page, 'setur');
    await page.keyboard.press('ControlOrMeta+b');
    expect(await value(page)).toContain('<strong>setur</strong>');
  });
});

test.describe('block formats', () => {
  const format = (page: import('@playwright/test').Page) =>
    page.getByRole('combobox', { name: 'Snið' });

  test('Grein, Kafli m. heiti, Dags from the format menu', async ({ page }) => {
    await openEditor(page, {
      html: '<p>I. KAFLI</p><p>2. gr.</p><p>Reykjavík, 1. janúar 2026.</p>',
    });
    await clickEnd(page, 'I. KAFLI');
    await format(page).selectOption('chapterTitleWithName');
    await clickEnd(page, '2. gr.');
    await format(page).selectOption('articleTitle');
    await clickEnd(page, 'Reykjavík');
    await format(page).selectOption('Dags');
    expect(await value(page)).toBe(
      '<h2 class="chapter__title">I. KAFLI <em>Titill</em></h2>' +
        '<h3 class="article__title">2. gr.</h3>' +
        '<p class="Dags">Reykjavík, 1. janúar 2026.</p>',
    );
    await expect(format(page)).toHaveValue('Dags');
  });

  test('structure is not offered inside a list', async ({ page }) => {
    await openEditor(page, {
      html: '<ol><li>liður</li></ol><p>Málsgrein.</p>',
    });
    await clickEnd(page, 'liður');
    await expect(
      format(page).locator('option[value="articleTitle"]'),
    ).toBeDisabled();
    await expect(
      format(page).locator('option[value="indented"]'),
    ).toBeEnabled();
    await clickEnd(page, 'Málsgrein.');
    await expect(
      format(page).locator('option[value="articleTitle"]'),
    ).toBeEnabled();
  });
});

test.describe('alignment', () => {
  test('from the alignment group', async ({ page }) => {
    await openEditor(page, { html: TEXT });
    await clickEnd(page, 'Önnur málsgrein.');
    await tool(page, 'Jöfnun').click();
    await tool(page, 'Miðjað').click();
    expect(await value(page)).toContain(
      '<p style="text-align: center;">Önnur málsgrein.</p>',
    );
  });

  test('from the `align` dropdown consumers use', async ({ page }) => {
    await openEditor(page, {
      html: TEXT,
      toolbar: 'bold italic underline | align numlist bullist | link',
    });
    await clickEnd(page, 'Önnur málsgrein.');
    await tool(page, 'Jöfnun').click();
    await menuItem(page, 'Hægri').click();
    expect(await value(page)).toContain(
      '<p style="text-align: right;">Önnur málsgrein.</p>',
    );
  });
});

test('undo and redo', async ({ page }) => {
  await openEditor(page, { html: TEXT });
  await expect(tool(page, 'Afturkalla')).toBeDisabled();
  await clickEnd(page, 'Önnur málsgrein.');
  await page.keyboard.type(' Viðbót.');
  await tool(page, 'Afturkalla').click();
  expect(await value(page)).toContain('<p>Önnur málsgrein.</p>');
  await tool(page, 'Endurgera').click();
  expect(await value(page)).toContain('<p>Önnur málsgrein. Viðbót.</p>');
});

test.describe('the toolbar prop', () => {
  test("a consumer's toolbar string shows exactly those items", async ({
    page,
  }) => {
    await openEditor(page, {
      html: TEXT,
      toolbar: 'bold italic underline | align numlist bullist | link',
    });
    const labels = await page
      .locator(
        '.regtools-toolbar > button, .regtools-toolbar > .regtools-toolbar__dropdown > button, .regtools-toolbar > .regtools-toolbar__group > button',
      )
      .evaluateAll((buttons) =>
        buttons.map((b) => b.getAttribute('aria-label')),
      );
    expect(labels).toEqual([
      'Feitletrað',
      'Skáletrað',
      'Undirstrikað',
      'Jöfnun',
      'Númeraður listi',
      'Punktalisti',
      'Setja inn/breyta hlekk',
    ]);
  });

  test('false shows no toolbar items', async ({ page }) => {
    await openEditor(page, { html: TEXT, toolbar: false });
    await expect(page.locator('.regtools-toolbar button')).toHaveCount(0);
  });
});
