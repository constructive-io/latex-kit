import { RawLatex } from '@latex-kit/escape';

/** What a component gets besides its value. */
export interface ComponentContext {
  variant: 'draft' | 'blank' | 'final' | 'signed';
  locale: string;
  docId?: string;
  template?: string;
  /** The whole record's data. */
  data: unknown;
  /** The path the template passed (`\component{name}{path}`); '' for the whole record. */
  path: string;
  /**
   * Format a value with the template filters, as `\field` does:
   * `format(1200, 'money:USD')`, `format(d, 'date:long')`. Returns plain
   * text; put it through `tex` (or escapeLatex) like any other value.
   */
  format(value: unknown, filters: string): string;
  /** The signature block `\signature` prints for a party. */
  signature(party: unknown, path?: string): RawLatex;
  /** A red "missing" marker in drafts; an error in final and signed builds. */
  missing(what: string): RawLatex;
}

/**
 * A component turns a value into LaTeX: `\component{name}{path}` in a
 * template calls it with the value at `path`. Return `tex`-tagged LaTeX
 * (inserted as is) or a plain string (escaped).
 */
export type Component = (value: unknown, ctx: ComponentContext) => RawLatex | string | number | null | undefined;

export function isRawLatex(v: unknown): v is RawLatex {
  return (
    v instanceof RawLatex ||
    (!!v && typeof v === 'object' && (v as { constructor?: { name?: string } }).constructor?.name === 'RawLatex' && typeof (v as RawLatex).value === 'string')
  );
}
