declare module 'htmldiff-js' {
  import { HTMLText } from './types';

  export const execute: (a: HTMLText, b: HTMLText) => HTMLText;
}
