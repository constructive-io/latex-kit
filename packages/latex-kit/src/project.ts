import { DATA_EXTENSIONS, JsonSchema, loadTemplateSchema, TemplateMeta, toJsonSchema, z } from '@latex-kit/schema';
import { CompiledTemplate, compileTemplate } from '@latex-kit/template';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'path';

import { loadConfig, ResolvedConfig } from './config';

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

  private constructor(
    readonly root: string,
    readonly config: ResolvedConfig
  ) {}

  static async open(root: string = process.cwd()): Promise<Project> {
    const abs = resolve(root);
    return new Project(abs, await loadConfig(abs));
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

  /** Absolute paths of every snippet loaded so far. */
  snippetFiles(): string[] {
    return [...this.snippets.keys()];
  }
}
