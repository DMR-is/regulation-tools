/*
  Reading an amending regulation's text for findAmendingMismatches: what it
  mentions, and which amounts and dates it states as changes.
*/

import { ARTICLE_RE, isSignatureStart } from '../_structuredDiff/parse';
import { AsDiv } from '../_structuredDiff/types';
import { HTMLText } from '../types';
import {
  contextOf,
  isValue,
  NumberToken,
  numbersIn,
  padded,
  prefixesOf,
  sidesOf,
  tidy,
  triples,
  valueKey,
  wordsOf,
} from './text';

/**
 * The amending regulation's own provisions: its legal basis, entry into
 * force, the EU acts it implements, its notification under the TRIS
 * directive. They state dates and numbers no base regulation holds.
 */
const OWN_PROVISION_RE =
  /(?<!\p{L})(?:öðlast (?:þegar )?gildi|tekur (?:þegar )?gildi|sett(?: er)? (?:með|samkvæmt|á grundvelli)|sett með stoð|er sett á grundvelli|með stoð í|til innleiðingar|koma til framkvæmda|kemur til framkvæmda|tilkynnt (?:til|í samræmi|samkvæmt))(?!\p{L})/u;

/** What an instruction says: "orðast svo", "kemur:", "bætist", "falla brott". */
const INSTRUCTION_RE =
  /(?<!\p{L})(?:orðast|orðist|kem(?:ur|a)\s*:|kem(?:ur|a) (?:ný|eftirfarandi)|bæt(?:ist|ast)|f(?:ellur|alla) (?:á )?(?:brott|niður)|svohljóðandi|verður:|breytist)(?!\p{L})/u;

/**
 * One of the regulation's own paragraphs. New wording can say "öðlast
 * gildi" too, so only one that starts as a gildistaka does ("Reglugerð
 * þessi …"), or says nothing an instruction does.
 */
const isOwnParagraph = (text: string) =>
  OWN_PROVISION_RE.test(text) &&
  (/^(?:Reglugerð(?:in)? þessi|Reglugerðin)(?!\p{L})/u.test(text) ||
    !INSTRUCTION_RE.test(text));

/** A lead whose new wording follows in the next blocks: "… orðast svo:". */
const OPENS_WORDING = /(?::|svohljóðandi\.?|orðast svo\.?)$/u;

export const isHeading = (el: Element) => /^H[1-6]$/.test(el.tagName);

export type Amending = {
  /** The amounts and dates its instructions mention, as `valueKey`s. */
  values: Set<string>;
  /** How many times its instructions give each date. */
  dates: Map<string, number>;
  /** Every run of digits in the text. */
  digits: Set<string>;
  /** Its words, `padded`, for whole-word search. */
  words: string;
  /** Prefixes of its words, for matching inflected forms. */
  prefixes: Set<string>;
  triples: Set<string>;
  /**
   * The amounts and dates it states as changes: not those of its own
   * provisions, nor the date of an act it cites.
   */
  stated: Array<{ token: NumberToken; context: string; section?: string }>;
};

type Article = { section?: string; blocks: Array<string> };

/**
 * The text by article, without the signature. A heading other than an
 * article's that follows a lead ("… bætist nýtt ákvæði til bráðabirgða,
 * svohljóðandi:") is new wording, so it stays in its article. The signature
 * ends the text up to the next heading: an appendix.
 */
const articlesOf = (root: Element): Array<Article> => {
  const articles: Array<Article> = [];
  let inSignature = false;
  for (const el of Array.from(root.children)) {
    const text = sidesOf(el).new;
    const flat = tidy(text);
    if (!flat) {
      continue;
    }
    if (isHeading(el)) {
      inSignature = false;
      const current = articles[articles.length - 1];
      const last = current?.blocks[current.blocks.length - 1];
      if (!ARTICLE_RE.test(flat) && last && OPENS_WORDING.test(tidy(last))) {
        current!.blocks.push(text);
        continue;
      }
      articles.push({ section: flat, blocks: [] });
      continue;
    }
    if (inSignature || isSignatureStart(el, flat)) {
      inSignature = true;
      continue;
    }
    if (!articles.length) {
      articles.push({ blocks: [] });
    }
    articles[articles.length - 1]!.blocks.push(text);
  }
  return articles;
};

export const readAmending = (html: HTMLText, asDiv: AsDiv): Amending => {
  const root = asDiv(html);
  const all = sidesOf(root).new;
  const words = wordsOf(all);

  const stated: Amending['stated'] = [];
  const mentioned: Array<NumberToken> = [];
  for (const { section, blocks } of articlesOf(root)) {
    // An article with no instruction is the regulation's own: its
    // gildistaka, its own transitional provision, the EU acts it
    // implements. Those cite the same acts as the instructions, so a slip
    // in an instruction would hide behind them: they don't count.
    const own =
      section != null &&
      (/gildistaka/i.test(section) ||
        !blocks.some((b) => INSTRUCTION_RE.test(tidy(b))));
    if (own) {
      continue;
    }
    for (const text of blocks) {
      const tokens = numbersIn(text).filter(isValue);
      mentioned.push(...tokens);
      if (isOwnParagraph(tidy(text))) {
        continue;
      }
      for (const token of tokens) {
        // The date of an act cited ("(EB) nr. 106/2008 frá 15. janúar
        // 2008") need not be in the base.
        if (!token.ofReference) {
          stated.push({ token, context: contextOf(text, token), section });
        }
      }
    }
  }

  const dates = new Map<string, number>();
  for (const t of mentioned) {
    if (t.kind === 'date') {
      dates.set(valueKey(t), (dates.get(valueKey(t)) || 0) + 1);
    }
  }
  return {
    values: new Set(mentioned.map(valueKey)),
    dates,
    digits: new Set(numbersIn(all).flatMap((t) => t.digits)),
    words: padded(words),
    prefixes: prefixesOf(words),
    triples: triples(words),
    stated,
  };
};
