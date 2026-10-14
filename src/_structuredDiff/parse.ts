/*
  Parsing a regulation's HTML into sections (articles, sub-articles,
  chapters, the signature) holding blocks (paragraphs, lists, tables, loose
  text), with each block's text and shape.
*/

import { Block, BlockKind, Section, StructuredDiffOptions } from './types';

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
  (el.classList.contains('Dags') ||
    // Without the class, only a short line: a body paragraph can end
    // "… staðfest af ráðuneytinu, 1. janúar 2020." too.
    (SIGNATURE_DATE_RE.test(text) && text.split(' ').length <= 12));

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
export const BOUNDARY = '\u241f';

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

/**
 * A block's text, a space between cells, items, paragraphs and `<br>`s:
 * `textContent` runs `<td>Loðna</td><td>100</td>` into one word, "Loðna100",
 * so a table or list with a row or item added shared no words with itself.
 */
export const textOf = (el: Element) =>
  normalize(
    contentOf(el)
      .replace(new RegExp(BOUNDARY, 'g'), ' ')
      .replace(/\ufffc/g, ''),
  );

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

// ---------------------------------------------------------------------------
// parseSections in three steps, so the incremental differ can cache the
// first per top-level node: what each node is (`itemOf`), where sections
// start (`segment`), and each section's blocks (`buildSection`). Everything a
// section holds is decided by its own nodes, never by its neighbours.

/** A block without its paragraph number, which depends on its position. */
export type BlockFields = Omit<Block, 'mgr'>;

/** What one top-level node is to the parse. */
export type Item =
  /** Loose text or inline markup: collected into runs, each run one block. */
  | { type: 'inline'; node: ChildNode }
  /** A comment. */
  | { type: 'skip' }
  /** An article, chapter or sub-article heading: starts a section. */
  | { type: 'heading'; section: Omit<Section, 'blocks'> }
  /** `sigStart`: would start the signature, unless already inside it. */
  | { type: 'block'; sigStart: boolean; fields: BlockFields };

export type InlineItem = Extract<Item, { type: 'inline' }>;

export const itemOf = (node: ChildNode): Item => {
  if (isInline(node)) {
    return { type: 'inline', node };
  }
  if (node.nodeType !== 1) {
    return { type: 'skip' };
  }
  const el = node as Element;
  const text = normalize(el.textContent || '');
  const heading = () => ({ html: el.outerHTML, text, shape: shapeOf(el) });

  if (el.tagName === 'H3') {
    const m = text.match(ARTICLE_RE);
    const num = m && m[1] + (m[2] || '');
    return {
      type: 'heading',
      section: {
        key: num ? `gr:${num}` : `h3:${text}`,
        label: m ? `${m[1]}. gr.${m[2] ? ' ' + m[2] : ''}` : text,
        title: m ? normalize(text.slice(m[0].length)) : text,
        heading: heading(),
      },
    };
  }
  if (el.tagName === 'H2') {
    // Keyed by kind and number, so a changed title is not a renumbering.
    const m = text.match(DIVISION_RE);
    const kind = m?.[2]!.toLowerCase();
    const num = m && m[1]! + (m[3] ? ' ' + m[3] : '');
    return {
      type: 'heading',
      section: {
        key: m ? `h2:${kind}:${num}` : `h2:${text}`,
        label: m ? `${num}. ${kind}` : text,
        title: m ? normalize(text.slice(m[0].length)) : text,
        heading: heading(),
      },
    };
  }
  const sub = subheadingNumber(el);
  if (sub) {
    return {
      type: 'heading',
      section: {
        key: `sub:${sub}`,
        label: `${sub}. gr.`,
        title: normalize(text.replace(SUBHEADING_RE, '')),
        heading: heading(),
      },
    };
  }
  return {
    type: 'block',
    sigStart: isSignatureStart(el, text),
    fields: {
      kind: blockKind(el),
      html: el.outerHTML,
      text: textOf(el),
      content: contentOf(el),
      canon: canonOf(el).replace(/^<div>|<\/div>$/g, ''),
      shape: shapeOf(el),
      blockShape: shapeOf(el, false),
      term: definedTerm(el, text),
    },
  };
};

