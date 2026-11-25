import { isPath } from './path';

export interface FilterCall {
  name: string;
  arg?: string;
}

export interface FieldSpec {
  path: string;
  filters: FilterCall[];
}

export interface FilterContext {
  locale: string;
}

/** Value marker: the filter produced line-preserving text. */
export interface Newlines {
  newlines?: 'linebreak' | 'paragraph';
  /** `default` supplied the value, so an empty result is intended. */
  defaulted?: boolean;
}

interface FilterDef {
  arg: 'none' | 'optional' | 'required';
  /** Return an error message when the argument is invalid. */
  checkArg?: (arg: string) => string | null;
  /** `default` runs on missing values; every other filter is skipped for them. */
  onMissing?: boolean;
  apply: (value: unknown, arg: string | undefined, ctx: FilterContext, out: Newlines) => unknown;
}

export class FilterError extends Error {
  name = 'FilterError';
}

const DATE_STYLES = ['long', 'short', 'medium', 'full', 'iso'] as const;

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new FilterError(`date: expected a date like 2026-11-25, got ${JSON.stringify(value)}`);
}

function toNumber(name: string, value: unknown): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new FilterError(`${name}: expected a number, got ${JSON.stringify(value)}`);
  }
  return n;
}

function digits(name: string, arg: string | undefined): number | undefined {
  if (arg === undefined) return undefined;
  const d = Number(arg);
  if (!Number.isInteger(d) || d < 0 || d > 20) throw new FilterError(`${name}: digits must be 0–20, got ${arg}`);
  return d;
}

const digitsArg = (arg: string) => (/^\d{1,2}$/.test(arg) && Number(arg) <= 20 ? null : 'expected a number of digits (0–20)');

