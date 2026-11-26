import { detectEngine, Engine, EngineChoice, gitCommitTime, render, RenderError, RenderResult } from '@latex-kit/render';
import { loadDocument, mintDocId, validate, writeDocId } from '@latex-kit/schema';
import {
  BlankStyle,
  diag,
  Diagnostic,
  evaluateTemplate,
  hasErrors,
  LATEX_KIT_STY,
  SignerInfo,
  Variant,
  wrapDocument,
} from '@latex-kit/template';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, extname, isAbsolute, join, posix, relative, resolve, sep } from 'path';

import { writeFormJson } from './form';
import { Project, Template } from './project';

export interface BuildOptions {
  variant?: Variant;
  /** Fail on missing values even in drafts. Default: on when CI=true. */
  strict?: boolean;
  /** Default: the template's, the config's, else `auto`. */
  engine?: EngineChoice;
  /** Build in this locale instead of the record's; the output name gets `-<locale>`. */
  locale?: string;
  /** Rebuild even when the cached PDF matches every input. */
  force?: boolean;
  /**
   * Folder of signature images for signed builds. Default: the
   * LATEX_KIT_SIGNATURES environment variable, then the config.
   */
  signatures?: string | null;
  backend?: 'docker' | 'local';
  image?: string;
  platform?: string | null;
  /** Build twice and fail unless the PDFs are byte-identical. */
  verify?: boolean;
  /** How blanks print in blank builds: `labelled` (default), `lines` to write on, or `names` in brackets. */
  blanks?: BlankStyle;
  /** Stop after writing the .tex (no TeX run). */
  texOnly?: boolean;
  /** Use this ID when the record has none, instead of minting one (for redlines). */
  docIdFallback?: string;
  /** Write output here instead of out/<document>/. */
  outDir?: string;
  onOutput?: (chunk: string) => void;
}

export interface BuildResult {
  name: string;
  /** The template the document uses. */
  template: string;
  variant: Variant;
  tex: string;
  pdf: string | null;
  sha256: string | null;
  docId: string | null;
  /** `<document>.form.json`: where the spots to sign or fill in landed, when the template marks any. */
  form: string | null;
  /** The ID was minted by this build and written to the record. */
  minted: boolean;
  sourceDateEpoch: number;
  reproducible: boolean;
  verified?: boolean;
  /** The engine TeX ran with (null for --tex-only). */
  engine: Engine | null;
  /** "chosen", or why `auto` picked it. */
  engineReason: string | null;
  /** The PDF was already up to date: same inputs, same image, same date. */
  cached: boolean;
  diagnostics: Diagnostic[];
}

export class BuildError extends Error {
  constructor(
    message: string,
    readonly diagnostics: Diagnostic[]
  ) {
    super(message);
    this.name = 'BuildError';
  }
}

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

function isCI(): boolean {
  return process.env.CI === 'true' || process.env.CI === '1';
}

/**
 * The build date: SOURCE_DATE_EPOCH if set, else the newest commit among
 * every input file. Same commit → same date → same PDF bytes.
 */
function buildEpoch(files: string[]): { epoch: number; reproducible: boolean } {
  const env = process.env.SOURCE_DATE_EPOCH;
  if (env && /^\d+$/.test(env.trim())) return { epoch: Number(env.trim()), reproducible: true };
  let newest = -1;
  let allCommitted = true;
  for (const f of files) {
    const t = gitCommitTime(f);
    if (t && /^\d+$/.test(t)) newest = Math.max(newest, Number(t));
    else allCommitted = false;
  }
  if (newest < 0) return { epoch: Math.floor(Date.now() / 1000), reproducible: false };
  return { epoch: newest, reproducible: allCommitted };
}

function gitShortHead(cwd: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
  } catch {
    return 'no-git';
  }
}

/** A folder name for a signer: "Avery Example" → "avery-example". */
export function signerSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const IMAGE_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'];

/** The signatures folder: option, LATEX_KIT_SIGNATURES, then config. `~` is home. */
export function signaturesDir(project: Project, option?: string | null): string | null {
  const raw = option ?? process.env.LATEX_KIT_SIGNATURES ?? project.config.signatures ?? null;
  if (!raw) return null;
  const expanded = raw === '~' || raw.startsWith('~/') ? join(homedir(), raw.slice(1)) : raw;
  return resolve(project.root, expanded);
}

