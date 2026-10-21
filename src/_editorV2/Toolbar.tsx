/*
  EditorV2's toolbar. It subscribes only to the state it shows (active
  marks, block format, alignment, list, whether the selection is in a
  table), so typing does not re-render it on every keystroke.
*/

import React, {
  MutableRefObject,
  ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Editor, useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Code,
  Ellipsis,
  FileText,
  Image,
  Link,
  List,
  ListOrdered,
  Minus,
  Omega,
  Plus,
  Redo2,
  RemoveFormatting,
  Search,
  Subscript,
  Superscript,
  Table,
  Type,
  Undo2,
} from 'lucide-react';

import { Button, Dropdown, ICON_SIZE, MenuItem } from './controls';
import {
  atTopLevel,
  BLOCK_FORMATS,
  BlockFormat,
  currentBlockFormat,
  setBlockFormat,
} from './extensions';
import { insertTable, TableMenuItems, TableSizePicker } from './TableTools';
import { GROUPS, ToolbarItem } from './toolbarItems';

export type DialogName =
  | 'link'
  | 'image'
  | 'charmap'
  | 'code'
  | 'searchreplace';

export type ToolbarActions = {
  openDialog: (name: DialogName) => void;
  importWord: () => void;
};

// B, I, U and S as letters, styled in editorV2.css.
const Glyph = (props: { kind: string; children: string }) => (
  <span
    className={`regtools-toolbar__glyph regtools-toolbar__glyph--${props.kind}`}
    aria-hidden
  >
    {props.children}
  </span>
);

// ---------------------------------------------------------------------------

const LIST_STYLES = [
  { type: null, label: '1, 2, 3' },
  { type: 'a', label: 'a, b, c' },
  { type: 'A', label: 'A, B, C' },
  { type: 'i', label: 'i, ii, iii' },
  { type: 'I', label: 'I, II, III' },
] as const;

const useToolbarState = (editor: Editor) =>
  useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      superscript: e.isActive('superscript'),
      subscript: e.isActive('subscript'),
      link: e.isActive('link'),
      image: e.isActive('image'),
      align: (e.getAttributes(e.state.selection.$from.parent.type.name).align ||
        null) as string | null,
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      listType: (e.getAttributes('orderedList').type || null) as string | null,
      inTable: e.isActive('table'),
      tableClass: (e.getAttributes('table').class || null) as string | null,
      blockFormat: currentBlockFormat(e),
      topLevel: atTopLevel(e),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

/**
 * How many items fit on one row of `container`, whose children are the
 * items (and, when some do not fit, the "more" dropdown last). Item widths
 * are measured while they are shown and remembered, so an item moved into
 * the dropdown still counts at its width when the toolbar grows again.
 */
const useFittingCount = (
  container: MutableRefObject<HTMLElement | null>,
  items: Array<ToolbarItem>,
) => {
  const [count, setCount] = useState(items.length);
  const countRef = useRef(count);
  countRef.current = count;
  const widths = useRef<Array<number>>([]);
  const moreWidth = useRef(52);

  useLayoutEffect(() => {
    const el = container.current;
    if (!el) {
      return;
    }
    // The room an item takes in the row: its margins too (separators have them).
    const outerWidth = (child: HTMLElement) => {
      const { marginLeft, marginRight } = getComputedStyle(child);
      return (
        child.offsetWidth +
        (parseFloat(marginLeft) || 0) +
        (parseFloat(marginRight) || 0)
      );
    };
    const measure = () => {
      const shown = countRef.current;
      const children = Array.from(el.children) as Array<HTMLElement>;
      children.slice(0, shown).forEach((child, i) => {
        widths.current[i] = outerWidth(child);
      });
      if (shown < items.length && children[shown]) {
        moreWidth.current = outerWidth(children[shown]!);
      }
      const style = getComputedStyle(el);
      const gap = parseFloat(style.columnGap) || 0;
      const room =
        el.clientWidth -
        (parseFloat(style.paddingLeft) || 0) -
        (parseFloat(style.paddingRight) || 0);
      const widthOf = (n: number) =>
        widths.current.slice(0, n).reduce((sum, w) => sum + w + gap, -gap);
      let fits = items.length;
      if (widthOf(fits) > room) {
        while (fits > 0 && widthOf(fits) + gap + moreWidth.current > room) {
          fits--;
        }
        // No separator at the end of the row.
        while (fits > 0 && items[fits - 1] === '|') {
          fits--;
        }
      }
      fits !== shown && setCount(fits);
    };
    measure();
    // The items too: they change width without the toolbar doing so, as
    // when a web font finishes loading.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
    // Not on every render: reading widths forces a layout, and the toolbar
    // re-renders as the cursor moves. The observer sees any size change.
  }, [container, items, count]);
  return Math.min(count, items.length);
};

