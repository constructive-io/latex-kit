import { generateTypeScript } from 'schema-typescript';
import { z } from 'zod';

import { loadModule } from './load';

export type JsonSchema = Record<string, unknown>;

/** What a template's schema.ts may export besides its default schema. */
export interface TemplateMeta {
  /** Prefix for minted document IDs, e.g. "NDA". Default: the template name. */
  docIdPrefix?: string;
  /** Default locale for records that do not set one. */
  locale?: string;
  /** TeX engine for this template. Default: lualatex. */
  engine?: 'lualatex' | 'xelatex' | 'pdflatex';
  title?: string;
}

export interface TemplateSchema {
  schema: z.ZodType;
  meta: TemplateMeta;
}

export function isZodSchema(value: unknown): value is z.ZodType {
  return !!value && typeof value === 'object' && typeof (value as z.ZodType).safeParse === 'function' && '_zod' in value;
}

/** Load `templates/<name>/schema.ts`: a default-exported zod schema and optional `meta`. */
export async function loadTemplateSchema(file: string): Promise<TemplateSchema> {
  const mod = await loadModule(file);
  const schema = mod.default;
  if (!isZodSchema(schema)) {
    throw new Error(`${file}: the default export must be a zod schema, e.g. export default z.object({ … })`);
  }
  return { schema, meta: (mod.meta as TemplateMeta | undefined) ?? {} };
}

export interface Issue {
  path: string;
  message: string;
}

export function validate(schema: z.ZodType, value: unknown): { ok: true; value: unknown } | { ok: false; issues: Issue[] } {
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, value: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => ({ path: i.path.map(String).join('.') || '(root)', message: i.message })),
  };
}

/** JSON Schema of the data, as the record files are written (before defaults/transforms). */
export function toJsonSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as JsonSchema;
}

/** JSON Schema for a whole document record of one template, for editor autocomplete. */
export function documentJsonSchema(template: string, data: JsonSchema): JsonSchema {
  const { $schema, $defs, ...dataSchema } = data;
  return {
    $schema: $schema ?? 'https://json-schema.org/draft/2020-12/schema',
    title: `${template} document`,
    type: 'object',
    properties: {
      $schema: { type: 'string' },
      template: { const: template },
      docId: { type: 'string', description: 'Minted on the first final build; never reuse one.' },
      locale: { type: 'string', description: 'BCP 47 language tag, e.g. en-US or ja-JP.' },
      data: dataSchema,
    },
    required: ['template', 'data'],
    additionalProperties: false,
    ...($defs ? { $defs } : {}),
  };
}

/** TypeScript declarations for a template's data, named after the template. */
export function generateTypes(name: string, data: JsonSchema): string {
  const title = name.replace(/(^|[-_ /])(\w)/g, (_m, _s, c: string) => c.toUpperCase()) + 'Data';
  return generateTypeScript({ ...(data as object), title } as Parameters<typeof generateTypeScript>[0], {
    useSingleQuotes: true,
    strictTypeSafety: true,
  });
}
