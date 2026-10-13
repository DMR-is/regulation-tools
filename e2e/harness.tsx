/*
  The page the browser tests drive: EditorV2 (or Editor, for comparing the
  two) set up from `window.__options`, which each test sets before the page
  loads (see ./helpers.ts). Bundled by ./global-setup.ts; not part of the
  package.
*/

import React, { MutableRefObject } from 'react';
import { createRoot } from 'react-dom/client';

import { Editor, EditorClasses } from '../src/Editor';
import { EditorV2 } from '../src/EditorV2';
import { HTMLText } from '../src/types';

export type HarnessOptions = {
  editor?: 'v1' | 'v2';
  html: string;
  /** Show the comparison pane against this text. */
  baseText?: string;
  toolbar?: string | false;
  readOnly?: boolean;
  disabled?: boolean;
  /** `ok` uploads succeed as `/files/<name>`; `fail` they fail. */
  uploads?: 'ok' | 'fail';
  warningsAbove?: boolean;
  labelledBy?: string;
};

declare global {
  interface Window {
    __options: HarnessOptions;
    __value: () => HTMLText;
    __uploads: Array<string>;
    __changes: number;
    __focus: number;
    __blur: number;
    /** Sets readOnly after load, as an app does while it saves. */
    __setReadOnly: (readOnly: boolean) => void;
  }
}

const options = window.__options;

// Every class name is its own key, so tests can find the parts by them.
const classes = new Proxy({} as EditorClasses, {
  get: (_, key) => String(key),
});

const valueRef: MutableRefObject<() => HTMLText> = {
  current: () => options.html as HTMLText,
};
window.__value = () => valueRef.current();
window.__uploads = [];
window.__changes = 0;
window.__focus = 0;
window.__blur = 0;

const fileUploader = (
  blobInfo: { filename: () => string },
  success: (url: string) => void,
  failure: (err: string) => void,
) => {
  const name = blobInfo.filename();
  window.__uploads.push(name);
  setTimeout(() =>
    options.uploads === 'ok' ? success(`/files/${name}`) : failure('nei'),
  );
};

const common = {
  classes,
  valueRef,
  baseText: options.baseText as HTMLText | undefined,
  isImpact: true,
  fileUploader,
  disabled: options.disabled,
  warningsAbove: options.warningsAbove,
  'aria-labelledby': options.labelledBy,
  onChange: () => window.__changes++,
  onFocus: () => window.__focus++,
  onBlur: () => window.__blur++,
};

const App = () => {
  const [readOnly, setReadOnly] = React.useState(options.readOnly);
  window.__setReadOnly = setReadOnly;
  return <EditorOf readOnly={readOnly} />;
};

const EditorOf = ({ readOnly }: { readOnly?: boolean }) =>
  options.editor === 'v1' ? (
    <Editor
      {...common}
      readOnly={readOnly}
      config={
        options.toolbar !== undefined ? { toolbar: options.toolbar } : undefined
      }
    />
  ) : (
    <EditorV2 {...common} readOnly={readOnly} toolbar={options.toolbar} />
  );

createRoot(document.getElementById('root')!).render(<App />);
