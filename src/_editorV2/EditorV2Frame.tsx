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
import { EditorContent, useEditor } from '@tiptap/react';

import {
  PasteImageUploader,
  plainTextToHtml,
  prepareWordDocument,
  prepareWordHtml,
  preparePastedHtml,
} from '../_editorPaste';
import { HTMLText } from '../types';
import { convertFileToBlobInfo } from '../utils';

import { Dialogs, UploadFile } from './Dialogs';
import { editorExtensions, highlightElement } from './extensions';
import { createRegulationSerializer, toRegulationHTML } from './serialize';
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

const EditorV2FrameInner = (props: EditorV2FrameProps) => {
  const [dialog, setDialog] = useState<DialogName>();
  const [loadingWord, setLoadingWord] = useState(false);
  const wordInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
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
    content: props.initialText,
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
      handlePaste: (view, event) => {
        let html = event.clipboardData?.getData('text/html');
        // Copying within the editor is left to ProseMirror, which marks its
        // own clipboard HTML.
        if (html && /data-pm-slice/.test(html)) {
          return false;
        }
        // Plain text (copied from a PDF, say) goes through the same pipeline
        // as HTML, as in the current editor: dirtyClean is what makes
        // "3. gr." lines article titles and lettered lines lists.
        if (!html) {
          const text = event.clipboardData?.getData('text/plain');
          if (!text) {
            return false;
          }
          html = plainTextToHtml(text);
        }
        event.preventDefault();
        const { from, to } = view.state.selection;
        void preparePastedHtml(html, propsRef.current.fileUploader).then(
          (content) => {
            editorRef.current
              ?.chain()
              .focus()
              .insertContentAt({ from, to }, content)
              .run();
          },
        );
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
    editor?.setEditable(!props.disabled);
  }, [editor, props.disabled]);

  useEffect(() => {
    if (editor && getHTML) {
      propsRef.current.onReady({
        getHTML,
        element: editor.view.dom,
        highlight: (elm) => highlightElement(editor, elm),
        normalize: (html) =>
          toRegulationHTML(
            createDocument(html, editor.schema).content,
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
    try {
      const raw = await prepareWordDocument(await file.arrayBuffer());
      const content = await prepareWordHtml(raw, propsRef.current.fileUploader);
      editor.chain().focus().insertContent(content).run();
    } catch (error) {
      console.error('Error converting document:', error);
    } finally {
      setLoadingWord(false);
    }
  };

  const insertImage = async (file: File) => {
    if (!editor) {
      return;
    }
    try {
      const src = await uploadFile(file);
      editor
        .chain()
        .focus()
        .setImage({ src, alt: file.name.replace(/\.[^.]+$/, '') })
        .run();
    } catch (error) {
      console.error('Image upload failed:', error);
    }
  };

  return (
    <>
      <div
        className={props.classes.toolbar + ' regtools-toolbar'}
        role="toolbar"
      >
        {editor && (
          <Toolbar
            editor={editor}
            items={props.toolbar}
            actions={{
              openDialog: setDialog,
              insertImage: () => imageInput.current?.click(),
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
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          file && void insertImage(file);
        }}
      />
      {loadingWord && (
        <div className="regulation_editor_loading_word_document">
          {props.documentLoaderElement ?? 'Hleð inn Word skjali ...'}
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
    if (key === 'classes') {
      return (
        a.classes.toolbar === b.classes.toolbar &&
        a.classes.editor === b.classes.editor
      );
    }
    return a[key] === b[key];
  }) && Object.keys(a).length === Object.keys(b).length;

export const EditorV2Frame = React.memo(EditorV2FrameInner, sameProps);
