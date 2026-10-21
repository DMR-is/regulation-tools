/*
  The playground page (see ./server.ts): EditorV2, or Editor to compare,
  on a real regulation. The choices live in the address, and the text being
  edited in sessionStorage, so the reload after a rebuild keeps both.
*/

import '../src/editorV2.css';
import '../src/diff.css';
import './playground.css';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Editor, EditorClasses } from '../src/Editor';
import { EditorV2 } from '../src/EditorV2';
import { HTMLText } from '../src/types';

type Options = {
  reg: string;
  variant: 'current' | 'original';
  editor: 'v1' | 'v2';
  diff: boolean;
  readOnly: boolean;
};

const readOptions = (): Options => {
  const q = new URLSearchParams(location.search);
  return {
    reg: q.get('reg') || '',
    variant: q.get('variant') === 'original' ? 'original' : 'current',
    editor: q.get('editor') === 'v1' ? 'v1' : 'v2',
    diff: q.get('diff') !== '0',
    readOnly: q.get('readonly') === '1',
  };
};

const writeOptions = (o: Options) => {
  const q = new URLSearchParams();
  o.reg && q.set('reg', o.reg);
  o.variant !== 'current' && q.set('variant', o.variant);
  o.editor !== 'v2' && q.set('editor', o.editor);
  !o.diff && q.set('diff', '0');
  o.readOnly && q.set('readonly', '1');
  history.replaceState(null, '', '?' + q);
};

const SAMPLE =
  `<h2 class="chapter__title">I. KAFLI <em class="chapter__name">Almenn ákvæði.</em></h2>
<h3 class="article__title">1. gr. <em class="article__name">Gildissvið.</em></h3>
<p>Reglugerð þessi gildir um allt landið.</p>
<h3 class="article__title">2. gr. <em class="article__name">Skilgreiningar.</em></h3>
<p>Í reglugerð þessari merkir:</p>
<ol><li>Eitt.</li><li>Tvennt.</li></ol>` as HTMLText;

// sessionStorage can be missing or throw (private windows, blocked storage).
const storage = {
  get: (key: string) => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string | null) => {
    try {
      value == null
        ? sessionStorage.removeItem(key)
        : sessionStorage.setItem(key, value);
    } catch {
      // the edits are then lost on reload, nothing worse
    }
  },
};

// Each class name is its own key, as in the browser tests; playground.css
// styles them.
const classes = new Proxy({} as EditorClasses, {
  get: (_, key) => String(key),
});

// Images become blob: URLs of the chosen file, so they show as uploaded.
const fileUploader = (
  blobInfo: { blob: () => Blob },
  success: (url: string) => void,
) => {
  setTimeout(() => success(URL.createObjectURL(blobInfo.blob())), 300);
};

// ---------------------------------------------------------------------------

type ListItem = { name: string; title: string; cached: boolean };

