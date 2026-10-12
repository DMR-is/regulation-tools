import './editorV2-dom';

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { DiffPane } from '../_editorV2/DiffPane';
import type { DiffPart } from '../structuredDiff';
import { HTMLText } from '../types';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const win = globalThis.window as unknown as Record<string, unknown>;
['HTMLElement', 'Node', 'Element', 'navigator'].forEach((key) => {
  (globalThis as Record<string, unknown>)[key] ??= win[key];
});

const part = (key: string, html: string): DiffPart => ({
  key,
  html: html as HTMLText,
});

const mount = () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = (parts: Array<DiffPart>) =>
    act(() => root.render(React.createElement(DiffPane, { parts })));
  return { host, render, unmount: () => act(() => root.unmount()) };
};

describe('DiffPane', () => {
  const v1 = [
    part('gr:1', '<h3>1. gr.</h3><p>Óbreytt.</p>'),
    part('gr:2', '<h3>2. gr.</h3><p>Texti.</p>'),
    part('gr:3', '<h3>3. gr.</h3><p>Annar texti.</p>'),
  ];

  test('holds exactly the joined diff', () => {
    const { host, render, unmount } = mount();
    render(v1);
    expect(host.firstElementChild!.innerHTML).toBe(
      v1.map((p) => p.html).join('\n'),
    );
    unmount();
  });

  test("replaces only the changed part, leaving the others' nodes", () => {
    const { host, render, unmount } = mount();
    render(v1);
    const pane = host.firstElementChild!;
    const firstH3 = pane.querySelector('h3')!;
    const lastP = pane.querySelectorAll('p')[2]!;

    const v2 = [
      v1[0]!,
      part(
        'gr:2',
        '<h3>2. gr.</h3><p>Texti <ins class="diffins">nýr</ins>.</p>',
      ),
      v1[2]!,
    ];
    render(v2);
    expect(pane.innerHTML).toBe(v2.map((p) => p.html).join('\n'));
    // The same DOM nodes for the untouched articles.
    expect(pane.querySelector('h3')).toBe(firstH3);
    expect(pane.querySelectorAll('p')[2]).toBe(lastP);
    unmount();
  });

  test('within a changed part, keeps the unchanged blocks', () => {
    const { host, render, unmount } = mount();
    const table = '<table><tbody><tr><td>stór tafla</td></tr></tbody></table>';
    const a = [part('app:1', `${table}<p>Fyrir.</p>${table}`)];
    render(a);
    const pane = host.firstElementChild!;
    const [t1, t2] = Array.from(pane.querySelectorAll('table'));
    const b = [
      part(
        'app:1',
        `${table}<p>Fyrir <ins class="diffins">nú</ins>.</p>${table}`,
      ),
    ];
    render(b);
    expect(pane.innerHTML).toBe(b[0]!.html);
    const [u1, u2] = Array.from(pane.querySelectorAll('table'));
    expect(u1).toBe(t1);
    expect(u2).toBe(t2);
    // And back, and to a part with blocks added and removed.
    render(a);
    expect(pane.innerHTML).toBe(a[0]!.html);
    const c = [part('app:1', `<p>Nýtt.</p>${table}`)];
    render(c);
    expect(pane.innerHTML).toBe(c[0]!.html);
    unmount();
  });

  test('rebuilds when sections are added or removed', () => {
    const { host, render, unmount } = mount();
    render(v1);
    const v2 = [v1[0]!, part('gr:1a', '<h3>1. gr. a</h3>'), ...v1.slice(1)];
    render(v2);
    expect(host.firstElementChild!.innerHTML).toBe(
      v2.map((p) => p.html).join('\n'),
    );
    render(v1.slice(1));
    expect(host.firstElementChild!.innerHTML).toBe(
      v1
        .slice(1)
        .map((p) => p.html)
        .join('\n'),
    );
    unmount();
  });

  test('an empty part, and a part becoming empty and back', () => {
    const { host, render, unmount } = mount();
    const a = [part('a', '<p>a</p>'), part('b', ''), part('c', '<p>c</p>')];
    render(a);
    const b = [part('a', '<p>a</p>'), part('b', '<p>b</p>'), part('c', '')];
    render(b);
    expect(host.firstElementChild!.innerHTML).toBe(
      b.map((p) => p.html).join('\n'),
    );
    render(a);
    expect(host.firstElementChild!.innerHTML).toBe(
      a.map((p) => p.html).join('\n'),
    );
    unmount();
  });
});