/** Every file under a folder, for the cache key. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
}

const posixRel = (root: string, p: string) => relative(root, p).split(sep).join(posix.sep);

interface Job {
  project: Project;
  template: Template;
  name: string;
  variant: Variant;
  data: unknown;
  locale: string;
  docId?: string;
  signed?: Record<string, { date?: string; signature?: string }>;
  inputs: string[];
  diagnostics: Diagnostic[];
  options: BuildOptions;
  /** Set when a final build must mint an ID and store it in this record. */
  mintInto?: string;
}

async function run(job: Job): Promise<BuildResult> {
  const { project, template, variant, options } = job;
  const diagnostics = job.diagnostics;

  // 1. fill the template
  const snippets = new Set<string>();
  const loadSnippet = (name: string, from: string) => {
    const s = project.loadSnippet(name, from);
    if (s) snippets.add(resolve(s.file));
    return s;
  };
  const strict = options.strict ?? isCI();
  const files = [...job.inputs, template.texFile, ...(template.schemaFile ? [template.schemaFile] : [])];
  const { epoch, reproducible } = buildEpoch(files);

  let docId = job.docId;
  let minted = false;
  if (!docId && job.mintInto) {
    docId = mintDocId({ prefix: template.meta.docIdPrefix ?? template.name, epoch: Math.floor(Date.now() / 1000) });
    minted = true;
  }

  const outDir = options.outDir ?? join(project.outDir, job.name);
  const blanks: BlankStyle | undefined = variant === 'blank' ? (options.blanks ?? project.config.blanks) : undefined;
  // the names view is its own file, so it can sit next to the form to fill in
  const job_ = variant === 'final' ? job.name : blanks === 'names' ? `${job.name}-names` : `${job.name}-${variant}`;

  // signed builds: copy signature images next to the .tex for this build only
  const stageDir = join(outDir, 'lk-signatures');
  const staged: string[] = [];
  let signatureImage: ((s: SignerInfo) => string | null) | undefined;
  const sigDir = variant === 'signed' ? signaturesDir(project, options.signatures) : null;
  if (sigDir) {
    const at = { file: project.rel(sigDir), line: 1, column: 1 };
    if (!existsSync(sigDir)) {
      diagnostics.push(diag('error', `signatures folder not found: ${project.rel(sigDir)}`, at));
    } else {
      const inside = relative(project.root, sigDir);
      if (!inside.startsWith('..') && !isAbsolute(inside)) {
        diagnostics.push(diag('warning', 'the signatures folder is inside the project; keep signature images out of the repository', at));
      }
      signatureImage = (signer) => {
        const names = signer.image ? [signer.image] : IMAGE_EXTENSIONS.map((e) => `${signerSlug(signer.name)}${e}`);
        const found = names.find((n) => basename(n) === n && existsSync(join(sigDir, n)));
        if (!found) {
          diagnostics.push(diag('warning', `no signature image for ${signer.name} in ${project.rel(sigDir)} (looked for ${names.join(', ')}); printed /s/ ${signer.name}`, at));
          return null;
        }
        mkdirSync(stageDir, { recursive: true });
        const target = join(stageDir, found);
        copyFileSync(join(sigDir, found), target);
        if (!staged.includes(target)) staged.push(target);
        return posixRel(project.root, target);
      };
    }
  }

  try {
    return await fill();
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }

  async function fill(): Promise<BuildResult> {
    const evaluated = evaluateTemplate(template.compiled, {
      data: job.data,
      variant,
      locale: job.locale,
      docId,
      template: template.name,
      allowMissing: variant === 'draft' ? !strict : undefined,
      loadSnippet,
      loadClause: project.loadClause,
      components: project.components,
      signatureImage,
      signed: job.signed,
    });
    diagnostics.push(...evaluated.diagnostics);
    if (hasErrors(diagnostics)) throw new BuildError(`${job.name}: cannot build ${variant}`, diagnostics);

    // snippets, clauses and components count as inputs for the build date too
    const clauseFiles = evaluated.clauses.map((c) => resolve(c.file));
    const componentFiles = evaluated.components.map((n) => project.componentFiles[n]).filter((f): f is string => !!f);
    const extra = [...snippets, ...clauseFiles, ...componentFiles];
    const finalEpoch = extra.length ? buildEpoch([...files, ...extra]) : { epoch, reproducible };

    // 2. write the .tex next to latex-kit.sty
    mkdirSync(outDir, { recursive: true });
    const texPath = join(outDir, `${job_}.tex`);
    const stamp = `${new Date(finalEpoch.epoch * 1000).toISOString().slice(0, 10)} ${gitShortHead(project.root)}`;
    const tex = wrapDocument(evaluated.tex, { variant, stamp, blanks });
    writeFileSync(texPath, tex);
    writeFileSync(join(outDir, 'latex-kit.sty'), LATEX_KIT_STY);

    const result: BuildResult = {
      name: job.name,
      template: template.name,
      variant,
      tex: texPath,
      pdf: null,
      sha256: null,
      docId: docId ?? null,
      minted: false,
      sourceDateEpoch: finalEpoch.epoch,
      reproducible: finalEpoch.reproducible,
      engine: null,
      engineReason: null,
      cached: false,
      form: null,
      diagnostics,
    };
    if (options.texOnly) return result;

    // 3. render, unless the last build had exactly these inputs
    const choice: EngineChoice = options.engine ?? template.meta.engine ?? project.config.engine ?? 'auto';
    let engine: Engine;
    let engineReason: string;
    if (choice === 'auto') {
      const d = detectEngine(tex);
      engine = d.engine;
      engineReason = `auto: ${d.reason}`;
      for (const w of d.warnings) diagnostics.push(diag('warning', w, { file: template.compiled.file, line: 1, column: 1 }));
    } else {
      engine = choice;
      engineReason = 'chosen';
    }
    result.engine = engine;
    result.engineReason = engineReason;
    const backend = options.backend ?? project.config.backend ?? 'docker';
    const image = project.image(options.image);
    const platform = options.platform !== undefined ? options.platform : project.config.platform;
    const renderOpts = {
      file: texPath,
      root: project.root,
      engine,
      backend,
      image,
      platform,
      sourceDateEpoch: finalEpoch.epoch,
      texInputs: [relative(project.root, outDir) || '.', relative(project.root, template.dir) || '.'],
      onOutput: options.onOutput,
    };

    // content-addressed: the PDF depends on the .tex, the .sty, the template
    // folder (images, \\input files), signature images, the engine, the image
    // and the build date. Same key → same bytes, so the last PDF is reused.
    const keyInputs = [...filesUnder(template.dir), ...staged].map((f) => [posixRel(project.root, f), sha256(readFileSync(f))]);
    const cacheKey = sha256(
      JSON.stringify({ v: 1, tex: sha256(tex), sty: sha256(LATEX_KIT_STY), engine, backend, image: backend === 'docker' ? (image ?? 'default') : null, platform: platform ?? null, epoch: finalEpoch.epoch, inputs: keyInputs })
    );
    const manifestPath = join(outDir, `${job_}.manifest.json`);
    const formBase = join(outDir, job_);
    const pdfPath = join(outDir, `${job_}.pdf`);
    if (!options.force && !options.verify && existsSync(manifestPath) && existsSync(pdfPath)) {
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as { cacheKey?: string; pdf?: { sha256?: string } };
        const pdfSha = sha256(readFileSync(pdfPath));
        if (m.cacheKey === cacheKey && m.pdf?.sha256 === pdfSha) {
          result.pdf = pdfPath;
          result.sha256 = pdfSha;
          result.cached = true;
          result.form = existsSync(formBase + '.form.json') ? formBase + '.form.json' : null;
          return result;
        }
      } catch {
      // an unreadable manifest just means a rebuild
      }
    }

    // TeX writes marked spots to <job>.form; a file from an earlier run must not survive
    rmSync(formBase + '.form', { force: true });
    let rendered: RenderResult;
    try {
      rendered = await render({ ...renderOpts, outDir: relative(project.root, outDir) });
    } catch (e) {
      if (e instanceof RenderError) {
        throw new BuildError(`${job.name}: ${e.message}`, [
          ...diagnostics,
          ...e.diagnostics.map((d) => diag(d.severity, d.message, d.file ? { file: project.rel(join(outDir, basename(d.file))), line: d.line ?? 0, column: 0 } : undefined)),
        ]);
      }
      throw e;
    }
    result.pdf = rendered.pdf;
    result.sha256 = rendered.sha256;
    result.form = writeFormJson(formBase);

    if (options.verify) {
    // same output path: some tools (Ghostscript) hash the path into the PDF ID
      const again = await render({ ...renderOpts, outDir: relative(project.root, outDir) });
      result.verified = again.sha256 === rendered.sha256;
    }

    // 4. keep the ID: only after a successful final build
    if (minted && job.mintInto) {
      writeDocId(job.mintInto, docId!);
      result.minted = true;
    }

    // 5. manifest: what went in, what came out
    const inputFiles = [...new Set([...files, ...extra])].filter(existsSync).sort();
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          document: job.name,
          template: template.name,
          variant,
          docId: docId ?? null,
          locale: job.locale,
          engine,
          engineReason,
          image: rendered.image,
          cacheKey,
          sourceDateEpoch: finalEpoch.epoch,
          inputs: inputFiles.map((f) => ({ file: relative(project.root, f), sha256: sha256(readFileSync(f)) })),
          tex: { file: relative(project.root, texPath), sha256: sha256(tex) },
          pdf: { file: relative(project.root, rendered.pdf), sha256: rendered.sha256 },
          clauses: evaluated.clauses.map((c) => ({ id: c.id, version: c.version ?? null, file: relative(project.root, resolve(c.file)) })),
          components: evaluated.components,
          fields: evaluated.fields.map((f) => ({ path: f.path, missing: f.missing })),
          // which signers had an image; never the images or where they live
          signatureImages: staged.map((f) => basename(f)),
        },
        null,
        2
      ) + '\n'
    );
    return result;
  }
}

