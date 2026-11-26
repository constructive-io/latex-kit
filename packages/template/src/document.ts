import { escapeLatex } from '@latex-kit/escape';

import { Variant } from './evaluate';

export type BlankStyle = 'labelled' | 'lines' | 'names';
export const BLANK_STYLES: BlankStyle[] = ['labelled', 'lines', 'names'];

export interface WrapOptions {
  variant: Variant;
  /** Short text printed on draft pages, e.g. date and git commit. */
  stamp?: string;
  /** How blanks print: a small labelled line (default), an empty line, or the field's name in brackets. */
  blanks?: BlankStyle;
}

const USES_PACKAGE = /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{[^}]*\blatex-kit\b[^}]*\}/;

/**
 * Make a filled template ready for TeX: tell `latex-kit.sty` it is rendering
 * a document (not previewing a template) and which variant, and load the
 * package if the template did not.
 *
 * The settings go at the very start of line 1, so line numbers in TeX's
 * errors still match the generated file line for line.
 */
export function wrapDocument(tex: string, options: WrapOptions): string {
  const stamp = options.stamp ? escapeLatex(options.stamp) : '';
  const blanks = options.blanks === 'lines' ? ',blanklines' : options.blanks === 'names' ? ',blanknames' : '';
  const prefix = `\\PassOptionsToPackage{rendered,${options.variant}${blanks}}{latex-kit}\\def\\lkstamp{${stamp}}`;
  let body = tex;
  if (!USES_PACKAGE.test(body)) {
    const at = body.indexOf('\\begin{document}');
    if (at === -1) throw new Error('the template has no \\begin{document}');
    body = `${body.slice(0, at)}\\usepackage{latex-kit}${body.slice(at)}`;
  }
  return prefix + body;
}
