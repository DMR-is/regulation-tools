import { expect, test } from '@playwright/test';

import { clickEnd, openEditor, value } from './helpers';

test('EditorV2 loads a text, takes typing, and hands it back', async ({
  page,
}) => {
  await openEditor(page, {
    html: '<h3 class="article__title">1. gr.</h3><p>Texti.</p>',
  });
  await clickEnd(page, 'Texti.');
  await page.keyboard.type(' Meira.');
  expect(await value(page)).toBe(
    '<h3 class="article__title">1. gr.</h3><p>Texti. Meira.</p>',
  );
});
