/*
  Tiptap parses HTML with `window.DOMParser` and serializes with the global
  `document`. Under Node, give it jsdom's, as the cleanup code already uses.
  Import this before anything from `_editorV2`.
*/

import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!DOCTYPE html><html><body></body></html>');

const g = globalThis as Record<string, unknown>;
g.window ??= window;
g.document ??= window.document;
