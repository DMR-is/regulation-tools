declare const _RegName__Brand: unique symbol;
/** Regulation name — `0123/2012` */
export type RegName = string & { [_RegName__Brand]: true };

declare const _RegNameQuery__Brand: unique symbol;
/** Regulation name formatted for URL param insertion — `0123-2012` */
export type RegQueryName = string & { [_RegNameQuery__Brand]: true };

declare const _ISODate__Brand: unique symbol;
/** Valid ISODate string — e.g. `2012-09-30` */
export type ISODate = string & { [_ISODate__Brand]: true };

declare const _ISODateTime__Brand: unique symbol;
/** Valid UTC ISODateTime string — e.g. `2012-09-30T12:00:00` */
export type ISODateTime = string & { [_ISODateTime__Brand]: true };

declare const _HTMLText__Brand: unique symbol;
/** HTMLText string — e.g. `I &lt;3 You ` */
export type HTMLText = '' | (string & { [_HTMLText__Brand]: true });

/** Plain-text string — e.g. `I <3 You ` */
export type PlainText = string & { [_HTMLText__Brand]?: false };

declare const _MinistrySlug__Brand: unique symbol;
/** Slug identifier for Ministries — e.g. `hr`
 *
 * (Human-readable, persistent id for for query strings, etc.)
 */
export type MinistrySlug = string & { [_MinistrySlug__Brand]: true };

declare const _LawChapterSlug__Brand: unique symbol;
/** Slug identifier for Law Chapters — e.g. `01b`
 *
 * (Human-readable, persistent id for for query strings, etc.)
 */
export type LawChapterSlug = string & { [_LawChapterSlug__Brand]: true };

declare const _Year__Brand: unique symbol;
/** Four letter positive integer that might reasonably be a year */
export type Year = number & { [_Year__Brand]: true };

declare const IntPositive__Brand: unique symbol;
/** Positive integer (>1) */
export type IntPositive = number & { [IntPositive__Brand]: true };

declare const _URLString__Brand: unique symbol;
/** Fully qualified URL, protocol and all — e.g. `http://www.example.com` */
export type URLString = string & { [_URLString__Brand]: true };

// ---------------------------------------------------------------------------

/** Regulations are roughly classified based on whether they contain
 * any original text/stipulations, or whether they **only**  prescribe
 * changes to other regulations.
 *
 * `base` = Stofnreglugerð
 * `amending` = Breytingareglugerð
 */
export type RegulationType = 'base' | 'amending';

// ===========================================================================

export type LawChapter = {
  /** Name (title) of the law chapter */
  name: string;
  /** Short, URL-friendly token to use for search filters, etc.  */
  slug: LawChapterSlug; // '01a' |'01b' |'01c' | etc.
};

export type LawChapterTree = Array<
  LawChapter & {
    /** List of child-chapters for this top-level chapter.
     *
     * NOTE: The "tree" never goes more than one level down.
     */
    subChapters: Array<LawChapter>;
  }
>;

// ---------------------------------------------------------------------------

// Ministries
export type Ministry = {
  /** Name (title) of the ministry */
  name: string;
  /** Short, URL-friendly token to use for search filters, etc.  */
  slug: MinistrySlug;
};

export type MinistryListItem = Ministry & {
  /** Optional sorting weight hint.
   *
   * Lower numbers first, undefined/null last.
   */
  order?: number | null;
};

export type MinistryList = Array<MinistryListItem>;

// ---------------------------------------------------------------------------

export type RegulationHistoryItem = {
  /** The date this this history item took effect */
  date: ISODate;
  /** Publication name of the affecting Regulation */
  name: RegName;
  /** The title of the affecting Regulation */
  title: string;
  /** Type of effect */
  effect: 'amend' | 'repeal';
};

// ---------------------------------------------------------------------------

export type RegulationEffect = {
  /** effective-/publishDate for this impact */
  date: ISODate;
  /** Publication name of the affected Regulation */
  name: RegName;
  /** Publication name of the affected Regulation */
  title: string;
  /** Type of effect */
  effect: 'amend' | 'repeal';
};

// ---------------------------------------------------------------------------

/** Regulation appendix/attachment chapter */
export type Appendix = {
  /** Title of the appendix */
  title: PlainText;
  /** The appendix text in HTML format */
  text: HTMLText;
};

