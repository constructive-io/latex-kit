import { ENGINES } from '@latex-kit/render';
import { documentJsonSchema, generateTypes, loadDocument } from '@latex-kit/schema';
import { Diagnostic, formatDiagnostic, LATEX_KIT_STY, Variant, VARIANTS } from '@latex-kit/template';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import type { ParsedArgs } from 'minimist';
import { join, relative } from 'path';
import chalk from 'yanse';

import { UsageError } from './args';
import { buildBlank, buildDocument, BuildError, BuildOptions, BuildResult } from './build';
import { checkProject, templateFields } from './check';
import { version } from './commands';
import { diffDocument, diffFiles } from './diff';
import { importDocument } from './import';
import { Project } from './project';
import { initProject, newDocument, newTemplate } from './scaffold';

function printDiagnostics(ds: Diagnostic[], json: boolean) {
  if (json) return;
  for (const d of ds) console.error((d.severity === 'error' ? chalk.red : chalk.yellow)(formatDiagnostic(d)));
}

const rel = (p: string | null) => (p ? relative(process.cwd(), p) : null);

export async function buildCommand(argv: Partial<ParsedArgs>): Promise<number> {
  const variant = (argv.variant ?? (argv.final ? 'final' : 'draft')) as Variant;
  if (!VARIANTS.includes(variant)) throw new UsageError(`--variant must be one of ${VARIANTS.join(', ')}`);
  if (argv.engine && !ENGINES.includes(argv.engine)) throw new UsageError(`--engine must be one of ${ENGINES.join(', ')}`);
  const project = await Project.open(argv.root);
  const options: BuildOptions = {
    variant,
    strict: argv.strict === undefined ? undefined : Boolean(argv.strict),
    engine: argv.engine,
    backend: argv.local ? 'local' : undefined,
    image: argv.image,
    platform: argv.platform,
    verify: Boolean(argv.verify),
    texOnly: Boolean(argv['tex-only']),
  };
  const json = Boolean(argv.json);
  const log = (s: string) => !json && console.error(s);

  type Target = { label: string; run: () => Promise<BuildResult> };
  const targets: Target[] = [];
  const files = (argv._ ?? []).map(String);

  if (variant === 'blank' && files.length === 0) {
    const names = argv.template ? [String(argv.template)] : project.templateNames();
    for (const n of names) targets.push({ label: `template ${n}`, run: () => buildBlank(project, n, options) });
  } else {
    let docs = files.length ? files.map((f) => join(process.cwd(), f)) : project.documentFiles();
    for (const f of docs) if (!existsSync(f)) throw new UsageError(`no such document: ${rel(f)}`);
    if (argv.template) {
      const wanted = String(argv.template);
      const keep: string[] = [];
      for (const f of docs) if ((await loadDocument(f, { dataDir: project.dataDir })).record.template === wanted) keep.push(f);
      docs = keep;
    }
    for (const f of docs) targets.push({ label: rel(f)!, run: () => buildDocument(project, f, options) });
  }
  if (targets.length === 0) {
    log(chalk.yellow(`nothing to build (no documents in ${project.rel(project.documentsDir)}/)`));
    return 0;
  }

  const results: unknown[] = [];
  let failed = 0;
  for (const t of targets) {
    log(chalk.dim(`building ${t.label} (${variant})…`));
    try {
      const r = await t.run();
      printDiagnostics(r.diagnostics, json);
      const bad = r.verified === false;
      if (bad) failed++;
      results.push({ ...r, tex: rel(r.tex), pdf: rel(r.pdf), diagnostics: r.diagnostics.length });
      if (!json) {
        console.log(`${bad ? chalk.red('✗') : chalk.green('✓')} ${rel(r.pdf ?? r.tex)}${r.docId ? chalk.dim(`  ${r.docId}`) : ''}`);
        if (r.minted) console.log(chalk.dim(`  minted ${r.docId} and saved it in ${t.label}`));
        if (r.verified !== undefined) console.log(r.verified ? chalk.dim('  byte-identical on a second build') : chalk.red('  second build differs'));
        if (!r.reproducible) console.log(chalk.yellow('  not reproducible: some inputs are not committed, so the build date is "now"'));
      }
    } catch (e) {
      failed++;
      if (e instanceof BuildError) {
        printDiagnostics(e.diagnostics, json);
        if (!json) console.error(chalk.red(`✗ ${t.label}: ${e.message}`));
        results.push({ target: t.label, error: e.message, diagnostics: e.diagnostics });
      } else {
        if (!json) console.error(chalk.red(`✗ ${t.label}: ${(e as Error).message}`));
        results.push({ target: t.label, error: (e as Error).message });
      }
    }
  }
  if (json) console.log(JSON.stringify(results, null, 2));
  return failed ? 1 : 0;
}

