import type { ComponentContext } from '@latex-kit/template';

/** `money(ctx, 1200, 'USD')` → "$1,200.00" in the record's locale. Plain text. */
export function money(ctx: ComponentContext, value: unknown, currency?: string): string {
  return ctx.format(value, currency ? `money:${currency}` : 'money');
}

/** `date(ctx, '2026-11-25')` → "November 25, 2026". Styles: long, short, medium, full, iso. */
export function date(ctx: ComponentContext, value: unknown, style: 'long' | 'short' | 'medium' | 'full' | 'iso' = 'long'): string {
  return ctx.format(value, `date:${style}`);
}

/** `number(ctx, 1234.5, 2)` → "1,234.50". */
export function number(ctx: ComponentContext, value: unknown, digits?: number): string {
  return ctx.format(value, digits === undefined ? 'number' : `number:${digits}`);
}

/** `percent(ctx, 0.08)` → "8%". */
export function percent(ctx: ComponentContext, value: unknown, digits?: number): string {
  return ctx.format(value, digits === undefined ? 'percent' : `percent:${digits}`);
}

/** Read `a.b.0.c` from an object; undefined when any step is missing. */
export function get(obj: unknown, path: string): unknown {
  let v = obj;
  for (const seg of path.split('.')) {
    if (v === null || typeof v !== 'object') return undefined;
    v = Array.isArray(v) ? (/^\d+$/.test(seg) ? v[Number(seg)] : undefined) : Object.prototype.hasOwnProperty.call(v, seg) ? (v as Record<string, unknown>)[seg] : undefined;
  }
  return v;
}