/**
 * A run of loose text and inline markup as one block, or undefined when it
 * holds nothing visible (whitespace between elements).
 */
export const runFields = (
  run: ReadonlyArray<InlineItem>,
): BlockFields | undefined => {
  if (!run.length) {
    return;
  }
  const wrap = run[0]!.node.ownerDocument!.createElement('div');
  run.forEach(({ node }) => wrap.appendChild(node.cloneNode(true)));
  const text = normalize(wrap.textContent || '');
  // An image is content too: a run of only an image is still a block.
  if (!text && !wrap.querySelector('img')) {
    return;
  }
  return {
    kind: 'text',
    html: wrap.innerHTML,
    text: textOf(wrap),
    content: contentOf(wrap),
    canon: canonOf(wrap).replace(/^<div>|<\/div>$/g, ''),
    shape: shapeOf(wrap).replace(/^div/, '#text'),
    blockShape: shapeOf(wrap, false).replace(/^div/, '#text'),
    term: undefined,
  };
};

/** Items `from`–`to` (exclusive) make one section, started as `start` says. */
export type Segment = {
  start: 'pre' | 'heading' | 'sig';
  from: number;
  to: number;
};

/**
 * Where sections start: at every heading, and at the closing date line
 * unless already in the signature. Loose text before a heading stays with the
 * section before it.
 */
export const segment = (items: ReadonlyArray<Item>): Array<Segment> => {
  const out: Array<Segment> = [];
  let start: Segment['start'] = 'pre';
  let from = 0;
  items.forEach((item, i) => {
    const next =
      item.type === 'heading'
        ? 'heading'
        : item.type === 'block' && item.sigStart && start !== 'sig'
        ? 'sig'
        : undefined;
    if (next) {
      out.push({ start, from, to: i });
      start = next;
      from = i;
    }
  });
  out.push({ start, from, to: items.length });
  return out;
};

export type BuildHooks = {
  /** `runFields`, or a cached equivalent. */
  run: (run: ReadonlyArray<InlineItem>) => BlockFields | undefined;
  /** The block itself, or a cached equivalent. */
  block: (fields: BlockFields, mgr: number) => Block;
};

export const plainHooks: BuildHooks = {
  run: runFields,
  block: (fields, mgr) => ({ ...fields, mgr }),
};

/** One segment as a section, or undefined for an empty unheaded one. */
export const buildSection = (
  items: ReadonlyArray<Item>,
  { start, from, to }: Segment,
  hooks: BuildHooks,
): Section | undefined => {
  const blocks: Array<Block> = [];
  const first = items[from];
  const section: Section =
    start === 'heading' && first?.type === 'heading'
      ? { ...first.section, blocks }
      : start === 'sig'
      ? {
          key: 'sig',
          label: 'Undirritun',
          title: '',
          signature: true,
          blocks,
        }
      : { key: 'pre', label: '', title: '', blocks };
  let mgr = 0;
  const push = (fields: BlockFields) => {
    // A list or table belongs to the paragraph before it.
    if (fields.kind === 'paragraph' || fields.kind === 'text' || mgr === 0) {
      mgr++;
    }
    blocks.push(hooks.block(fields, mgr));
  };
  let run: Array<InlineItem> = [];
  const flushRun = () => {
    const fields = run.length ? hooks.run(run) : undefined;
    run = [];
    fields && push(fields);
  };
  for (let i = start === 'heading' ? from + 1 : from; i < to; i++) {
    const item = items[i]!;
    if (item.type === 'inline') {
      run.push(item);
      continue;
    }
    flushRun();
    if (item.type === 'block') {
      push(item.fields);
    }
  }
  flushRun();
  return section.heading || blocks.length ? section : undefined;
};

export const parseSections = (
  html: string,
  asDiv: StructuredDiffOptions['asDiv'],
): Array<Section> => {
  const items = Array.from(asDiv(html).childNodes).map(itemOf);
  return segment(items).flatMap(
    (seg) => buildSection(items, seg, plainHooks) || [],
  );
};