export async function checkCommand(argv: Partial<ParsedArgs>): Promise<number> {
  const project = await Project.open(argv.root);
  const r = await checkProject(project);
  const errors = r.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = r.diagnostics.length - errors;
  if (argv.json) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    printDiagnostics(r.diagnostics, false);
    const summary = `${r.templates.length} template${r.templates.length === 1 ? '' : 's'}, ${r.documents.length} document${r.documents.length === 1 ? '' : 's'}: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`;
    console.log(errors ? chalk.red(`✗ ${summary}`) : `${chalk.green('✓')} ${summary}`);
  }
  return errors ? 1 : 0;
}

export async function fieldsCommand(argv: Partial<ParsedArgs>): Promise<number> {
  const name = argv._?.[0];
  if (!name) throw new UsageError('usage: latex-kit fields <template>');
  const project = await Project.open(argv.root);
  const { fields, diagnostics } = await templateFields(project, String(name));
  if (argv.json) {
    console.log(JSON.stringify(fields, null, 2));
    return 0;
  }
  printDiagnostics(diagnostics, false);
  const width = Math.max(...fields.map((f) => f.absolute.length), 4);
  for (const f of fields) {
    const filters = f.filters.length ? chalk.cyan(` | ${f.filters.join(' | ')}`) : '';
    console.log(`${f.absolute.padEnd(width)}  ${chalk.dim(f.kind.padEnd(5))}  ${chalk.dim(`${f.file}:${f.line}`)}${filters}`);
  }
  return diagnostics.some((d) => d.severity === 'error') ? 1 : 0;
}

export async function typegenCommand(argv: Partial<ParsedArgs>): Promise<number> {
  const project = await Project.open(argv.root);
  let n = 0;
  for (const name of project.templateNames()) {
    const t = await project.template(name);
    if (!t.jsonSchema) continue;
    const schemaFile = join(t.dir, `${name}.schema.json`);
    const typesFile = join(t.dir, 'types.d.ts');
    writeFileSync(schemaFile, JSON.stringify(documentJsonSchema(name, t.jsonSchema), null, 2) + '\n');
    writeFileSync(typesFile, `// Generated by latex-kit typegen from schema.ts. Do not edit.\n${generateTypes(name, t.jsonSchema)}\n`);
    console.log(`${chalk.green('✓')} ${rel(schemaFile)}  ${rel(typesFile)}`);
    n++;
  }
  if (n === 0) console.log(chalk.yellow('no templates with a schema.ts'));
  return 0;
}

export async function styCommand(argv: Partial<ParsedArgs>): Promise<number> {
  const project = await Project.open(argv.root);
  const dir = argv._?.[0] ? join(process.cwd(), String(argv._[0])) : project.templatesDir;
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'latex-kit.sty');
  writeFileSync(file, LATEX_KIT_STY);
  console.log(`${chalk.green('✓')} ${rel(file)}  (lets editors compile templates as blank previews)`);
  return 0;
}

export async function importCommand(argv: Partial<ParsedArgs>): Promise<number> {
  const file = argv._?.[0];
  if (!file) throw new UsageError('usage: latex-kit import <file.docx|.md|.html|.tex> [--name <template>] [--force]');
  const project = await Project.open(argv.root);
  const r = await importDocument(project, String(file), {
    name: argv.name,
    force: Boolean(argv.force),
    backend: argv.local ? 'local' : undefined,
    schema: argv.schema !== false,
  });
  console.log(`${chalk.green('✓')} ${rel(r.template)}`);
  if (r.media) console.log(chalk.dim(`  images in ${rel(r.media)}`));
  console.log(chalk.dim(`  ${r.converted.length} placeholder${r.converted.length === 1 ? '' : 's'} became \\field{…}`));
  for (const s of r.skipped) console.log(chalk.yellow(`  line ${s.line}: left ${s.from} as is (not a valid field path)`));
  if (r.schema) console.log(chalk.dim(`  starter schema: ${rel(r.schema)} (every field is a string; tighten it)`));
  console.log(chalk.dim(`  next: latex-kit fields ${r.name}, then latex-kit build --variant blank --template ${r.name}`));
  return 0;
}

