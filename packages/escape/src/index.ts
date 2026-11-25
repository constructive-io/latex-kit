/**
 * Escape plain text so it can be placed inside a LaTeX document and print
 * exactly as written.
 *
 * Output assumes a Unicode engine (LuaLaTeX or XeLaTeX, `TU` encoding) or
 * pdfLaTeX with `\usepackage[T1]{fontenc}`. Non-ASCII characters pass through
 * unchanged; the engine and fonts are responsible for them.
 */

export type NewlineMode = 'space' | 'linebreak' | 'paragraph' | 'error';
export type ControlCharMode = 'error' | 'strip';

export interface EscapeOptions {
  /**
   * What to do with line breaks in the input.
   * - `space` (default): each run of line breaks becomes one space
   * - `linebreak`: `\newline{}` (forced line break inside a paragraph)
   * - `paragraph`: a blank line becomes a paragraph break, a single line
   *   break becomes `\newline{}`
   * - `error`: throw
   */
  newlines?: NewlineMode;
  /**
   * What to do with ASCII control characters other than tab and line breaks.
   * Default `error`, so bad input is never changed silently.
   */
  controlChars?: ControlCharMode;
}

export class LatexEscapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LatexEscapeError';
  }
}

const SPECIALS: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '%': '\\%',
  _: '\\_',
  '^': '\\textasciicircum{}',
  '~': '\\textasciitilde{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
  '|': '\\textbar{}',
  // a bracket right after \\ or an optional-argument macro would be read as
  // an argument; grouping it makes it plain text everywhere
  '[': '{[}',
  ']': '{]}',
  // Intl number and currency formats use these; many fonts lack U+202F, so
  // use TeX's own non-breaking spaces instead of trusting the glyph
  '\u00A0': '~',
  '\u202F': '\\,',
};

// `-(?=-)` splits the -- and --- ligatures so "A--B" stays two hyphens. An
// empty group (`-{}-`) is not enough under LuaLaTeX, where the font's TeX
// ligatures still join the hyphens; a zero kern stops them in every engine.
const SPECIAL_RE = /[\\{}$&#%_^~<>|[\]\u00A0\u202F]|-(?=-)/g;
const CONTROL_CHARS = '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]';
const CONTROL_ONE = new RegExp(CONTROL_CHARS);
const CONTROL_ALL = new RegExp(CONTROL_CHARS, 'g');

function escapeLine(line: string): string {
  return line.replace(SPECIAL_RE, (ch) => (ch === '-' ? '-\\kern0pt' : SPECIALS[ch]));
}

/** Escape a plain-text value for LaTeX. */
export function escapeLatex(input: string, options: EscapeOptions = {}): string {
  if (typeof input !== 'string') {
    throw new LatexEscapeError(`escapeLatex expects a string, got ${typeof input}`);
  }
  const newlines = options.newlines ?? 'space';
  const controlChars = options.controlChars ?? 'error';

  let text = input.replace(/\r\n?/g, '\n').replace(/\t/g, ' ');

  const control = CONTROL_ONE.exec(text);
  if (control) {
    if (controlChars === 'error') {
      const code = control[0].charCodeAt(0);
      throw new LatexEscapeError(
        `control character U+${code.toString(16).toUpperCase().padStart(4, '0')} in input`
      );
    }
    text = text.replace(CONTROL_ALL, '');
  }

  if (!text.includes('\n')) return escapeLine(text);

  switch (newlines) {
  case 'error':
    throw new LatexEscapeError('line break in input (newlines: "error")');
  case 'space':
    return escapeLine(text.replace(/\s*\n\s*/g, ' '));
  case 'linebreak':
    return text
      .split(/\n+/)
      .map((l) => escapeLine(l.trim()))
      .filter((l) => l.length > 0)
      .join('\\newline{}');
  case 'paragraph':
    return text
      .split(/\n\s*\n/)
      .map((para) =>
        para
          .split('\n')
          .map((l) => escapeLine(l.trim()))
          .filter((l) => l.length > 0)
          .join('\\newline{}')
      )
      .filter((p) => p.length > 0)
      .join('\n\n');
  }
}

/** LaTeX that is inserted as-is by {@link tex}. Use sparingly. */
export class RawLatex {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

/** Mark a string as trusted LaTeX so {@link tex} does not escape it. */
export function raw(value: string): RawLatex {
  return new RawLatex(value);
}

export type TexValue = string | number | bigint | RawLatex;

/**
 * Tagged template: the literal parts are LaTeX, every interpolated value is
 * escaped unless wrapped in {@link raw}. `null`, `undefined`, booleans and
 * objects throw, so a missing value can never print as "undefined".
 *
 *     tex`Dear ${name},\\[1em] Total: ${raw('\\textbf{')}${total}${raw('}')}`
 */
export function tex(strings: TemplateStringsArray, ...values: TexValue[]): RawLatex {
  let out = strings[0];
  values.forEach((value, i) => {
    out += interpolate(value, i) + strings[i + 1];
  });
  return new RawLatex(out);
}

function interpolate(value: unknown, index: number): string {
  if (value instanceof RawLatex) return value.value;
  if (typeof value === 'string') return escapeLatex(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new LatexEscapeError(`tex value #${index} is ${value}`);
    }
    return escapeLatex(String(value));
  }
  if (typeof value === 'bigint') return String(value);
  const kind = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  throw new LatexEscapeError(`tex value #${index} is ${kind}; pass a string, number or raw()`);
}
