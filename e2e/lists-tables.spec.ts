/*
  Lists (numbering styles, nesting) and tables (the size grid, the table
  menu, the bar over the table and the right-click menu), and clearing
  dirtyClean's "auto-generated" flag.
*/

import { expect, test } from '@playwright/test';

import { clickEnd, menuItem, openEditor, tool, value } from './helpers';

test.describe('lists', () => {
  test('numbered list, then lettered from the numbering dropdown', async ({
    page,
  }) => {
    await openEditor(page, { html: '<p>fyrsti liður</p><p>annar liður</p>' });
    await page.locator('.editor[contenteditable]').click();
    await page.keyboard.press('ControlOrMeta+a');
    await tool(page, 'Númeraður listi').click();
    expect(await value(page)).toBe(
      '<ol><li>fyrsti liður</li><li>annar liður</li></ol>',
    );
    await tool(page, 'Tegund númera').click();
    await menuItem(page, 'a, b, c').click();
    expect(await value(page)).toBe(
      '<ol type="a"><li>fyrsti liður</li><li>annar liður</li></ol>',
    );
  });

  test('a numbering style chosen outside a list starts a list', async ({
    page,
  }) => {
    await openEditor(page, { html: '<p>liður</p>' });
    await clickEnd(page, 'liður');
    await tool(page, 'Tegund númera').click();
    await menuItem(page, 'i, ii, iii').click();
    expect(await value(page)).toBe('<ol type="i"><li>liður</li></ol>');
  });

  test('the toolbar keeps its width in and out of a list', async ({ page }) => {
    await openEditor(page, { html: '<p>texti</p><ol><li>liður</li></ol>' });
    const buttons = page.locator('.regtools-toolbar button');
    await clickEnd(page, 'texti');
    const outside = await buttons.count();
    await clickEnd(page, 'liður');
    await expect(buttons).toHaveCount(outside);
  });

  test('bullet list, and Tab nests an item', async ({ page }) => {
    await openEditor(page, { html: '<ul><li>a</li><li>b</li></ul>' });
    await clickEnd(page, 'b');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    expect(await value(page)).toBe(
      '<ul><li><p>a</p><ul><li>b</li></ul></li></ul>',
    );
    await page.keyboard.press('Shift+Tab');
    expect(await value(page)).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  test('"1. " typed at the start of a line stays text', async ({ page }) => {
    await openEditor(page, { html: '<p>Fyrir.</p>' });
    await clickEnd(page, 'Fyrir.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('1. gr. Texti');
    expect(await value(page)).toBe('<p>Fyrir.</p><p>1. gr. Texti</p>');
  });
});

test.describe('tables', () => {
  const tableMenu = async (
    page: import('@playwright/test').Page,
    item: string,
  ) => {
    await tool(page, 'Tafla').click();
    await menuItem(page, item).click();
  };

  test('insert a table, add a row and a column, delete it', async ({
    page,
  }) => {
    await openEditor(page, { html: '<p>Fyrir.</p>' });
    await clickEnd(page, 'Fyrir.');
    await tool(page, 'Tafla').click();
    await page.getByRole('gridcell', { name: '3 × 3' }).click();
    const rows = page.locator('.editor[contenteditable] table tr');
    await expect(rows).toHaveCount(3);
    await tableMenu(page, 'Röð fyrir neðan');
    await expect(rows).toHaveCount(4);
    await tableMenu(page, 'Dálkur til hægri');
    await expect(rows.first().locator('td')).toHaveCount(4);
    // Only <table><tbody>, no colgroup or width styles.
    expect(await value(page)).toMatch(/<table><tbody><tr><td>/);
    expect(await value(page)).not.toMatch(/colgroup|style=/);
    await tableMenu(page, 'Eyða töflu');
    await expect(rows).toHaveCount(0);
  });

  test('table style: layout, and merged cells kept', async ({ page }) => {
    await openEditor(page, {
      html: '<table><tbody><tr><td colspan="2">a</td></tr><tr><td>b</td><td>c</td></tr></tbody></table>',
    });
    await clickEnd(page, 'b');
    await tableMenu(page, 'Uppsetning (án ramma)');
    expect(await value(page)).toBe(
      '<table class="layout"><tbody><tr><td colspan="2">a</td></tr><tr><td>b</td><td>c</td></tr></tbody></table>',
    );
    await tableMenu(page, 'Upptalning í töflu');
    expect(await value(page)).toContain('<table class="layout layout--list">');
  });

  test('the size grid inserts the size picked', async ({ page }) => {
    await openEditor(page, { html: '<p>Fyrir.</p>' });
    await clickEnd(page, 'Fyrir.');
    await tool(page, 'Tafla').click();
    await page.getByRole('gridcell', { name: '2 × 4' }).click();
    const rows = page.locator('.editor[contenteditable] table tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.first().locator('td')).toHaveCount(4);
  });

  test('the size grid by keyboard', async ({ page }) => {
    await openEditor(page, { html: '<p>Fyrir.</p>' });
    await clickEnd(page, 'Fyrir.');
    await tool(page, 'Tafla').click();
    // Starts at 3 × 3.
    await page.getByRole('gridcell', { name: '3 × 3' }).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    const rows = page.locator('.editor[contenteditable] table tr');
    await expect(rows).toHaveCount(4);
    await expect(rows.first().locator('td')).toHaveCount(5);
  });

  test('the bar over the table: rows, columns, style, delete', async ({
    page,
  }) => {
    await openEditor(page, {
      html:
        '<p>Fyrir.</p><p>Meira.</p><p>Enn meira.</p>' +
        '<table><tbody><tr><td>reitur1</td><td>reitur2</td></tr></tbody></table>',
    });
    const bar = page.getByRole('toolbar', { name: 'Tafla' });
    await clickEnd(page, 'Fyrir.');
    await expect(bar).toHaveCount(0);
    await clickEnd(page, 'reitur1');
    await expect(bar).toBeVisible();
    // Above the table, with room for it there.
    const barBox = (await bar.boundingBox())!;
    const tableBox = (await page
      .locator('.editor[contenteditable] table')
      .boundingBox())!;
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(tableBox.y);

    const rows = page.locator('.editor[contenteditable] table tr');
    await bar.getByRole('button', { name: 'Raðir' }).click();
    await bar.getByRole('button', { name: 'Röð fyrir neðan' }).click();
    await expect(rows).toHaveCount(2);
    await bar.getByRole('button', { name: 'Dálkar' }).click();
    await bar.getByRole('button', { name: 'Dálkur til vinstri' }).click();
    await expect(rows.first().locator('td')).toHaveCount(3);
    await bar.getByRole('button', { name: 'Útlit töflu' }).click();
    await bar.getByRole('button', { name: 'Uppsetning (án ramma)' }).click();
    expect(await value(page)).toContain('<table class="layout">');
    await bar.getByRole('button', { name: 'Eyða töflu' }).click();
    await expect(rows).toHaveCount(0);
    await expect(bar).toHaveCount(0);
  });

  test('the right-click menu', async ({ page }) => {
    await openEditor(page, {
      html: '<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>',
    });
    const cells = page.locator('.editor[contenteditable] td');
    await cells.nth(3).click({ button: 'right' });
    const menu = page.getByRole('group', { name: 'Tafla' });
    await expect(menu).toBeVisible();
    // The first item has focus; Escape closes it.
    await expect(
      menu.getByRole('button', { name: 'Röð fyrir ofan' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    // Right-clicking "d" moved the cursor there: its column goes.
    await cells.nth(3).click({ button: 'right' });
    await menu.getByRole('button', { name: 'Eyða dálki' }).click();
    expect(await value(page)).toBe(
      '<table><tbody><tr><td>a</td></tr><tr><td>c</td></tr></tbody></table>',
    );
    await expect(menu).toHaveCount(0);
  });

  test("outside a table, right-click is the browser's own", async ({
    page,
  }) => {
    await openEditor(page, { html: '<p>texti</p>' });
    await page.getByText('texti').click({ button: 'right' });
    await expect(page.getByRole('group', { name: 'Tafla' })).toHaveCount(0);
  });

  test('merge and split cells', async ({ page }) => {
    await openEditor(page, {
      html: '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>',
    });
    // Select both cells: click the first, shift-click the second.
    const cells = page.locator('.editor[contenteditable] td');
    await cells.nth(0).click();
    await cells.nth(1).click({ modifiers: ['Shift'] });
    await tableMenu(page, 'Sameina reiti');
    expect(await value(page)).toMatch(/<td colspan="2">/);
    await tableMenu(page, 'Skipta reit');
    expect(await value(page)).not.toMatch(/colspan/);
  });
});

test('a flagged auto-generated list can be marked as checked', async ({
  page,
}) => {
  await openEditor(page, {
    html: '<ol data-autogenerated=""><li>liður</li></ol><p>Annað.</p>',
  });
  // On the bar over the flagged block, not in the toolbar, so the toolbar
  // does not change width.
  const check = page.getByRole('button', {
    name: 'Sjálfvirkt myndað: merkja yfirfarið',
  });
  await clickEnd(page, 'Annað.');
  await expect(check).toHaveCount(0);
  await clickEnd(page, 'liður');
  await check.click();
  expect(await value(page)).toBe('<ol><li>liður</li></ol><p>Annað.</p>');
  await expect(check).toHaveCount(0);
});
