/** A JSON Schema node, loosely typed: only the keywords the walker needs. */
export type JsonSchema =
  | boolean
  | {
      $ref?: string;
      $defs?: Record<string, JsonSchema>;
      definitions?: Record<string, JsonSchema>;
      type?: string | string[];
      properties?: Record<string, JsonSchema>;
      additionalProperties?: JsonSchema;
      items?: JsonSchema | JsonSchema[];
      prefixItems?: JsonSchema[];
      anyOf?: JsonSchema[];
      oneOf?: JsonSchema[];
      allOf?: JsonSchema[];
      [key: string]: unknown;
    };

/** "anything goes" from here down: no further checking is possible. */
export const ANY: JsonSchema = true;

function deref(node: JsonSchema, root: JsonSchema, depth = 0): JsonSchema {
  if (typeof node === 'boolean' || !node.$ref || depth > 32) return node;
  const m = /^#\/(\$defs|definitions)\/(.+)$/.exec(node.$ref);
  if (!m || typeof root === 'boolean') return ANY;
  const table = root[m[1] as '$defs' | 'definitions'];
  const target = table?.[decodeURIComponent(m[2]).replace(/~1/g, '/').replace(/~0/g, '~')];
  return target === undefined ? ANY : deref(target, root, depth + 1);
}

function variants(node: JsonSchema): JsonSchema[] | null {
  if (typeof node === 'boolean') return null;
  return node.anyOf ?? node.oneOf ?? null;
}

function isPermissive(node: JsonSchema): boolean {
  if (node === true) return true;
  if (node === false) return false;
  const keys = Object.keys(node).filter((k) => !['$schema', 'description', 'title', 'default', 'examples', '$id'].includes(k));
  return keys.length === 0;
}

/**
 * The sub-schema at `segments`, or `undefined` when the path cannot exist.
 * Unions are walked branch by branch; a path is valid if any branch has it.
 */
export function schemaAt(node: JsonSchema, segments: string[], root: JsonSchema = node): JsonSchema | undefined {
  node = deref(node, root);
  if (segments.length === 0) return node;
  if (typeof node === 'boolean') return node ? ANY : undefined;
  if (isPermissive(node)) return ANY;

  const alts = variants(node);
  if (alts) {
    const found = alts.map((a) => schemaAt(a, segments, root)).filter((x): x is JsonSchema => x !== undefined);
    if (found.length === 0) return undefined;
    return found.length === 1 ? found[0] : { anyOf: found };
  }
  if (node.allOf) {
    for (const part of node.allOf) {
      const found = schemaAt(part, segments, root);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  const [seg, ...rest] = segments;
  const types = node.type === undefined ? [] : Array.isArray(node.type) ? node.type : [node.type];

  if (types.includes('array') || node.items !== undefined || node.prefixItems !== undefined) {
    if (!/^\d+$/.test(seg)) return undefined;
    const i = Number(seg);
    const item = node.prefixItems?.[i] ?? (Array.isArray(node.items) ? node.items[i] : node.items) ?? ANY;
    return schemaAt(item, rest, root);
  }

  if (types.includes('object') || node.properties || node.additionalProperties !== undefined) {
    const prop = node.properties?.[seg];
    if (prop !== undefined) return schemaAt(prop, rest, root);
    const extra = node.additionalProperties;
    if (extra === undefined || extra === true) return types.includes('object') && node.properties ? undefined : ANY;
    if (extra === false) return undefined;
    return schemaAt(extra, rest, root);
  }

  return undefined;
}

/** The schema for one element of a list, for \each. `undefined` if not a list. */
export function itemSchema(node: JsonSchema, root: JsonSchema): JsonSchema | undefined {
  node = deref(node, root);
  if (isPermissive(node)) return ANY;
  if (typeof node === 'boolean') return undefined;
  const alts = variants(node);
  if (alts) {
    const found = alts.map((a) => itemSchema(a, root)).filter((x): x is JsonSchema => x !== undefined);
    return found.length === 0 ? undefined : found.length === 1 ? found[0] : { anyOf: found };
  }
  const types = node.type === undefined ? [] : Array.isArray(node.type) ? node.type : [node.type];
  if (types.includes('array') || node.items !== undefined) {
    return Array.isArray(node.items) ? ANY : (node.items ?? ANY);
  }
  if (types.length > 0) return undefined; // a known non-list type
  return ANY;
}
