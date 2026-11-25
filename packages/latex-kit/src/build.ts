import { Engine, gitCommitTime, render, RenderError, RenderResult } from '@latex-kit/render';
import { loadDocument, mintDocId, validate, writeDocId } from '@latex-kit/schema';
import {
  diag,
  Diagnostic,
  evaluateTemplate,
  hasErrors,
  LATEX_KIT_STY,
  Variant,
  wrapDocument,
} from '@latex-kit/template';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, extname, join, relative, resolve } from 'path';

import { Project, Template } from './project';

export interface BuildOptions {
  variant?: Variant;
  /** Fail on missing values even in drafts. Default: on when CI=true. */
  strict?: boolean;
  engine?: Engine;
  backend?: 'docker' | 'local';
  image?: string;
  platform?: string | null;
  /** Build twice and fail unless the PDFs are byte-identical. */
  verify?: boolean;
  /** Stop after writing the .tex (no TeX run). */
  texOnly?: boolean;
  onOutput?: (chunk: string) => void;
}

export interface BuildResult {
  name: string;
  variant: Variant;
  tex: string;
  pdf: string | null;
  sha256: string | null;
  docId: string | null;
  /** The ID was minted by this build and written to the record. */
  minted: boolean;
  sourceDateEpoch: number;
  reproducible: boolean;
  verified?: boolean;
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

interface Job {
  project: Project;
  template: Template;
  name: string;
  variant: Variant;
  data: unknown;
  locale: string;
  docId?: string;
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

  const evaluated = evaluateTemplate(template.compiled, {
    data: job.data,
    variant,
    locale: job.locale,
    docId,
    template: template.name,
    allowMissing: variant === 'draft' ? !strict : undefined,
    loadSnippet,
  });
  diagnostics.push(...evaluated.diagnostics);
  if (hasErrors(diagnostics)) throw new BuildError(`${job.name}: cannot build ${variant}`, diagnostics);

  // snippets count as inputs for the build date too
  const finalEpoch = snippets.size ? buildEpoch([...files, ...snippets]) : { epoch, reproducible };

  // 2. write the .tex next to latex-kit.sty
  const outDir = join(project.outDir, job.name);
  mkdirSync(outDir, { recursive: true });
  const job_ = variant === 'final' ? job.name : `${job.name}-${variant}`;
  const texPath = join(outDir, `${job_}.tex`);
  const stamp = `${new Date(finalEpoch.epoch * 1000).toISOString().slice(0, 10)} ${gitShortHead(project.root)}`;
  const tex = wrapDocument(evaluated.tex, { variant, stamp });
  writeFileSync(texPath, tex);
  writeFileSync(join(outDir, 'latex-kit.sty'), LATEX_KIT_STY);

  const result: BuildResult = {
    name: job.name,
    variant,
    tex: texPath,
    pdf: null,
    sha256: null,
    docId: docId ?? null,
    minted: false,
    sourceDateEpoch: finalEpoch.epoch,
    reproducible: finalEpoch.reproducible,
    diagnostics,
  };
  if (options.texOnly) return result;

  // 3. render
  const engine = options.engine ?? template.meta.engine ?? project.config.engine ?? 'lualatex';
  const renderOpts = {
    file: texPath,
    root: project.root,
    engine,
    backend: options.backend ?? project.config.backend,
    image: options.image ?? project.config.image,
    platform: options.platform !== undefined ? options.platform : project.config.platform,
    sourceDateEpoch: finalEpoch.epoch,
    texInputs: [relative(project.root, outDir) || '.', relative(project.root, template.dir) || '.'],
    onOutput: options.onOutput,
  };
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

  if (options.verify) {
    const verifyDir = `${outDir}.verify`;
    const again = await render({ ...renderOpts, outDir: relative(project.root, verifyDir) });
    result.verified = again.sha256 === rendered.sha256;
    rmSync(verifyDir, { recursive: true, force: true });
  }

  // 4. keep the ID: only after a successful final build
  if (minted && job.mintInto) {
    writeDocId(job.mintInto, docId!);
    result.minted = true;
  }

  // 5. manifest: what went in, what came out
  const inputFiles = [...new Set([...files, ...snippets])].filter(existsSync).sort();
  writeFileSync(
    join(outDir, `${job_}.manifest.json`),
    JSON.stringify(
      {
        document: job.name,
        template: template.name,
        variant,
        docId: docId ?? null,
        locale: job.locale,
        engine,
        image: rendered.image,
        sourceDateEpoch: finalEpoch.epoch,
        inputs: inputFiles.map((f) => ({ file: relative(project.root, f), sha256: sha256(readFileSync(f)) })),
        tex: { file: relative(project.root, texPath), sha256: sha256(tex) },
        pdf: { file: relative(project.root, rendered.pdf), sha256: rendered.sha256 },
        fields: evaluated.fields.map((f) => ({ path: f.path, missing: f.missing })),
      },
      null,
      2
    ) + '\n'
  );
  return result;
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

  const needsId = (variant === 'final' || variant === 'signed') && !doc.record.docId;
  if (needsId && !['.json', '.yaml', '.yml'].includes(extname(file).toLowerCase())) {
    const suggestion = mintDocId({ prefix: template.meta.docIdPrefix ?? template.name, epoch: Math.floor(Date.now() / 1000) });
    diagnostics.push(diag('error', `a ${variant} build needs a document ID, and latex-kit does not edit code. Add: docId: '${suggestion}'`, at));
    throw new BuildError(`${doc.record.template}: no document ID`, diagnostics);
  }

  return run({
    project,
    template,
    name: project.documentName(file),
    variant,
    data,
    locale: doc.record.locale ?? template.meta.locale ?? project.config.locale,
    docId: doc.record.docId,
    inputs: [file, ...doc.refFiles],
    diagnostics,
    options,
    mintInto: needsId ? file : undefined,
  });
}

/** Build a template as a blank form, without a record. */
export async function buildBlank(project: Project, templateName: string, options: BuildOptions = {}): Promise<BuildResult> {
  const template = await project.template(templateName);
  return run({
    project,
    template,
    name: `${templateName}`,
    variant: 'blank',
    data: {},
    locale: template.meta.locale ?? project.config.locale,
    inputs: [],
    diagnostics: [],
    options: { ...options, variant: 'blank' },
  });
}