const App = () => {
  const [options, setOptions] = useState(readOptions);
  const [list, setList] = useState<Array<ListItem>>([]);
  const [base, setBase] = useState<HTMLText | undefined>(
    options.reg ? undefined : SAMPLE,
  );
  const [error, setError] = useState('');
  const [output, setOutput] = useState<string>();
  const showOutput = useRef(false);
  showOutput.current = output != null;
  const [resets, setResets] = useState(0);
  const valueRef = useRef<() => HTMLText>(() => '' as HTMLText);

  const update = (changes: Partial<Options>) => {
    const next = { ...options, ...changes };
    writeOptions(next);
    setOptions(next);
  };

  useEffect(() => {
    fetch('/api/regulations')
      .then((r) => r.json())
      .then(setList, () => undefined);
  }, []);

  const { reg, variant } = options;
  useEffect(() => {
    if (!reg) {
      setBase(SAMPLE);
      return;
    }
    setBase(undefined);
    setError('');
    fetch(`/api/regulation/${reg.replace('/', '-')}/${variant}`)
      .then((r) => {
        if (!r.ok) {
          throw new Error(
            r.status === 404
              ? `${reg} is not in the cache (set REGULATIONS_API_URL to fetch it)`
              : `${r.status} ${r.statusText}`,
          );
        }
        return r.json();
      })
      .then(
        (json: { text: HTMLText }) => setBase(json.text),
        (e: Error) => setError(e.message),
      );
  }, [reg, variant]);

  const draftKey = `playground:${reg || 'sample'}:${variant}`;
  const initial = useMemo(
    () => (base == null ? undefined : storage.get(draftKey) || base),
    // A reset starts again from the base text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, draftKey, resets],
  );
  if (initial != null) {
    valueRef.current = () => initial as HTMLText;
  }
  const edited = initial != null && initial !== base;

  const common = initial != null && {
    classes,
    valueRef,
    baseText: options.diff ? base : undefined,
    isImpact: true,
    fileUploader,
    readOnly: options.readOnly,
    onChange: () => {
      storage.set(draftKey, valueRef.current());
      showOutput.current && setOutput(valueRef.current());
    },
  };
  const editorKey = [
    options.editor,
    draftKey,
    options.diff,
    options.readOnly,
    resets,
  ].join();

  const current = list.find((r) => r.name === reg);

  return (
    <>
      <header className="pg-bar">
        <strong className="pg-bar__title">Editor playground</strong>
        <label className="pg-field">
          Regulation
          <input
            list="pg-regs"
            placeholder="0678/2009"
            defaultValue={reg}
            key={reg}
            size={12}
            onChange={(e) => {
              const value = e.currentTarget.value.trim();
              if (value === '' || /^\d{4}\/\d{4}$/.test(value)) {
                update({ reg: value });
              }
            }}
          />
          <datalist id="pg-regs">
            {list.map((r) => (
              <option key={r.name} value={r.name}>
                {(r.cached ? '' : '(fetch) ') + r.title}
              </option>
            ))}
          </datalist>
        </label>
        <label className="pg-field">
          Version
          <select
            value={variant}
            onChange={(e) =>
              update({ variant: e.currentTarget.value as Options['variant'] })
            }
          >
            <option value="current">Current</option>
            <option value="original">Original</option>
          </select>
        </label>
        <div className="pg-switch" role="group" aria-label="Editor">
          {(['v2', 'v1'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={options.editor === v}
              onClick={() => update({ editor: v })}
            >
              {v === 'v2' ? 'EditorV2' : 'Editor (TinyMCE)'}
            </button>
          ))}
        </div>
        <label className="pg-check">
          <input
            type="checkbox"
            checked={options.diff}
            onChange={(e) => update({ diff: e.currentTarget.checked })}
          />
          Comparison pane
        </label>
        <label className="pg-check">
          <input
            type="checkbox"
            checked={options.readOnly}
            onChange={(e) => update({ readOnly: e.currentTarget.checked })}
          />
          Read-only
        </label>
        <span className="pg-bar__end">
          <button
            type="button"
            onClick={() =>
              setOutput(output == null ? valueRef.current() : undefined)
            }
          >
            {output == null ? 'Show HTML' : 'Hide HTML'}
          </button>
          <button
            type="button"
            disabled={!edited && !storage.get(draftKey)}
            onClick={() => {
              storage.set(draftKey, null);
              setResets((n) => n + 1);
              output != null && setOutput(base);
            }}
          >
            Reset text
          </button>
        </span>
      </header>

      <main className="pg-main">
        {current && current.title && (
          <h1 className="pg-heading">
            {reg} · {current.title}
          </h1>
        )}
        {error ? (
          <p className="pg-error">{error}</p>
        ) : !common ? (
          <p className="pg-loading">Loading…</p>
        ) : options.editor === 'v1' ? (
          <Editor key={editorKey} {...common} />
        ) : (
          <EditorV2 key={editorKey} {...common} />
        )}
        {output != null && <pre className="pg-output">{output}</pre>}
      </main>
    </>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
