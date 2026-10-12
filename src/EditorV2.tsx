/*
  EditorV2: the regulation editor on Tiptap, beside `Editor` (TinyMCE).
  See docs/plan-tiptap-editor.md.

  The same props as `Editor` but `config`, which was TinyMCE's settings
  and in practice only ever set the toolbar: `toolbar` takes its place, and
  accepts the same toolbar strings. The same `classes`, so consumers'
  styles carry over, and the same markup around the editor.

  Differences that matter on long texts:
  - The comparison pane uses `getStructuredDiff`, and only after a pause in
    typing, in idle time, abandoned if typing resumes.
  - The editor code is loaded without a `Suspense` fallback, which on
    React 19 holds the editor back for up to 300 ms after it has loaded.
*/

import React, {
  Fragment,
  MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import classes from '@hugsmidjan/qj/classes';

import { useIsBrowserSide } from './_utils/hooks';
import { exportText, importText } from './_editorText';
import { EditorClasses, EditorProps } from './Editor';
import { HTMLDump } from './html';
import {
  createStructuredDiffer,
  DiffPart,
  StructuredDiffer,
} from './structuredDiff-browser';
import { TextWarnings } from './TextWarnings';
import { HTMLText } from './types';
import { useTextWarnings } from './useTextWarnings';
import { getTexts } from './utils';
import type {
  EditorV2FrameApi,
  EditorV2FrameProps,
} from './_editorV2/EditorV2Frame';
import { DiffPane } from './_editorV2/DiffPane';
import { parseToolbar, ToolbarItem } from './_editorV2/toolbarItems';

export type { EditorClasses } from './Editor';
export type { EditorFileUploader } from './EditorFrame';
export type { ToolbarItem } from './_editorV2/toolbarItems';

// ---------------------------------------------------------------------------

const EMPTY_HTML = '' as HTMLText;

const t = getTexts({
  comparisonTitle: {
    diff: 'Breytingar',
    base: 'Grunntexti',
  },
  button: {
    diff: 'Sjá breytingar',
    base: 'Sjá grunntexta',
  },
  diffNow: 'Endurreikna breytingar',
});

const modes = ['diff', 'base'] as const;
type DiffModes = (typeof modes)[number];

const resultClasses: Record<DiffModes, keyof EditorClasses> = {
  diff: 'result_diff',
  base: 'result_base',
};

/** How long typing must pause before the diff and the warnings run. */
const PAUSE_MS = 1000;
/** A diff slower than this turns automatic diffing off, as in `Editor`. */
const SLOW_DIFF_MS = 1500;

const whenIdle = (fn: () => void): (() => void) => {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn, { timeout: 1000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
};

/** Loads the editor code on demand, without a `Suspense` fallback. */
const useEditorFrame = (load: boolean) => {
  const [Frame, setFrame] = useState<React.ComponentType<EditorV2FrameProps>>();
  useEffect(() => {
    if (load && !Frame) {
      void import('./_editorV2/EditorV2Frame').then((m) =>
        setFrame(() => m.EditorV2Frame),
      );
    }
  }, [load, Frame]);
  return Frame;
};

// ===========================================================================

export type EditorV2Props = Omit<EditorProps, 'config'> & {
  /**
   * The toolbar: a list of items, or a string of TinyMCE's toolbar names
   * as `Editor`'s `config.toolbar` took them, e.g.
   * `'bold italic underline | align numlist bullist | link'`.
   * `false` for none. Default: `Editor`'s default toolbar.
   */
  toolbar?: Array<ToolbarItem> | string | false;
};

export const EditorV2 = (
  props: EditorV2Props & {
    classes: EditorClasses;
    fileUploader: NonNullable<EditorProps['fileUploader']>;
  },
) => {
  const s = props.classes;
  const { valueRef, elmRef, readOnly, disabled, hideWarnings } = props;
  const isBrowser = useIsBrowserSide();
  const Frame = useEditorFrame(!!isBrowser);

  const rawBaseText = useMemo(
    () => importText(props.baseText || EMPTY_HTML, false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialText = useMemo(() => importText(valueRef.current(), false), []);
  const toolbarKey =
    typeof props.toolbar === 'object'
      ? JSON.stringify(props.toolbar)
      : props.toolbar;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toolbar = useMemo(() => parseToolbar(props.toolbar), [toolbarKey]);

  const apiRef = useRef<EditorV2FrameApi>(undefined);
  const [contentRoot, setContentRoot] = useState<HTMLElement>();
  valueRef.current = () =>
    exportText(apiRef.current ? apiRef.current.getHTML() : initialText);

  // The base text as the editor writes it, so that only real edits show in
  // the diff (as `Editor` diffs against TinyMCE's version of the base).
  const [baseText, setBaseText] = useState(rawBaseText);
  const [currentText, setCurrentText] = useState(rawBaseText);
  const [diffParts, setDiffParts] = useState<Array<DiffPart>>([]);
  // Keeps its caches between diffs: after an edit only the changed
  // articles are diffed again (docs/plan-tiptap-editor.md, "Incremental work").
  const differ = useRef<StructuredDiffer>(undefined);
  const [updating, setUpdating] = useState<true | undefined>(true);
  const [needsUpdating, setNeedsUpdating] = useState<true | undefined>();
  const [diffMode, setDiffMode] = useState<DiffModes>('diff');
  const autoDiff = useRef(true);
  const pending = useRef<{
    timer?: ReturnType<typeof setTimeout>;
    idle?: () => void;
  }>({});

  const showComparisonPane = props.baseText != null;

  const warnings = useTextWarnings(
    currentText,
    props.isImpact,
    hideWarnings,
    props.disabledWarnings,
  );

  const runDiff = (base: HTMLText, text: HTMLText) => {
    const start = performance.now();
    differ.current ||= createStructuredDiffer(base);
    setDiffParts(differ.current.diff(text).parts);
    if (performance.now() - start > SLOW_DIFF_MS) {
      autoDiff.current = false;
    }
  };

  /** After a pause in typing: serialize once, then warnings and diff. */
  const onPause = () => {
    const api = apiRef.current;
    if (!api) {
      return;
    }
    pending.current.idle = whenIdle(() => {
      const text = api.getHTML();
      setCurrentText(text);
      if (showComparisonPane) {
        if (autoDiff.current) {
          runDiff(baseText, text);
        } else {
          setNeedsUpdating(true);
        }
      }
      setUpdating(undefined);
    });
  };

  useEffect(
    () => () => {
      clearTimeout(pending.current.timer);
      pending.current.idle?.();
    },
    [],
  );

  // The frame re-renders only when what it shows changes (see
  // EditorV2Frame), so it gets stable callbacks that call the latest ones.
  const handlers =
    useRef<
      Pick<
        EditorV2FrameProps,
        'onReady' | 'onChange' | 'onFocus' | 'onBlur' | 'fileUploader'
      >
    >(undefined);
  handlers.current = {
    onFocus: props.onFocus,
    onBlur: props.onBlur,
    fileUploader: props.fileUploader,
    onReady: (api) => {
      apiRef.current = api;
      elmRef && (elmRef.current = api.element);
      setContentRoot(api.element);
      // The base as the editor writes it. The editor holds the
      // current text, which is only the base when no initial
      // text differs from it.
      const editorBase =
        rawBaseText !== initialText
          ? api.normalize(rawBaseText)
          : api.getHTML();
      const text = api.getHTML();
      setBaseText(editorBase);
      setCurrentText(text);
      showComparisonPane && runDiff(editorBase, text);
      setUpdating(undefined);
    },
    onChange: () => {
      props.onChange?.();
      autoDiff.current && setUpdating(true);
      clearTimeout(pending.current.timer);
      pending.current.idle?.();
      pending.current.timer = setTimeout(onPause, PAUSE_MS);
    },
  };
  const frameHandlers = useMemo(
    () => ({
      onFocus: () => handlers.current!.onFocus?.(),
      onBlur: () => handlers.current!.onBlur?.(),
      onReady: (api: EditorV2FrameApi) => handlers.current!.onReady(api),
      onChange: () => handlers.current!.onChange(),
      fileUploader: ((...args) =>
        handlers.current!.fileUploader(
          ...args,
        )) as EditorV2FrameProps['fileUploader'],
    }),
    [],
  );

  return (
    <>
      {props.warningsAbove && !hideWarnings && (
        <TextWarnings
          warnings={warnings}
          contentRoot={contentRoot}
          classes={s}
          highlight={apiRef.current?.highlight}
        />
      )}

      <div
        className={classes(
          s.wrapper,
          disabled && s.wrapperDisabled,
          readOnly && s.wrapperReadonly,
        )}
      >
        <div className={s.editingpane}>
          {Frame ? (
            <Frame
              initialText={initialText}
              toolbar={toolbar}
              classes={s}
              fileUploader={frameHandlers.fileUploader}
              disabled={disabled || readOnly}
              documentLoaderElement={props.documentLoaderElement}
              aria-labelledby={props['aria-labelledby']}
              aria-describedBy={props['aria-describedBy']}
              onFocus={frameHandlers.onFocus}
              onBlur={frameHandlers.onBlur}
              onReady={frameHandlers.onReady}
              onChange={frameHandlers.onChange}
            />
          ) : (
            <div className={s.editorBooting} />
          )}
        </div>
        {showComparisonPane && (
          <div className={s.comparisonpane}>
            <div className={s.comparisonpaneContainer}>
              <h3 className={s.headline}>
                {t('comparisonTitle', diffMode)}
                <span className={s.diffmodes}>
                  {modes.map(
                    (mode) =>
                      mode !== diffMode && (
                        <Fragment key={mode}>
                          {' '}
                          <button
                            className={s.modeButton}
                            onClick={() => setDiffMode(mode)}
                          >
                            {t('button', mode)}
                          </button>
                        </Fragment>
                      ),
                  )}
                </span>
              </h3>

              <div
                className={s.result + ' ' + (s[resultClasses[diffMode]] || '')}
                data-updating={diffMode === 'diff' ? updating : undefined}
                data-needs-updating={
                  diffMode === 'diff' ? needsUpdating : undefined
                }
              >
                {needsUpdating && (
                  <button
                    className={s.diffNowBtn}
                    onClick={() => {
                      setNeedsUpdating(undefined);
                      setUpdating(true);
                      setTimeout(() => {
                        const text = apiRef.current?.getHTML() ?? currentText;
                        runDiff(baseText, text);
                        setUpdating(undefined);
                      }, 150);
                    }}
                  >
                    {t('diffNow')}
                  </button>
                )}
                {diffMode === 'diff' ? (
                  <DiffPane parts={diffParts} />
                ) : (
                  <HTMLDump html={baseText} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {!hideWarnings && (
        <TextWarnings
          warnings={warnings}
          contentRoot={contentRoot}
          classes={s}
          highlight={apiRef.current?.highlight}
        />
      )}
    </>
  );
};
