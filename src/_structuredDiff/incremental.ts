/*
  The incremental differ: one base text diffed against a changing new text,
  as an editor does after every pause in typing. A keystroke changes one
  paragraph, so it keeps what it worked out last time and redoes only what
  the change touched. Every cache holds a pure function of its key, so a run
  that uses them gives exactly what `getStructuredDiff` gives. See
  docs/plan-tiptap-editor.md, "Incremental work".

  - The base is parsed once.
  - The new text is cut into its top-level nodes as strings
    (`splitTopLevel`), and each node is parsed and read (`itemOf`) once per
    distinct string. That is only the same as parsing the whole text when
    each piece parses back to exactly itself: then every element in it was
    closed by its own end tag, and the parser is in the same state at the
    end of the piece as at its start, so the next piece parses as if alone.
    Any piece that does not — entities written out, unclosed or misnested
    tags, a cut in the wrong place — sends that run to `parseSections`, with
    nothing reused. The editor's own serialization always round-trips.
  - A section is rebuilt only when its nodes changed; otherwise last run's
    `Section` object is reused, and with it everything keyed by it: the
    section's block ops and its similarity to old sections. In a rebuilt
    section, each unchanged block keeps its `Block` object (per node and
    paragraph number), so its paired op — the htmldiff — is reused too.
  - Alignment, move detection and the section ops are redone every run, over
    the cached parts: an edit anywhere can change how sections pair, or
    reveal a move.
  - Rendering remembers each piece by the strings it is made from.

  Caches keep only what the last run used, so memory follows the document.
*/

import { HTMLText } from '../types';
import { diffBlocks, PairMemo } from './blocks';
import {
  Block,
  BlockOp,
  DiffPart,
  IncrementalDiff,
  Section,
  SectionOp,
  StructuredDiffer,
  StructuredDiffOptions,
} from './types';
import {
  BlockFields,
  buildSection,
  BuildHooks,
  InlineItem,
  Item,
  itemOf,
  parseSections,
  runFields,
  segment,
} from './parse';
import {
  DiffCaches,
  diffOptions,
  diffSections,
  joinPieces,
  sectionSimilarity,
} from './sections';
import { RenderMemo } from './render';

/** A memo that forgets whatever the previous run did not use. */
const generations = <V>() => {
  let prev = new Map<string, V>();
  let cur = new Map<string, V>();
  return {
    get: (key: string, make: () => V): V => {
      if (cur.has(key)) {
        return cur.get(key)!;
      }
      const v = prev.has(key) ? prev.get(key)! : make();
      cur.set(key, v);
      return v;
    },
    next: () => {
      prev = cur;
      cur = new Map();
    },
  };
};

/** A number per object, for keys made of object identities. */
const identities = () => {
  const ids = new WeakMap<object, number>();
  let last = 0;
  return (x: object) => {
    let id = ids.get(x);
    if (id == null) {
      ids.set(x, (id = ++last));
    }
    return id;
  };
};

// ---------------------------------------------------------------------------

