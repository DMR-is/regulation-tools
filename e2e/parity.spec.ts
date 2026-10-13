/*
  Editor and EditorV2 side by side: the same text, the same actions, and
  the result compared after cleanup, which is what gets saved
  (`cleanupSingleEditorOutput`, run here in Node as the apps' servers run
  it). Real regulation texts from src/__test__/expected/.
*/

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { expect, Page, test } from '@playwright/test';

import { cleanupSingleEditorOutput } from '../src/cleanupEditorOutput';
import { HTMLText } from '../src/types';

import { clickEnd, openEditor, paste, value } from './helpers';

const FIXTURES = join(__dirname, '..', 'src', '__test__', 'expected');
const texts = readdirSync(FIXTURES).filter((f) => f.endsWith('.html'));

/** Nested formatting in one order, for comparing across the allowed change. */
const markOrder = (html: string) =>
  html
    .replace(/<u><strong>([^<]*)<\/strong><\/u>/g, '<strong><u>$1</u></strong>')
    .replace(
      /<em><strong>([^<]*)<\/strong><\/em>/g,
      '<strong><em>$1</em></strong>',
    );

const saved = async (page: Page) =>
  cleanupSingleEditorOutput((await value(page)) as HTMLText);

/** Opens `html` in both editors, runs `act` in each, returns both saves. */
const both = async (
  browser: import('@playwright/test').Browser,
  html: string,
  act?: (page: Page) => Promise<void>,
) => {
  const results: Record<'v1' | 'v2', string> = { v1: '', v2: '' };
  for (const editor of ['v1', 'v2'] as const) {
    const page = await browser.newPage();
    await openEditor(page, { editor, html });
    if (editor === 'v1') {
      // Editor sets its text again 100 ms after it is ready (onReady in
      // src/Editor.tsx); anything typed before that is overwritten.
      await page.waitForTimeout(500);
    }
    if (act) {
      await act(page);
      // Paste uploads and cleaning are asynchronous in both editors.
      await page.waitForTimeout(300);
    }
    results[editor] = await saved(page);
    await page.close();
  }
  return results;
};

test.describe('a save without edits', () => {
  for (const file of texts) {
    test(file, async ({ browser }) => {
      const html = readFileSync(join(FIXTURES, file), 'utf8');
      const { v1, v2 } = await both(browser, html);
      // EditorV2 saves what cleanup alone gives (the fidelity check), and
      // what Editor saves, but for the one allowed change: nested
      // formatting written in one order (docs/plan-tiptap-editor.md,
      // "Schema"), which Editor keeps as it was.
      expect(markOrder(v2)).toBe(
        markOrder(cleanupSingleEditorOutput(html as HTMLText)),
      );
      expect(markOrder(v2)).toBe(markOrder(v1));
    });
  }
});

const BASE =
  '<h3 class="article__title">1. gr.</h3><p>Ráðherra setur reglugerð.</p>';

test('typing gives the same save', async ({ browser }) => {
  const { v1, v2 } = await both(browser, BASE, async (page) => {
    await clickEnd(page, 'reglugerð.');
    await page.keyboard.type(' Hún öðlast þegar gildi.');
  });
  expect(v2).toBe(v1);
  expect(v2).toContain('Hún öðlast þegar gildi.');
});

test('a Word paste gives the same save', async ({ browser }) => {
  const word = `<p class=MsoNormal><b>2. gr.<o:p></o:p></b></p>
<p class=MsoNormal><span style='font-family:"Times New Roman"'>Gildistaka
<i>reglugerðar</i>.<o:p></o:p></span></p>`;
  const { v1, v2 } = await both(browser, BASE, async (page) => {
    await clickEnd(page, 'reglugerð.');
    await paste(page, { html: word });
  });
  expect(v2).toBe(v1);
  expect(v2).toContain('2. gr.');
});

test('a plain-text paste gives the same save', async ({ browser }) => {
  const { v1, v2 } = await both(browser, BASE, async (page) => {
    await clickEnd(page, 'reglugerð.');
    await paste(page, { text: '2. gr.\n\nGildistaka reglugerðar.' });
  });
  expect(v2).toBe(v1);
  expect(v2).toContain('<h3 class="article__title">2. gr.</h3>');
});
