import { format, parseISO } from 'date-fns';
import { is } from 'date-fns/locale';

import { ISODate, ISODateTime } from '../types';

export function formatdate(
  value: Date | string | undefined | null,
  _format = 'd. MMMM yyyy',
): string {
  if (!value) {
    return '';
  }

  const parsed = typeof value === 'string' ? parseISO(value) : value;

  if (parsed.toString() === 'Invalid Date') {
    return '';
  }

  return format(parsed, _format, { locale: is });
}

// ---------------------------------------------------------------------------

export function toISODate(date: Date): ISODate;
export function toISODate(date: null | undefined): null;
export function toISODate(
  date: Date | string | null | undefined,
): ISODate | null;

export function toISODate(
  date: Date | string | null | undefined,
): ISODate | null {
  if (typeof date === 'string') {
    date = new Date(date);
    if (isNaN(date.getTime())) {
      date = undefined;
    }
  }
  return date ? (date.toISOString().substring(0, 10) as ISODate) : null;
}

// ---------------------------------------------------------------------------

export function toISODateTime(date: Date): ISODateTime;
export function toISODateTime(date: null | undefined): null;
export function toISODateTime(
  date: Date | string | null | undefined,
): ISODateTime | null;

export function toISODateTime(
  date: Date | string | null | undefined,
): ISODateTime | null {
  if (typeof date === 'string') {
    date = new Date(date);
    if (isNaN(date.getTime())) {
      date = undefined;
    }
  }
  return date ? (date.toISOString().substring(0, 19) as ISODateTime) : null;
}
