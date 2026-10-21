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

/** A choice in an open toolbar dropdown. */
export const menuItem = (page: Page, label: string) =>
  page
    .locator('.regtools-toolbar__menu')
    .getByRole('button', { name: label, exact: true });

/** Applies a block format from the "Snið" dropdown. */
export const setFormat = async (page: Page, label: string) => {
  await tool(page, 'Snið').click();
  await menuItem(page, label).click();
};

/** Puts the cursor at the end of the first element containing `text`. */
export const clickEnd = async (page: Page, text: string) => {
  const target = page
    .locator('.editor[contenteditable]')
    .getByText(text, { exact: false })
    .first();
  await target.click();
  await page.keyboard.press('End');
};

/**
 * Selects the first `text` in EditorV2's document. Through the editor (Tiptap
 * puts it on its element), not the DOM: after the focusing click,
 * ProseMirror finishes the mouseup a moment later and can put the selection
 * back where the click was, over a DOM selection made meanwhile.
 */
export const selectText = async (page: Page, text: string) => {
  await page.locator('.editor[contenteditable]').click();
  await page.evaluate((needle) => {
    const dom = document.querySelector(
      '.editor[contenteditable]',
    ) as Element & {
      editor: import('@tiptap/core').Editor;
    };
    const { editor } = dom;
    let found: { from: number; to: number } | undefined;
    editor.state.doc.descendants((node, pos) => {
      const at = found || !node.isText ? -1 : node.text!.indexOf(needle);
      if (at >= 0) {
        found = { from: pos + at, to: pos + at + needle.length };
      }
      return !found;
    });
    if (!found) {
      throw new Error(`"${needle}" not found in the editor`);
    }
    editor.chain().focus().setTextSelection(found).run();
  }, text);
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
