/*
  EditorV2's dialogs: link (with uploading a PDF to link to, as the
  current editor's link dialog does), special characters, the HTML source,
  and search and replace. Native `<dialog>` elements.
*/

import React, { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Editor, useEditorState } from '@tiptap/react';

import { HTMLText } from '../types';
import { importText } from '../_editorText';

import { findUnsupportedElements } from './fidelity';
import { searchKey } from './search';
import { editorInput } from './serialize';
import { DialogName } from './Toolbar';

const Dialog = (props: {
  title: string;
  onClose: () => void;
  modal?: boolean;
  /** Where focus goes when a non-modal dialog closes. */
  returnFocus?: () => void;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const returnFocus = useRef(props.returnFocus);
  returnFocus.current = props.returnFocus;
  useEffect(() => {
    const dialog = ref.current!;
    props.modal === false ? dialog.show() : dialog.showModal();
    return () => {
      dialog.close();
      // A modal dialog gives focus back itself; a non-modal one does not.
      props.modal === false && returnFocus.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={
        'regtools-dialog' +
        (props.modal === false ? ' regtools-dialog--panel' : '')
      }
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
      onKeyDown={(e) => {
        // Escape only fires `cancel` on modal dialogs.
        if (props.modal === false && e.key === 'Escape') {
          e.preventDefault();
          props.onClose();
        }
      }}
    >
      <h2 className="regtools-dialog__title" id={titleId}>
        {props.title}
      </h2>
      {props.children}
    </dialog>
  );
};

const Buttons = (props: { children: ReactNode }) => (
  <div className="regtools-dialog__buttons">{props.children}</div>
);

// ---------------------------------------------------------------------------

/** Uploads one file and gives back its URL. */
export type UploadFile = (file: File) => Promise<string>;

const LinkDialog = (props: {
  editor: Editor;
  uploadFile: UploadFile;
  onClose: () => void;
}) => {
  const { editor } = props;
  const [href, setHref] = useState(
    () => (editor.getAttributes('link').href as string | undefined) || '',
  );
  const { from, to, empty } = editor.state.selection;
  const [text, setText] = useState(() =>
    empty ? '' : editor.state.doc.textBetween(from, to),
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const isLink = editor.isActive('link');

  const save = () => {
    const chain = editor.chain().focus();
    if (!href) {
      chain.extendMarkRange('link').unsetLink().run();
    } else if (empty && !isLink) {
      chain
        .insertContent({
          type: 'text',
          text: text || href,
          marks: [{ type: 'link', attrs: { href } }],
        })
        .run();
    } else {
      chain.extendMarkRange('link').setLink({ href }).run();
    }
    props.onClose();
  };

  const upload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf'; // Allow only PDFs, as the current editor does
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      setUploading(true);
      setError(undefined);
      props
        .uploadFile(file)
        .then((url) => {
          setHref(url);
          text || setText(file.name);
        })
        .catch(() => setError('Ekki tókst að hlaða upp skjalinu'))
        .finally(() => setUploading(false));
    };
    input.click();
  };

  return (
    <Dialog title="Setja inn/breyta hlekk" onClose={props.onClose}>
      <label className="regtools-dialog__field">
        Hlekkur
        <span className="regtools-dialog__row">
          <input
            type="url"
            value={href}
            autoFocus
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !uploading && save()}
          />
          <button type="button" onClick={upload} disabled={uploading}>
            {uploading ? 'Hleð upp…' : 'Hlaða upp skjali ↑'}
          </button>
        </span>
      </label>
      {empty && !isLink && (
        <label className="regtools-dialog__field">
          Texti til að birta
          <input value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      {error && <p className="regtools-dialog__error">{error}</p>}
      <Buttons>
        {isLink && (
          <button
            type="button"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              props.onClose();
            }}
          >
            Fjarlægja hlekk
          </button>
        )}
        <button type="button" onClick={props.onClose}>
          Hætta við
        </button>
        <button type="button" onClick={save} disabled={uploading}>
          Vista
        </button>
      </Buttons>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------

/** The characters legal texts need that keyboards lack. */
const CHARACTERS = [
  ['§', 'Greinarmerki'],
  ['–', 'Stutt þankastrik'],
  ['—', 'Langt þankastrik'],
  ['„', 'Opnandi gæsalappir'],
  ['“', 'Lokandi gæsalappir'],
  ['‚', 'Opnandi einfaldar gæsalappir'],
  ['‘', 'Lokandi einfaldar gæsalappir'],
  ['…', 'Úrfellingarmerki'],
  [' ', 'Óskiptanlegt bil'],
  ['°', 'Gráða'],
  ['±', 'Plús/mínus'],
  ['×', 'Margföldun'],
  ['÷', 'Deiling'],
  ['≤', 'Minna eða jafnt'],
  ['≥', 'Stærra eða jafnt'],
  ['≈', 'Um það bil'],
  ['½', 'Hálfur'],
  ['¼', 'Fjórðungur'],
  ['¾', 'Þrír fjórðu'],
  ['²', 'Í öðru veldi'],
  ['³', 'Í þriðja veldi'],
  ['µ', 'Míkró'],
  ['‰', 'Prómill'],
  ['€', 'Evra'],
  ['£', 'Pund'],
  ['$', 'Dollari'],
  ['•', 'Punktur'],
  ['©', 'Höfundarréttur'],
  ['®', 'Skráð vörumerki'],
  ['™', 'Vörumerki'],
] as const;

const CharMapDialog = (props: { editor: Editor; onClose: () => void }) => (
  <Dialog title="Sértákn" onClose={props.onClose}>
    <div className="regtools-dialog__charmap">
      {CHARACTERS.map(([char, name]) => (
        <button
          key={name}
          type="button"
          title={name}
          aria-label={name}
          onClick={() => {
            props.editor.chain().focus().insertContent(char).run();
            props.onClose();
          }}
        >
          {char === ' ' ? '⍽' : char}
        </button>
      ))}
    </div>
    <Buttons>
      <button type="button" onClick={props.onClose}>
        Loka
      </button>
    </Buttons>
  </Dialog>
);

// ---------------------------------------------------------------------------

const CodeDialog = (props: {
  editor: Editor;
  getHTML: () => HTMLText;
  onClose: () => void;
}) => {
  const [html, setHtml] = useState<string>(() => props.getHTML());
  const [unsupported, setUnsupported] = useState<Array<string>>([]);
  const save = (force?: boolean) => {
    const imported = importText(html as HTMLText, false);
    const found = findUnsupportedElements(imported);
    if (found.length && !force) {
      setUnsupported(found);
      return;
    }
    props.editor.chain().focus().setContent(editorInput(imported)).run();
    props.onClose();
  };
  return (
    <Dialog title="HTML kóði" onClose={props.onClose}>
      <textarea
        className="regtools-dialog__code"
        aria-label="HTML kóði"
        value={html}
        spellCheck={false}
        onChange={(e) => {
          setHtml(e.target.value);
          setUnsupported([]);
        }}
      />
      {unsupported.length > 0 && (
        <div className="regtools-dialog__error">
          <p>Ritillinn styður ekki þessi element og þau myndu hverfa:</p>
          <ul>
            {unsupported.slice(0, 5).map((u, i) => (
              <li key={i}>
                <code>{u}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Buttons>
        <button type="button" onClick={props.onClose}>
          Hætta við
        </button>
        {unsupported.length > 0 ? (
          <button type="button" onClick={() => save(true)}>
            Vista samt
          </button>
        ) : (
          <button type="button" onClick={() => save()}>
            Vista
          </button>
        )}
      </Buttons>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------

const SearchDialog = (props: { editor: Editor; onClose: () => void }) => {
  const { editor } = props;
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const { count, current } = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const state = searchKey.getState(e.state);
      return {
        count: state?.matches.length ?? 0,
        current: state?.current ?? -1,
      };
    },
  });
  useEffect(() => {
    editor.commands.setSearch(query, caseSensitive);
  }, [editor, query, caseSensitive]);
  useEffect(() => () => void editor.commands.clearSearch(), [editor]);

  return (
    <Dialog
      title="Leita og skipta út"
      onClose={props.onClose}
      modal={false}
      returnFocus={() => editor.commands.focus()}
    >
      <label className="regtools-dialog__field">
        Leita að
        <input
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.shiftKey
                ? editor.commands.findPrevious()
                : editor.commands.findNext();
            }
          }}
        />
      </label>
      <label className="regtools-dialog__field">
        Skipta út fyrir
        <input
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
        />
      </label>
      <label className="regtools-dialog__check">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => setCaseSensitive(e.target.checked)}
        />{' '}
        Hástafanæmt
      </label>
      <p className="regtools-dialog__status" aria-live="polite">
        {query ? `${count ? current + 1 : 0} af ${count}` : ''}
      </p>
      <Buttons>
        <button
          type="button"
          onClick={() => editor.commands.findPrevious()}
          disabled={!count}
        >
          Fyrri
        </button>
        <button
          type="button"
          onClick={() => editor.commands.findNext()}
          disabled={!count}
        >
          Næsta
        </button>
        <button
          type="button"
          onClick={() => editor.commands.replaceCurrent(replacement)}
          disabled={!count || !editor.isEditable}
        >
          Skipta út
        </button>
        <button
          type="button"
          onClick={() => editor.commands.replaceAll(replacement)}
          disabled={!count || !editor.isEditable}
        >
          Skipta út öllum
        </button>
        <button type="button" onClick={props.onClose}>
          Loka
        </button>
      </Buttons>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------

export const Dialogs = (props: {
  open?: DialogName;
  editor: Editor;
  uploadFile: UploadFile;
  getHTML: () => HTMLText;
  onClose: () => void;
}) => {
  const { open, editor, onClose } = props;
  switch (open) {
    case 'link':
      return (
        <LinkDialog
          editor={editor}
          uploadFile={props.uploadFile}
          onClose={onClose}
        />
      );
    case 'charmap':
      return <CharMapDialog editor={editor} onClose={onClose} />;
    case 'code':
      return (
        <CodeDialog editor={editor} getHTML={props.getHTML} onClose={onClose} />
      );
    case 'searchreplace':
      return <SearchDialog editor={editor} onClose={onClose} />;
    default:
      return null;
  }
};
