import React from 'react';

import { execute as htmldiff } from './htmldiff-js';
import { HTMLText, PlainText } from './types';

export const toHTML = (textContent: PlainText) =>
  textContent.replace(/>/g, '&lg;') as HTMLText;

const SLOW_DIFF_LIMIT = 1500;

export const getDiff = (older: HTMLText, newer: HTMLText, raw?: boolean) => {
  const startTime = Date.now();
  let diffed: string = htmldiff(older, newer);
  if (!raw) {
    diffed = diffed
      .replace(/<del [^>]+>\n*<\/del>/g, '')
      .replace(/<ins [^>]+>\n*<\/ins>/g, '');
    // .replace(/<del [^>]+>\s+<\/del>/g, '')
    // .replace(/<ins [^>]+>\s+<\/ins>/g, '');
  }
  return {
    diff: diffed as HTMLText,
    slow: Date.now() - startTime > SLOW_DIFF_LIMIT,
  };
};

export const getTextContentDiff = (
  older: PlainText,
  newer: PlainText,
): HTMLText =>
  older === newer ? toHTML(newer) : getDiff(toHTML(older), toHTML(newer)).diff;

// ---------------------------------------------------------------------------

export type HTMLDumpProps = {
  html: HTMLText;
  className?: string;
  /** Default: 'div' */
  tag?: keyof JSX.IntrinsicElements;
};

export const HTMLDump = (props: HTMLDumpProps) => {
  const { tag, html, className } = props;
  const Tag = tag || 'div';
  return (
    <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
};
