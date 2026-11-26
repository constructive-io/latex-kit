import { BUILTIN_COMPONENTS, ClauseDefinition } from '@latex-kit/components';
import { DATA_EXTENSIONS, JsonSchema, loadModule, loadTemplateSchema, TemplateMeta, toJsonSchema, z } from '@latex-kit/schema';
import { CompiledTemplate, compileTemplate, Component, diag, Diagnostic, isRelativeName, LoadedClause, parseClauseHeader } from '@latex-kit/template';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'path';

import { loadConfig, ResolvedConfig } from './config';
import { Lock, readLock } from './lock';

const CODE_EXTENSIONS = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'];

/** Every code file under `dir`, as [name without extension, absolute path]. */
function codeFiles(dir: string): [string, string][] {
  const out: [string, string][] = [];
  const walk = (d: string, prefix: string) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d).sort()) {
      if (name.startsWith('.') || name.startsWith('_')) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p, `${prefix}${name}/`);
      else if (CODE_EXTENSIONS.includes(extname(name)) && !name.endsWith('.d.ts')) out.push([`${prefix}${name.slice(0, -extname(name).length)}`, p]);
    }
  };
  walk(dir, '');
  return out;
}

export interface Template {
  name: string;
  dir: string;
  texFile: string;
  compiled: CompiledTemplate;
  schemaFile: string | null;
  schema: z.ZodType | null;
  jsonSchema: JsonSchema | null;
  meta: TemplateMeta;
}

const SCHEMA_FILES = ['schema.ts', 'schema.mts', 'schema.js', 'schema.mjs', 'schema.cjs'];

/** A latex-kit project: a folder with templates, data and documents. */
export class Project {
  private templates = new Map<string, Promise<Template>>();
  private snippets = new Map<string, CompiledTemplate>();
  private clauses = new Map<string, LoadedClause | null>();
  /** Clauses written in TypeScript, loaded when the project opens. */
  private codeClauses = new Map<string, LoadedClause>();
  /** Built-in components, then the project's own (which win). */
  readonly components: Record<string, Component> = { ...BUILTIN_COMPONENTS };
  /** Source files of the project's components, by name. */
  readonly componentFiles: Record<string, string> = {};
  /** Problems loading components/ and TypeScript clauses. */
  readonly codeDiagnostics: Diagnostic[] = [];

  private constructor(
    readonly root: string,
    readonly config: ResolvedConfig,
    /** latex-kit.lock, when the project has one. */
    readonly lock: Lock | null
  ) {}

  static async open(root: string = process.cwd()): Promise<Project> {
    const abs = resolve(root);
    const project = new Project(abs, await loadConfig(abs), readLock(abs));
    await project.loadCode();
    return project;
  }

  /** The Docker image to build with: --image, then config, then latex-kit.lock. */
  image(override?: string): string | undefined {
    return override ?? this.config.image ?? this.lock?.image;
  }

  private async loadCode(): Promise<void> {
    for (const [name, file] of codeFiles(this.path(this.config.components))) {
      const at = { file: this.rel(file), line: 1, column: 1 };
      this.componentFiles[name] = file;
      try {
        const mod = await loadModule(file);
        const fn = mod.default;
        if (typeof fn !== 'function') throw new Error('the default export must be a component function (use defineComponent)');
        this.components[name] = fn as Component;
      } catch (e) {
        this.codeDiagnostics.push(diag('error', `component ${name}: ${(e as Error).message}`, at));
        const message = (e as Error).message;
        this.components[name] = () => {
          throw new Error(`failed to load: ${message}`);
        };
      }
    }
    for (const [id, file] of codeFiles(this.path(this.config.clauses))) {
      const at = { file: this.rel(file), line: 1, column: 1 };
      try {
        const mod = await loadModule(file);
        const def = mod.default as ClauseDefinition | undefined;
        if (!def || typeof def !== 'object' || (typeof def.body !== 'string' && typeof def.render !== 'function')) {
          throw new Error('the default export must be defineClause({ title, version, body | render })');
        }
        this.codeClauses.set(id, {
          id,
          title: def.title,
          version: def.version === undefined ? undefined : String(def.version),
          template: compileTemplate(def.body ?? '', this.rel(file)),
          render: def.render,
        });
      } catch (e) {
        this.codeDiagnostics.push(diag('error', `clause ${id}: ${(e as Error).message}`, at));
      }
    }
  }

  /** Names \\component can use. */
  componentNames(): string[] {
    return Object.keys(this.components).sort();
  }

