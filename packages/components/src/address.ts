import { escapeLatex, RawLatex } from '@latex-kit/escape';
import type { ComponentContext } from '@latex-kit/template';

/** A postal address on separate lines: line1, line2, "City, Region Postal", country. */
export function address(value: unknown, ctx: Pick<ComponentContext, 'missing' | 'variant' | 'path'>): RawLatex {
  const p = ctx.path || 'address';
  if (ctx.variant === 'blank') return new RawLatex(`\\lkblank{${p}.line1}\\\\\n\\lkblank{${p}.city}`);
  if (!value || typeof value !== 'object') return ctx.missing(p);
  const a = value as Record<string, unknown>;
  const s = (k: string) => (typeof a[k] === 'string' && a[k] !== '' ? (a[k] as string) : undefined);
  const cityLine = [s('city'), [s('region'), s('postalCode')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const lines = [s('line1'), s('line2'), cityLine || undefined, s('country')].filter((l): l is string => !!l);
  if (lines.length === 0) return ctx.missing(p);
  return new RawLatex(lines.map((l) => escapeLatex(l)).join('\\\\\n'));
}