export async function diffCommand(argv: Partial<ParsedArgs>): Promise<number> {
  const args = (argv._ ?? []).map(String);
  const variant = (argv.variant ?? 'final') as Variant;
  if (!VARIANTS.includes(variant)) throw new UsageError(`--variant must be one of ${VARIANTS.join(', ')}`);
  const project = await Project.open(argv.root);
  const options = { variant, engine: argv.engine, backend: argv.local ? ('local' as const) : undefined, image: argv.image, platform: argv.platform };
  const abs = (p: string) => join(process.cwd(), p);
  let result;
  try {
    if (args.length === 2 && !argv.against) {
      result = await diffFiles(project, abs(args[0]), abs(args[1]), options);
    } else if (args.length === 1 && argv.against) {
      result = await diffDocument(project, abs(args[0]), String(argv.against), options);
    } else {
      throw new UsageError('usage: latex-kit diff <old.tex> <new.tex>\n       latex-kit diff <document> --against <git-ref>');
    }
  } catch (e) {
    if (e instanceof BuildError) {
      printDiagnostics(e.diagnostics, Boolean(argv.json));
      console.error(chalk.red(`✗ ${e.message}`));
      return 1;
    }
    throw e;
  }
  if (argv.json) console.log(JSON.stringify({ pdf: rel(result.pdf), tex: rel(result.tex), old: rel(result.old), new: rel(result.new) }, null, 2));
  else console.log(`${chalk.green('✓')} ${rel(result.pdf)}  ${chalk.dim('(insertions underlined in blue, deletions struck through in red)')}`);
  return 0;
}

export async function initCommand(argv: Partial<ParsedArgs>): Promise<number> {
  const dir = join(process.cwd(), argv._?.[0] ? String(argv._[0]) : '.');
  const r = initProject(dir, { paper: Boolean(argv.paper), force: Boolean(argv.force), version: version() });
  for (const f of r.written) console.log(`${chalk.green('+')} ${rel(f)}`);
  for (const f of r.skipped) console.log(chalk.dim(`  kept ${rel(f)} (exists)`));
  const cd = rel(dir) === '.' ? '' : `cd ${rel(dir)} && `;
  console.log(
    argv.paper
      ? chalk.dim(`\nnext: ${cd}latex-kit render paper/main.tex --verify`)
      : chalk.dim(`\nnext: ${cd}latex-kit check && latex-kit build`)
  );
  return 0;
}

export async function newCommand(argv: Partial<ParsedArgs>): Promise<number> {
  const [kind, name] = (argv._ ?? []).map(String);
  const project = await Project.open(argv.root);
  if (kind === 'template' && name) {
    const r = newTemplate(project, name, Boolean(argv.force));
    for (const f of r.written) console.log(`${chalk.green('+')} ${rel(f)}`);
    console.log(chalk.dim(`\nnext: latex-kit new document <name> --template ${name}`));
    return 0;
  }
  if (kind === 'document' && name) {
    if (!argv.template) throw new UsageError('usage: latex-kit new document <name> --template <template>');
    const r = await newDocument(project, name, String(argv.template), Boolean(argv.force));
    for (const f of r.written) console.log(`${chalk.green('+')} ${rel(f)}`);
    if (r.schemaFile) console.log(chalk.dim(`  editors autocomplete it from ${rel(r.schemaFile)}`));
    console.log(chalk.dim(`\nnext: fill in the data, then latex-kit build ${r.written[0] ? rel(r.written[0]) : ''}`));
    return 0;
  }
  throw new UsageError('usage: latex-kit new template <name>\n       latex-kit new document <name> --template <template>');
}
