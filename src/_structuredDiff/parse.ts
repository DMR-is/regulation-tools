/*
  Parsing a regulation's HTML into sections (articles, sub-articles,
  chapters, the signature) holding blocks (paragraphs, lists, tables, loose
  text), with each block's text and shape.
*/

import { BlockKind, Section, StructuredDiffOptions } from './types';

export const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * "7. gr." and "24. gr. a" — the letter is lowercase and stands alone, so
 * "1. gr. Skilgreiningar." is not read as "1. gr. S".
 */
export const ARTICLE_RE =
  /^(\d+(?:\.\d+)*)\s*\.?\s*(?:gr\.?|grein)(?:\s+([a-zá-þ])(?=[\s.]|$))?/u;
export const SUBHEADING_RE = /^(\d+(?:\.\d+)+)\.?\s/;
/**
 * A numbered division: "III. kafli", "III. KAFLI A", "1.1. KAFLI", "10.4 KAFLI",
 * "1. HLUTI". Group 1 is the number, 2 the kind, 3 an optional letter.
 */
export const DIVISION_RE =
  /^([IVXLCDM]+|\d+(?:\.\d+)*)\.?\s*(kafli|hluti)(?:\s+([A-Z])(?=[\s.]))?\.?\s*/i;
/** "Fjármála- og efnahagsráðuneytinu, 27. október 2017." */
export const SIGNATURE_DATE_RE = /ráðuneyti\S*,\s*\d{1,2}\.\s+\S+\s+\d{4}\.?$/i;

/** The editor marks the closing date line `<p class="Dags">`; older texts may not. */
export const isSignatureStart = (el: Element, text: string) =>
  el.tagName === 'P' &&
  (el.classList.contains('Dags') || SIGNATURE_DATE_RE.test(text));

/** `<p><em>11.2 Lágspennuvirki.</em></p>` — a numbered paragraph that is entirely one em/strong. */
export const subheadingNumber = (el: Element): string | undefined => {
  if (el.tagName !== 'P' || el.children.length !== 1) {
    return;
  }
  const child = el.children[0]!;
  if (child.tagName !== 'EM' && child.tagName !== 'STRONG') {
    return;
  }
  const text = normalize(el.textContent || '');
  if (text !== normalize(child.textContent || '')) {
    return;
  }
  return text.match(SUBHEADING_RE)?.[1];
};

/** Attributes that change what a block means or how it reads. */
export const SHAPE_ATTRS = [
  'type',
  'start',
  'class',
  // Change what a link points to, which image shows, or a table's layout.
  // Ids and styles are deliberately left out: incidental, not meaning.
  'href',
  'src',
  'colspan',
  'rowspan',
];

/** Inline formatting. Left out of `blockShape`. */
export const INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'br',
  'cite',
  'code',
  'em',
  'i',
  'mark',
  'q',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'u',
  // An image sits in running text like a word; whole-block marking wraps it
  // with the text around it, so an inserted or deleted image is marked.
  'img',
]);

export const isInline = (node: ChildNode) =>
  node.nodeType === 3 /* text */ ||
  (node.nodeType === 1 &&
    INLINE_TAGS.has((node as Element).tagName.toLowerCase()));

/**
 * Containers of repeated items: one more item or row of the same kind is a
 * change of content, not of formatting, so repeated child shapes count once —
 * `ol(li,li)` and `ol(li,li,li)` are both `ol(li)`. (Not `tr`: a new column
 * is a change of structure.)
 */
export const ITEM_CONTAINERS = new Set([
  'ol',
  'ul',
  'table',
  'thead',
  'tbody',
  'tfoot',
]);

export const childShapes = (el: Element, inline: boolean): Array<string> => {
  const shapes = Array.from(el.children).flatMap((child) =>
    inline || !INLINE_TAGS.has(child.tagName.toLowerCase())
      ? [shapeOf(child, inline)]
      : childShapes(child, inline),
  );
  return ITEM_CONTAINERS.has(el.tagName.toLowerCase())
    ? [...new Set(shapes)]
    : shapes;
};

/** An element's meaningful attributes as `[name=value]…`; class names sorted. */
const attrsOf = (el: Element) =>
  SHAPE_ATTRS.map((name) => {
    let value = el.getAttribute(name);
    if (value == null) {
      return '';
    }
    if (name === 'class') {
      value = value.split(/\s+/).filter(Boolean).sort().join(' ');
      if (!value) {
        return '';
      }
    }
    return `[${name}=${value}]`;
  }).join('');

export const shapeOf = (el: Element, inline = true): string => {
  const children = childShapes(el, inline).join(',');
  return (
    el.tagName.toLowerCase() + attrsOf(el) + (children ? `(${children})` : '')
  );
};

const canonNode = (node: Node): string => {
  if (node.nodeType === 3) {
    return (node.textContent || '').replace(/\s+/g, ' ');
  }
  if (node.nodeType !== 1) {
    return '';
  }
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const inner = Array.from(el.childNodes).map(canonNode).join('');
  return `<${tag}${attrsOf(el)}>${inner}</${tag}>`;
};

/**
 * The block canonicalised for equality: where every tag and text sits, with
 * the meaningful attributes. Whitespace next to a tag is dropped as
 * incidental — a word joined or split there still shows in `contentOf`.
 */
export const canonOf = (el: Element) =>
  canonNode(el)
    .replace(/ ?(<[^>]+>) ?/g, '$1')
    .trim();

/** Marks a cell, item or paragraph boundary inside `contentOf`. */
const BOUNDARY = '\u241f';

