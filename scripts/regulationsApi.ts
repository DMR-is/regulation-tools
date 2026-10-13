/*
  A polite client for the public regulations API, shared by the scripts.
  Its base URL comes from REGULATIONS_API_URL.

  It is a public production API: requests are sequential, at most one a
  second, and every successful response is cached, so a rerun makes no
  requests at all. The cache lives in `.cache/regulations-api/` in the repo
  (gitignored; override with REGULATIONS_CACHE_DIR) rather than the OS temp
  dir, which the OS empties: a corpus fetched once stays fetched.

  `setMaxRequests` caps how many requests one run may make; cache hits do not
  count. Past the cap, `getJson` throws `RequestBudgetExceeded` instead of
  asking the API. A gateway error (502/503/504) is retried once, ten seconds
  later; both attempts count toward the cap.
*/

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { HTMLText } from '../src/types';

export type Reg = {
  text: HTMLText;
  title?: string;
  appendixes?: Array<{ title: string; text: HTMLText }>;
  comments?: HTMLText;
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
  process.env.REGULATIONS_CACHE_DIR ||
    join(process.cwd(), '.cache', 'regulations-api'),
  new URL(BASE).host,
);
const REQUEST_DELAY_MS = 1000;
const GATEWAY_RETRY_DELAY_MS = 10000;
const GATEWAY_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 60000;
let lastRequest = 0;
let requests = 0;
let maxRequests = Infinity;

/** How many requests actually went out (cache hits not counted). */
export const requestCount = () => requests;

export class RequestBudgetExceeded extends Error {}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Caps the requests this run may make. Cache hits are free. */
export const setMaxRequests = (max: number) => {
  maxRequests = max;
};

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
  let res: Response | undefined;
  for (let attempt = 1; attempt <= GATEWAY_ATTEMPTS; attempt++) {
    if (requests >= maxRequests) {
      throw new RequestBudgetExceeded(
        `request budget of ${maxRequests} used up, not fetching ${path}`,
      );
    }
    const wait =
      lastRequest +
      (attempt > 1 ? GATEWAY_RETRY_DELAY_MS : REQUEST_DELAY_MS) -
      Date.now();
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    lastRequest = Date.now();
    requests++;
    res = await fetch(`${BASE}/${path}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // A gateway error is the API taking too long (large texts, a cold
    // cache), not an answer: try once more after a pause, and never cache it.
    if (![502, 503, 504].includes(res.status)) {
      break;
    }
  }
  if (!res) {
    throw new Error(`no response for ${path}`);
  }
  if (!res.ok) {
    // The API answers a version that does not exist with a 500 — remember
    // those (and 404s) so they are not requested again.
    if (res.status === 404 || res.status === 500) {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(file, JSON.stringify({ __missing: res.status }));
    }
    throw new ApiError(res.status, `${res.status} ${path}`);
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
