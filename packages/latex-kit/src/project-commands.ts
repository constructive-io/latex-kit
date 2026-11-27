import { ENGINES } from '@latex-kit/render';
import { documentJsonSchema, generateTypes, loadDocument } from '@latex-kit/schema';
import { BLANK_STYLES, Diagnostic, formatDiagnostic, LATEX_KIT_STY, Variant, VARIANTS } from '@latex-kit/template';
import { existsSync, mkdirSync, rmSync, watch as fsWatch, writeFileSync } from 'fs';
import type { ParsedArgs } from 'minimist';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import chalk from 'yanse';

import { UsageError } from './args';
import { PAPER_PRESETS, PaperPreset } from './boilerplates';
import { buildBlank, buildDocument, BuildError, BuildOptions, BuildResult } from './build';
import { checkProject, templateFields } from './check';
import { version } from './commands';
import { diffDocument, diffFiles } from './diff';
import { importDocument } from './import';
import { currentPins, LOCK_FILE, writeLock } from './lock';
import { Project } from './project';
import { initProject, newDocument, newTemplate } from './scaffold';
import { findPnpmWorkspace, scaffoldStarter, STARTER_REPO, STARTERS } from './starter';

function printDiagnostics(ds: Diagnostic[], json: boolean) {
  if (json) return;
  for (const d of ds) console.error((d.severity === 'error' ? chalk.red : chalk.yellow)(formatDiagnostic(d)));
}

const rel = (p: string | null) => (p ? relative(process.cwd(), p) : null);

/** `--only nda-*,invoice-0001`: comma-separated names, * matches anything. */
export function onlyMatcher(only: unknown): ((name: string) => boolean) | null {
  if (only === undefined || only === null || only === '' || only === true) return null;
  const patterns = (Array.isArray(only) ? only : [only]).flatMap((o) => String(o).split(',')).map((p) => p.trim()).filter(Boolean);
  if (patterns.length === 0) return null;
  const res = patterns.map((p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));
  return (name) => res.some((r) => r.test(name));
}

function checkLocale(locale: unknown): string | undefined {
  if (locale === undefined) return undefined;
  try {
    return Intl.getCanonicalLocales(String(locale))[0];
  } catch {
    throw new UsageError(`--locale ${locale} is not a language tag (like en-US or ja-JP)`);
  }
}

export async function buildCommand(argv: Partial<ParsedArgs>): Promise<number> {
  const variant = (argv.variant ?? (argv.final ? 'final' : 'draft')) as Variant;
  if (!VARIANTS.includes(variant)) throw new UsageError(`--variant must be one of ${VARIANTS.join(', ')}`);
  if (argv.engine && argv.engine !== 'auto' && !ENGINES.includes(argv.engine)) throw new UsageError(`--engine must be auto or one of ${ENGINES.join(', ')}`);
  if (argv.signatures !== undefined && variant !== 'signed') throw new UsageError('--signatures only applies to --variant signed');
  if (argv.blanks !== undefined && !BLANK_STYLES.includes(argv.blanks)) throw new UsageError(`--blanks must be one of ${BLANK_STYLES.join(', ')}`);
  if (argv.blanks !== undefined && variant !== 'blank') throw new UsageError('--blanks only applies to --variant blank');
  if (argv.missing !== undefined && !['marker', 'blank'].includes(argv.missing)) throw new UsageError('--missing must be marker or blank');
  if ((argv.highlight || argv.missing !== undefined) && variant !== 'draft') throw new UsageError('--highlight and --missing only apply to drafts');
  const only = onlyMatcher(argv.only);
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
    locale: checkLocale(argv.locale),
    force: Boolean(argv.force),
    signatures: argv.signatures,
    blanks: argv.blanks,
    highlight: Boolean(argv.highlight),
    missing: argv.missing,
  };
  const json = Boolean(argv.json);
  const log = (s: string) => !json && console.error(s);

  type Target = { label: string; run: () => Promise<BuildResult> };
  const targets: Target[] = [];
  const files = (argv._ ?? []).map(String);

  if (variant === 'blank' && files.length === 0) {
    const names = (argv.template ? [String(argv.template)] : project.templateNames()).filter((n) => !only || only(n));
    for (const n of names) targets.push({ label: `template ${n}`, run: () => buildBlank(project, n, options) });
  } else {
    let docs = files.length ? files.map((f) => resolve(process.cwd(), f)) : project.documentFiles();
    for (const f of docs) if (!existsSync(f)) throw new UsageError(`no such document: ${rel(f)}`);
    if (argv.template) {
      const wanted = String(argv.template);
      const keep: string[] = [];
      for (const f of docs) if ((await loadDocument(f, { dataDir: project.dataDir })).record.template === wanted) keep.push(f);
      docs = keep;
    }
    if (only) docs = docs.filter((f) => only(project.documentName(f)));
    for (const f of docs) targets.push({ label: rel(f)!, run: () => buildDocument(project, f, options) });
  }
  if (targets.length === 0) {
    if (only) {
      log(chalk.red(`--only ${argv.only} matched nothing`));
      return 1;
    }
    log(chalk.yellow(`nothing to build (no documents in ${project.rel(project.documentsDir)}/)`));
    return 0;
  }
  for (const d of project.codeDiagnostics) printDiagnostics([d], json);

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
        const notes = [r.docId, r.cached ? 'unchanged' : null, r.engine && r.engineReason !== 'chosen' && r.engine !== 'lualatex' ? `${r.engine}, ${r.engineReason?.replace(/^auto: /, '')}` : null].filter(Boolean).join('  ');
        console.log(`${bad ? chalk.red('✗') : chalk.green('✓')} ${rel(r.pdf ?? r.tex)}${notes ? chalk.dim(`  ${notes}`) : ''}`);
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
    console.log(`${f.absolute.padEnd(width)}  ${chalk.dim(f.kind.padEnd(9))}  ${chalk.dim(`${f.file}:${f.line}`)}${filters}`);
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
  const dir = argv._?.[0] ? resolve(process.cwd(), String(argv._[0])) : project.templatesDir;
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
  const abs = (p: string) => resolve(process.cwd(), p);
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

