import { RawLatex } from '@latex-kit/escape';
import type { ComponentContext } from '@latex-kit/template';

/**
 * Signature blocks for every party in a list, two side by side:
 * `\component{signatures}{parties}`. A single party works too.
 */
export function signatures(value: unknown, ctx: ComponentContext): RawLatex {
  if (ctx.variant === 'blank') {
    const one = ctx.signature(undefined, `${ctx.path || 'parties'}.0`).value;
    return new RawLatex(`\\par\\noindent ${one}\\hfill ${ctx.signature(undefined, `${ctx.path || 'parties'}.1`).value}\\par`);
  }
  const list = Array.isArray(value) ? value : value === undefined || value === null ? null : [value];
  if (!list) return ctx.missing(ctx.path || 'parties');
  const blocks = list.map((p, i) => ctx.signature(p, Array.isArray(value) ? `${ctx.path}.${i}` : ctx.path).value);
  let out = '';
  for (let i = 0; i < blocks.length; i += 2) {
    out += `\\par\\noindent ${blocks[i]}${blocks[i + 1] ? `\\hfill ${blocks[i + 1]}` : ''}\\par`;
    if (i + 2 < blocks.length) out += '\\vspace{2em}';
  }
  return new RawLatex(out);
}
