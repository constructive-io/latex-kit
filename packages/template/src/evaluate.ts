import { escapeLatex, LatexEscapeError, RawLatex } from '@latex-kit/escape';

import { clauseLabel, ClauseUse, LoadedClause } from './clause';
import { CompiledTemplate, Node } from './compile';
import { Component, ComponentContext, isRawLatex } from './component';
import { evaluateCondition, truthy } from './condition';
import { diag, Diagnostic, Location } from './diagnostics';
import { applyFilters, FilterError, isMissing, parseFieldSpec } from './filters';
import { splitPath } from './path';
import { signatureBlock, SignatureError, SignerInfo } from './signature';

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
  /** Resolve \clause{id} from the clause library. */
  loadClause?: (id: string) => LoadedClause | null;
  /** Components for \component{name}{path}, by name. */
  components?: Record<string, Component>;
  /**
   * Signed builds: a local signature image for a signer, as a path TeX can
   * read, or null to print `/s/ Name`.
   */
  signatureImage?: (signer: SignerInfo) => string | null;
  /** The record's `signed` map: signing date (and image) per party path. */
  signed?: Record<string, { date?: string; signature?: string }>;
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
  /** Library clauses placed in the document, in order, with versions. */
  clauses: ClauseUse[];
  /** Components the document called, by name. */
  components: string[];
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

const isRaw = isRawLatex;

export function evaluateTemplate(template: CompiledTemplate, options: EvaluateOptions): EvaluateResult {
  const variant = options.variant;
  const locale = options.locale ?? 'en-US';
  const allowMissing = variant === 'blank' || (options.allowMissing ?? variant === 'draft');
  const diagnostics: Diagnostic[] = [...template.diagnostics];
  const fields: FieldUse[] = [];
  const frames: Frame[] = [];
  const stack: string[] = [template.file];
  const clauses: ClauseUse[] = [];
  const refs: { id: string; loc: Location }[] = [];
  const usedComponents = new Set<string>();
  const signedPaths = new Set<string>();

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

  const signature = (value: unknown, path: string, loc: Location): string => {
    try {
      signedPaths.add(path);
      const signing = options.signed && Object.prototype.hasOwnProperty.call(options.signed, path) ? options.signed[path] : undefined;
      return signatureBlock(value, { variant, locale, path, signing, missing: (what) => missing(what, loc), signatureImage: options.signatureImage });
    } catch (e) {
      if (!(e instanceof SignatureError || e instanceof LatexEscapeError)) throw e;
      diagnostics.push(diag('error', `\\signature{${path}}: ${e.message}`, loc));
      return '';
    }
  };

  /** Call a component (or a TypeScript clause) and turn its result into LaTeX. */
  const callComponent = (fn: Component, value: unknown, path: string, what: string, loc: Location): string => {
    const ctx: ComponentContext = {
      variant,
      locale,
      docId: options.docId,
      template: options.template,
      data: options.data,
      path,
      format: (v, filters) => {
        const spec = parseFieldSpec(`value|${filters}`);
        return String(applyFilters(v, spec.filters, { locale }).value ?? '');
      },
      signature: (party, p = path) => new RawLatex(signature(party, p, loc)),
      missing: (w) => new RawLatex(missing(w, loc)),
    };
    try {
      const r = fn(value, ctx);
      if (r === null || r === undefined) return '';
      if (isRaw(r)) return r.value;
      if (typeof r === 'string' || typeof r === 'number') return escapeLatex(String(r));
      diagnostics.push(diag('error', `${what} returned ${typeof r}; return tex\`…\` or a string`, loc));
      return '';
    } catch (e) {
      diagnostics.push(diag('error', `${what}: ${(e as Error).message}`, loc));
      return '';
    }
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
      case 'clause': {
        const clause = options.loadClause?.(node.id) ?? null;
        if (!clause) {
          diagnostics.push(diag('error', `clause not found: ${node.id}`, node.loc));
          break;
        }
        if (stack.includes(clause.template.file)) {
          diagnostics.push(diag('error', `clause ${node.id} includes itself`, node.loc));
          break;
        }
        if (clauses.some((c) => c.id === node.id)) {
          diagnostics.push(diag('error', `clause ${node.id} is placed twice`, node.loc));
          break;
        }
        clauses.push({ id: node.id, version: clause.version, file: clause.template.file });
        diagnostics.push(...clause.template.diagnostics);
        out += `\\lkclause{${clause.title ? escapeLatex(clause.title) : ''}}{${clauseLabel(node.id)}}`;
        stack.push(clause.template.file);
        out += render(clause.template.nodes);
        if (clause.render) out += callComponent(clause.render, options.data, '', `clause ${node.id}`, node.loc);
        stack.pop();
        break;
      }
      case 'clauseref':
        refs.push({ id: node.id, loc: node.loc });
        out += `\\ref{${clauseLabel(node.id)}}`;
        break;
      case 'signature': {
        const value = variant === 'blank' ? undefined : lookup(node.path);
        fields.push({ path: node.path, ...node.loc, missing: variant !== 'blank' && isMissing(value) });
        out += signature(value, node.path, node.loc);
        break;
      }
      case 'component': {
        const fn = options.components?.[node.name];
        if (!fn) {
          const known = Object.keys(options.components ?? {}).sort();
          diagnostics.push(diag('error', `unknown component ${node.name}${known.length ? ` (known: ${known.join(', ')})` : ''}`, node.loc));
          break;
        }
        usedComponents.add(node.name);
        const value = variant === 'blank' ? undefined : node.path ? lookup(node.path) : options.data;
        if (node.path) fields.push({ path: node.path, ...node.loc, missing: variant !== 'blank' && isMissing(value) });
        out += callComponent(fn, value, node.path, `\\component{${node.name}}`, node.loc);
        break;
      }
      }
    }
    return out;
  };

  const tex = render(template.nodes);

  // a reference to a clause this document does not contain would print "??"
  for (const r of refs) {
    if (!clauses.some((c) => c.id === r.id)) {
      const msg = `\\clauseref{${r.id}}: clause ${r.id} is not in this document`;
      diagnostics.push(diag(allowMissing ? 'warning' : 'error', msg, r.loc));
    }
  }
  for (const key of Object.keys(options.signed ?? {})) {
    if (!signedPaths.has(key)) {
      diagnostics.push(diag('warning', `signed.${key}: the document has no \\signature{${key}}`, { file: template.file, line: 1, column: 1 }));
    }
  }
  return { tex, diagnostics, fields, clauses, components: [...usedComponents].sort() };
}

export { truthy };
