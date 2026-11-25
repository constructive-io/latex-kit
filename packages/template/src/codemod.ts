import { isPath } from './path';

export interface Converted {
  /** The token as it appeared, e.g. `@COMPANY@LEGAL_NAME@` or `{{ party.name }}`. */
  from: string;
  /** What it became, e.g. `\field{company.legalName}`. */
  to: string;
  line: number;
}

export interface ConvertResult {
  tex: string;
  converted: Converted[];
  /** Tokens that looked like placeholders but could not become a valid path. */
  skipped: Converted[];
}

/** LEGAL_NAME → legalName, COMPANY → company, already camelCase → unchanged. */
export function camelSegment(seg: string): string {
  const s = seg.replace(/\\_/g, '_');
  if (!s.includes('_') && s !== s.toUpperCase()) return s;
  const parts = s.toLowerCase().split('_').filter(Boolean);
  return parts.map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join('');
}

// @GROUP@FIELD@ with letters, digits and underscores (possibly escaped as \_ by pandoc)
const LEGACY = /@([A-Za-z](?:[A-Za-z0-9_]|\\_)*)@([A-Za-z](?:[A-Za-z0-9_]|\\_)*)@/g;
// {{ path }} as typed, or \{\{ path \}\} as pandoc escapes it
const MUSTACHE = /(?:\{\{|\\\{\\\{)\s*([^{}\\]*(?:\\_[^{}\\]*)*?)\s*(?:\}\}|\\\}\\\})/g;

function lineAt(text: string, offset: number): number {
  let n = 1;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * Turn placeholder tokens from older templates or Word documents into
 * `\field{…}`: `@GROUP@FIELD@` (the legacy generator's tokens) and
 * `{{ path }}` (common in Word/Markdown templates, also after pandoc
 * escaped it). Anything that cannot become a valid path is left alone and
 * reported.
 */
export function convertPlaceholders(tex: string): ConvertResult {
  const converted: Converted[] = [];
  const skipped: Converted[] = [];

  let out = tex.replace(LEGACY, (whole, group: string, field: string, offset: number) => {
    const path = `${camelSegment(group)}.${camelSegment(field)}`;
    const item = { from: whole, to: `\\field{${path}}`, line: lineAt(tex, offset) };
    if (!isPath(path)) {
      skipped.push(item);
      return whole;
    }
    converted.push(item);
    return item.to;
  });

  const before = out;
  out = out.replace(MUSTACHE, (whole, inner: string, offset: number) => {
    const path = inner.replace(/\\_/g, '_').trim();
    const item = { from: whole, to: `\\field{${path}}`, line: lineAt(before, offset) };
    if (!isPath(path)) {
      skipped.push(item);
      return whole;
    }
    converted.push(item);
    return item.to;
  });

  return { tex: out, converted, skipped };
}

/** Make sure a document loads latex-kit.sty, right before \begin{document}. */
export function ensureLatexKitPackage(tex: string): string {
  if (/\\usepackage\s*(?:\[[^\]]*\])?\s*\{[^}]*\blatex-kit\b[^}]*\}/.test(tex)) return tex;
  const at = tex.indexOf('\\begin{document}');
  if (at === -1) return tex;
  return `${tex.slice(0, at)}\\usepackage{latex-kit}\n${tex.slice(at)}`;
}
