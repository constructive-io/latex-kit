import { readFileSync } from 'fs';
import { createJiti } from 'jiti';
import { extname, join } from 'path';
import { parse as parseYaml } from 'yaml';

export const DATA_EXTENSIONS = ['.json', '.yaml', '.yml', '.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'];
const MODULE_EXTENSIONS = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'];

export class LoadError extends Error {
  constructor(
    message: string,
    readonly file: string
  ) {
    super(message);
    this.name = 'LoadError';
  }
}

let jiti: ReturnType<typeof createJiti> | null = null;
function loader() {
  // fsCache off: never write a transpile cache into the user's project
  jiti ??= createJiti(join(process.cwd(), 'latex-kit.js'), { fsCache: false, moduleCache: false, interopDefault: false });
  return jiti;
}

/** Load a TypeScript or JavaScript module and return all its exports. */
export async function loadModule(file: string): Promise<Record<string, unknown>> {
  try {
    return (await loader().import(file)) as Record<string, unknown>;
  } catch (e) {
    throw new LoadError(`could not load ${file}: ${(e as Error).message}`, file);
  }
}

/** Load a data file: JSON, YAML, or the default export of a TS/JS module. */
export async function loadFile(file: string): Promise<unknown> {
  const ext = extname(file).toLowerCase();
  if (MODULE_EXTENSIONS.includes(ext)) {
    const mod = await loadModule(file);
    if (!('default' in mod)) throw new LoadError(`${file} has no default export`, file);
    return mod.default;
  }
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new LoadError(`cannot read ${file}`, file);
  }
  try {
    if (ext === '.json') return JSON.parse(text);
    if (ext === '.yaml' || ext === '.yml') return parseYaml(text, { prettyErrors: true });
  } catch (e) {
    throw new LoadError(`${file}: ${(e as Error).message}`, file);
  }
  throw new LoadError(`unsupported data file type ${ext} (use ${DATA_EXTENSIONS.join(', ')})`, file);
}
