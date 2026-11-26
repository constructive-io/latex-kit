import { runPandoc } from '@latex-kit/render';
import { Converted, convertPlaceholders, ensureLatexKitPackage } from '@latex-kit/template';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, extname, isAbsolute, join, relative, resolve } from 'path';

import { Project } from './project';

export interface ImportOptions {
  /** Template name. Default: the file name in kebab-case. */
  name?: string;
  /** Replace an existing template. */
  force?: boolean;
  backend?: 'docker' | 'local';
  /** Write a starter schema.ts from the fields found. Default true. */
  schema?: boolean;
}

export interface ImportResult {
  name: string;
  template: string;
  schema: string | null;
  media: string | null;
  converted: Converted[];
  skipped: Converted[];
}

export function templateNameFor(file: string): string {
  return (
    basename(file, extname(file))
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'imported'
  );
}

/** A zod schema source with every converted field as a string, nested by path. */
export function starterSchema(paths: string[]): string {
  type Tree = { [k: string]: Tree | null };
  const root: Tree = {};
  const conflicts = new Set<string>();
  for (const p of paths) {
    const segs = p.split('.');
    if (segs[0].startsWith('$')) continue;
    let node = root;
    segs.forEach((seg, i) => {
      const last = i === segs.length - 1;
      const key = /^\d+$/.test(seg) ? null : seg;
      if (key === null) return; // list indexes: leave lists to the author
      if (last) {
        if (node[key] && node[key] !== null) conflicts.add(segs.slice(0, i + 1).join('.'));
        else node[key] = null;
      } else {
        if (node[key] === null) conflicts.add(segs.slice(0, i + 1).join('.'));
        node[key] ??= {};
        node = node[key] as Tree;
      }
    });
  }
  const render = (t: Tree, indent: string): string =>
    Object.keys(t)
      .sort()
      .map((k) => {
        const name = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
        const v = t[k];
        return v === null ? `${indent}${name}: z.string(),` : `${indent}${name}: z.object({\n${render(v, indent + '  ')}\n${indent}}),`;
      })
      .join('\n');
  const note = conflicts.size ? `\n// Used both as a value and as a group, check: ${[...conflicts].join(', ')}` : '';
  return `// Starter schema written by \`latex-kit import\`: every field is a string.
// Tighten the types (numbers, dates, lists) and add the fields' rules.${note}
import { z } from 'latex-kit';

export default z.object({
${render(root, '  ')}
});
`;
}

/** Convert a document (Word, Markdown, HTML, …, or an older .tex) into a template. */
export async function importDocument(project: Project, file: string, options: ImportOptions = {}): Promise<ImportResult> {
  const input = resolve(file);
  if (!existsSync(input)) throw new Error(`no such file: ${file}`);
  const name = options.name ?? templateNameFor(input);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) throw new Error(`invalid template name "${name}" (use lowercase letters, digits and -)`);
  const dir = join(project.templatesDir, name);
  const target = join(dir, 'template.tex');
  if (existsSync(target) && !options.force) throw new Error(`${project.rel(target)} exists; use --force to replace it`);
  mkdirSync(dir, { recursive: true });

  let tex: string;
  let media: string | null = null;
  if (extname(input).toLowerCase() === '.tex') {
    tex = readFileSync(input, 'utf8');
  } else {
    // pandoc runs in Docker with the project mounted, so the input must be inside it
    const rel = relative(project.root, input);
    let staged: string | null = null;
    let source = input;
    if (rel.startsWith('..') || isAbsolute(rel)) {
      const stage = join(project.outDir, '.import');
      mkdirSync(stage, { recursive: true });
      staged = join(stage, basename(input));
      copyFileSync(input, staged);
      source = staged;
    }
    const mediaDir = join(dir, 'media');
    try {
      await runPandoc({ root: project.root, input: source, output: target, extractMedia: mediaDir, backend: options.backend, image: project.lock?.pandocImage });
    } finally {
      if (staged) rmSync(staged, { force: true });
    }
    tex = readFileSync(target, 'utf8');
    if (existsSync(mediaDir)) {
      media = mediaDir;
      // pandoc writes media paths relative to the project root; TeX looks in the template folder
      tex = tex.split(relative(project.root, mediaDir) + '/').join('media/');
    }
  }

  const { tex: converted, converted: fields, skipped } = convertPlaceholders(tex);
  writeFileSync(target, ensureLatexKitPackage(converted));

  let schema: string | null = null;
  const schemaFile = join(dir, 'schema.ts');
  if (options.schema !== false && fields.length > 0 && !existsSync(schemaFile)) {
    const paths = [...new Set(fields.map((f) => f.to.slice('\\field{'.length, -1)))];
    writeFileSync(schemaFile, starterSchema(paths));
    schema = schemaFile;
  }
  return { name, template: target, schema, media, converted: fields, skipped };
}