const VOID_ELEMENTS = new Set(
  'area base br col embed hr img input keygen link meta param source track wbr'.split(
    ' ',
  ),
);
/** Elements whose content is not markup: skipped to their end tag. */
const RAW_TEXT = new Set(
  'script style textarea title xmp iframe noembed noframes noscript plaintext'.split(
    ' ',
  ),
);
const TOKEN =
  /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][^\t\n\f\r />]*)(?:[^>"']|"[^"]*"|'[^']*')*>/g;

/**
 * `html` cut into its top-level nodes, as strings: each element whole, and
 * the text between them. Only a proposal — a wrong cut is caught when the
 * piece does not parse back to itself — so it need not know HTML's rules.
 */
export const splitTopLevel = (html: string): Array<string> => {
  const out: Array<string> = [];
  const re = new RegExp(TOKEN.source, 'g');
  let depth = 0;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (depth === 0 && m.index > start) {
      out.push(html.slice(start, m.index));
      start = m.index;
    }
    const [, closing, name] = m;
    const tag = name?.toLowerCase();
    if (tag && closing) {
      depth = Math.max(0, depth - 1);
    } else if (tag && RAW_TEXT.has(tag)) {
      const end = new RegExp(`</${tag}[\\t\\n\\f\\r />]`, 'gi');
      end.lastIndex = re.lastIndex;
      const close = end.exec(html);
      const gt = close ? html.indexOf('>', close.index) : -1;
      re.lastIndex = gt < 0 ? html.length : gt + 1;
    } else if (tag && !VOID_ELEMENTS.has(tag)) {
      depth++;
    }
    if (depth === 0) {
      out.push(html.slice(start, re.lastIndex));
      start = re.lastIndex;
    }
  }
  if (start < html.length) {
    out.push(html.slice(start));
  }
  return out;
};

const isTextItem = (item: Item) =>
  item.type === 'inline' && item.node.nodeType === 3;

/** Parses new versions of a text, reusing what earlier versions shared. */
const newSideParser = (
  asDiv: StructuredDiffOptions['asDiv'],
  id: (x: object) => number,
) => {
  /** A top-level node's item by its HTML, or null if it does not round-trip. */
  const items = generations<Item | null>();
  /** A run of loose text's block fields, by the run's items. */
  const runs = generations<BlockFields | null>();
  /** A section by how it starts and its items. */
  const sections = generations<Section | null>();
  /** Blocks by their fields and paragraph number. */
  const blocks = new WeakMap<BlockFields, Map<number, Block>>();

  const hooks: BuildHooks = {
    run: (run: ReadonlyArray<InlineItem>) =>
      runs.get(run.map(id).join(','), () => runFields(run) || null) ||
      undefined,
    block: (fields, mgr) => {
      let byMgr = blocks.get(fields);
      if (!byMgr) {
        blocks.set(fields, (byMgr = new Map()));
      }
      let block = byMgr.get(mgr);
      if (!block) {
        byMgr.set(mgr, (block = { ...fields, mgr }));
      }
      return block;
    },
  };

  /** The items of `html`, or undefined if it cannot be parsed in pieces. */
  const itemsOf = (html: string): Array<Item> | undefined => {
    const out: Array<Item> = [];
    for (const piece of splitTopLevel(html)) {
      const item = items.get(piece, () => {
        const root = asDiv(piece);
        const nodes = root.childNodes;
        return nodes.length === 1 && root.innerHTML === piece
          ? itemOf(nodes[0]!)
          : null;
      });
      // Two text nodes in a row would be one in the whole parse.
      const prev = out[out.length - 1];
      if (!item || (prev && isTextItem(prev) && isTextItem(item))) {
        return;
      }
      out.push(item);
    }
    return out;
  };

  return {
    parse: (html: string): Array<Section> => {
      const all = itemsOf(html);
      if (!all) {
        return parseSections(html, asDiv);
      }
      return segment(all).flatMap((seg) => {
        const key =
          seg.start + ':' + all.slice(seg.from, seg.to).map(id).join(',');
        return (
          sections.get(key, () => buildSection(all, seg, hooks) || null) || []
        );
      });
    },
    next: () => {
      items.next();
      runs.next();
      sections.next();
    },
  };
};

// ---------------------------------------------------------------------------

/** `getStructuredDiff`'s caches, kept between runs. */
const incrementalCaches = (
  opts: StructuredDiffOptions,
  id: (x: object) => number,
) => {
  const { asDiv, blockCutoff, replaceWordDiffFloor } = diffOptions(opts);
  const sims = generations<number>();
  const pairOps = generations<BlockOp>();
  const sectionOps = generations<Array<BlockOp>>();
  const rendered = generations<string>();

  const pairMemo: PairMemo = (type, olds, news, make) =>
    pairOps.get(
      type + ':' + olds.map(id).join(',') + '/' + news.map(id).join(','),
      make,
    );
  const render: RenderMemo = (key, make) => rendered.get(key, make);

  const caches: DiffCaches = {
    sectionSim: (x, y) =>
      sims.get(id(x) + ',' + id(y), () => sectionSimilarity(x, y)),
    blocks: (o, n) =>
      sectionOps
        .get(id(o) + ',' + id(n), () =>
          diffBlocks(
            o.blocks,
            n.blocks,
            blockCutoff,
            replaceWordDiffFloor,
            asDiv,
            pairMemo,
          ),
        )
        // Copies: `detectMoves` rewrites ops in place.
        .map((op) => ({ ...op })),
    render,
  };
  return {
    caches,
    next: () => {
      sims.next();
      pairOps.next();
      sectionOps.next();
      rendered.next();
    },
  };
};

/** A key per section op, unique within the diff, stable while it pairs the same. */
const partKeys = (sections: Array<SectionOp>) => {
  const seen = new Map<string, number>();
  return sections.map((s) => {
    const base = s.new ? s.new.key : 'deleted:' + s.old!.key;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base}#${n}` : base;
  });
};

export const createStructuredDiffer = (
  older: HTMLText,
  opts: StructuredDiffOptions,
): StructuredDiffer => {
  const id = identities();
  const oldSections = parseSections(older, opts.asDiv);
  const newSide = newSideParser(opts.asDiv, id);
  const { caches, next } = incrementalCaches(opts, id);
  return {
    diff: (newer): IncrementalDiff => {
      try {
        const { sections, pieces } = diffSections(
          oldSections,
          newSide.parse(newer),
          opts,
          caches,
        );
        const keys = partKeys(sections);
        const parts = pieces.flatMap(
          (p, i): Array<DiffPart> =>
            p.length
              ? [{ key: keys[i]!, html: p.join('\n') as DiffPart['html'] }]
              : [],
        );
        return { ...joinPieces(sections, pieces), parts };
      } finally {
        newSide.next();
        next();
      }
    },
  };
};
