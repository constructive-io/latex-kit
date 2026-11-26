import { documentJsonSchema } from '@latex-kit/schema';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';

import { FileMap, paperFiles, PaperPreset, projectFiles, templateFiles } from './boilerplates';
import { CONFIG_FILES } from './config';
import { Project } from './project';

export interface WriteResult {
  written: string[];
  skipped: string[];
}

/** Write files under `dir`. Existing files are kept unless `force`. */
export function writeFiles(dir: string, files: FileMap, force = false): WriteResult {
  const written: string[] = [];
  const skipped: string[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const file = join(dir, rel);
    if (existsSync(file) && !force) {
      skipped.push(file);
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    written.push(file);
  }
  return { written, skipped };
}

/** Scaffold a latex-kit project (or a paper) in `dir`. */
export function initProject(dir: string, options: { paper?: boolean; preset?: PaperPreset; force?: boolean; version: string }): WriteResult {
  mkdirSync(dir, { recursive: true });
  if (!options.paper && !options.force) {
    const existing = CONFIG_FILES.find((f) => existsSync(join(dir, f)));
    if (existing) throw new Error(`${join(dir, existing)} already exists; use --force to add the starter files anyway`);
  }
  return writeFiles(dir, options.paper ? paperFiles(options.preset) : projectFiles(options.version), options.force);
}

export function newTemplate(project: Project, name: string, force = false): WriteResult {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) throw new Error(`invalid template name "${name}" (use lowercase letters, digits and -)`);
  if (existsSync(join(project.templatesDir, name)) && !force) throw new Error(`template ${name} already exists`);
  const files = templateFiles(name);
  const mapped: FileMap = {};
  for (const [rel, content] of Object.entries(files)) mapped[join(project.config.templates, rel.replace(/^templates\//, ''))] = content;
  return writeFiles(project.root, mapped, force);
}

type Schema = Record<string, unknown>;

/** A placeholder value for a JSON Schema: required fields only, typed. */
export function skeleton(schema: Schema | undefined, root: Schema, depth = 0): unknown {
  if (!schema || depth > 12) return '';
  if (typeof schema.$ref === 'string') {
    const m = /^#\/(\$defs|definitions)\/(.+)$/.exec(schema.$ref);
    const target = m ? (root[m[1]] as Record<string, Schema> | undefined)?.[m[2]] : undefined;
    return skeleton(target, root, depth + 1);
  }
  if ('default' in schema) return schema.default;
  if ('const' in schema) return schema.const;
  if (Array.isArray(schema.enum)) return schema.enum[0];
  const alt = (schema.anyOf ?? schema.oneOf) as Schema[] | undefined;
  if (alt?.length) return skeleton(alt.find((a) => a.type !== 'null') ?? alt[0], root, depth + 1);
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
  case 'object': {
    const props = (schema.properties ?? {}) as Record<string, Schema>;
    const required = (schema.required ?? []) as string[];
    const out: Record<string, unknown> = {};
    for (const key of required) out[key] = skeleton(props[key], root, depth + 1);
    return out;
  }
  case 'array':
    return [];
  case 'number':
  case 'integer':
    return 0;
  case 'boolean':
    return false;
  case 'string':
    return typeof schema.pattern === 'string' && schema.pattern.includes('\\d{4}-\\d{2}-\\d{2}') ? '2026-01-01' : '';
  default:
    return '';
  }
}

/**
 * documents/<name>.json for a template: every required field with a
 * placeholder, and `$schema` pointing at the generated JSON Schema so editors
 * autocomplete and validate it.
 */
export async function newDocument(project: Project, name: string, templateName: string, force = false): Promise<WriteResult & { schemaFile: string | null }> {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) throw new Error(`invalid document name "${name}" (use lowercase letters, digits and -)`);
  const existing = existsSync(project.documentsDir) ? readdirSync(project.documentsDir).find((f) => f.replace(/\.[^.]+$/, '') === name) : undefined;
  if (existing && !force) throw new Error(`documents/${existing} already exists`);
  const template = await project.template(templateName);
  const file = join(project.documentsDir, `${name}.json`);
  let schemaFile: string | null = null;
  const record: Record<string, unknown> = {};
  if (template.jsonSchema) {
    schemaFile = join(template.dir, `${templateName}.schema.json`);
    writeFileSync(schemaFile, JSON.stringify(documentJsonSchema(templateName, template.jsonSchema), null, 2) + '\n');
    record.$schema = relative(project.documentsDir, schemaFile).split('\\').join('/');
  }
  record.template = templateName;
  record.data = template.jsonSchema ? skeleton(template.jsonSchema, template.jsonSchema) : {};
  const r = writeFiles(dirname(file), { [`${name}.json`]: JSON.stringify(record, null, 2) + '\n' }, force);
  return { ...r, schemaFile };
}
