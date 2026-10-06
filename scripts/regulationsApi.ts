/*
  A polite client for the public regulations API, shared by the scripts.
  Its base URL comes from REGULATIONS_API_URL.

  It is a public production API: requests are sequential, at most one a
  second, and every successful response is cached under the OS temp dir, so a
  rerun makes no requests at all.
*/

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { HTMLText } from '../src/types';

export type Reg = {
  text: HTMLText;
  title?: string;
  history?: Array<{ date: string; name: string; effect: string }>;
};

// The API's base URL, e.g. `https://<host>/api/v1` — from the environment,
// never committed. Prod or dev is whichever URL you set.
const BASE = (process.env.REGULATIONS_API_URL || '').replace(/\/+$/, '');
if (!BASE) {
  console.error(
    'Set REGULATIONS_API_URL to the regulations API base URL (…/api/v1).',
  );
  process.exit(1);
}
// One cache per API, so prod and dev responses never mix.
const CACHE_DIR = join(
  tmpdir(),
  'regulation-tools-diff-cache',
  new URL(BASE).host,
);
const REQUEST_DELAY_MS = 1000;
let lastRequest = 0;
let requests = 0;

/** How many requests actually went out (cache hits not counted). */
export const requestCount = () => requests;

/** `cacheName` defaults to the path; slashes and query characters become `__`. */
export const getJson = async <T>(
  path: string,
  cacheName = path,
): Promise<T> => {
  const file = join(CACHE_DIR, cacheName.replace(/[/?=&]/g, '__') + '.json');
  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, 'utf8'));
    if (cached && cached.__missing) {
      // Remembered as missing, so a rerun does not ask again.
      throw new Error(`${cached.__missing} ${path} (cached)`);
    }
    return cached as T;
  }
  const wait = lastRequest + REQUEST_DELAY_MS - Date.now();
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastRequest = Date.now();
  requests++;
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) {
    // The API answers a version that does not exist with a 500 — remember
    // those (and 404s) so they are not requested again.
    if (res.status === 404 || res.status === 500) {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(file, JSON.stringify({ __missing: res.status }));
    }
    throw new Error(`${res.status} ${path}`);
  }
  const json = (await res.json()) as T;
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(json));
  return json;
};

/**
 * A regulation by name (`0678-2009`) and variant (`current`, `original`,
 * `d/<date>`). Cached as `0678-2009__current.json` etc.
 */
export const getReg = (path: string) =>
  getJson<Reg>(`regulation/${path}`, path);