export const Toolbar = (props: {
  editor: Editor;
  items: Array<ToolbarItem>;
  actions: ToolbarActions;
  /** The toolbar element, which holds the items. */
  container: MutableRefObject<HTMLElement | null>;
  /**
   * readOnly/disabled, from the props, which also set the editor's own
   * `isEditable`. That one is not read here: the toolbar's state only
   * updates on a transaction, and changing it makes none.
   */
  disabled?: boolean;
}) => {
  const { editor, actions } = props;
  const s = useToolbarState(editor);
  const fitting = useFittingCount(props.container, props.items);
  const chain = () => editor.chain().focus();
  const disabled = !!props.disabled;

  const setAlign = (align: string | null) => {
    const type = editor.state.selection.$from.parent.type.name;
    chain().updateAttributes(type, { align }).run();
  };

  const render = (item: ToolbarItem, key: number): ReactNode => {
    switch (item) {
      case '|':
        return <span key={key} className="regtools-toolbar__separator" />;
      case 'undo':
        return (
          <Button
            key={key}
            label="Afturkalla"
            icon={<Undo2 size={ICON_SIZE} />}
            disabled={disabled || !s.canUndo}
            onClick={() => chain().undo().run()}
          />
        );
      case 'redo':
        return (
          <Button
            key={key}
            label="Endurgera"
            icon={<Redo2 size={ICON_SIZE} />}
            disabled={disabled || !s.canRedo}
            onClick={() => chain().redo().run()}
          />
        );
      case 'bold':
        return (
          <Button
            key={key}
            label="Feitletrað"
            icon={<Glyph kind="bold">B</Glyph>}
            active={s.bold}
            disabled={disabled}
            onClick={() => chain().toggleBold().run()}
          />
        );
      case 'italic':
        return (
          <Button
            key={key}
            label="Skáletrað"
            icon={<Glyph kind="italic">I</Glyph>}
            active={s.italic}
            disabled={disabled}
            onClick={() => chain().toggleItalic().run()}
          />
        );
      case 'underline':
        return (
          <Button
            key={key}
            label="Undirstrikað"
            icon={<Glyph kind="underline">U</Glyph>}
            active={s.underline}
            disabled={disabled}
            onClick={() => chain().toggleUnderline().run()}
          />
        );
      case 'strikethrough':
        return (
          <Button
            key={key}
            label="Yfirstrikað"
            icon={<Glyph kind="strike">S</Glyph>}
            active={s.strike}
            disabled={disabled}
            onClick={() => chain().toggleStrike().run()}
          />
        );
      case 'superscript':
        return (
          <Button
            key={key}
            label="Hástafur"
            icon={<Superscript size={ICON_SIZE} />}
            active={s.superscript}
            disabled={disabled}
            onClick={() => chain().toggleSuperscript().run()}
          />
        );
      case 'subscript':
        return (
          <Button
            key={key}
            label="Lágstafur"
            icon={<Subscript size={ICON_SIZE} />}
            active={s.subscript}
            disabled={disabled}
            onClick={() => chain().toggleSubscript().run()}
          />
        );
      case 'removeformat':
        return (
          <Button
            key={key}
            label="Hreinsa sniðmát"
            icon={<RemoveFormatting size={ICON_SIZE} />}
            disabled={disabled}
            onClick={() => chain().unsetAllMarks().run()}
          />
        );
      case 'link':
        return (
          <Button
            key={key}
            label="Setja inn/breyta hlekk"
            icon={<Link size={ICON_SIZE} />}
            active={s.link}
            disabled={disabled}
            onClick={() => actions.openDialog('link')}
          />
        );
      case 'alignleft':
        return (
          <Button
            key={key}
            label="Vinstri jöfnun"
            icon={<AlignLeft size={ICON_SIZE} />}
            active={!s.align}
            disabled={disabled}
            onClick={() => setAlign(null)}
          />
        );
      case 'aligncenter':
        return (
          <Button
            key={key}
            label="Miðjað"
            icon={<AlignCenter size={ICON_SIZE} />}
            active={s.align === 'center'}
            disabled={disabled}
            onClick={() => setAlign('center')}
          />
        );
      case 'alignright':
        return (
          <Button
            key={key}
            label="Hægri jöfnun"
            icon={<AlignRight size={ICON_SIZE} />}
            active={s.align === 'right'}
            disabled={disabled}
            onClick={() => setAlign('right')}
          />
        );
      case 'align':
        return (
          <Dropdown
            key={key}
            label="Jöfnun"
            disabled={disabled}
            icon={
              s.align === 'center' ? (
                <AlignCenter size={ICON_SIZE} />
              ) : s.align === 'right' ? (
                <AlignRight size={ICON_SIZE} />
              ) : (
                <AlignLeft size={ICON_SIZE} />
              )
            }
          >
            <MenuItem
              label="Vinstri"
              active={!s.align}
              onClick={() => setAlign(null)}
            />
            <MenuItem
              label="Miðjað"
              active={s.align === 'center'}
              onClick={() => setAlign('center')}
            />
            <MenuItem
              label="Hægri"
              active={s.align === 'right'}
              onClick={() => setAlign('right')}
            />
          </Dropdown>
        );
      case 'bullist':
        return (
          <Button
            key={key}
            label="Punktalisti"
            icon={<List size={ICON_SIZE} />}
            active={s.bulletList}
            disabled={disabled}
            onClick={() => chain().toggleBulletList().run()}
          />
        );
      case 'numlist':
        return (
          <span key={key} className="regtools-toolbar__group">
            <Button
              label="Númeraður listi"
              icon={<ListOrdered size={ICON_SIZE} />}
              active={s.orderedList}
              disabled={disabled}
              onClick={() => chain().toggleOrderedList().run()}
            />
            {/* Always there, so the toolbar keeps its width; a style
                chosen outside a numbered list starts one. */}
            <Dropdown label="Tegund númera" disabled={disabled}>
              {LIST_STYLES.map((l) => (
                <MenuItem
                  key={l.label}
                  label={l.label}
                  active={s.orderedList && s.listType === l.type}
                  onClick={() =>
                    (s.orderedList ? chain() : chain().toggleOrderedList())
                      .updateAttributes('orderedList', { type: l.type })
                      .run()
                  }
                />
              ))}
            </Dropdown>
          </span>
        );
      case 'styleselect': {
        const formatLabel = s.blockFormat
          ? BLOCK_FORMATS[s.blockFormat].label
          : 'Snið';
        return (
          <span key={key} className="regtools-toolbar__group">
            {/* A dropdown, not a <select>: a closed <select> changes
                value on every arrow key on Windows, which would apply each
                format passed over ("m. heiti" inserts text). */}
            <Dropdown
              label="Snið"
              disabled={disabled}
              icon={
                <span
                  className="regtools-toolbar__text regtools-toolbar__text--format"
                  title={formatLabel}
                >
                  {formatLabel}
                </span>
              }
            >
              {(Object.keys(BLOCK_FORMATS) as Array<BlockFormat>).map((f) => {
                const format = BLOCK_FORMATS[f];
                const structural = 'structural' in format;
                return (
                  <MenuItem
                    key={f}
                    label={format.label}
                    active={s.blockFormat === f}
                    disabled={structural && !s.topLevel}
                    onClick={() => setBlockFormat(editor, f)}
                  />
                );
              })}
            </Dropdown>
          </span>
        );
      }
      case 'table':
        return (
          <Dropdown
            key={key}
            label="Tafla"
            disabled={disabled}
            icon={<Table size={ICON_SIZE} />}
            active={s.inTable}
          >
            {!s.inTable ? (
              <TableSizePicker
                onPick={(rows, cols) => insertTable(editor, rows, cols)}
              />
            ) : (
              <TableMenuItems editor={editor} tableClass={s.tableClass} />
            )}
          </Dropdown>
        );
      case 'image':
        return (
          <Button
            key={key}
            label="Setja inn/breyta mynd"
            icon={<Image size={ICON_SIZE} />}
            active={s.image}
            disabled={disabled}
            onClick={() => actions.openDialog('image')}
          />
        );
      case 'hr':
        return (
          <Button
            key={key}
            label="Lárétt lína"
            icon={<Minus size={ICON_SIZE} />}
            disabled={disabled}
            onClick={() => chain().setHorizontalRule().run()}
          />
        );
      case 'charmap':
        return (
          <Button
            key={key}
            label="Sértákn"
            icon={<Omega size={ICON_SIZE} />}
            disabled={disabled}
            onClick={() => actions.openDialog('charmap')}
          />
        );
      case 'code':
        return (
          <Button
            key={key}
            label="HTML kóði"
            icon={<Code size={ICON_SIZE} />}
            disabled={disabled}
            onClick={() => actions.openDialog('code')}
          />
        );
      case 'searchreplace':
        return (
          <Button
            key={key}
            label="Leita og skipta út"
            icon={<Search size={ICON_SIZE} />}
            onClick={() => actions.openDialog('searchreplace')}
          />
        );
      case 'customInsertButton':
        return (
          <Button
            key={key}
            label="Færa inn Word skjal"
            icon={<FileText size={ICON_SIZE} />}
            disabled={disabled}
            onClick={actions.importWord}
          />
        );
      case 'inlineformat':
      case 'alignment':
      case 'insert': {
        const icons = {
          inlineformat: <Type size={ICON_SIZE} />,
          alignment: <AlignLeft size={ICON_SIZE} />,
          insert: <Plus size={ICON_SIZE} />,
        };
        const labels = {
          inlineformat: 'Fleiri snið',
          alignment: 'Jöfnun',
          insert: 'Annað',
        };
        return (
          <Dropdown
            key={key}
            label={labels[item]}
            icon={icons[item]}
            disabled={disabled}
          >
            <span className="regtools-toolbar__menurow">
              {GROUPS[item]!.map((sub, i) => render(sub, i))}
            </span>
          </Dropdown>
        );
      }
    }
  };

  // One row at any width: what does not fit goes into a "more" dropdown,
  // as with TinyMCE's toolbar in `Editor`.
  const rest = props.items.slice(fitting);
  while (rest[0] === '|') {
    rest.shift();
  }
  return (
    <>
      {props.items.slice(0, fitting).map(render)}
      {rest.length > 0 && (
        <Dropdown
          label="Fleiri aðgerðir"
          icon={<Ellipsis size={ICON_SIZE} />}
          disabled={disabled}
          alignEnd
        >
          <span className="regtools-toolbar__menurow">
            {rest.map((item, i) => render(item, i))}
          </span>
        </Dropdown>
      )}
    </>
  );
};