/** Pin the TeX and pandoc images in latex-kit.lock (commit it). */
export async function lockCommand(argv: Partial<ParsedArgs>): Promise<number> {
  const project = await Project.open(argv.root);
  const pins = currentPins();
  const file = join(project.root, LOCK_FILE);
  if (argv.check) {
    if (!project.lock) {
      console.log(chalk.yellow(`no ${LOCK_FILE}: builds use this latex-kit's default image`));
      return 1;
    }
    const stale = project.lock.image !== pins.image || project.lock.pandocImage !== pins.pandocImage;
    console.log(stale ? chalk.yellow(`${rel(file)} pins older images than this latex-kit's defaults; run latex-kit lock to move them (PDF bytes will change)`) : `${chalk.green('✓')} ${rel(file)} matches this latex-kit`);
    return stale ? 1 : 0;
  }
  const { lock, previous } = writeLock(project.root);
  console.log(`${chalk.green('✓')} ${rel(file)}`);
  if (previous && previous.image !== lock.image) console.log(chalk.dim(`  image ${previous.image}\n     → ${lock.image}\n  rebuilt PDFs will differ from earlier ones`));
  else if (!previous) console.log(chalk.dim(`  image ${lock.image}`));
  else console.log(chalk.dim('  already up to date'));
  return 0;
}

/** Flags that belong to latex-kit, not to a starter's questions. */
const INIT_FLAGS = new Set(['_', 'template', 'repo', 'from-branch', 'tty', 'skills', 'force', 'paper', 'preset', 'help', 'h', 'version', 'v', 'root', 'strict', 'schema']);

