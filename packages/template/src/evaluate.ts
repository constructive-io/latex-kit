import { escapeLatex, LatexEscapeError, RawLatex } from '@latex-kit/escape';

import { CompiledTemplate, Node } from './compile';
import { evaluateCondition, truthy } from './condition';
import { diag, Diagnostic, Location } from './diagnostics';
import { applyFilters, FilterError, isMissing } from './filters';
import { splitPath } from './path';

export type Variant = 'draft' | 'blank' | 'final' | 'signed';
export const VARIANTS: Variant[] = ['draft', 'blank', 'final', 'signed'];

export interface EvaluateOptions {
  /** The record's data. */
  data: unknown;
  variant: Variant;
  locale?: string;
  docId?: string;
  template?: string;
  /**
   * Missing values print a red marker instead of failing. Defaults to true
   * for `draft`; `final` and `signed` always fail on a missing value.
   */
  allowMissing?: boolean;
  /** Resolve \snippet{name} from the file that uses it. */
  loadSnippet?: (name: string, from: string) => CompiledTemplate | null;
}

export interface FieldUse {
  path: string;
  file: string;
  line: number;
  column: number;
  missing: boolean;
}

export interface EvaluateResult {
  tex: string;
  diagnostics: Diagnostic[];
  /** Every field that was filled (or found missing), in document order. */
  fields: FieldUse[];
}

interface Frame {
  name: string;
  item: unknown;
  index: number;
  count: number;
}

function own(obj: unknown, key: string): unknown {
  if (obj === null || typeof obj !== 'object') return undefined;
  if (Array.isArray(obj)) return /^\d+$/.test(key) ? obj[Number(key)] : undefined;
  return Object.prototype.hasOwnProperty.call(obj, key) ? (obj as Record<string, unknown>)[key] : undefined;
}

function isRaw(v: unknown): v is RawLatex {
  return v instanceof RawLatex || (!!v && typeof v === 'object' && (v as { constructor?: { name?: string } }).constructor?.name === 'RawLatex' && typeof (v as RawLatex).value === 'string');
}

export function evaluateTemplate(template: CompiledTemplate, options: EvaluateOptions): EvaluateResult {
  const variant = options.variant;
  const locale = options.locale ?? 'en-US';
  const allowMissing = variant === 'blank' || (options.allowMissing ?? variant === 'draft');
  const diagnostics: Diagnostic[] = [...template.diagnostics];
  const fields: FieldUse[] = [];
  const frames: Frame[] = [];
  const stack: string[] = [template.file];

  const lookup = (path: string): unknown => {
    const [head, ...rest] = splitPath(path);
    let value: unknown;
    if (head.startsWith('$')) {
      const loop = frames[frames.length - 1];
      switch (head) {
      case '$variant':
        value = variant;
        break;
      case '$locale':
        value = locale;
        break;
      case '$docid':
        value = options.docId;
        break;
      case '$template':
        value = options.template;
        break;
      case '$index':
        value = loop ? loop.index + 1 : undefined;
        break;
      case '$first':
        value = loop ? loop.index === 0 : undefined;
        break;
      case '$last':
        value = loop ? loop.index === loop.count - 1 : undefined;
        break;
      }
    } else {
      const frame = [...frames].reverse().find((f) => f.name === head);
      value = frame ? frame.item : own(options.data, head);
    }
    for (const seg of rest) value = own(value, seg);
    return value;
  };

  const missing = (what: string, loc: Location): string => {
    if (allowMissing) {
      if (variant !== 'blank') diagnostics.push(diag('warning', `missing value for ${what}`, loc));
      return `\\lkmissing{${what}}`;
    }
    diagnostics.push(diag('error', `missing value for ${what}`, loc));
    return '';
  };

  const toTex = (value: unknown, raw: boolean, newlines: 'linebreak' | 'paragraph' | undefined, what: string, loc: Location): string => {
    if (isRaw(value)) return value.value;
    if (value instanceof Date) value = value.toISOString().slice(0, 10);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        diagnostics.push(diag('error', `${what} is ${value}`, loc));
        return '';
      }
      value = String(value);
    }
    if (typeof value === 'bigint') value = String(value);
    if (typeof value === 'string') {
      if (raw) return value;
      try {
        return escapeLatex(value, newlines ? { newlines } : {});
      } catch (e) {
        if (!(e instanceof LatexEscapeError)) throw e;
        diagnostics.push(diag('error', `${what}: ${e.message}`, loc));
        return '';
      }
    }
    const kind = typeof value === 'boolean' ? 'true/false (use \\when to test it)' : Array.isArray(value) ? 'a list (use \\each or |join)' : 'an object (pick a field inside it)';
    diagnostics.push(diag('error', `${what} is ${kind}`, loc));
    return '';
  };

  const render = (nodes: Node[]): string => {
    let out = '';
    for (const node of nodes) {
      switch (node.kind) {
      case 'text':
        out += node.text;
        break;
      case 'field': {
        const { path, filters } = node.spec;
        if (variant === 'blank') {
          fields.push({ path, ...node.loc, missing: false });
          out += `\\lkblank{${path}}`;
          break;
        }
        let result: ReturnType<typeof applyFilters>;
        try {
          result = applyFilters(lookup(path), filters, { locale });
        } catch (e) {
          if (!(e instanceof FilterError)) throw e;
          diagnostics.push(diag('error', `\\field{${node.source}}: ${e.message}`, node.loc));
          break;
        }
        const isGone = !result.defaulted && isMissing(result.value);
        fields.push({ path, ...node.loc, missing: isGone });
        out += isGone ? missing(path, node.loc) : toTex(result.value, node.raw, result.newlines, path, node.loc);
        break;
      }
      case 'docid':
        if (variant === 'blank') out += '\\lkblank{docid}';
        else if (options.docId) out += escapeLatex(options.docId);
        else out += missing('the document ID', node.loc);
        break;
      case 'when':
        if (evaluateCondition(node.cond, lookup)) out += render(node.then);
        else if (node.else) out += render(node.else);
        break;
      case 'each': {
        const list = lookup(node.path);
        if (list === undefined || list === null) {
          if (variant === 'blank') {
            frames.push({ name: node.name, item: undefined, index: 0, count: 1 });
            out += render(node.body);
            frames.pop();
          } else {
            out += missing(node.path, node.loc);
          }
          break;
        }
        if (!Array.isArray(list)) {
          diagnostics.push(diag('error', `\\each{${node.path}}: expected a list, got ${typeof list}`, node.loc));
          break;
        }
        list.forEach((item, index) => {
          frames.push({ name: node.name, item, index, count: list.length });
          out += render(node.body);
          frames.pop();
        });
        break;
      }
      case 'sep': {
        const loop = frames[frames.length - 1];
        if (loop && loop.index < loop.count - 1) out += render(node.body);
        break;
      }
      case 'snippet': {
        const from = stack[stack.length - 1];
        const snippet = options.loadSnippet?.(node.name, from) ?? null;
        if (!snippet) {
          diagnostics.push(diag('error', `snippet not found: ${node.name}`, node.loc));
          break;
        }
        if (stack.includes(snippet.file)) {
          diagnostics.push(diag('error', `snippet ${node.name} includes itself (${[...stack, snippet.file].join(' → ')})`, node.loc));
          break;
        }
        diagnostics.push(...snippet.diagnostics);
        stack.push(snippet.file);
        out += render(snippet.nodes);
        stack.pop();
        break;
      }
      }
    }
    return out;
  };

  const tex = render(template.nodes);
  return { tex, diagnostics, fields };
}

export { truthy };
