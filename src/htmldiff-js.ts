import { execute as htmldiff_js_execute } from 'htmldiff-js';
import { HTMLText } from './types';

export const execute = (a: HTMLText, b: HTMLText): HTMLText =>
  htmldiff_js_execute(a, b) as HTMLText;
