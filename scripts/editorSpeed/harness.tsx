/*
  The page that scripts/editorSpeed.ts measures: the current editor (or
  EditorV2, with `?editor=v2`) on one long regulation, set up the way consumers edit an amendment — the text
  is also the base text, so the diff pane and the warnings run as they do in
  real use. Bundled by the runner; not part of the package.
*/

import React, { MutableRefObject } from 'react';
import { createRoot } from 'react-dom/client';

import { Editor, EditorClasses } from '../../src/Editor';
import { EditorV2 } from '../../src/EditorV2';
import { HTMLText } from '../../src/types';

declare global {
  interface Window {
    __html: HTMLText;
    __readyAt?: number;
    __reactVersion: string;
  }
}

// Every class name is just its key; the measurements do not depend on styling.
const classes = new Proxy({} as EditorClasses, {
  get: (_, key) => String(key),
});

const valueRef: MutableRefObject<() => HTMLText> = {
  current: () => window.__html,
};

const useV2 = new URLSearchParams(location.search).get('editor') === 'v2';

const fileUploader = (
  _blobInfo: unknown,
  _success: (url: string) => void,
  failure: (err: string) => void,
) => failure('not in tests');

const App = () =>
  useV2 ? (
    <EditorV2
      classes={classes}
      valueRef={valueRef}
      baseText={window.__html}
      isImpact
      fileUploader={fileUploader}
    />
  ) : (
    <Editor
      classes={classes}
      valueRef={valueRef}
      baseText={window.__html}
      isImpact
      fileUploader={fileUploader}
    />
  );

window.__reactVersion = React.version;
createRoot(document.getElementById('root')!).render(<App />);

// The editor is ready when TinyMCE has marked its content area.
const poll = setInterval(() => {
  const area = document.querySelector('.editor[contenteditable="true"]');
  if (area && area.textContent!.trim()) {
    window.__readyAt = performance.now();
    clearInterval(poll);
  }
}, 20);
