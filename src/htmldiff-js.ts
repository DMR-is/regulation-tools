/// <reference types="./globals" />
import htmldiff from 'htmldiff-js';
import { HTMLText } from './types';

export const execute = (a: HTMLText, b: HTMLText): HTMLText =>
  htmldiff.execute(a, b) as HTMLText;
