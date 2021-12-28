import A from '@hugsmidjan/qj/A';
import hypertext from '@hugsmidjan/qj/E';
import q from '@hugsmidjan/qj/q';
import qq from '@hugsmidjan/qj/qq';
import removeNode from '@hugsmidjan/qj/removeNode';
import zapElm from '@hugsmidjan/qj/zapElm';

import { HTMLText } from '../types';
import { styleValueToTypeAttrMap } from '../utils';

import {
  blockElms,
  blockTextElms,
  inlineSelfClosingElms,
  inlineTextElms,
  isBlockElm,
  isInlineElms,
  isTableCell,
  meaninglessElements,
  unsafeElements,
} from './cleanup-consts';
import mappify from './mappify';
import { prettify } from './text';

declare global {
  // Override TypeScript's primitive Node definitions which say string|null
  interface ChildNode {
    textContent: string;
  }
  interface Comment {
    textContent: string;
  }
  interface Element {
    textContent: string;
  }
  interface Text {
    textContent: string;
  }
}

export type CleanerFn<
  Options extends Record<string, any> | undefined = undefined,
> = {
  (input: HTMLText, opts?: Options): HTMLText;
  prettify(html: HTMLText): HTMLText;
};

// ---------------------------------------------------------------------------

export const makeMutators = (
  asDiv: (html: string) => HTMLDivElement,
  E: typeof hypertext,
  Node: typeof window.Node,
) => {
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const __logOuterHTML =
    (msg = '') =>
    (root: HTMLElement) =>
      console.info(msg, { html: root.outerHTML });

  // ---------------------------------------------------------------------------

  const _copyAttrs = (source: Element, target: Element) =>
    A(source.attributes).forEach(({ name, value }) => {
      target.setAttribute(name, value);
    });
  const copyChildNodes = (source: Element, target: Element) =>
    source !== target &&
    !source.contains(target) &&
    A(source.childNodes).forEach((childNode) => {
      target.appendChild(childNode);
    });

  const _transmogrifyInto =
    (tagName: keyof HTMLElementTagNameMap) => (elm: Element) => {
      const newElm = E(tagName);
      _copyAttrs(elm, newElm);
      copyChildNodes(elm, newElm);
      elm.replaceWith(newElm);
      return newElm;
    };

  // ---------------------------------------------------------------------------

  const _trimAdjacentSpaces = (
    elm: Element,
    position: 'before' | 'after' | 'both' = 'both',
    skipBrs?: boolean,
  ) => {
    const rounds = position === 'both' ? [true, false] : [position === 'after'];
    rounds.forEach((after) => {
      const getSibling = after ? 'nextSibling' : 'previousSibling';
      const trim = after ? 'trimStart' : 'trimEnd';

      let node = elm[getSibling];
      while (
        node &&
        (node.nodeName === '#text' || (!skipBrs && node.nodeName === 'BR'))
      ) {
        if (node.nodeName === 'BR') {
          node.remove();
        } else {
          const trimmedText = node.textContent[trim]();
          if (trimmedText) {
            node.textContent = trimmedText;
            break;
          } else {
            node.remove();
          }
        }
        node = elm[getSibling];
      }
    });
  };

  // ---------------------------------------------------------------------------

  const _isElementEmpty = (elm: Element) =>
    !elm.textContent.trim() && qq('hr,img[src]', elm).length === 0;

  const _paragraphizeBareChildren = (elm: Element) => {
    const lastPElm = A(elm.childNodes).reduce<HTMLParagraphElement | undefined>(
      (pElm, node) => {
        if (node.nodeName === '#text' || isInlineElms[node.nodeName]) {
          if (!pElm) {
            pElm = E('p');
            node.replaceWith(pElm);
          }
          pElm.appendChild(node);
          return pElm;
        }
        if (pElm && _isElementEmpty(pElm)) {
          pElm.remove();
        }
        return undefined;
      },
      undefined,
    );

    if (lastPElm && _isElementEmpty(lastPElm)) {
      lastPElm.remove();
    }
  };

  // ---------------------------------------------------------------------------

  const _priorityAttrs: Record<string, string> = {
    class: '01',
    id: '02',
    src: '03',
    href: '04',
    width: '05',
    height: '06',
    alt: '07',
    title: '08',
    colspan: '09',
    rowspan: '10',
    scope: '11',
    align: '12',
    type: '13',
    start: '14',
    style: '15',
  };

  const sortAttributes = (root: HTMLElement) => {
    qq('*', root).forEach((elm) => {
      A(elm.attributes)
        .sort((a, b) => {
          const nameA = _priorityAttrs[a.name] || a.name;
          const nameB = _priorityAttrs[b.name] || b.name;
          return nameA.localeCompare(nameB);
        })
        .forEach(({ name, value }) => {
          elm.removeAttribute(name);
          elm.setAttribute(name, value);
        });
    });
  };

  // ---------------------------------------------------------------------------

  // Normalize <br>s so that there's always a sinlgle space after them.
  // This guarantees predictable formatting by prettier
  const injectSpaceAfterBr = (root: HTMLElement) => {
    qq('br', root).forEach((br) => {
      br.after(' ');
    });
  };

  // ---------------------------------------------------------------------------

  const innerWrap = (
    elm: HTMLElement,
    newElm: HTMLElement | keyof HTMLElementTagNameMap,
  ) => {
    newElm = typeof newElm === 'string' ? E(newElm) : newElm;
    elm.insertAdjacentElement('afterbegin', newElm);
    while (newElm.nextSibling) {
      newElm.appendChild(newElm.nextSibling);
    }
  };

  // ---------------------------------------------------------------------------

  const trimBrs = (root: Element) => {
    // Remove trailing <br>s
    qq('br', root)
      .reverse()
      .forEach((elm) => {
        if (!elm.nextSibling) {
          elm.remove();
        }
      });

    // Remove leading <br>s
    qq('br', root).forEach((elm) => {
      if (!elm.previousSibling) {
        elm.remove();
      }
    });
  };

  // ---------------------------------------------------------------------------

  // Collapse spaces around block-level elements
  const trimSpacesAroundBlocks = (root: HTMLElement) => {
    qq('br,' + blockElms, root).forEach((elm) => {
      const skipBrs = elm.nodeName === 'BR';
      _trimAdjacentSpaces(elm, 'both', skipBrs);
    });
  };

  // ---------------------------------------------------------------------------

  // style attribute cherry picking
  const convertStylesToHtml = (root: HTMLElement) => {
    qq<HTMLElement>('[style]', root).forEach((elm) => {
      const {
        fontWeight,
        fontStyle,
        textAlign,
        listStyleType,
        marginLeft,
        textIndent,
        textDecoration,
      } = elm.style;

      // NOTE: Quick surveying seems to indicate that font-weight and font-style
      // are NEVER set to "normal" inside a container specifying otherwise
      // so we don't worry about that.

      if (textDecoration === 'underline') {
        innerWrap(elm, 'u');
      }

      if (fontStyle === 'italic' || fontStyle === 'oblique') {
        innerWrap(elm, 'em');
      }
      if (
        fontWeight === 'bold' ||
        fontWeight === 'bolder' ||
        parseInt(fontWeight) > 500
      ) {
        innerWrap(elm, 'strong');
      }
      if (textAlign === 'right' || textAlign === 'center') {
        elm.setAttribute('align', textAlign);
      }
      const listType = styleValueToTypeAttrMap[listStyleType];
      if (listType) {
        elm.setAttribute('type', listType);
      }
      if (marginLeft) {
        const negativeTextIndent = parseFloat(textIndent) < 0 ? textIndent : '';
        elm.setAttribute(
          'data-indenting',
          marginLeft + '|' + negativeTextIndent,
        );
      }
    });
  };

  // ---------------------------------------------------------------------------

  // // Normalizes lang="" attributes
  // const normalizeLangAttrs = (root: HTMLElement) => {
  // 	qq<HTMLElement>('[lang]', root).forEach((elm) => {
  // 		const lang = elm.lang.trim().split(/\s+/)[0].toLowerCase();
  // 		elm.lang = lang;
  // 		if (
  // 			!lang ||
  // 			(/^is-?/.test(lang) && !(elm.parentElement && elm.parentElement?.closest('[lang]')))
  // 		) {
  // 			elm.removeAttribute('lang');
  // 		}
  // 	});
  // };

  // ---------------------------------------------------------------------------

  // push all leading/trailing spaces (and <br>s) outside elements
  const pushSpaceOutsideElements = (root: Element) => {
    [root]
      .concat(qq('*:not(br):not(hr):not(img):not(pre)', root))
      .reverse()
      .forEach((elm) => {
        ([false, true] as const).forEach((atStart) => {
          const notRoot = elm !== root;
          const getChild = atStart ? 'firstChild' : 'lastChild';
          const insertOutside = atStart ? 'before' : 'after';
          const trim = atStart ? 'trimStart' : 'trimEnd';

          let node = elm[getChild];
          while (
            node &&
            (node.nodeName === '#text' ||
              node.nodeName === 'BR' ||
              (!atStart &&
                (node as Element).matches('span[data-legacy-indenter]')))
          ) {
            if (node.nodeName === '#text') {
              const trimmedText = node.textContent[trim]();
              if (trimmedText !== node.textContent) {
                notRoot && elm[insertOutside](' ');
              }
              if (trimmedText) {
                node.textContent = trimmedText;
                break;
              } else {
                node.remove();
              }
            } else {
              if (notRoot) {
                elm[insertOutside](node);
              } else {
                node.remove();
              }
            }
            node = elm[getChild];
          }
        });
      });
    removeEmptyElms(root);
  };

  // ---------------------------------------------------------------------------

  const trimDom = (
    root: Element,
    cursor: ChildNode | undefined | null,
    from: 'left' | 'right',
  ) => {
    const leftTrim = from === 'left';
    if (!cursor) {
      if (leftTrim) {
        root.textContent = '';
      }
      return;
    }
    const getSibling = leftTrim ? 'previousSibling' : 'nextSibling';
    const lineage: Array<Node> = [];
    let elm: Node | null = cursor;
    while (elm && elm !== root) {
      lineage.push(elm);
      elm = elm.parentNode;
    }
    lineage.forEach((elm) => {
      while (elm[getSibling]) {
        (elm[getSibling] as ChildNode).remove();
      }
    });
    leftTrim && cursor.remove();
  };

  const _splitElmOnCursor = <E extends Element>(
    root: E,
    splitter?: Element,
    trimRoot?: 'first' | 'last',
  ): [elmA: E, elmB: E] => {
    if (
      !splitter ||
      root.compareDocumentPosition(splitter) & Node.DOCUMENT_POSITION_CONTAINS
    ) {
      return [root.cloneNode(true) as E, root.cloneNode(false) as E];
    }
    const splitPos = qq('*', root).indexOf(splitter);

    const elmA = trimRoot === 'first' ? root : (root.cloneNode(true) as E);
    const splitterA = qq('*', elmA)[splitPos];
    const elmB = trimRoot === 'last' ? root : (root.cloneNode(true) as E);
    const splitterB = qq('*', elmB)[splitPos];

    trimDom(elmA, splitterA, 'right');
    trimDom(elmB, splitterB, 'left');

    pushSpaceOutsideElements(elmA);
    pushSpaceOutsideElements(elmB);
    trimBrs(elmA);
    trimBrs(elmB);

    return [elmA, elmB];
  };

  // ---------------------------------------------------------------------------

  // Wrap top-level textNodes in <p>s
  const paragraphizeStrayContent = (root: Element) => {
    [root]
      .concat(qq('li,th,td,caption', root))
      .filter((elm) => elm === root || q(blockElms, elm))
      .forEach(_paragraphizeBareChildren);
  };

  // ---------------------------------------------------------------------------

  // remove empty elements
  const removeEmptyElms = (root: Element) => {
    qq(blockTextElms + ',' + inlineTextElms, root)
      .reverse()
      .filter(_isElementEmpty)
      .forEach((elm) => {
        if (isTableCell[elm.nodeName]) {
          elm.textContent = '';
        } else if (elm.textContent) {
          elm.replaceWith(' ');
        } else {
          elm.remove();
        }
      });
  };

  // ---------------------------------------------------------------------------

  // Remove only-child <p>s inside <td>, <th>, <li>, etc.
  const zapRedundantParagraphs = (root: HTMLElement) => {
    qq('p', root)
      .filter(
        (elm) =>
          elm.parentNode !== root &&
          !elm.previousSibling &&
          !elm.nextSibling &&
          (elm.parentNode as Element).matches('li,td,th'),
      )
      .forEach((elm) => {
        // eslint-disable-next-line deprecation/deprecation
        if (elm.align) {
          // eslint-disable-next-line deprecation/deprecation
          (elm.parentNode as HTMLTableCellElement).align = elm.align;
        }
        zapElm(elm);
      });
  };

  // ---------------------------------------------------------------------------

  const mergeAdjacentInlineElms = (root: HTMLElement) => {
    const seekPreviousMergableSibling = (
      elm: HTMLElement,
      startAt = elm.previousSibling,
    ): HTMLElement | undefined => {
      const tagName = elm.nodeName;
      let prevSibling = startAt;
      while (
        prevSibling &&
        (prevSibling.nodeName === '#text'
          ? !prevSibling.textContent.trim()
          : (prevSibling as Element).matches(
              inlineSelfClosingElms + ', span[data-legacy-indenter]',
            ))
      ) {
        prevSibling = prevSibling.previousSibling;
      }
      // we found either nothing or a text node
      if (!prevSibling || prevSibling.nodeName === '#text') {
        return;
      }
      const prevSiblingElm = prevSibling as HTMLElement;
      // we found a perfect match
      if (
        prevSiblingElm.nodeName === tagName &&
        (prevSiblingElm as HTMLAnchorElement).href ===
          (elm as HTMLAnchorElement).href &&
        prevSiblingElm.id === elm.id &&
        prevSiblingElm.className === elm.className &&
        prevSiblingElm.dataset.cfemail === elm.dataset.cfemail // '[data-cfemail]'
      ) {
        return prevSiblingElm;
      }
      // candidate contains a single child element
      if (prevSiblingElm.children.length === 1) {
        const siblingChild = seekPreviousMergableSibling(
          elm,
          prevSibling.lastChild,
        );
        // which is a valid condidate element and has no preceding text content
        if (
          siblingChild &&
          siblingChild.textContent === prevSibling.textContent.trim()
        ) {
          // swap them (A>B ==> B>A) and return the former child (current parent)
          // as a mergable sibling
          siblingChild.childNodes.forEach((node) => {
            siblingChild.before(node);
          });
          prevSibling.after(siblingChild);
          siblingChild.append(prevSibling);
          return siblingChild;
        }
      }
    };

    qq<HTMLElement>(inlineTextElms, root).forEach((elm) => {
      if (elm.matches('span[data-legacy-indenter]')) {
        return;
      }
      let mergableElm: Element | undefined;
      while ((mergableElm = seekPreviousMergableSibling(elm))) {
        let node = elm.previousSibling;
        while (node) {
          if (node === mergableElm) {
            node = mergableElm.lastChild;
          } else {
            const next = node.previousSibling;
            elm.prepend(node);
            node = next;
          }
        }
        mergableElm.remove();
      }
    });
  };

  // ---------------------------------------------------------------------------

  // Cap number of adjacent <br>s
  const max2AdjacentBrs = (root: HTMLElement) => {
    qq('br', root).forEach((br) => {
      const prev = br.previousSibling;
      if (prev && prev.nodeName === 'BR') {
        const prev2 = prev.previousSibling;
        if (prev2 && prev2.nodeName === 'BR') {
          removeNode(br);
        }
      }
    });
  };

  // ---------------------------------------------------------------------------
  const reverseLinkedFootnoteMarkers = (root: HTMLElement) => {
    qq('a > .footnote-reference, a > .footnote__marker', root)
      .filter((elm) => !elm.previousSibling && !elm.nextSibling)
      .forEach((elm) => {
        const parent = elm.parentNode as HTMLElement;
        parent.append(...A(elm.childNodes));
        parent.replaceWith(elm);
        elm.append(parent);
      });
  };

  // ---------------------------------------------------------------------------

  const splitPsOnDoubleBrs = (root: HTMLElement) => {
    qq<HTMLBRElement>('p br', root)
      .filter((br) => br.previousSibling?.nodeName === 'BR')
      .forEach((br) => {
        (br.previousSibling as HTMLBRElement).remove();
        const pElm = br.closest('p') as HTMLParagraphElement;
        const [elmA] = _splitElmOnCursor(pElm, br, 'last');
        pElm.before(elmA);
      });
  };

  // ---------------------------------------------------------------------------

  // convert remoeve comments, collapse spacves, etc.
  const _removeCommentsAndUnescapeText = (
    elm: Element,
    noPreElms?: boolean,
  ) => {
    elm.childNodes.forEach((node) => {
      const type = node.nodeType;
      if (type === Node.COMMENT_NODE) {
        node.parentNode?.removeChild(node);
      } else if (type === Node.TEXT_NODE) {
        if (noPreElms || !elm.closest('pre')) {
          node.textContent = node.textContent.replace(/\s+/g, ' ');
        }
        // Remove soft-hypoen (&shy; char-code 173, \u00ad)
        node.textContent = node.textContent.replace(/\u00ad/g, '');
      } else if (type === Node.CDATA_SECTION_NODE) {
        // TODO: Decide upon the correct action – if any!
      } else if (type === Node.ELEMENT_NODE) {
        _removeCommentsAndUnescapeText(node as Element); // eslint-disable-line @typescript-eslint/no-use-before-define
      }
    });
  };
  const removeCommentsAndUnescapeText = (root: HTMLElement) => {
    _removeCommentsAndUnescapeText(root, !q('pre', root));
  };

  // ---------------------------------------------------------------------------

  // remove/zap elements.
  const removeDisallowedElements = (root: Element) => {
    qq(unsafeElements, root).forEach(removeNode);
    qq(meaninglessElements, root).forEach(zapElm);
  };

  // ---------------------------------------------------------------------------

  type AllowedAttrs = Record<
    string,
    true | undefined | ((value: string) => string | false)
  >;

  type UnwantedAttrs = {
    alwaysAllowedClassNames?: Record<string, true | undefined>;
  };

  const removeUnwantedAttributes = (
    root: HTMLElement,
    opts?: UnwantedAttrs,
  ) => {
    const alwaysAllowedClassNames = opts?.alwaysAllowedClassNames || {};

    const noAttrsAllowed = {};

    const allowedValues =
      (allowed: Record<string, true | undefined>, lowerCase?: true) =>
      (value: string): string | false => {
        value = value.trim();
        value = lowerCase ? value.toLowerCase() : value;
        return !!allowed[value] && value;
      };

    // const allowedMultiClasses = (allowed: Record<string, true | undefined>) => (
    // 	value: string,
    // ): string | false =>
    // 	value
    // 		.trim()
    // 		.split(/\s*/)
    // 		.filter((val) => allowed[val] || alwaysAllowedClassNames[val])
    // 		.join(' ') || false;

    const allowedClasses = (allowed?: Record<string, true | undefined>) =>
      allowedValues({ ...alwaysAllowedClassNames, ...allowed });

    const allowedAlign = allowedValues({ right: true, center: true }, true);

    type AttrRules = {
      _always: AllowedAttrs;
      _otherInline: AllowedAttrs;
      _otherBlock: AllowedAttrs;
      [x: string]: AllowedAttrs;
    };
    const allowedAttrs: AttrRules = {
      _always: {
        'data-autogenerated': true, // inserted by dirtyclean for flagging to the editor
        id: true,
        class: allowedClasses(),
      },
      SPAN: {
        'data-legacy-indenter': true,
        'data-cfemail': true,
        class: allowedClasses({
          footnote__marker: true,
          'footnote-reference': true,
          __cf_email__: true,
        }),
      },
      A: mappify('href'),
      IMG: mappify('src,alt,width,height'),
      BR: noAttrsAllowed,
      HR: noAttrsAllowed,
      OL: {
        start: true,
        type: (value) => {
          value = value.trim()[0] || '';
          return 'aAiI'.includes(value) && value;
        },
      },
      UL: {
        start: true,
        type: allowedValues({ circle: true, square: true }, true),
      },
      LI: mappify('value'),
      TD: {
        align: allowedAlign,
        colspan: true,
        rowspan: true,
      },
      SUP: {
        class: allowedValues({
          'footnote-reference': true,
          footnote__marker: true,
        }),
      },
      TH: {
        align: allowedAlign,
        colspan: true,
        rowspan: true,
        scope: true,
      },
      TABLE: {
        class: allowedClasses({
          layout: true,
          'layout layout--list': true,
        }),
      },
      P: {
        'data-indenting': true,
        align: allowedAlign,
        class: allowedClasses({
          doc__title: true,
          footnote: true,
          Dags: true,
          FHUndirskr: true,
          Undirritun: true,
          indented: true,
        }),
      },
      H2: {
        align: allowedValues({ center: true }, true),
        class: allowedClasses({
          chapter__title: true,
          subchapter__title: true,
          appendix__title: true,
          section__title: true,
        }),
      },
      H3: {
        align: allowedValues({ center: true }, true),
        class: allowedClasses({
          article__title: true,
          'article__title article__title--provisional': true,
        }),
      },
      H4: {
        align: allowedValues({ center: true }, true),
      },
      H5: {
        align: allowedValues({ center: true }, true),
      },
      TR: noAttrsAllowed,
      TBODY: noAttrsAllowed,
      TFOOT: noAttrsAllowed,
      THEAD: noAttrsAllowed,
      CAPTION: noAttrsAllowed,
      BLOCKQUOTE: noAttrsAllowed,

      SECTION: {
        class: allowedValues({
          appendix: true,
        }),
      },

      _otherInline: noAttrsAllowed,
      _otherBlock: {
        align: allowedAlign,
      },
    };

    const { _always, _otherBlock, _otherInline } = allowedAttrs;
    qq<HTMLElement>('*', root).forEach((elm) => {
      const tagName = elm.tagName;
      const allowed =
        allowedAttrs[tagName] ||
        (isInlineElms[tagName]
          ? _otherInline
          : isBlockElm[tagName]
          ? _otherBlock
          : {});

      elm.getAttributeNames().forEach((name) => {
        const checker = allowed[name] || _always[name];
        const newValue = !checker
          ? false
          : checker === true
          ? elm.getAttribute(name) || false // by default remove empty (="") attributes
          : checker(elm.getAttribute(name) as string);

        if (newValue === false) {
          elm.removeAttribute(name);
        } else {
          elm.setAttribute(name, newValue);
        }
      });
    });
  };

  // ---------------------------------------------------------------------------

  const unitToPx: Record<string, number | undefined> = {
    px: 1,
    pt: 1,
    em: 16, // seems reasonable
    rem: 16, // seems reasonable
  };
  const cssSizeToPx = (size: string): number | undefined => {
    const [, numStr, unit] =
      size.toLowerCase().match(/^(-?\d*(?:\.\d+)?)(.+)$/) || [];
    if (!numStr || !unit) {
      return;
    }
    const factor = unitToPx[unit] || 0;
    const num = Math.round((parseFloat(numStr) || 0) * factor);
    return num > 0 ? num : undefined;
  };

  const INVALID_SIZE = 9991999;

  // Normalizes images
  const fixImages = (root: HTMLElement) => {
    qq('img[src="/icons/ecblank.gif"]', root).forEach(removeNode);

    qq('img', root).forEach((elm) => {
      const width = cssSizeToPx(elm.style.width) ?? (elm.width || INVALID_SIZE);
      const height =
        cssSizeToPx(elm.style.height) ?? (elm.height || INVALID_SIZE);
      if (Math.min(width, height) <= 3) {
        elm.remove();
      } else {
        width !== INVALID_SIZE
          ? (elm.width = width)
          : elm.removeAttribute('width');
        height !== INVALID_SIZE
          ? (elm.height = height)
          : elm.removeAttribute('height');
      }

      const { alt, title } = elm;
      if (title) {
        elm.alt = alt || title;
        elm.removeAttribute('title');
      }
    });
  };

  // ---------------------------------------------------------------------------

  const cleanupBlockquotes = (root: Element) => {
    qq('blockquote > blockquote', root).forEach(zapElm);

    qq('blockquote', root).forEach((blockquoteElm) => {
      paragraphizeStrayContent(blockquoteElm);
      // removeEmptyElms(blockquoteElm)
    });
  };

  // ---------------------------------------------------------------------------

  // clean up list stylings
  const cleanUpLists = (root: HTMLElement) => {
    // often <ol><li style="list-style-type: none;"> is used for indenting
    qq<HTMLLIElement>('li[style]:only-child', root)
      .filter((elm) => elm.style.listStyleType === 'none')
      .forEach((elm) => {
        zapElm(elm.parentNode as Element);
        zapElm(elm);
      });

    // Merges unstyled <li>s with their previousSibling <li>
    qq<HTMLLIElement>('li + li', root)
      .filter((elm) => elm.style.listStyleType === 'none')
      .forEach((elm) => {
        const prevLi = elm.previousElementSibling as HTMLLIElement;
        paragraphizeStrayContent(prevLi); // eslint-disable-line @typescript-eslint/no-use-before-define
        prevLi.append(...A(elm.childNodes));
        elm.remove();
      });

    qq('ol', root).forEach((elm) => {
      let count = elm.start;
      A(elm.children)
        .filter((elm): elm is HTMLLIElement => elm.matches('li'))
        .forEach((li) => {
          if (li.hasAttribute('value')) {
            if (li.value === count) {
              li.removeAttribute('value');
            } else {
              count = li.value;
            }
          }
          count += 1;
        });
    });
  };

  // ---------------------------------------------------------------------------

  const reApplyStyleAttrs = (root: HTMLElement) => {
    qq<HTMLElement>('[data-indenting]', root).forEach((elm) => {
      const [marginLeft = '', textIndent = ''] = (
        elm.getAttribute('data-indenting') as string
      ).split('|');
      elm.style.marginLeft = marginLeft;
      elm.style.textIndent = textIndent;
      elm.removeAttribute('data-indenting');
    });
  };

  // ---------------------------------------------------------------------------

  // Zap leftover <span>s
  const zapsLeftoverSpans = (root: HTMLElement) => {
    qq('span:not([data-legacy-indenter],[data-cfemail])', root).forEach(zapElm);
  };

  // ---------------------------------------------------------------------------

  const zapRedundantDecendants = (root: HTMLElement) => {
    qq('em em, strong strong, u u, s s', root).forEach(zapElm);
  };

  // ---------------------------------------------------------------------------

  const rehydrateIndents = (root: HTMLElement) => {
    qq<HTMLElement>('span[data-legacy-indenter]', root).forEach((elm) => {
      if (!elm.nextSibling) {
        if (!elm.previousSibling) {
          (elm.parentNode as Element).remove();
        } else {
          _trimAdjacentSpaces(elm, 'before');
          elm.remove();
        }
      } else {
        const length = parseInt(
          elm.getAttribute('data-legacy-indenter') as string,
        );
        elm.textContent = ' ' + new Array(length + 1).join(' ') + ' ';
        elm.setAttribute('data-legacy-indenter', '');
        const { previousSibling, nextSibling } = elm;
        if (previousSibling && previousSibling.nodeName === '#text') {
          previousSibling.textContent = previousSibling.textContent.replace(
            / $/,
            '\n',
          );
        }
        if (nextSibling && nextSibling.nodeName === '#text') {
          nextSibling.textContent = nextSibling.textContent.replace(/^ /, '\n');
        }
      }
    });
  };

  // ---------------------------------------------------------------------------

  const saveCFEmailMarkers = (root: HTMLElement) => {
    qq('a.__cf_email__[data-cfemail]', root).forEach(_transmogrifyInto('span'));
  };

  // ---------------------------------------------------------------------------

  return {
    prettify,
    //
    _splitElmOnCursor,
    __logOuterHTML,
    _transmogrifyInto,
    _paragraphizeBareChildren,
    //
    sortAttributes,
    injectSpaceAfterBr,
    innerWrap,
    removeUnwantedAttributes,
    trimBrs,
    paragraphizeStrayContent,
    removeEmptyElms,
    rehydrateIndents,
    saveCFEmailMarkers,
    removeCommentsAndUnescapeText,
    removeDisallowedElements,
    trimSpacesAroundBlocks,
    convertStylesToHtml,
    fixImages,
    reApplyStyleAttrs,
    zapsLeftoverSpans,
    zapRedundantDecendants,
    cleanUpLists,
    zapRedundantParagraphs,
    mergeAdjacentInlineElms,
    max2AdjacentBrs,
    reverseLinkedFootnoteMarkers,
    splitPsOnDoubleBrs,
    pushSpaceOutsideElements,
    cleanupBlockquotes,
  };
};
