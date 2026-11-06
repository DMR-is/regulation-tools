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
 * force ("öðlast reglugerð þessi gildi"), how long and to what it applies,
 * the EU acts it implements, its notification under the TRIS directive.
 * They state dates and numbers no base regulation holds.
 */
const OWN_PROVISION_RE =
  /(?<!\p{L})(?:(?:öðlast|tekur)(?:\s+\p{L}+){0,3}?\s+gildi|gild(?:ir|a) (?:frá|til)|fell(?:ur|a) úr gildi|skal beita|sett(?: er)? (?:með|samkvæmt|á grundvelli)|sett með stoð|er sett á grundvelli|með stoð í|til innleiðingar|innleidd\p{L}*|endurskoð\p{L}*|koma til framkvæmda|kemur til framkvæmda|tilkynnt (?:til|í samræmi|samkvæmt))(?!\p{L})/iu;

/**
 * What an instruction says: "orðast svo", "kemur:", "komi:", "bætist",
 * "falla brott", "Eftirfarandi breytingar verða". Older texts use the
 * subjunctive ("komi", "falli", "verði"), so both moods are here. Adding
 * and changing only as instructions say it ("bætist", "breytist"): "bæti"
 * and "breytast" are as common in prose ("nema umsækjandi bæti úr",
 * "Fjárhæðir breytast 1. janúar ár hvert").
 */
const INSTRUCTION_RE =
  /(?<!\p{L})(?:orðast|orðist|kom(?:ur|a|i)\s*:|kem(?:ur|a)\s*:|kom(?:i|a) (?:ný|eftirfarandi)|kem(?:ur|a) (?:ný|eftirfarandi)|bæt(?:ist|ast)|f(?:ellur|alla|elli|alli) (?:á )?(?:brott|niður)|svohljóðandi|verð(?:ur|i)\s*:|hljóð(?:ar|i) svo|breytist|breyting(?:ar)? verð(?:ur|a|i)|gerð(?:ar)? (?:sú|eftirfarandi) breyting)(?!\p{L})/u;

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

/** An appendix's title, which can be a paragraph: `<p><strong>Viðauki I</strong></p>`. */
const APPENDIX_TITLE = /^(?:viðauki|fylgiskjal)(?!\p{L})/iu;

export type Amending = {
  /** The amounts and dates its instructions mention, as `valueKey`s. */
  values: Set<string>;
  /** How many times its instructions give each date. */
  dates: Map<string, number>;
  /** Every run of digits in its instructions and new wording. */
  digits: Set<string>;
  /** The words of its instructions and new wording, `padded`, for whole-word search. */
  words: string;
  /** Prefixes of its words, for matching inflected forms. */
  prefixes: Set<string>;
  triples: Set<string>;
  /**
   * The amounts and dates it states as changes: not those of its own
   * provisions, nor the date of an act it cites.
   */
  stated: Array<{
    token: NumberToken;
    context: string;
    section?: string;
    /**
     * A bare number of up to four digits, not an amount of money: it can be
     * a day or a year, and match part of a changed date ("Í stað „2024“
     * kemur: 2025").
     */
    datePart: boolean;
  }>;
};

/** Money next to a number: "kr. 2.025", "2025 krónur". */
const CURRENCY_BEFORE = /(?:kr\.?|ISK|EUR|€)\s*$/iu;
const CURRENCY_AFTER = /^\s*(?:kr(?!\p{L})|kr\.|krón|ISK|EUR|evr|€|%)/iu;

type Article = {
  section?: string;
  blocks: Array<string>;
  /** After the signature: an appendix, which has articles of its own. */
  appendix?: true;
};

/**
 * The text by article, without the signature. A heading other than an
 * article's that follows a lead ("… bætist nýtt ákvæði til bráðabirgða,
 * svohljóðandi:") is new wording, so it stays in its article. The signature
 * ends the text up to the next heading or appendix title: an appendix.
 */
const articlesOf = (root: Element): Array<Article> => {
  const articles: Array<Article> = [];
  let inSignature = false;
  let signed = false;
  for (const el of Array.from(root.children)) {
    const text = sidesOf(el).new;
    const flat = tidy(text);
    if (!flat) {
      continue;
    }
    if (isHeading(el) || (inSignature && APPENDIX_TITLE.test(flat))) {
      inSignature = false;
      const current = articles[articles.length - 1];
      const last = current?.blocks[current.blocks.length - 1];
      if (!ARTICLE_RE.test(flat) && last && OPENS_WORDING.test(tidy(last))) {
        current!.blocks.push(text);
        continue;
      }
      articles.push({
        section: flat,
        blocks: [],
        appendix: signed || undefined,
      });
      continue;
    }
    if (inSignature || isSignatureStart(el, flat)) {
      inSignature = signed = true;
      continue;
    }
    if (!articles.length) {
      articles.push({ blocks: [] });
    }
    articles[articles.length - 1]!.blocks.push(text);
  }
  return articles;
};

/**
 * One of the regulation's own articles: its gildistaka, its own
 * transitional provision, the EU acts it implements. Those cite the same
 * acts and dates as the instructions, so a slip in an instruction would
 * hide behind them. Only an article that says so counts as one: an
 * instruction in words this doesn't know stays an instruction, and an
 * appendix's articles are its wording.
 */
const isOwnArticle = ({ section, blocks, appendix }: Article) =>
  section != null &&
  !appendix &&
  (/gildistaka/i.test(section) ||
    (!blocks.some((b) => INSTRUCTION_RE.test(tidy(b))) &&
      (/bráðabirgð/i.test(section) ||
        blocks.some((b) => OWN_PROVISION_RE.test(tidy(b))))));

export const readAmending = (html: HTMLText, asDiv: AsDiv): Amending => {
  const root = asDiv(html);
  const said: Array<string> = [];

  const stated: Amending['stated'] = [];
  const mentioned: Array<NumberToken> = [];
  for (const article of articlesOf(root)) {
    if (isOwnArticle(article)) {
      continue;
    }
    const { section, blocks } = article;
    said.push(...blocks);
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
          const before = text.slice(Math.max(0, token.index - 6), token.index);
          const after = text.slice(token.index + token.raw.length);
          stated.push({
            token,
            context: contextOf(text, token),
            section,
            datePart:
              token.kind === 'value' &&
              /^\d{1,4}$/.test(token.raw) &&
              !CURRENCY_BEFORE.test(before) &&
              !CURRENCY_AFTER.test(after),
          });
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
  const all = said.join('\n');
  const words = wordsOf(all);
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
