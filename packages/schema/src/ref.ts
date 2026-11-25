import { existsSync } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';

import { DATA_EXTENSIONS, loadFile } from './load';

/** A pointer to a shared record: `{ "$ref": "people/avery" }`. */
export interface Ref {
  $ref: string;
}

/** Point at a shared record in the data folder, e.g. `ref('people/avery')`. */
export function ref(id: string): Ref {
  return { $ref: id };
}

export function isRef(value: unknown): value is Ref {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as Ref).$ref === 'string'
  );
}

/** A plain `{}` object, also when it was created in another realm (vm, jest). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (Object.prototype.toString.call(v) !== '[object Object]') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

export class RefError extends Error {
  constructor(
    message: string,
    readonly at: string
  ) {
    super(message);
    this.name = 'RefError';
  }
}

export interface ResolveOptions {
  /** Folder that holds shared records: `<dataDir>/<collection>/<id>.json`. */
  dataDir: string;
  load?: (file: string) => Promise<unknown>;
}

/** Find the file for `people/avery` (or `people:avery`). */
export function refFile(id: string, dataDir: string): string | null {
  const norm = id.replace(':', '/');
  if (!/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_.-]+)+$/.test(norm) || norm.split('/').includes('..')) {
    throw new RefError(`invalid reference "${id}" (use collection/id, like people/avery)`, id);
  }
  const base = resolve(dataDir, norm);
  const rel = relative(resolve(dataDir), base);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new RefError(`reference "${id}" leaves the data folder`, id);
  for (const ext of DATA_EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

/**
 * Replace every `{ "$ref": "collection/id" }` with the record it names,
 * recursively. Returns the resolved value and every file it read.
 */
export async function resolveRefs(value: unknown, options: ResolveOptions): Promise<{ value: unknown; files: string[] }> {
  const load = options.load ?? loadFile;
  const files = new Set<string>();
  const cache = new Map<string, unknown>();

  const walk = async (v: unknown, path: string, stack: string[]): Promise<unknown> => {
    if (isRef(v)) {
      const id = v.$ref.replace(':', '/');
      if (stack.includes(id)) throw new RefError(`reference cycle: ${[...stack, id].join(' → ')}`, path);
      const file = refFile(id, options.dataDir);
      if (!file) throw new RefError(`${path}: no record for "${v.$ref}" in ${join(options.dataDir, id)}.{json,yaml,ts,…}`, path);
      files.add(file);
      if (!cache.has(file)) cache.set(file, await load(file));
      return walk(cache.get(file), path, [...stack, id]);
    }
    if (Array.isArray(v)) return Promise.all(v.map((x, i) => walk(x, `${path}.${i}`, stack)));
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = await walk(x, path ? `${path}.${k}` : k, stack);
      return out;
    }
    return v;
  };

  const resolved = await walk(value, '', []);
  return { value: resolved, files: [...files] };
}
