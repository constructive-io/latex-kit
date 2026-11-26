import { escapeLatex, RawLatex } from '@latex-kit/escape';
import type { ComponentContext } from '@latex-kit/template';

/**
 * A name or phrase in two languages, the record's language first:
 * `{ ja: '株式会社サンプル', en: 'Sample KK' }` in a ja-JP record prints
 * "株式会社サンプル (Sample KK)"; in en-US, "Sample KK (株式会社サンプル)".
 */
export function bilingual(value: unknown, ctx: Pick<ComponentContext, 'locale' | 'missing' | 'variant' | 'path'>): RawLatex {
  if (ctx.variant === 'blank') return new RawLatex(`\\lkblank{${ctx.path || 'name'}}`);
  if (typeof value === 'string') return new RawLatex(escapeLatex(value));
  if (!value || typeof value !== 'object') return ctx.missing(ctx.path || 'name');
  const entries = Object.entries(value as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '');
  if (entries.length === 0) return ctx.missing(ctx.path || 'name');
  const lang = ctx.locale.toLowerCase();
  const primary = lang.split('-')[0];
  const rank = (tag: string) => {
    const t = tag.toLowerCase();
    return t === lang ? 0 : t.split('-')[0] === primary ? 1 : 2;
  };
  const sorted = [...entries].sort((a, b) => rank(a[0]) - rank(b[0]));
  const [first, ...rest] = sorted.map(([, v]) => escapeLatex(v));
  return new RawLatex(rest.length ? `${first} (${rest.join(', ')})` : first);
}
