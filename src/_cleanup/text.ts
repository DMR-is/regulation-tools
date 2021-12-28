import qq from '@hugsmidjan/qj/qq';
import { Options as PrettierOptions } from 'cleanup-prettier';
import parserHtml from 'cleanup-prettier/parser-html';
import parserCSS from 'cleanup-prettier/parser-postcss';
import prettier from 'cleanup-prettier/standalone';

import { HTMLText } from '../types';

import { blockTextElms } from './cleanup-consts';
import prettierrc from './cleanup-prettierrc';
import { asDiv } from './serverDOM';

const PRE_PLACEHOLDER = '$$__PRE_PLACEHOLDER__$$';
const prePlaceholderRe = new RegExp(PRE_PLACEHOLDER.replace(/\$/g, '\\$'), 'g');

const removePres = (html: HTMLText) => {
  const pres: Array<HTMLText> = [];

  const htmlSansPre = html.replace(/<pre[\s>][^]+?<\/pre\s*>/g, (preMatch) => {
    pres.push(preMatch as HTMLText);
    return PRE_PLACEHOLDER;
  }) as HTMLText;

  return { htmlSansPre, pres };
};

const reInsertPres = (html: HTMLText, pres: Array<HTMLText>): HTMLText =>
  html.replace(prePlaceholderRe, () => pres.shift() || '') as HTMLText;

const padBlockElements = (html: string) => {
  const root = asDiv(html);
  qq(blockTextElms, root).forEach((elm) => {
    elm.prepend('\n');
    elm.append('\n');
  });
  return root.innerHTML;
};

// ---------------------------------------------------------------------------

export const prettify = (html: HTMLText): HTMLText => {
  const paddedHtml = padBlockElements(html)
    .trim()
    .replace(/&nbsp;/g, ' ') as HTMLText;

  const { htmlSansPre, pres } = removePres(paddedHtml);

  let prettifiedHtml = prettier
    .format(htmlSansPre, {
      ...prettierrc,
      plugins: [parserHtml, parserCSS],
      parser: 'html',
    } as PrettierOptions)
    // Reformat to one word/open-tag/close-tag per line for effective word-based diffing behavior.
    // Yes, cute kittens will be struck by lightning
    // ...but it works. ¯\_(ツ)_/¯
    // preserve formatting <pre>s as is
    .replace(/\t/g, '') // remove indenting
    .replace(/ /g, '\n') // break on every space!
    .replace(/\n>/g, '>') // un-wrap end-angle-bracket of inline elements (i.e. like `<em\n>This</em>`...
    .replace(/(<[^>]+)\n([^>]+>)/g, '$1 $2') // join HTML-tag attributes on a single line (poor)
    .replace(/(<[^>]+)\n([^>]+>)/g, '$1 $2') // join HTML-tag attributes on a single line (man's)
    .replace(/(<[^>]+)\n([^>]+>)/g, '$1 $2') // join HTML-tag attributes on a single line (recursion)
    .replace(/(<[^>]+)\n([^>]+>)/g, '$1 $2') // join HTML-tag attributes on a single line (FTW!)
    .replace(/(<[^>]+)\n([^>]+>)/g, '$1 $2') // join HTML-tag attributes on a single line (o_O)
    .replace(/(<[^>]+)\n([^>]+>)/g, '$1 $2') // join HTML-tag attributes on a single line (Ack!)
    .replace(/(<[^>]+)\n([^>]+>)/g, '$1 $2') // join HTML-tag attributes on a single line (Ick!)
    .replace(
      /(<\/?(?:p|h[2-6]|t(?:able|body|head|r|d|h)|caption|li|ul|ol|blockquote|section)(?:>| .+?>))/g,
      '\n$1\n',
    ) // Add space around OPENING and CLOSING block-level tags
    .replace(/\n\n/g, '\n') // collspase double newlines
    .trimStart() as HTMLText;

  prettifiedHtml = reInsertPres(prettifiedHtml, pres);

  return prettifiedHtml as HTMLText;
};
/** /
// Failed attempt at brute-forcing a normalized line-breaks
// inside *every* bock-level element – even empty ones –
// to better isolate the text content for nicer diffs.
// 🐼

const flagBlockBoundries = (html: string): string => {
  const root = asDiv(html);
  qq(blockElms, root).forEach((elm) => {
    elm.prepend('🍍');
    if (elm.childNodes.length > 1) {
      elm.append('🍍');
    }
  });
  return root.innerHTML;
};

export const prettify = (html: string) => {
  html = html.trim().replace(/&nbsp;/g, ' ');
  html = flagBlockBoundries(html);
  let prettyHTML = prettier.format(html, {
    ...prettierrc,
    plugins: [parserHtml],
    parser: 'html',
  } as PrettierOptions);
  console.log({ prettyHTML });
  prettyHTML = prettyHTML
    .replace(/^( *)(.*?)🍍</gm, '$1$2\n$1<')
    .replace(/^( *)([^>]*?)>🍍/gm, '$1$2>\n  $1')
    .replace(/🍍/g, '');
  console.log({ prettyHTML });
  return prettyHTML;
};
/**/

// ---------------------------------------------------------------------------

export const dePrettify = (html: HTMLText): HTMLText => {
  const { htmlSansPre, pres } = removePres(html);
  const dePrettifiedHTML = htmlSansPre.replace(/\n/g, ' ') as HTMLText;
  return reInsertPres(dePrettifiedHTML, pres);
};
