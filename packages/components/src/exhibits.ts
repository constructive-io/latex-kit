import { escapeLatex, RawLatex } from '@latex-kit/escape';
import { ComponentContext, isRawLatex } from '@latex-kit/template';

export interface Exhibit {
  title?: string;
  /** Plain text; blank lines separate paragraphs, single line breaks are spaces. */
  body?: string;
}

/** One exhibit: a new page headed "Exhibit A" (B, C, …), then the body. */
export function exhibit(title: string | undefined, body: RawLatex | string, label: string): RawLatex {
  const b = isRawLatex(body)
    ? body.value
    : body
      .split(/\n\s*\n/)
      .map((p) => escapeLatex(p.trim(), { newlines: 'space' }))
      .filter(Boolean)
      .join('\n\n');
  return new RawLatex(`\\lkexhibit{${title ? escapeLatex(title) : ''}}{exhibit:${label}}\n${b}\n`);
}

/**
 * `\component{exhibits}{exhibits}`: every exhibit in a list, each on its own
 * page. Items are `{ title, body }` or plain strings.
 */
export function exhibits(value: unknown, ctx: ComponentContext): RawLatex {
  if (ctx.variant === 'blank') return exhibit(undefined, new RawLatex(`\\lkblank{${ctx.path || 'exhibits'}}`), 'blank');
  if (value === undefined || value === null) return new RawLatex('');
  if (!Array.isArray(value)) throw new Error(`exhibits: expected a list, got ${typeof value}`);
  return new RawLatex(
    value
      .map((item, i) => {
        if (typeof item === 'string') return exhibit(undefined, item, String(i + 1)).value;
        const e = (item ?? {}) as Exhibit;
        return exhibit(e.title, e.body ?? '', String(i + 1)).value;
      })
      .join('')
  );
}
