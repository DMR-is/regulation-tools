/*
  The three hooks the editor used from `@hugsmidjan/react`, which does not
  support React 19 (its peer range is `<19`). They behave as the originals
  did. Internal: not re-exported from `utils`.
*/

import { DependencyList, useEffect, useId, useRef, useState } from 'react';

/** A stable, unique id. */
export const useDomid = (staticId?: string) => {
  const id = useId();
  return staticId || id;
};

/** Runs the callback when `deps` change, but not on mount. */
export const useOnUpdate = (
  callback: () => void | (() => void),
  deps: DependencyList,
) => {
  const isUpdate = useRef(false);
  const cb = useRef(callback);
  cb.current = callback;
  useEffect(
    () => {
      if (isUpdate.current) {
        return cb.current();
      }
      isUpdate.current = true;
    },
    deps, // eslint-disable-line react-hooks/exhaustive-deps
  );
};

let alreadyBrowserSide = false;

/**
 * `undefined` during server rendering and the first client render, `true`
 * once mounted. After the first mount anywhere on the page, later components
 * start out `true`, as there is no server render left to match.
 */
export const useIsBrowserSide = () => {
  const [isBrowser, setIsBrowser] = useState(alreadyBrowserSide);
  useEffect(() => {
    alreadyBrowserSide = true;
    setIsBrowser(true);
  }, []);
  return isBrowser || undefined;
};