/** Single Regulation with up-to-date text */
export type Regulation = {
  /** Publication name (NNNN/YYYY) of the regulation */
  name: RegName;
  /** The title of the regulation */
  title: PlainText;
  /* The regulation text in HTML format */
  text: HTMLText;
  /** List of the regulation's appendixes */
  appendixes: Array<Appendix>;
  /** Optional HTML formatted comments from the editor pointing out
   * known errors or ambiguities in the text.
   */
  comments: HTMLText;

  /** Date signed in the ministry */
  signatureDate: ISODate;
  /** Date officially published in Stjórnartíðindi */
  publishedDate: ISODate;
  /** NOTE: This date is for informational purposes only */
  effectiveDate: ISODate;
  /** Date of the last effective amendment of this regulation
   *
   * This date is always a past (or current) date
   */
  lastAmendDate?: ISODate | null;

  /** True if the regulation is either repealed (and has `repealedDate`, see below)
   * or has just been arbitrarily classified as "Ógild" (no `repealedDate`).
   *
   * NOTE: This value is NOT affected by `timlineDate`, or `showingDiff`
   */
  repealed: boolean;
  /** Date when (if) this regulation was repealed and became a thing of the past.
   *
   * NOTE: This date is **NEVER** set in the future
   *
   * NOTE2: This value is NOT affected by `timlineDate`, or `showingDiff`
   */
  repealedDate?: ISODate | null;

  /** The ministry this regulation is published by/linked to */
  ministry?: Ministry;
  /** Law chapters that this regulation is linked to */
  lawChapters: Array<LawChapter>;

  /** URL linking to the originally published document as published in Stjórnartíðindi */
  originalDoc?: string | null;

  /** URL to a PDF file containing the current version of the Regulation */
  pdfVersion: string;

  /** Regulations are roughly classified based on whether they contain
   * any original text/stipulations, or whether they **only**  prescribe
   * changes to other regulations.
   *
   * `base` = Stofnreglugerð
   * `amending` = Breytingareglugerð
   */
  type: RegulationType;

  /** List of change events (Amendments, Repeals) over the life time of this
   * regulation – **excluding** the original base/root regulation
   */
  history: Array<RegulationHistoryItem>;

  /** Date sorted list of effects this regulations has on other regulations
   * text-changes or cacellations
   */
  effects: Array<RegulationEffect>;

  /** Present if a specifically dated version of the regulation is being served
   *
   * Is undefined by default (when the "current" version is served).
   */
  timelineDate?: ISODate;

  /** Present if the regulation contains inlined change-markers (via htmldiff-js) */
  showingDiff?: undefined;
};

// ---------------------------------------------------------------------------

export type RegulationDiff = Omit<
  Regulation,
  'title' | 'appendixes' | 'showingDiff'
> & {
  /** The title of the regulation in HTML format */
  title: HTMLText;
  /** List of the regulation's appendixes */
  appendixes: Array<
    Omit<Appendix, 'title'> & {
      title: HTMLText;
    }
  >;
  /** Present if the regulation contains inlined change-markers (via htmldiff-js) */
  showingDiff: {
    /** The date of the base version being compared against */
    from: ISODate;
    /** The date of the version being viewed
     *
     * Generally the same as `timelineDate` defaulting to `lastAmendDate` */
    to: ISODate;
  };
};

// ---------------------------------------------------------------------------

export type RegulationMaybeDiff = Regulation | RegulationDiff;

// ---------------------------------------------------------------------------

export type RegulationRedirect = {
  /** Publication name (NNNN/YYYY) of the regulation */
  name: RegName;
  /** The title of the regulation in HTML format */
  title: string;
  /** The regulation data has not been fully migrated and should be viewed at this URL */
  redirectUrl: string;
  /** URL linking to the originally published document as published in Stjórnartíðindi */
  originalDoc?: string | null;
};

// ---------------------------------------------------------------------------

export type RegulationTextProps = Pick<
  Regulation,
  'text' | 'appendixes' | 'comments'
>;

// ---------------------------------------------------------------------------

/** List of regulations that the draft impacts (cancels or updates) */
export type RegulationOption = Pick<Regulation, 'name' | 'title'> & {
  /** True if the regulation has been fully migrated
   *
   * Used to prevent any text-changes to be made (cancelling is OK)
   */
  migrated: boolean;
  /** True if the regulation has already been cancelled/repealed (Brottfelld)
   *
   * Used to display warning
   */
  cancelled?: true;
};

export type RegulationOptionsList = Array<RegulationOption>;
