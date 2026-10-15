/*
  The editing half of EditorV2: Tiptap, its toolbar and dialogs, paste and
  Word import. Loaded on demand by EditorV2, as EditorFrame is by Editor.

  Speed on long texts (docs/plan-tiptap-editor.md, "Long texts: speed"):
  - React does not re-render on every keystroke
    (`shouldRerenderOnTransaction: false`); the toolbar subscribes to the
    few things it shows.
  - Nothing is serialized per keystroke. `onChange` only says something
    changed; `getHTML` writes the text out when asked, one top-level node
    at a time, remembering nodes that did not change.
  - Input and paste rules are off: Tiptap's list rules would turn every
    "1. gr." typed at the start of a line into a list.
*/

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createDocument, Editor as TiptapEditor } from '@tiptap/core';
import { Transaction } from '@tiptap/pm/state';
import { Mapping } from '@tiptap/pm/transform';
import { EditorContent, useEditor } from '@tiptap/react';

import {
  cleanPastedHtml,
  fixAlphabeticalLists,
  hasInlineImages,
  PasteImageUploader,
  plainTextToHtml,
  prepareWordDocument,
  prepareWordHtml,
  sanitizeClipboardHtml,
  uploadInlineImages,
} from '../_editorPaste';
import { HTMLText } from '../types';
import { convertFileToBlobInfo } from '../utils';

import { Dialogs, UploadFile } from './Dialogs';
import { editorExtensions, highlightElement } from './extensions';
import { findUnsupportedElements } from './fidelity';
import {
  createRegulationSerializer,
  editorInput,
  toRegulationHTML,
} from './serialize';
import { DialogName, Toolbar } from './Toolbar';
import { ToolbarItem } from './toolbarItems';

