import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';

/**
 * A spot in a built PDF for someone to fill in: where a signing or form tool
 * should put its box. Lengths are PDF points (1/72 inch); `x` and `y` are the
 * box's bottom-left corner, measured from the bottom-left corner of the page.
 */
export interface FormField {
  /** signature, date, initials, text, or whatever the template called it. */
  type: string;
  /** The party that fills it in, as the template named it. */
  who: string;
  /** From 1. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** TeX's scaled points (65536 to a TeX point, 72.27 TeX points to an inch) to PDF points. */
const bp = (sp: number): number => Math.round((sp / 65536) * (72 / 72.27) * 100) / 100;

/**
 * Read what `\formfield` and `\signature` wrote while TeX ran: one line per
 * spot, `type who page x y width height raise`, lengths in scaled points.
 * Lines that are not that shape are skipped.
 */
export function parseFormFile(text: string): FormField[] {
  const fields: FormField[] = [];
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 8) continue;
    const [type, who, ...rest] = parts;
    const n = rest.map(Number);
    if (!n.every(Number.isFinite) || n[0] < 1) continue;
    const [page, x, y, width, height, raise] = n;
    fields.push({ type, who: who === '-' ? '' : who, page, x: bp(x), y: bp(y + raise), width: bp(width), height: bp(height) });
  }
  return fields;
}

/**
 * Turn `<base>.form` into `<base>.form.json`. Returns the JSON file, or null
 * when the document marked no spots (a stale JSON file is then removed).
 */
export function writeFormJson(base: string): string | null {
  const raw = `${base}.form`;
  const out = `${base}.form.json`;
  const fields = existsSync(raw) ? parseFormFile(readFileSync(raw, 'utf8')) : [];
  if (!fields.length) {
    rmSync(out, { force: true });
    return null;
  }
  writeFileSync(out, JSON.stringify(fields, null, 2) + '\n');
  return out;
}
