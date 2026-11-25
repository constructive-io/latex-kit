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
import { Project } from './project';

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
