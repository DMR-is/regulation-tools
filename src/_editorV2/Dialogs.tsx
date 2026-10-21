/*
  EditorV2's dialogs: link (with uploading a PDF to link to, as the
  current editor's link dialog does), image (upload and alt text), special
  characters, the HTML source, and search and replace. Native `<dialog>`
  elements.
*/

import React, {
  ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Editor, useEditorState } from '@tiptap/react';
import { Upload } from 'lucide-react';

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
  // A layout effect, so `close()` runs before React removes the dialog:
  // closed while still in the page, it gives focus back to where it was.
  useLayoutEffect(() => {
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

/** `primary` is the dialog's main action, `danger` one that removes
 * something; any other button is secondary. */
const DialogButton = (props: {
  variant?: 'primary' | 'danger';
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    className={
      'regtools-dialog__button' +
      (props.variant ? ` regtools-dialog__button--${props.variant}` : '')
    }
    disabled={props.disabled}
    onClick={props.onClick}
  >
    {props.children}
  </button>
);

const UploadButton = (props: {
  label: string;
  uploading: boolean;
  onClick: () => void;
}) => (
  <DialogButton disabled={props.uploading} onClick={props.onClick}>
    {props.uploading ? (
      'Hleð upp…'
    ) : (
      <>
        <Upload size={16} aria-hidden />
        {props.label}
      </>
    )}
  </DialogButton>
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
          <UploadButton
            label="Hlaða upp skjali"
            uploading={uploading}
            onClick={upload}
          />
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
          <DialogButton
            variant="danger"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              props.onClose();
            }}
          >
            Fjarlægja hlekk
          </DialogButton>
        )}
        <DialogButton onClick={props.onClose}>Hætta við</DialogButton>
        <DialogButton variant="primary" onClick={save} disabled={uploading}>
          Vista
        </DialogButton>
      </Buttons>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------

/**
 * Insert an image, or edit the selected one, as the current editor's image
 * dialog does: the address (uploading sets it) and the alt text, which
 * starts as the file name.
 */
const ImageDialog = (props: {
  editor: Editor;
  uploadFile: UploadFile;
  onClose: () => void;
}) => {
  const { editor } = props;
  const isImage = editor.isActive('image');
  const [src, setSrc] = useState(() =>
    isImage ? (editor.getAttributes('image').src as string) || '' : '',
  );
  const [alt, setAlt] = useState(() =>
    isImage ? (editor.getAttributes('image').alt as string) || '' : '',
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();

  const save = () => {
    if (!src || uploading) {
      return;
    }
    const chain = editor.chain().focus();
    if (isImage) {
      chain.updateAttributes('image', { src, alt }).run();
    } else {
      chain.setImage({ src, alt }).run();
    }
    props.onClose();
  };

  const upload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
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
          setSrc(url);
          alt || setAlt(file.name.replace(/\.[^.]+$/, ''));
        })
        .catch((e) => {
          console.error('Image upload failed:', e);
          setError('Ekki tókst að hlaða upp myndinni.');
        })
        .finally(() => setUploading(false));
    };
    input.click();
  };

  const onEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && save();

  return (
    <Dialog
      title={isImage ? 'Breyta mynd' : 'Setja inn mynd'}
      onClose={props.onClose}
    >
      <label className="regtools-dialog__field">
        Slóð myndar
        <span className="regtools-dialog__row">
          <input
            type="url"
            value={src}
            autoFocus={!isImage}
            onChange={(e) => setSrc(e.target.value)}
            onKeyDown={onEnter}
          />
          <UploadButton
            label="Hlaða upp mynd"
            uploading={uploading}
            onClick={upload}
          />
        </span>
      </label>
      <label className="regtools-dialog__field">
        Lýsing myndar (alt-texti)
        <input
          value={alt}
          autoFocus={isImage}
          onChange={(e) => setAlt(e.target.value)}
          onKeyDown={onEnter}
        />
      </label>
      {error && (
        <p className="regtools-dialog__error" role="alert">
          {error}
        </p>
      )}
      <Buttons>
        <DialogButton onClick={props.onClose}>Hætta við</DialogButton>
        <DialogButton
          variant="primary"
          onClick={save}
          disabled={!src || uploading}
        >
          Vista
        </DialogButton>
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
      <DialogButton onClick={props.onClose}>Loka</DialogButton>
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
        <DialogButton onClick={props.onClose}>Hætta við</DialogButton>
        {unsupported.length > 0 ? (
          <DialogButton variant="primary" onClick={() => save(true)}>
            Vista samt
          </DialogButton>
        ) : (
          <DialogButton variant="primary" onClick={() => save()}>
            Vista
          </DialogButton>
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
        <DialogButton
          onClick={() => editor.commands.findPrevious()}
          disabled={!count}
        >
          Fyrri
        </DialogButton>
        <DialogButton
          variant="primary"
          onClick={() => editor.commands.findNext()}
          disabled={!count}
        >
          Næsta
        </DialogButton>
        <DialogButton
          onClick={() => editor.commands.replaceCurrent(replacement)}
          disabled={!count || !editor.isEditable}
        >
          Skipta út
        </DialogButton>
        <DialogButton
          onClick={() => editor.commands.replaceAll(replacement)}
          disabled={!count || !editor.isEditable}
        >
          Skipta út öllum
        </DialogButton>
        <DialogButton onClick={props.onClose}>Loka</DialogButton>
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
    case 'image':
      return (
        <ImageDialog
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