/** Build one document record. */
export async function buildDocument(project: Project, file: string, options: BuildOptions = {}): Promise<BuildResult> {
  const variant = options.variant ?? 'draft';
  const diagnostics: Diagnostic[] = [];
  const doc = await loadDocument(file, { dataDir: project.dataDir });
  const template = await project.template(doc.record.template);
  const at = { file: project.rel(file), line: 1, column: 1 };

  let data = doc.data;
  if (template.schema) {
    const v = validate(template.schema, doc.data);
    if (v.ok) {
      data = v.value;
    } else {
      const sev = variant === 'final' || variant === 'signed' ? 'error' : 'warning';
      for (const i of v.issues) diagnostics.push(diag(sev, `data.${i.path}: ${i.message}`, at));
    }
  }

  const needsId = (variant === 'final' || variant === 'signed') && !doc.record.docId && !options.docIdFallback;
  if (needsId && !['.json', '.yaml', '.yml'].includes(extname(file).toLowerCase())) {
    const suggestion = mintDocId({ prefix: template.meta.docIdPrefix ?? template.name, epoch: Math.floor(Date.now() / 1000) });
    diagnostics.push(diag('error', `a ${variant} build needs a document ID, and latex-kit does not edit code. Add: docId: '${suggestion}'`, at));
    throw new BuildError(`${doc.record.template}: no document ID`, diagnostics);
  }

  const natural = doc.record.locale ?? template.meta.locale ?? project.config.locale;
  const name = project.documentName(file);
  return run({
    project,
    template,
    // another language is another PDF, next to the usual one
    name: options.locale && options.locale !== natural ? `${name}-${options.locale}` : name,
    variant,
    data,
    locale: options.locale ?? natural,
    docId: doc.record.docId ?? options.docIdFallback,
    signed: doc.record.signed,
    inputs: [file, ...doc.refFiles],
    diagnostics,
    options,
    mintInto: needsId ? file : undefined,
  });
}

/** Build a template as a blank form, without a record. */
export async function buildBlank(project: Project, templateName: string, options: BuildOptions = {}): Promise<BuildResult> {
  const template = await project.template(templateName);
  const natural = template.meta.locale ?? project.config.locale;
  return run({
    project,
    template,
    name: options.locale && options.locale !== natural ? `${templateName}-${options.locale}` : templateName,
    variant: 'blank',
    data: {},
    locale: options.locale ?? natural,
    inputs: [],
    diagnostics: [],
    options: { ...options, variant: 'blank' },
  });
}