  path(...parts: string[]): string {
    return join(this.root, ...parts);
  }

  rel(file: string): string {
    return relative(process.cwd(), file) || '.';
  }

  get templatesDir(): string {
    return this.path(this.config.templates);
  }
  get dataDir(): string {
    return this.path(this.config.data);
  }
  get documentsDir(): string {
    return this.path(this.config.documents);
  }
  get outDir(): string {
    return this.path(this.config.out);
  }

  /** Template names: folders under templates/ that contain template.tex. */
  templateNames(): string[] {
    if (!existsSync(this.templatesDir)) return [];
    return readdirSync(this.templatesDir)
      .filter((n) => !n.startsWith('.') && !n.startsWith('_'))
      .filter((n) => existsSync(join(this.templatesDir, n, 'template.tex')))
      .sort();
  }

  /** Document record files under documents/ (any depth). */
  documentFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir).sort()) {
        if (name.startsWith('.') || name.startsWith('_')) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (DATA_EXTENSIONS.includes(extname(name).toLowerCase()) && !name.endsWith('.d.ts')) out.push(p);
      }
    };
    walk(this.documentsDir);
    return out;
  }

  /** A document's name: its path under documents/ without extension, `/` → `-`. */
  documentName(file: string): string {
    const rel = relative(this.documentsDir, file);
    const base = rel.startsWith('..') || isAbsolute(rel) ? basename(file) : rel;
    return base.slice(0, -extname(base).length).split(/[\\/]/).join('-');
  }

  template(name: string): Promise<Template> {
    let t = this.templates.get(name);
    if (!t) {
      t = this.loadTemplate(name);
      this.templates.set(name, t);
    }
    return t;
  }

  private async loadTemplate(name: string): Promise<Template> {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`invalid template name "${name}"`);
    const dir = join(this.templatesDir, name);
    const texFile = join(dir, 'template.tex');
    if (!existsSync(texFile)) {
      const known = this.templateNames();
      throw new Error(`no template "${name}" (expected ${this.rel(texFile)}${known.length ? `; templates: ${known.join(', ')}` : ''})`);
    }
    const compiled = compileTemplate(readFileSync(texFile, 'utf8'), this.rel(texFile));
    const schemaFile = SCHEMA_FILES.map((f) => join(dir, f)).find((f) => existsSync(f)) ?? null;
    let schema: z.ZodType | null = null;
    let meta: TemplateMeta = {};
    let jsonSchema: JsonSchema | null = null;
    if (schemaFile) {
      ({ schema, meta } = await loadTemplateSchema(schemaFile));
      jsonSchema = toJsonSchema(schema);
    }
    return { name, dir, texFile, compiled, schemaFile, schema, jsonSchema, meta };
  }

  /**
   * \snippet{name}: first next to the file that uses it, then in snippets/.
   * `.tex` is added when the name has no extension. Never outside the project.
   */
  loadSnippet = (name: string, from: string): CompiledTemplate | null => {
    const file = name.endsWith('.tex') ? name : `${name}.tex`;
    const candidates = [resolve(dirname(resolve(from)), file), join(this.path(this.config.snippets), file)];
    for (const c of candidates) {
      const rel = relative(this.root, c);
      if (rel.startsWith('..') || isAbsolute(rel) || !existsSync(c)) continue;
      let compiled = this.snippets.get(c);
      if (!compiled) {
        compiled = compileTemplate(readFileSync(c, 'utf8'), this.rel(c));
        this.snippets.set(c, compiled);
      }
      return compiled;
    }
    return null;
  };

  /** \\clause{id}: `clauses/<id>.tex` (or `.ts`) from the clause library. */
  loadClause = (id: string): LoadedClause | null => {
    if (this.clauses.has(id)) return this.clauses.get(id)!;
    let loaded: LoadedClause | null = null;
    const file = join(this.path(this.config.clauses), `${id}.tex`);
    if (isRelativeName(id) && existsSync(file)) {
      const text = readFileSync(file, 'utf8');
      loaded = { id, template: compileTemplate(text, this.rel(file)), ...parseClauseHeader(text) };
    } else if (this.codeClauses.has(id)) {
      loaded = this.codeClauses.get(id)!;
    }
    this.clauses.set(id, loaded);
    return loaded;
  };

  /** Absolute paths of every snippet loaded so far. */
  snippetFiles(): string[] {
    return [...this.snippets.keys()];
  }
}
