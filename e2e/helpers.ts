/*
  What the browser tests have in common: opening an editor with options,
  and reaching its parts.
*/

import { expect, Page } from '@playwright/test';

import type { HarnessOptions } from './harness';

export const openEditor = async (page: Page, options: HarnessOptions) => {
  await page.addInitScript((o) => {
    window.__options = o;
  }, options);
  await page.goto(process.env.E2E_BASE_URL + '/');
  const editor = page.locator('.editor[contenteditable]');
  await expect(editor).toBeVisible();
  return editor;
};

/** The editor's text as the consumer gets it, through `valueRef`. */
export const value = (page: Page) => page.evaluate(() => window.__value());

/** A toolbar button or dropdown, by its label (the tooltip). */
export const tool = (page: Page, label: string) =>
  page.locator('.regtools-toolbar').getByRole('button', {
    name: label,
    exact: true,
  });

export const menuItem = (page: Page, label: string) =>
  page.getByRole('menuitem', { name: label, exact: true });

/** Puts the cursor at the end of the first element containing `text`. */
export const clickEnd = async (page: Page, text: string) => {
  const target = page
    .locator('.editor[contenteditable]')
    .getByText(text, { exact: false })
    .first();
  await target.click();
  await page.keyboard.press('End');
};

/** Selects `text` inside the editor, by searching the DOM for it. */
export const selectText = async (page: Page, text: string) => {
  await page.locator('.editor[contenteditable]').click();
  await page.evaluate((needle) => {
    const root = document.querySelector('.editor[contenteditable]')!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const at = node.data.indexOf(needle);
      if (at >= 0) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + needle.length);
        const sel = getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
    }
    throw new Error(`"${needle}" not found in the editor`);
  }, text);
  // Let ProseMirror pick up the DOM selection.
  await page.waitForTimeout(50);
};

/** Pastes as the clipboard would, with HTML and/or plain text. */
export const paste = (page: Page, data: { html?: string; text?: string }) =>
  page.evaluate((d) => {
    const target = document.querySelector('.editor[contenteditable]')!;
    const clipboardData = new DataTransfer();
    d.html && clipboardData.setData('text/html', d.html);
    d.text && clipboardData.setData('text/plain', d.text);
    target.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, data);
