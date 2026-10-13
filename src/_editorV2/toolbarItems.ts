/*
  EditorV2's toolbar items. The names are TinyMCE's, so the toolbar strings
  consumers pass today work unchanged, e.g.
  `'bold italic underline | align numlist bullist | link'`.
*/

export const TOOLBAR_ITEMS = [
  'undo',
  'redo',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'superscript',
  'subscript',
  'removeformat',
  'link',
  'styleselect',
  /** A dropdown: left, center, right. */
  'align',
  'alignleft',
  'aligncenter',
  'alignright',
  'bullist',
  /** Numbered list, with its numbering style (1, a, A, i, I) beside it. */
  'numlist',
  /** A dropdown: insert a table, rows, columns, cells, table style. */
  'table',
  'image',
  'hr',
  'charmap',
  /** Edit the HTML source. */
  'code',
  'searchreplace',
  /** Import a Word document (TinyMCE's name for it). */
  'customInsertButton',
  // The groups of the default toolbar, as TinyMCE's `toolbar_groups`.
  /** underline, strikethrough, superscript, subscript, removeformat */
  'inlineformat',
  /** alignleft, aligncenter, alignright */
  'alignment',
  /** code, charmap, hr */
  'insert',
] as const;

export type ToolbarItem = (typeof TOOLBAR_ITEMS)[number] | '|';

/** `Editor`'s default toolbar, item for item. */
export const DEFAULT_TOOLBAR: Array<ToolbarItem> = [
  'undo',
  'redo',
  '|',
  'bold',
  'italic',
  'link',
  'inlineformat',
  '|',
  'styleselect',
  'alignment',
  '|',
  'bullist',
  'numlist',
  '|',
  'table',
  'image',
  '|',
  'insert',
  '|',
  'customInsertButton',
];

export const GROUPS: Partial<Record<ToolbarItem, Array<ToolbarItem>>> = {
  inlineformat: [
    'underline',
    'strikethrough',
    'superscript',
    'subscript',
    'removeformat',
  ],
  alignment: ['alignleft', 'aligncenter', 'alignright'],
  insert: ['code', 'charmap', 'hr'],
};

const known = new Set<string>(TOOLBAR_ITEMS);

/**
 * The toolbar prop, as a list. A string is split on spaces; unknown names
 * are left out (as TinyMCE did) with a warning in development.
 */
export const parseToolbar = (
  toolbar: Array<ToolbarItem> | string | false | undefined,
): Array<ToolbarItem> => {
  if (toolbar === false) {
    return [];
  }
  if (toolbar == null) {
    return DEFAULT_TOOLBAR;
  }
  const items = typeof toolbar === 'string' ? toolbar.split(/\s+/) : toolbar;
  return items.filter((item): item is ToolbarItem => {
    if (!item) {
      return false;
    }
    if (item === '|' || known.has(item)) {
      return true;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`EditorV2: unknown toolbar item "${item}", left out`);
    }
    return false;
  });
};