/** `latex-kit init <dir> --template <starter>`: start from a template repository. */
async function initFromStarter(argv: Partial<ParsedArgs>): Promise<number> {
  const target = argv._?.[0];
  if (!target) throw new UsageError(`usage: latex-kit init <dir> --template <${Object.keys(STARTERS).join('|')}> [--repo <org/repo>]`);
  if (argv.paper) throw new UsageError('--paper and --template are two different ways to start; pick one');
  const template = String(argv.template);
  const dir = resolve(process.cwd(), String(target));
  if (template === 'module' && !findPnpmWorkspace(dirname(dir))) {
    throw new UsageError('a module goes inside a pnpm workspace. Start one first: latex-kit init <dir> --template workspace');
  }
  // any other flag answers a question the starter asks: --fullName "Ada Marsh"
  const answers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(argv)) if (!INIT_FLAGS.has(key) && typeof value !== 'boolean') answers[key] = value;
  const noTty = argv.tty === false || !process.stdin.isTTY || process.env.CI === 'true';
  let result;
  try {
    result = await scaffoldStarter({ dir, template, repo: argv.repo, branch: argv['from-branch'], answers, noTty, noSkills: argv.skills === false });
  } catch (e) {
    throw new UsageError(`could not start from ${argv.repo ?? STARTER_REPO} (${template}): ${(e as Error).message}`);
  }
  console.log(`${chalk.green('+')} ${rel(result.dir)}  ${chalk.dim(`from ${argv.repo ?? STARTER_REPO}, ${template}`)}`);
  for (const name of result.skills.installed) console.log(`${chalk.green('+')} .agents/skills/${name}  ${chalk.dim('(agent skill)')}`);
  for (const f of result.skills.failed) console.log(chalk.yellow(`  could not fetch a skill; add it with: npx skills add https://github.com/${f.source} --skill ${f.skill}`));
  console.log(result.motd ?? chalk.dim(`\nnext: cd ${rel(result.dir)} && pnpm install && pnpm check`));
  return 0;
}

export async function initCommand(argv: Partial<ParsedArgs>): Promise<number> {
  if (argv.template !== undefined || argv.repo !== undefined) return initFromStarter({ ...argv, template: argv.template ?? 'project' });
  const dir = resolve(process.cwd(), argv._?.[0] ? String(argv._[0]) : '.');
  const preset = (argv.preset ?? 'whitepaper') as PaperPreset;
  if (!PAPER_PRESETS.includes(preset)) throw new UsageError(`--preset must be one of ${PAPER_PRESETS.join(', ')}`);
  if (argv.preset && !argv.paper) throw new UsageError('--preset only applies to init --paper');
  const r = initProject(dir, { paper: Boolean(argv.paper), preset, force: Boolean(argv.force), version: version() });
  if (!argv.paper && !existsSync(join(dir, LOCK_FILE))) {
    writeLock(dir);
    r.written.push(join(dir, LOCK_FILE));
  }
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

export async function cleanCommand(argv: Partial<ParsedArgs>): Promise<number> {
  const project = await Project.open(argv.root);
  const rel = relative(project.root, project.outDir);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw new UsageError(`refusing to delete ${project.outDir}: the out folder must be inside the project`);
  if (!existsSync(project.outDir)) {
    console.log(chalk.dim(`nothing to clean (${project.rel(project.outDir)}/ does not exist)`));
    return 0;
  }
  rmSync(project.outDir, { recursive: true, force: true });
  console.log(`${chalk.green('✓')} removed ${project.rel(project.outDir)}/`);
  return 0;
}

/**
 * Rebuild when templates, snippets, clauses, data or records change. Builds
 * drafts unless --variant says otherwise; never mints IDs (use build --final).
 */
export async function watchCommand(argv: Partial<ParsedArgs>): Promise<number> {
  const variant = (argv.variant ?? 'draft') as Variant;
  if (variant === 'final' || variant === 'signed') throw new UsageError('watch builds drafts or blanks; run latex-kit build --final when you are done');
  const project = await Project.open(argv.root);
  const dirs = [project.config.templates, project.config.snippets, project.config.clauses, project.config.data, project.config.documents]
    .map((d) => project.path(d))
    .filter((d) => existsSync(d));
  if (dirs.length === 0) throw new UsageError('nothing to watch: no templates/, data/ or documents/ here');

  let running = false;
  let again = false;
  let timer: NodeJS.Timeout | null = null;
  const run = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    console.log(chalk.dim(`\n— ${new Date().toLocaleTimeString()} —`));
    try {
      await buildCommand({ ...argv, variant });
    } catch (e) {
      console.error(chalk.red((e as Error).message));
    }
    running = false;
    if (again) {
      again = false;
      void run();
    }
  };
  const schedule = (file: string | null) => {
    // generated files and editor swap files are not changes worth a build
    if (file && /(\.schema\.json|types\.d\.ts|~|\.swp)$/.test(file)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), 250);
  };

  for (const d of dirs) fsWatch(d, { recursive: true }, (_event, file) => schedule(file ? String(file) : null));
  console.log(chalk.dim(`watching ${dirs.map((d) => project.rel(d)).join(', ')} (Ctrl-C to stop)`));
  await run();
  return new Promise<number>(() => {
    // runs until interrupted
  });
}
