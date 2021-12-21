/* eslint-disable deprecation/deprecation */

import A from '@hugsmidjan/qj/A';
import hypertext from '@hugsmidjan/qj/E';
import q from '@hugsmidjan/qj/q';
import qq from '@hugsmidjan/qj/qq';
import removeNode from '@hugsmidjan/qj/removeNode';
import zapElm from '@hugsmidjan/qj/zapElm';

import { FILE_SERVER } from '../constants';
import { HTMLText } from '../types';

import {
  blockElms,
  /* eslint-disable @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports-ts */
  // Keeping these here for reference (out of sight out of mind, etc.)
  blockTextElms,
  inlineElms,
  inlineSelfClosingElms,
  inlineTextElms,
  isBlockElm,
  isInlineElms,
  isInlineTextElm,
  isTableCell,
  tableCells,
  /* eslint-enable @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports-ts */
} from './cleanup-consts';
import { CleanerFn, makeMutators } from './cleanup-utils';

export const makeDirtyClean = (
  asDiv: (html: string) => HTMLDivElement,
  E: typeof hypertext,
  Node: typeof window.Node,
  Text: typeof window.Text,
  DocumentFragment: typeof window.DocumentFragment,
) => {
  const M = makeMutators(asDiv, E, Node);

  // ---------------------------------------------------------------------------

  const removeUnwantedAttributes = (root: HTMLElement) =>
    M.removeUnwantedAttributes(root, {
      alwaysAllowedClassNames: {
        Grein: true, // ==> `article__title`
        Greinaheiti: true, // ==> `article__name`
        Kafli: true, // ==> `chapter__title`
        Kaflaheiti: true, // ==> `chapter__name`
        MsoTitle: true, // ==> `doc__title`
        MsoFootnoteText: true, // ==> `footnote` // always <p>
        MsoFootnoteReference: true, // ==> `footnote__marker`/`footnote-reference` // always <span>
        FHUndirskr: true,
        Section1: true, // Sometimes signifies article/chapter titles
        // left as is for good measure
        Dags: true,
        Undirritun: true,
      },
    });

  // ---------------------------------------------------------------------------

  const convertHacksToText = (root: HTMLElement) => {
    const uCharMap: Record<string, string | undefined> = {
      '>': '≥',
      '<': '≤',
    };
    qq('u', root).forEach((elm) => {
      const intendedChar = uCharMap[elm.textContent.trim()];
      if (intendedChar) {
        elm.replaceWith(intendedChar);
      }
    });
  };

  // ---------------------------------------------------------------------------

  const spaceholders = [
    [' ', '🚀'], // space
    [' ', '🚀'], // nbsp
    ['\n', '🪐'],
  ] as const;

  const __scapePreSpaces = (elm: Element, escape: boolean) => {
    elm.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        spaceholders.forEach((charPair) => {
          const fromChar = new RegExp(escape ? charPair[0] : charPair[1], 'g');
          const toChar = escape ? charPair[1] : charPair[0];
          node.textContent = node.textContent.replace(fromChar, toChar);
        });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        __scapePreSpaces(node as Element, escape);
      }
    });
  };
  const escapePreSpaces = (elm: Element) => __scapePreSpaces(elm, true);
  const unescapePreSpaces = (elm: Element) => __scapePreSpaces(elm, false);

  const onlySpaces = (
    dir: 'before' | 'after',
    elm: HTMLPreElement,
  ): boolean => {
    const sibling = dir === 'after' ? 'nextSibling' : 'previousSibling';
    let node = elm[sibling];
    while (node && node.nodeType !== Node.ELEMENT_NODE) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        return false;
      }
      node = node[sibling];
    }
    return true;
  };

  const escapePreElements = (root: HTMLElement) => {
    qq('pre', root).forEach((elm) => {
      const isSignificant =
        /(?:^\s*\u00a0|\s\s)/.test(elm.textContent) ||
        (elm.previousElementSibling?.nodeName === 'PRE' &&
          onlySpaces('before', elm)) ||
        (elm.nextElementSibling?.nodeName === 'PRE' &&
          onlySpaces('after', elm));

      if (isSignificant) {
        escapePreSpaces(elm);
      } else {
        M._transmogrifyInto('div')(elm);
      }
    });
  };

  // ---------------------------------------------------------------------------

  const flagIndents = (root: HTMLElement) => {
    qq<HTMLSpanElement>('span[style]', root)
      .filter((elm) =>
        (elm.cloneNode() as Element).outerHTML.includes('mso-tab-count:'),
      )
      .forEach((elm) => {
        elm.setAttribute(
          'data-legacy-indenter',
          String(elm.textContent.length),
        );
        elm.textContent = '🍌';
        elm.before(' ');
        elm.after(' ');
      });
  };

  // ---------------------------------------------------------------------------

  const cleanupTables = (root: HTMLElement) => {
    qq('table', root).forEach((table) => {
      if (table.border === '0' || parseFloat(table.style.borderWidth) === 0) {
        table.className = 'layout';
      }
    });

    const divify = M._transmogrifyInto('div');

    qq('table', root)
      .filter((table) => !q('thead, tfoot', table))
      .forEach((table) => {
        qq('tr', table).find((row) => {
          if (row.children.length > 1 || row.previousElementSibling) {
            return true;
          }
          table.before(divify(row.children[0]));
          row.remove();
        });
        qq('tr', table)
          .reverse()
          .find((row) => {
            if (row.children.length > 1 || row.nextElementSibling) {
              return true;
            }
            table.after(divify(row.children[0]));
            row.remove();
          });
      });
  };

  // ---------------------------------------------------------------------------

  const normalizeClassNames = (root: HTMLElement) => {
    // normalize lower-case variants to Capitalized form
    [
      'Grein',
      'Greinaheiti',
      'Undirritun1',
      'Undirritun2',
      'FHUndirskr',
    ].forEach((className) => {
      qq('.' + className.toLowerCase(), root).forEach((elm) => {
        elm.className = className;
      });
    });
    // strip number-suffix off Undirritun{N}}
    qq('.Undirritun1, .Undirritun2', root).forEach((elm) => {
      elm.className = 'Undirritun';
    });
  };

  // ---------------------------------------------------------------------------

  const processPreElms = (root: HTMLElement) => {
    qq('pre', root).forEach((elm) => {
      unescapePreSpaces(elm);

      const prevElm = elm.previousElementSibling;
      if (prevElm && prevElm.nodeName === 'PRE') {
        if (!prevElm.textContent.endsWith('\n')) {
          // make sure prevElm ends with a
          prevElm.append('\n');
        }
        // collspase single-newline whitespace <pre>s into a single newline
        if (/^[ \u00a0]*\n?$/.test(elm.textContent)) {
          elm.textContent = '\n';
        }
        // Merge elm contents into prevElm
        prevElm.append(...elm.childNodes);
        elm.remove();
      } else if (!elm.textContent.trim()) {
        // Standalone (or leading) whitespace-only <pre>s should die
        elm.remove();
      }
    });
  };

  // ---------------------------------------------------------------------------

  const _passElmIdDown = (elm: Element) => {
    const firstChild = elm.firstElementChild;
    if (firstChild) {
      if (firstChild.id && firstChild.id !== elm.id) {
        throw new Error('Can not pass id="" to child that already has ID');
      }
      firstChild.id = elm.id;
    }
  };

  const normalizeTagNames = (root: HTMLElement) => {
    // surveying shows that <address>, <align>(!?) and <code> elements
    // are never significant, always just a block-level wrapper
    qq('address, align, code, section:not(.appendix)', root).forEach(
      M._transmogrifyInto('div'),
    );
    // old-school <strike> is deprecated
    qq('strike', root).forEach(M._transmogrifyInto('s'));
    // and <h1> into <h2>
    qq('h1', root).forEach(M._transmogrifyInto('h2'));

    // Convert <div>s into <p>s
    qq('div', root).forEach((elm) => {
      if (!q(blockElms, elm)) {
        M._transmogrifyInto('p')(elm);
      } else {
        M._paragraphizeBareChildren(elm);

        if (elm.id) {
          _passElmIdDown(elm);
        }
        if (elm.align) {
          A(elm.children).forEach((block) => {
            (block as HTMLParagraphElement).align = elm.align;
          });
        }
        const dataIndenting = elm.getAttribute('data-indenting');
        if (dataIndenting) {
          A(elm.children).forEach((block) => {
            (block as HTMLParagraphElement).setAttribute(
              'data-indenting',
              dataIndenting,
            );
          });
        }
        zapElm(elm);
        // what about root-level content?
      }
    });
    // and <b> and <i> into <strong> and <em>
    qq('b', root).forEach(M._transmogrifyInto('strong'));
    qq('i', root).forEach(M._transmogrifyInto('em'));
  };

  // ---------------------------------------------------------------------------

  // remove certain elements because no significant instances can be found in the dataset
  const zapNoisyElements = (root: HTMLElement) => {
    qq('acronym,big,center,form,tt,dir,dl,dt,font', root).forEach(zapElm);
    qq('a:not([href])', root).forEach(zapElm);
  };

  const SPLITTER_SPAN_CLASS = '__dash-splitter__';
  const findDashSplitter = (elm: Element): HTMLSpanElement | undefined => {
    let dashNode: HTMLSpanElement | undefined;
    elm.childNodes.forEach((node) => {
      if (dashNode) {
        return;
      }
      if (node.nodeName !== '#text') {
        dashNode = findDashSplitter(node as Element);
        return;
      }
      const text = node.textContent.trim();
      const match = /\s([-–—])\s/.exec(text + ' ');
      if (match) {
        const matchChar = match[0];
        const matchIndex = match.index;
        const matchLength = matchChar.length;
        dashNode = E(
          'span',
          { class: SPLITTER_SPAN_CLASS },
          '|' + matchChar + '|',
        );
        node.replaceWith(
          new Text(text.substring(0, matchIndex)), // insert Text node to faciliate cleanup after
          dashNode,
          new Text(text.substring(matchIndex + matchLength)), // insert Text node to faciliate cleanup after
        );
      }
    });
    return dashNode;
  };

  const centeredBlockSelector = [
    'p[align="center"]',
    'h2[align="center"]',
    'h3[align="center"]',
    'h4[align="center"]',
    'h5[align="center"]',
  ].join(',');

  const centeredBlockAndSection1Selector =
    centeredBlockSelector + ',h3.Section1,h4.Section1';

  const getSplitCenteredParagrphs = (
    root: Element,
    onDash?: boolean,
  ): Array<
    [
      paragraph: HTMLParagraphElement,
      titleText: string,
      restElm: HTMLParagraphElement | undefined,
      titleElm: HTMLParagraphElement,
    ]
  > =>
    qq<HTMLParagraphElement>(centeredBlockAndSection1Selector, root).map(
      (elm) => {
        const brSplitter = q('br', elm);
        const splitter =
          brSplitter || (onDash ? findDashSplitter(elm) : undefined);
        const [titleElm, restElm] = M._splitElmOnCursor(elm, splitter);
        if (splitter && !brSplitter) {
          splitter.replaceWith(' ' + splitter.textContent.slice(1, -1) + ' ');
          q('.' + SPLITTER_SPAN_CLASS, titleElm)?.remove();
        }
        const titleText = titleElm.textContent.replace(/\s*\.$/, '.');
        const contentfulRestElm = restElm.textContent ? restElm : undefined;
        return [elm, titleText, contentfulRestElm, titleElm];
      },
    );

  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------

  const detectFootnotes = (root: HTMLElement) => {
    qq('.MsoFootnoteText', root).forEach((elm) => {
      elm.className = 'footnote';
      const marker = q('sup.footnote-reference', elm); // change first reference only
      if (marker) {
        marker.className = 'footnote__marker';
      }
    });
  };

  // ---------------------------------------------------------------------------

  const detectFootnoteMarkers = (root: HTMLElement) => {
    const supify = M._transmogrifyInto('sup');
    qq('span.MsoFootnoteReference', root).forEach((elm) => {
      const supElm = supify(elm);
      supElm.className = 'footnote-reference';
    });
  };

  // ---------------------------------------------------------------------------

  const findArticleTitleByClasses = (root: HTMLElement) => {
    qq<HTMLElement>('.Grein', root).forEach((elm) => {
      const fixedText = elm.textContent.trim().replace(/ gr\s*\.?$/i, ' gr.');
      const titleElm = E('h3', { className: 'article__title' }, fixedText);
      elm.replaceWith(titleElm);
    });
  };

  // ---------------------------------------------------------------------------

  const findChapterTitleByClasses = (root: HTMLElement) => {
    qq<HTMLElement>('.Kafli', root).forEach((elm) => {
      const fixedText = elm.textContent.trim();
      const titleElm = E('h2', { className: 'chapter__title' }, fixedText);
      elm.replaceWith(titleElm);
    });
  };

  // ---------------------------------------------------------------------------

  const guessArticleTitles = (root: HTMLElement) => {
    getSplitCenteredParagrphs(root, true).forEach(
      ([elm, titleText, restElm]) => {
        const isProvisional = /^Ákvæði til bráðabirgða\.?$/i.test(titleText);
        if (
          isProvisional ||
          /^(?:\d+\.)*\d+[a-eA-E]?\. gr\.?$/i.test(titleText)
        ) {
          const modifierClass = isProvisional
            ? ' article__title--provisional'
            : '';
          const titleElm = E(
            'h3',
            { className: 'article__title' + modifierClass },
            titleText.replace(/\.?$/, '') + '.',
          );
          elm.replaceWith(titleElm, restElm || '');
        }
      },
    );
  };

  // ---------------------------------------------------------------------------

  const findArticleNameByClasses = (root: HTMLElement) => {
    qq('h3.article__title + .Greinaheiti', root).forEach((nextElm) => {
      const titleElm = nextElm.previousElementSibling as HTMLHeadingElement;
      titleElm.append(
        ' ',
        E('em', { class: 'article__name' }, nextElm.textContent),
      );
      nextElm.remove();
    });
  };

  // ---------------------------------------------------------------------------

  const findChapterNameByClasses = (root: HTMLElement) => {
    qq('h2.chapter__title + .Kaflaheiti', root).forEach((nextElm) => {
      const titleElm = nextElm.previousElementSibling as HTMLHeadingElement;
      titleElm.append(
        ' ',
        E('em', { class: 'chapter__name' }, nextElm.textContent),
      );
      nextElm.remove();
    });
  };

  // ---------------------------------------------------------------------------

  const guessArticleNames = (root: HTMLElement) => {
    qq(centeredBlockAndSection1Selector, root)
      .filter((elm) => elm.matches('h3.article__title + *'))
      .forEach((elm) => {
        const text = elm.textContent.trim();
        if (text && text.length < 90) {
          const titleElm = elm.previousElementSibling as HTMLHeadingElement;
          titleElm.append(
            ' ',
            E('em', { class: 'article__name' }, elm.textContent),
          );
          elm.remove();
        }
      });
  };

  // ---------------------------------------------------------------------------

  const romanNumeralReString = '^X{0,3}(?:I{1,4}|IV|VI{0,3}|IX|X)';

  const romanNumeralRe = new RegExp(romanNumeralReString + '\\.\\s');
  // const chapterTitleRe = /^[ivx]+\.\s+.+$/i;
  const isChapterTitle = (text: string): boolean => {
    text = text.trim();
    return romanNumeralRe.test(text) || /\d+[a-e]?\. ?kafli\.?/i.test(text); //&& chapterTitleRe.test(text);
  };

  const guessChapterTitles = (root: HTMLElement) => {
    getSplitCenteredParagrphs(root).forEach(([elm, titleText, restElm]) => {
      const isAppendix = /^Viðauki\.?$/i.test(titleText);
      if (isAppendix || isChapterTitle(titleText)) {
        const modifierClass = isAppendix ? ' chapter__title--appendix' : '';
        const titleElm = E(
          'h2',
          { className: 'chapter__title' + modifierClass },
          titleText,
        );
        elm.replaceWith(titleElm, restElm || '');
      }
    });
  };

  // ---------------------------------------------------------------------------

  const normalizeImageSrcs = (root: HTMLElement) => {
    qq('img', root).forEach((elm) => {
      if (elm.src.startsWith('/media/')) {
        elm.src = FILE_SERVER + elm.src.replace(/\/\//g, '/');
      } else {
        elm.src = elm.src
          .replace(
            /^https?:\/\/(?:hleri\/dkmadmin\/Stj|(?:www\.)?stjornartidindi\.is)\//,
            `${FILE_SERVER}/stjornartidindi/`,
          )
          .replace(/\?/g, `__q__`)
          .replace(
            /^https?:\/\/(www\.lovdata\.no|[a-z0-9]+\.googleusercontent\.com)\//g,
            `${FILE_SERVER}/ext/$1/`,
          )
          .replace(/^\//g, `${FILE_SERVER}/`);
      }
    });
  };

  // ---------------------------------------------------------------------------

  const normalizeLinkUrls = (root: HTMLElement) => {
    qq<HTMLAnchorElement>('a[href^="/"]', root).forEach((elm) => {
      elm.href = elm.href.replace(/^\//g, `${FILE_SERVER}/`);
    });
  };

  // ---------------------------------------------------------------------------

  const guessChapterNames = (root: HTMLElement) => {
    getSplitCenteredParagrphs(root)
      .filter(([elm]) => elm.matches('h2.chapter__title + *'))
      .forEach(([elm, titleText, restElm]) => {
        if (titleText && titleText.length < 60) {
          const titleElm = elm.previousElementSibling as HTMLHeadingElement;
          titleElm.append(' ', E('em', { class: 'chapter__name' }, titleText));
          elm.replaceWith(restElm || '');
        }
      });
  };

  // ---------------------------------------------------------------------------

  const guessDocTitle = (root: HTMLElement) => {
    qq('.MsoTitle', root).forEach((elm) => {
      const { textContent } = elm;
      if (textContent === textContent.toUpperCase()) {
        elm.replaceWith(
          E(
            'p',
            {
              class: 'doc__title',
              align: 'center',
            },
            A(elm.childNodes),
          ),
        );
      } else {
        elm.removeAttribute('class');
      }
    });
  };
  // ---------------------------------------------------------------------------

  const getColCount = (trElm: HTMLTableRowElement) =>
    (A(trElm.children) as Array<HTMLTableCellElement>).reduce(
      (count, cell) => count + cell.colSpan,
      0,
    );
  const romanNumerlMarkerRd = new RegExp(
    romanNumeralReString + '\\s*[.)]$',
    'i',
  );
  const bulletSymbols: Record<string, boolean> = {
    '-': true, // dash
    '–': true, // en-dash
    '—': true, // em-dash
    '•': true, // bullet
  };
  type MarkerType =
    | 'bullet'
    | '1'
    | 'a'
    | 'A'
    | 'i'
    | 'I'
    | 'complex'
    | undefined;
  const isFauxListMarker = (
    text: string,
    preferRoman?: boolean,
  ): MarkerType => {
    if (!text) {
      return;
    }
    if (bulletSymbols[text]) {
      return 'bullet';
    }
    if (/^\d+(?:\.\d+)+\s*[.)]$/.test(text)) {
      return 'complex';
    }
    if (/^\d+\s*[.)]$/.test(text)) {
      return '1';
    }
    if (/^[a-z]\s*[.)]$/.test(text)) {
      if (preferRoman && /^[ivxcl]/.test(text)) {
        return 'i';
      }
      return 'a';
    }
    if (/^[A-Z]\s*[.)]$/.test(text)) {
      if (preferRoman && /^[IVXCL]/.test(text)) {
        return 'I';
      }
      return 'A';
    }
    if (romanNumerlMarkerRd.test(text)) {
      return text[0].toLowerCase() === text[0] ? 'i' : 'I';
    }
    return;
  };

  const guessTablePurpose = (root: HTMLElement) => {
    // Check if a table is a "list layout table".
    qq('table.layout', root).forEach((table) => {
      if (qq('thead, tbody', table).length > 1) {
        return;
      }
      const rows = qq('tr', table);
      const colCount = getColCount(rows[0]);
      if (colCount < 2 || colCount > 3) {
        return;
      }

      const allRowsSameColCount = rows
        .slice(1)
        .reduce(
          (sameSoFar, tr) => sameSoFar && colCount === getColCount(tr),
          true,
        );
      if (!allRowsSameColCount) {
        return;
      }

      const nonListMarkerCell = qq('th,td', table)
        .filter((elm) => elm.nextElementSibling)
        .find(
          ({ textContent }) => textContent && !isFauxListMarker(textContent),
        );
      if (nonListMarkerCell) {
        return;
      }
      // we're still here, so that must mean we have a layout table
      table.classList.add('layout--list');
    });
  };

  // ---------------------------------------------------------------------------

  const getItemMarker = (node: ChildNode) =>
    node.textContent.slice(0, 10).trim().split(' ')[0];
  const getItemType = (elm: Element, preferRoman?: boolean) =>
    isFauxListMarker(getItemMarker(elm), preferRoman);

  const makeList = (elm: Element): Element | DocumentFragment => {
    if (!q('p > br', elm)) {
      return elm;
    }
    const items: Array<HTMLLIElement> = [E('li')];
    A(elm.childNodes).forEach((node, i, list) => {
      if (node.nodeName !== 'BR') {
        items[items.length - 1].append(node.cloneNode(true));
      } else if (i !== list.length - 1) {
        items.push(E('li'));
      }
    });
    const type = getItemType(items[0], true);
    const isRomanType = type && /^[iI]$/.test(type);
    if (
      type === 'complex' ||
      items.slice(1).some((item) => getItemType(item, isRomanType) !== type)
    ) {
      const frag = new DocumentFragment();
      frag.append(...items.map((item) => E('p', null, A(item.childNodes))));
      return frag;
    }

    const listElm =
      !type || type === 'bullet'
        ? E('ul')
        : E('ol', { type: type !== '1' ? type : undefined });
    listElm.setAttribute('data-autogenerated', '');
    listElm.append(...items);

    // delete the textual markers
    type &&
      items.forEach((item) => {
        let marker = getItemMarker(item);
        const walk = (elm: Element): boolean =>
          !!A(elm.childNodes).find((node) => {
            if (node.nodeName === '#text') {
              const str = node.textContent;
              const trim = str.length - node.textContent.trimStart().length;
              let i = trim;
              while (str[i] && str[i] === marker[i - trim]) {
                i++;
              }
              node.textContent = str.slice(i);
              marker = marker.slice(i - trim);
            } else {
              return walk(node as Element);
            }
            return !marker.length; // stop when marker has been deleted
          });
        walk(item);
      });
    elm.remove();
    return listElm;
  };

  const detectBlockquoteLists = (root: Element) => {
    qq('blockquote', root).forEach((blockquoteElm) => {
      let blocks = A(blockquoteElm.children);
      const hasOnlyParasAndNoBrs = !q(
        'p > br, blockquote > *:not(p)',
        blockquoteElm,
      );
      if (hasOnlyParasAndNoBrs) {
        // normalize list of <p>s into a single <br> delimited paragraph
        if (blocks.length <= 1) {
          zapElm(blockquoteElm);
          return;
        }
        const p = E('p', null, blocks);
        blocks.forEach((block) => {
          block.after(E('br'));
          zapElm(block);
        });
        blockquoteElm.append(p);
        blocks = [p];
      }

      blockquoteElm.before(...blocks.map(makeList));
      blockquoteElm.remove();
    });
  };

  // ---------------------------------------------------------------------------

  const yearRe = / (?:19\d\d|20(?:[01]\d|2[0-2]))/;
  const hasYearRe = new RegExp(yearRe.source + /\s?(?:[,. ]|$)/.source);
  const removeIncorrectDagsClass = (root: HTMLElement) => {
    qq('.Dags', root)
      .filter((elm) => !hasYearRe.test(elm.textContent))
      .forEach((elm) => elm.removeAttribute('class'));
  };

  // ---------------------------------------------------------------------------

  const guessFHUndirskr = (root: HTMLElement) => {
    qq(centeredBlockSelector.replace(/[=]"center"/g, ''), root)
      .filter((elm) => {
        const text = elm.textContent.trim();
        return (
          /^f.\s?h.\s?r\s?[.,]?$/i.test(text) ||
          /^f\.\s?h\.\s.+ráðherra\s*[.,]?$/i.test(text)
        );
      })
      .forEach((elm) => (elm.className = 'FHUndirskr'));
  };

  // ---------------------------------------------------------------------------

  const dagsRe = new RegExp(
    /ráðuneyti(?:ð|nu)\s?,?\s/.source +
      /(?:[12]?\d|3[01]).\s/.source +
      '(?:' +
      [
        'jan(?:\\.|úar)',
        'feb(?:\\.|rúar)',
        'mar(?:\\.|s)',
        'apr(?:\\.|íl)',
        'maí',
        'jún(?:\\.|í)',
        'júl(?:\\.|í)',
        'ágú(?:\\.|st)',
        'sep(?:\\.|tember)',
        'okt(?:\\.|óber)',
        'nóv(?:\\.|ember)',
        'des(?:\\.|ember)',
      ].join('|') +
      ')' +
      yearRe.source +
      /\s?[,.]?$/.source +
      '',
    'i',
  );
  const guessDags = (root: HTMLElement) => {
    qq(centeredBlockSelector, root)
      .concat(
        qq('.FHUndirskr', root)
          .filter((elm) =>
            elm.previousElementSibling?.matches(
              'p:not([align="center"]):not(.Dags)',
            ),
          )
          .map((elm) => elm.previousElementSibling as Element),
      )
      .filter((elm) => dagsRe.test(elm.textContent.trim()))
      .forEach((elm) => (elm.className = 'Dags'));
  };

  // ---------------------------------------------------------------------------

  const normalizeSignatureTags = (root: HTMLElement) => {
    qq('.Dags, .FHUndirskr, .Undirritun', root)
      .filter((elm) => elm.nodeName !== 'P')
      .forEach(M._transmogrifyInto('p'));
  };

  // ---------------------------------------------------------------------------

  // The Article/chapter title/name guessing routines may have left over
  // some newly emptied paragraph elements. Remove those!
  const cleanUpEmptyParagrphs = (root: HTMLElement) => {
    A(root.children)
      .filter(
        (elm) =>
          elm.matches(centeredBlockAndSection1Selector) &&
          !elm.textContent.trim() &&
          !q('img', elm),
      )
      .forEach(removeNode);
  };

  // ---------------------------------------------------------------------------

  const removeSection1Classes = (root: HTMLElement) => {
    qq('.Section1', root).forEach((elm) => elm.removeAttribute('class'));
  };

  // ---------------------------------------------------------------------------

  const wrapLis = (root: HTMLElement) => {
    qq('li', root).forEach((elm) => {
      if (!(elm.parentElement as HTMLElement).matches('ul, ol')) {
        const items = [elm];
        let sibling = elm.nextElementSibling;
        while (sibling && sibling.matches('li')) {
          items.push(sibling as HTMLLIElement);
          sibling = sibling.nextElementSibling;
        }
        const list = E('ul');
        elm.before(list);
        list.append(...items);
      }
    });
  };

  // ---------------------------------------------------------------------------

  const fixHtmlMistakesLol = (html: HTMLText): HTMLText =>
    html
      .replace(/&#64257;|ﬁ/g, 'Þ') // &#64257;
      .replace(/&lt;\/u&gt;/g, '</u>')
      .replace(/(<[a-z0-6]+ align="[a-z]+);/gi, '$1" style="') as HTMLText;

  // ---------------------------------------------------------------------------

  // Zap <cite> but insert <br>
  const insertBrAfterCite = (root: HTMLElement) => {
    qq('cite', root).forEach((elm) => {
      elm.after(E('br'));
      zapElm(elm);
    });
    //
  };

  // ===========================================================================

  // NOTE: It is NOT SAFE to run multiple times on the same text.
  // This function IS NOT idempotent. It's very aggressive and destructive.
  // Only run it against a raw, dirty, nasty Word/PDF document export.
  const dirtyClean: CleanerFn<{ skipPrettier?: boolean }> = (
    html,
    opts = {},
  ) => {
    html = fixHtmlMistakesLol(html);

    const mutators: Array<(elm: HTMLElement) => void> = [
      // M.__logOuterHTML(),
      escapePreElements,
      flagIndents,
      M.removeCommentsAndUnescapeText,
      M.removeDisallowedElements,
      M.saveCFEmailMarkers,
      zapNoisyElements,
      insertBrAfterCite,
      cleanupTables,
      M.cleanUpLists,
      M.cleanupBlockquotes,
      M.convertStylesToHtml,
      normalizeTagNames,
      normalizeClassNames,
      M.fixImages,
      normalizeImageSrcs,
      normalizeLinkUrls,

      removeUnwantedAttributes,

      M.reApplyStyleAttrs,

      convertHacksToText,
      M.removeEmptyElms,
      M.zapRedundantDecendants,
      M.pushSpaceOutsideElements,
      M.trimSpacesAroundBlocks,
      M.paragraphizeStrayContent,
      wrapLis,
      M.trimBrs,
      M.max2AdjacentBrs,
      M.splitPsOnDoubleBrs,

      M.zapRedundantParagraphs,

      M.mergeAdjacentInlineElms,
      detectFootnoteMarkers,
      detectFootnotes,
      M.zapsLeftoverSpans, // DECIDE: do later to gain from mergeAdjacentInlineElms ???
      M.reverseLinkedFootnoteMarkers,
      M.injectSpaceAfterBr,

      // Magic starts

      detectBlockquoteLists,
      guessDocTitle,
      guessTablePurpose,

      findChapterTitleByClasses,
      findArticleTitleByClasses,

      guessChapterTitles,
      guessArticleTitles, // run instantly to avoid false-positive chapter names

      findChapterNameByClasses,
      guessChapterNames,

      guessArticleTitles, // again as guessChapterNames might have left over something
      findArticleNameByClasses,
      guessArticleNames,

      removeIncorrectDagsClass,
      guessFHUndirskr,
      guessDags,
      normalizeSignatureTags,

      cleanUpEmptyParagrphs,
      removeSection1Classes,
      // Magic ends

      M.rehydrateIndents,
      processPreElms,

      M.sortAttributes,
    ];

    const root = asDiv(html);
    mutators.forEach((mutator) => mutator(root));

    const innerHTML = root.innerHTML as HTMLText;

    if (opts.skipPrettier === true) {
      return innerHTML;
    }

    // Normalize formatting \ö/
    return M.prettify(innerHTML);
  };

  // for testing
  dirtyClean.prettify = M.prettify;

  return dirtyClean;
};
