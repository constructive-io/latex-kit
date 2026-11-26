import { escapeLatex, RawLatex } from '@latex-kit/escape';
import { ComponentContext, isRawLatex } from '@latex-kit/template';

import { get } from './format';

export interface Column<Row = Record<string, unknown>> {
  header: string;
  /** A field of the row (`description`, `price.amount`) or a function of the row. */
  value: string | ((row: Row, index: number) => unknown);
  /** Filters, as in `\field`: `money:USD`, `number:2`, `date:short`. */
  format?: string;
  /** `l`, `c`, `r`, or `X` (takes the remaining width). Default: X for the first column, l after. */
  align?: 'l' | 'c' | 'r' | 'X';
}

export type Cell = string | number | RawLatex | null | undefined;

export interface TableOptions {
  /** Rows after the body, under a rule: totals. Strings are escaped. */
  footer?: Cell[][];
  /** Table width. Default `\linewidth`. */
  width?: string;
}

function cellTex(c: Cell): string {
  if (c === null || c === undefined) return '';
  if (isRawLatex(c)) return c.value;
  return escapeLatex(String(c));
}

/**
 * A booktabs table from a list of rows:
 *
 *     table(items, [
 *       { header: 'Description', value: 'description' },
 *       { header: 'Amount', value: 'amount', format: 'money:USD', align: 'r' },
 *     ], ctx, { footer: [['Total', money(ctx, total, 'USD')]] })
 *
 * In a blank build (no rows) it prints one row of labelled blanks.
 */
export function table<Row = Record<string, unknown>>(rows: readonly Row[] | undefined | null, columns: Column<Row>[], ctx: ComponentContext, options: TableOptions = {}): RawLatex {
  if (columns.length === 0) throw new Error('table: no columns');
  const hasX = columns.some((c) => c.align === 'X');
  const spec = columns.map((c, i) => c.align ?? (i === 0 && !hasX ? 'X' : 'l')).join('');
  const line = (cells: string[]) => `${cells.join(' & ')} \\\\\n`;

  let body = '';
  if (ctx.variant === 'blank' || !Array.isArray(rows)) {
    if (ctx.variant !== 'blank') return new RawLatex(ctx.missing(ctx.path || 'table rows').value);
    body = line(columns.map((c) => `\\lkblank{${typeof c.value === 'string' ? c.value : c.header}}`));
  } else {
    rows.forEach((row, i) => {
      body += line(
        columns.map((c) => {
          const v = typeof c.value === 'function' ? c.value(row, i) : get(row, c.value);
          if (isRawLatex(v)) return v.value;
          if (v === undefined || v === null || v === '') return '';
          return escapeLatex(c.format ? ctx.format(v, c.format) : String(v));
        })
      );
    });
  }

  let out = `\\begin{tabularx}{${options.width ?? '\\linewidth'}}{@{}${spec}@{}}\n\\toprule\n`;
  out += line(columns.map((c) => escapeLatex(c.header)));
  out += '\\midrule\n' + body;
  if (options.footer?.length) {
    out += '\\midrule\n';
    for (const r of options.footer) out += line(r.map(cellTex));
  }
  out += '\\bottomrule\n\\end{tabularx}';
  return new RawLatex(out);
}