export const FILTERS: Record<string, FilterDef> = {
  upper: { arg: 'none', apply: (v, _a, c) => String(v).toLocaleUpperCase(c.locale) },
  lower: { arg: 'none', apply: (v, _a, c) => String(v).toLocaleLowerCase(c.locale) },
  title: {
    arg: 'none',
    apply: (v, _a, c) =>
      String(v).replace(/(^|[\s\-(])(\p{L})/gu, (_m, pre: string, ch: string) => pre + ch.toLocaleUpperCase(c.locale)),
  },
  trim: { arg: 'none', apply: (v) => String(v).trim() },
  date: {
    arg: 'optional',
    checkArg: (a) => ((DATE_STYLES as readonly string[]).includes(a) ? null : `expected one of ${DATE_STYLES.join(', ')}`),
    apply: (v, arg, c) => {
      const d = toDate(v);
      const style = (arg ?? 'long') as (typeof DATE_STYLES)[number];
      if (style === 'iso') return d.toISOString().slice(0, 10);
      return new Intl.DateTimeFormat(c.locale, { dateStyle: style, timeZone: 'UTC' }).format(d);
    },
  },
  money: {
    arg: 'optional',
    checkArg: (a) => (/^[A-Z]{3}$/.test(a) ? null : 'expected a 3-letter currency code like USD'),
    apply: (v, arg, c) => {
      let amount: unknown = v;
      let currency = arg;
      if (v && typeof v === 'object' && 'amount' in v) {
        amount = (v as { amount: unknown }).amount;
        currency = currency ?? (v as { currency?: string }).currency;
      }
      if (!currency) throw new FilterError('money: no currency (use money:USD or a { amount, currency } value)');
      return new Intl.NumberFormat(c.locale, { style: 'currency', currency }).format(toNumber('money', amount));
    },
  },
  number: {
    arg: 'optional',
    checkArg: digitsArg,
    apply: (v, arg, c) => {
      const d = digits('number', arg);
      return new Intl.NumberFormat(c.locale, d === undefined ? {} : { minimumFractionDigits: d, maximumFractionDigits: d }).format(
        toNumber('number', v)
      );
    },
  },
  percent: {
    arg: 'optional',
    checkArg: digitsArg,
    apply: (v, arg, c) => {
      const d = digits('percent', arg) ?? 0;
      return new Intl.NumberFormat(c.locale, { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(
        toNumber('percent', v)
      );
    },
  },
  words: {
    arg: 'none',
    apply: (v, _a, c) => {
      if (!c.locale.toLowerCase().startsWith('en')) throw new FilterError(`words: only English is supported (locale ${c.locale})`);
      return numberToWords(toNumber('words', v));
    },
  },
  join: {
    arg: 'optional',
    apply: (v, arg) => {
      if (!Array.isArray(v)) throw new FilterError(`join: expected a list, got ${typeof v}`);
      return v
        .map((x) => {
          if (typeof x !== 'string' && typeof x !== 'number') throw new FilterError('join: list items must be text or numbers');
          return String(x);
        })
        .join(arg ?? ', ');
    },
  },
  default: { arg: 'required', onMissing: true, apply: (v, arg) => (isMissing(v) ? arg : v) },
  lines: { arg: 'none', apply: (v, _a, _c, out) => ((out.newlines = 'linebreak'), v) },
  paragraphs: { arg: 'none', apply: (v, _a, _c, out) => ((out.newlines = 'paragraph'), v) },
};

export function isMissing(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

/** Parse the inside of \field{…}: `path | filter | filter:arg | filter:"quoted arg"`. */
export function parseFieldSpec(text: string): FieldSpec {
  const parts: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted && ch === '\\' && i + 1 < text.length) {
      cur += ch + text[++i];
      continue;
    }
    if (ch === '"') quoted = !quoted;
    if (ch === '|' && !quoted) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (quoted) throw new FilterError('unterminated quoted filter argument');
  parts.push(cur);

  const path = parts[0].trim();
  if (!isPath(path)) {
    throw new FilterError(
      path === '' ? 'empty field path' : `invalid field path "${path}" (use names and dots, like party.name or items.0.price)`
    );
  }

  const filters = parts.slice(1).map((raw) => {
    const t = raw.trim();
    const m = /^([a-z]+)(?::([\s\S]*))?$/.exec(t);
    if (!m) throw new FilterError(`invalid filter "${t}"`);
    const name = m[1];
    const def = FILTERS[name];
    if (!def) throw new FilterError(`unknown filter "${name}" (known: ${Object.keys(FILTERS).join(', ')})`);
    let arg: string | undefined = m[2]?.trim();
    if (arg !== undefined && arg.startsWith('"')) {
      if (!arg.endsWith('"') || arg.length < 2) throw new FilterError(`filter ${name}: bad quoted argument`);
      arg = arg.slice(1, -1).replace(/\\(.)/g, '$1');
    } else if (arg === '') {
      arg = undefined;
    }
    if (def.arg === 'none' && arg !== undefined) throw new FilterError(`filter ${name} takes no argument`);
    if (def.arg === 'required' && arg === undefined) throw new FilterError(`filter ${name} needs an argument, like ${name}:"…"`);
    if (arg !== undefined && def.checkArg) {
      const problem = def.checkArg(arg);
      if (problem) throw new FilterError(`filter ${name}: ${problem}`);
    }
    return arg === undefined ? { name } : { name, arg };
  });

  return { path, filters };
}

/** Run filters left to right. Missing values skip every filter except `default`. */
export function applyFilters(value: unknown, filters: FilterCall[], ctx: FilterContext): { value: unknown } & Newlines {
  const out: Newlines = {};
  let v = value;
  for (const f of filters) {
    const def = FILTERS[f.name];
    if (isMissing(v) && !def.onMissing) continue;
    if (f.name === 'default' && isMissing(v)) out.defaulted = true;
    v = def.apply(v, f.arg, ctx, out);
  }
  return { value: v, ...out };
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

/** 1200 → "one thousand two hundred". Integers only, up to the trillions. */
export function numberToWords(n: number): string {
  if (!Number.isInteger(n)) throw new FilterError(`words: expected a whole number, got ${n}`);
  if (Math.abs(n) >= 1e15) throw new FilterError(`words: ${n} is too large`);
  if (n === 0) return 'zero';
  if (n < 0) return `minus ${numberToWords(-n)}`;
  const groups: string[] = [];
  let scale = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) groups.unshift(below1000(chunk) + (SCALES[scale] ? ` ${SCALES[scale]}` : ''));
    n = Math.floor(n / 1000);
    scale++;
  }
  return groups.join(' ');
}
