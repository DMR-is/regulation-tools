/*
  The editor as a whole: read-only and disabled, aria, the change and focus
  callbacks, the comparison pane, and the warnings panel.
*/

import { expect, test } from '@playwright/test';

import { clickEnd, openEditor, tool, value } from './helpers';

const TEXT = '<h3 class="article__title">1. gr.</h3><p>Texti greinar.</p>';

test.describe('read-only and disabled', () => {
  for (const mode of ['readOnly', 'disabled'] as const) {
    test(mode, async ({ page }) => {
      const editor = await openEditor(page, { html: TEXT, [mode]: true });
      await expect(editor).toHaveAttribute('contenteditable', 'false');
      await expect(tool(page, 'Feitletrað')).toBeDisabled();
      await editor.click();
      await page.keyboard.type('x');
      expect(await value(page)).toBe(TEXT);
    });
  }
});

test('aria-labelledby, onChange, onFocus, onBlur', async ({ page }) => {
  const editor = await openEditor(page, { html: TEXT, labelledBy: 'merki' });
  await expect(editor).toHaveAttribute('aria-labelledby', 'merki');
  await expect(editor).toHaveAttribute('role', 'textbox');
  await clickEnd(page, 'Texti greinar.');
  await page.keyboard.type('ab');
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  const counts = await page.evaluate(() => ({
    changes: window.__changes,
    focus: window.__focus,
    blur: window.__blur,
  }));
  // Once per keystroke, and not on load (as Editor guards with 'pre-init').
  expect(counts.changes).toBe(2);
  expect(counts.focus).toBeGreaterThanOrEqual(1);
  expect(counts.blur).toBeGreaterThanOrEqual(1);
});

test.describe('comparison pane', () => {
  test('shows the edit as a diff, and the base text on request', async ({
    page,
  }) => {
    await openEditor(page, { html: TEXT, baseText: TEXT });
    const result = page.locator('.result');
    await clickEnd(page, 'Texti greinar.');
    await page.keyboard.type(' Viðbót.');
    await expect(result.locator('ins')).toContainText('Viðbót.');
    await expect(result).not.toHaveAttribute('data-needs-updating');
    await page.getByRole('button', { name: 'Sjá grunntexta' }).click();
    await expect(result).not.toContainText('Viðbót.');
    await expect(result).toContainText('Texti greinar.');
    await page.getByRole('button', { name: 'Sjá breytingar' }).click();
    await expect(result.locator('ins')).toContainText('Viðbót.');
  });

  test('an editor opened on an already edited text diffs it against the base', async ({
    page,
  }) => {
    await openEditor(page, {
      html: '<h3 class="article__title">1. gr.</h3><p>Texti greinar breyttur.</p>',
      baseText: TEXT,
    });
    await expect(page.locator('.result ins')).toContainText('breyttur');
  });
});

test.describe('warnings', () => {
  const insecure =
    '<p>Sjá <a href="http://example.is">vef</a>.</p><p>Annað.</p>';

  test('listed, and "sjá" points at the element', async ({ page }) => {
    await openEditor(page, { html: insecure });
    const warnings = page.locator('.warnings');
    await expect(warnings).toBeVisible();
    await warnings.getByRole('button', { name: 'sjá' }).first().click();
    // Highlighted through ProseMirror, so it survives its DOM updates.
    await expect(
      page.locator('.editor[contenteditable] [data-highighted]'),
    ).toContainText('vef');
    await expect(
      page.locator('.editor[contenteditable] [data-highighted]'),
    ).toHaveCount(0, { timeout: 3000 });
  });

  test('update after a pause in typing', async ({ page }) => {
    await openEditor(page, { html: '<p>Hreinn texti.</p>' });
    await expect(page.locator('.warnings')).toHaveCount(0);
    await clickEnd(page, 'Hreinn texti.');
    // A typed http:// URL becomes a link, which is warned about.
    await page.keyboard.type(' Sjá http://example.is ');
    await expect(page.locator('.warnings')).toBeVisible({ timeout: 5000 });
  });
});