const contentNode = (node: Node): string => {
  if (node.nodeType === 3) {
    return node.textContent || '';
  }
  if (node.nodeType !== 1) {
    return '';
  }
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (tag === 'br') {
    return ' ';
  }
  if (tag === 'img') {
    return '\ufffc'; // an image is content, like a word
  }
  const inner = Array.from(el.childNodes).map(contentNode).join('');
  return INLINE_TAGS.has(tag) ? inner : BOUNDARY + inner + BOUNDARY;
};

/** The text with cell, item and paragraph boundaries kept. */
export const contentOf = (el: Element) =>
  contentNode(el)
    .replace(/\s+/g, ' ')
    // A run of boundaries with whitespace between them is one boundary.
    .replace(new RegExp(`(?: ?${BOUNDARY})+ ?`, 'g'), BOUNDARY)
    .replace(new RegExp(`^${BOUNDARY}|${BOUNDARY}$`, 'g'), '')
    .trim();

/** "Seljandi" from `<p><em>Seljandi:</em> Framleiðandi …</p>`. */
export const definedTerm = (el: Element, text: string): string | undefined => {
  const lead = el.firstElementChild;
  if (
    el.tagName !== 'P' ||
    !lead ||
    (lead.tagName !== 'EM' && lead.tagName !== 'STRONG')
  ) {
    return;
  }
  const leadText = normalize(lead.textContent || '');
  if (!leadText.endsWith(':') || !text.startsWith(leadText)) {
    return;
  }
  return leadText.slice(0, -1).trim();
};

export const blockKind = (el: Element): BlockKind => {
  const tag = el.tagName;
  if (tag === 'P') {
    return 'paragraph';
  }
  if (tag === 'OL' || tag === 'UL') {
    return 'list';
  }
  if (tag === 'TABLE') {
    return 'table';
  }
  return 'other';
};

export const parseSections = (
  html: string,
  asDiv: StructuredDiffOptions['asDiv'],
): Array<Section> => {
  const sections: Array<Section> = [];
  let current: Section = { key: 'pre', label: '', title: '', blocks: [] };
  let mgr = 0;

  const start = (section: Section) => {
    if (current.heading || current.blocks.length) {
      sections.push(current);
    }
    current = section;
    mgr = 0;
  };

  const pushBlock = (
    kind: BlockKind,
    el: Element,
    html: string,
    text: string,
    shape: string,
    blockShape: string,
    term?: string,
  ) => {
    if (kind === 'paragraph' || kind === 'text' || mgr === 0) {
      mgr++;
    }
    current.blocks.push({
      kind,
      html,
      text,
      content: contentOf(el),
      canon: canonOf(el).replace(/^<div>|<\/div>$/g, ''),
      shape,
      blockShape,
      term,
      mgr,
    });
  };

  const root = asDiv(html);
  // Loose top-level text and inline markup — not wrapped in a block element —
  // is collected into runs, each its own block, so no text is ever dropped.
  let run: Array<ChildNode> = [];
  const flushRun = () => {
    const wrap = root.ownerDocument.createElement('div');
    run.forEach((node) => wrap.appendChild(node.cloneNode(true)));
    run = [];
    const text = normalize(wrap.textContent || '');
    // An image is content too: a run of only an image is still a block.
    if (text || wrap.querySelector('img')) {
      pushBlock(
        'text',
        wrap,
        wrap.innerHTML,
        text,
        shapeOf(wrap).replace(/^div/, '#text'),
        shapeOf(wrap, false).replace(/^div/, '#text'),
      );
    }
  };

  for (const node of Array.from(root.childNodes)) {
    if (isInline(node)) {
      run.push(node);
      continue;
    }
    flushRun();
    if (node.nodeType !== 1) {
      continue; // comments
    }
    const el = node as Element;
    const text = normalize(el.textContent || '');
    const heading = { html: el.outerHTML, text, shape: shapeOf(el) };

    if (el.tagName === 'H3') {
      const m = text.match(ARTICLE_RE);
      const num = m && m[1] + (m[2] || '');
      start({
        key: num ? `gr:${num}` : `h3:${text}`,
        label: m ? `${m[1]}. gr.${m[2] ? ' ' + m[2] : ''}` : text,
        title: m ? normalize(text.slice(m[0].length)) : text,
        heading,
        blocks: [],
      });
      continue;
    }
    if (el.tagName === 'H2') {
      // Keyed by kind and number, so a changed title is not a renumbering.
      const m = text.match(DIVISION_RE);
      const kind = m?.[2]!.toLowerCase();
      const num = m && m[1]! + (m[3] ? ' ' + m[3] : '');
      start({
        key: m ? `h2:${kind}:${num}` : `h2:${text}`,
        label: m ? `${num}. ${kind}` : text,
        title: m ? normalize(text.slice(m[0].length)) : text,
        heading,
        blocks: [],
      });
      continue;
    }
    const sub = subheadingNumber(el);
    if (sub) {
      start({
        key: `sub:${sub}`,
        label: `${sub}. gr.`,
        title: normalize(text.replace(SUBHEADING_RE, '')),
        heading,
        blocks: [],
      });
      continue;
    }
    if (!current.signature && isSignatureStart(el, text)) {
      start({
        key: 'sig',
        label: 'Undirritun',
        title: '',
        signature: true,
        blocks: [],
      });
    }
    pushBlock(
      blockKind(el),
      el,
      el.outerHTML,
      text,
      shapeOf(el),
      shapeOf(el, false),
      definedTerm(el, text),
    );
  }
  flushRun();
  start({ key: '', label: '', title: '', blocks: [] });
  return sections;
};