export type EditorV2FrameProps = {
  initialText: HTMLText;
  toolbar: Array<ToolbarItem>;
  classes: { toolbar: string; editor: string };
  fileUploader: PasteImageUploader;
  disabled?: boolean;
  documentLoaderElement?: React.ReactNode;
  'aria-labelledby'?: string;
  'aria-describedBy'?: string;
  /** Once, when the editor is up. */
  onReady: (api: EditorV2FrameApi) => void;
  /** On every change, synchronously. Cheap: nothing is serialized. */
  onChange: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

export type EditorV2FrameApi = {
  getHTML: () => HTMLText;
  /** The editor's content element, for the warnings to search. */
  element: HTMLElement;
  highlight: (elm: Element) => void;
  /** `html` as the editor would write it, without loading it. */
  normalize: (html: HTMLText) => HTMLText;
};

const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim();

const EditorV2FrameInner = (props: EditorV2FrameProps) => {
  const [dialog, setDialog] = useState<DialogName>();
  const [loadingWord, setLoadingWord] = useState(false);
  /** A failure the person editing should see (Word import, image upload). */
  const [error, setError] = useState<string>();
  /**
   * What in the loaded text the editor cannot hold as it is (and so would
   * drop or move if it is saved), shown on load: the fidelity guard of
   * docs/plan-tiptap-editor.md, as far as it can run in the browser.
   */
  const [unsupported] = useState(() =>
    findUnsupportedElements(props.initialText),
  );
  const lastCopied = useRef<string>(undefined);
  const wordInput = useRef<HTMLInputElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const uploadFile: UploadFile = useCallback(
    (file) =>
      new Promise((resolve, reject) => {
        // Read first, as the current editor's file picker does, so uploaders
        // that use `blobInfo.base64` get it.
        const reader = new FileReader();
        reader.onload = () =>
          propsRef.current.fileUploader(
            convertFileToBlobInfo(file, reader),
            resolve,
            (error) => reject(new Error(error)),
          );
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      }),
    [],
  );

  const editor = useEditor({
    extensions: editorExtensions,
    content: editorInput(props.initialText),
    editable: !props.disabled,
    enableInputRules: false,
    enablePasteRules: false,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: props.classes.editor,
        role: 'textbox',
        'aria-multiline': 'true',
        ...(props['aria-labelledby'] && {
          'aria-labelledby': props['aria-labelledby'],
        }),
        ...(props['aria-describedBy'] && {
          'aria-describedby': props['aria-describedBy'],
        }),
      },
      // Remembers what this editor copied, so pasting it back can be told
      // apart from HTML copied out of another ProseMirror editor, which
      // carries the same `data-pm-slice` mark.
      transformCopied: (slice) => {
        lastCopied.current = normalizeText(
          slice.content.textBetween(0, slice.content.size, '\n\n'),
        );
        return slice;
      },
      handlePaste: (view, event) => {
        let html = event.clipboardData?.getData('text/html');
        const text = event.clipboardData?.getData('text/plain') || '';
        // Copying within this editor is left to ProseMirror.
        if (
          html &&
          /data-pm-slice/.test(html) &&
          normalizeText(text) === lastCopied.current
        ) {
          return false;
        }
        // Plain text (copied from a PDF, say) goes through the same pipeline
        // as HTML, as in the current editor: dirtyClean is what makes
        // "3. gr." lines article titles and lettered lines lists.
        if (!html) {
          if (!text) {
            return false;
          }
          html = plainTextToHtml(text);
        }
        event.preventDefault();
        const editor = editorRef.current;
        if (!editor) {
          return true;
        }
        let prepared: string;
        try {
          prepared = cleanPastedHtml(
            fixAlphabeticalLists(sanitizeClipboardHtml(html)),
          );
        } catch (error) {
          console.error('Paste failed:', error);
          return true;
        }
        if (!hasInlineImages(prepared)) {
          // Nothing to wait for: in at once, where the cursor is.
          editor.chain().focus().insertContent(prepared).run();
          return true;
        }
        // Images are uploaded first. Keep the pasted range mapped through
        // any edits made meanwhile, so it lands where it was pasted.
        let { from, to } = view.state.selection;
        const mapping = new Mapping();
        const track = ({ transaction }: { transaction: Transaction }) =>
          mapping.appendMapping(transaction.mapping);
        editor.on('transaction', track);
        uploadInlineImages(prepared, propsRef.current.fileUploader)
          .then((content) => {
            from = mapping.map(from, -1);
            to = mapping.map(to, 1);
            if (!editor.isDestroyed) {
              editor
                .chain()
                .focus()
                .insertContentAt({ from, to }, content)
                .run();
            }
          })
          .catch((error) => console.error('Paste failed:', error))
          .finally(() => editor.off('transaction', track));
        return true;
      },
    },
    onUpdate: () => propsRef.current.onChange(),
    onFocus: () => propsRef.current.onFocus?.(),
    onBlur: () => propsRef.current.onBlur?.(),
  });
  const editorRef = useRef<TiptapEditor | null>(null);
  editorRef.current = editor;

  const getHTML = useMemo(() => {
    if (!editor) {
      return undefined;
    }
    const serialize = createRegulationSerializer(editor.schema);
    return () => serialize(editor.state.doc);
  }, [editor]);

  useEffect(() => {
    // Without `emitUpdate: false`, Tiptap reports this as a change, and
    // `onChange` would fire on load, before anyone has typed.
    if (editor && editor.isEditable === !!props.disabled) {
      editor.setEditable(!props.disabled, false);
    }
  }, [editor, props.disabled]);

  useEffect(() => {
    if (editor && getHTML) {
      propsRef.current.onReady({
        getHTML,
        element: editor.view.dom,
        highlight: (elm) => highlightElement(editor, elm),
        normalize: (html) =>
          toRegulationHTML(
            createDocument(editorInput(html), editor.schema).content,
            editor.schema,
          ),
      });
    }
  }, [editor, getHTML]);

  const importWord = async (file: File) => {
    if (!editor || loadingWord) {
      return;
    }
    setLoadingWord(true);
    setError(undefined);
    try {
      const raw = await prepareWordDocument(await file.arrayBuffer());
      const content = await prepareWordHtml(raw, propsRef.current.fileUploader);
      editor.chain().focus().insertContent(content).run();
    } catch (error) {
      console.error('Error converting document:', error);
      setError('Ekki tókst að lesa Word skjalið.');
    } finally {
      setLoadingWord(false);
    }
  };

  return (
    <>
      <div
        className={props.classes.toolbar + ' regtools-toolbar'}
        role="toolbar"
        aria-label="Verkfæri ritils"
      >
        {editor && (
          <Toolbar
            editor={editor}
            disabled={props.disabled}
            items={props.toolbar}
            actions={{
              openDialog: setDialog,
              importWord: () => wordInput.current?.click(),
            }}
          />
        )}
      </div>
      <input
        ref={wordInput}
        type="file"
        accept=".docx"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // so the same file can be chosen again
          file && void importWord(file);
        }}
      />
      {loadingWord && (
        <div className="regulation_editor_loading_word_document" role="status">
          {props.documentLoaderElement ?? 'Hleð inn Word skjali ...'}
        </div>
      )}
      {unsupported.length > 0 && (
        <div className="regtools-editor__error" role="alert">
          Ritillinn getur ekki haldið öllu í þessum texta óbreyttu. Þetta
          breytist eða hverfur ef textinn er vistaður:
          <ul>
            {unsupported.slice(0, 5).map((u, i) => (
              <li key={i}>
                <code>{u}</code>
              </li>
            ))}
          </ul>
          {unsupported.length > 5 && (
            <p>og {unsupported.length - 5} í viðbót.</p>
          )}
        </div>
      )}
      {error && (
        <div className="regtools-editor__error" role="alert">
          {error}{' '}
          <button type="button" onClick={() => setError(undefined)}>
            Loka
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
      {editor && getHTML && (
        <Dialogs
          open={dialog}
          editor={editor}
          uploadFile={uploadFile}
          getHTML={getHTML}
          onClose={() => setDialog(undefined)}
        />
      )}
    </>
  );
};

/**
 * Re-renders only when something it shows changes. A re-render hands
 * Tiptap fresh options, which on a long text costs ~100 ms: it made the
 * first keystroke after every pause slow, when EditorV2's state changes.
 * Functions are left out of the comparison: they are read through
 * `propsRef`, so the latest is always called.
 */
const sameProps = (a: EditorV2FrameProps, b: EditorV2FrameProps) =>
  (Object.keys(a) as Array<keyof EditorV2FrameProps>).every((key) => {
    if (typeof a[key] === 'function') {
      return typeof b[key] === 'function';
    }
    if (key === 'documentLoaderElement') {
      // Often inline JSX, a new object on every render; it is only shown
      // while a Word document loads, so whether there is one is enough.
      return !!a[key] === !!b[key];
    }
    if (key === 'classes') {
      return (
        a.classes.toolbar === b.classes.toolbar &&
        a.classes.editor === b.classes.editor
      );
    }
    return a[key] === b[key];
  }) && Object.keys(a).length === Object.keys(b).length;

export const EditorV2Frame = React.memo(EditorV2FrameInner, sameProps);
