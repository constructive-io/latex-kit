import { CompiledTemplate, Node } from './compile';
import { conditionPaths } from './condition';
import { diag, Diagnostic, Location } from './diagnostics';
import { ANY, itemSchema, JsonSchema, schemaAt } from './jsonschema';
import { GLOBAL_SPECIALS, LOOP_SPECIALS, splitPath } from './path';

export interface FieldRef {
  /** How the template reads it: `field`, `raw`, `when`, `each`. */
  kind: 'field' | 'raw' | 'when' | 'each';
  /** The path as written, e.g. `item.price`. */
  path: string;
  /** The path from the data root, e.g. `items[].price`. */
  absolute: string;
  filters: string[];
  file: string;
  line: number;
  column: number;
}

export interface AnalyzeOptions {
  /** JSON Schema of the record's data. Without it only syntax is checked. */
  schema?: JsonSchema;
  loadSnippet?: (name: string, from: string) => CompiledTemplate | null;
}

export interface AnalyzeResult {
  fields: FieldRef[];
  snippets: string[];
  diagnostics: Diagnostic[];
}

interface Scope {
  name: string;
  absolute: string;
  schema: JsonSchema | undefined;
}

/**
 * Static checks for a template: every path exists in the schema, \each walks
 * a list, \raw is flagged, snippets resolve. Lists every field it reads.
 */
export function analyzeTemplate(template: CompiledTemplate, options: AnalyzeOptions = {}): AnalyzeResult {
  const root = options.schema;
  const diagnostics: Diagnostic[] = [...template.diagnostics];
  const fields: FieldRef[] = [];
  const snippets: string[] = [];
  const stack: string[] = [template.file];

  const resolve = (path: string, scopes: Scope[], loc: Location): { absolute: string; schema: JsonSchema | undefined } => {
    const [head, ...rest] = splitPath(path);
    if (head.startsWith('$')) {
      if ((LOOP_SPECIALS as readonly string[]).includes(head)) {
        if (scopes.length === 0) diagnostics.push(diag('error', `${head} only works inside \\each`, loc));
      } else if (!(GLOBAL_SPECIALS as readonly string[]).includes(head)) {
        diagnostics.push(diag('error', `unknown special value ${head} (known: ${[...GLOBAL_SPECIALS, ...LOOP_SPECIALS].join(', ')})`, loc));
      }
      if (rest.length) diagnostics.push(diag('error', `${head} has no fields`, loc));
      return { absolute: path, schema: ANY };
    }
    const scope = [...scopes].reverse().find((s) => s.name === head);
    const absolute = scope ? [scope.absolute, ...rest].join('.') : path;
    if (!root) return { absolute, schema: ANY };
    const base = scope ? scope.schema : root;
    const segs = scope ? rest : [head, ...rest];
    const found = base === undefined ? undefined : schemaAt(base, segs, root);
    if (found === undefined && base !== undefined) {
      diagnostics.push(diag('error', `unknown field ${absolute} (not in the template's schema)`, loc));
    }
    return { absolute, schema: found };
  };

  const walk = (nodes: Node[], scopes: Scope[]): void => {
    for (const node of nodes) {
      switch (node.kind) {
      case 'text':
      case 'docid':
        break;
      case 'field': {
        const { absolute } = resolve(node.spec.path, scopes, node.loc);
        fields.push({
          kind: node.raw ? 'raw' : 'field',
          path: node.spec.path,
          absolute,
          filters: node.spec.filters.map((f) => (f.arg === undefined ? f.name : `${f.name}:${f.arg}`)),
          ...node.loc,
        });
        if (node.raw) {
          diagnostics.push(diag('warning', `\\raw{${node.spec.path}} inserts LaTeX unescaped; only use it for trusted values`, node.loc));
        }
        break;
      }
      case 'when':
        for (const p of conditionPaths(node.cond)) {
          const { absolute } = resolve(p, scopes, node.loc);
          fields.push({ kind: 'when', path: p, absolute, filters: [], ...node.loc });
        }
        walk(node.then, scopes);
        if (node.else) walk(node.else, scopes);
        break;
      case 'each': {
        const { absolute, schema } = resolve(node.path, scopes, node.loc);
        fields.push({ kind: 'each', path: node.path, absolute, filters: [], ...node.loc });
        let item: JsonSchema | undefined = ANY;
        if (root && schema !== undefined) {
          item = itemSchema(schema, root);
          if (item === undefined) diagnostics.push(diag('error', `\\each{${node.path}}: ${absolute} is not a list in the schema`, node.loc));
        }
        walk(node.body, [...scopes, { name: node.name, absolute: `${absolute}[]`, schema: item }]);
        break;
      }
      case 'sep':
        walk(node.body, scopes);
        break;
      case 'snippet': {
        const from = stack[stack.length - 1];
        const snippet = options.loadSnippet?.(node.name, from) ?? null;
        if (!snippet) {
          diagnostics.push(diag('error', `snippet not found: ${node.name}`, node.loc));
          break;
        }
        if (stack.includes(snippet.file)) {
          diagnostics.push(diag('error', `snippet ${node.name} includes itself`, node.loc));
          break;
        }
        if (!snippets.includes(snippet.file)) {
          snippets.push(snippet.file);
          diagnostics.push(...snippet.diagnostics);
        }
        stack.push(snippet.file);
        walk(snippet.nodes, scopes);
        stack.pop();
        break;
      }
      }
    }
  };

  walk(template.nodes, []);
  return { fields, snippets, diagnostics };
}
