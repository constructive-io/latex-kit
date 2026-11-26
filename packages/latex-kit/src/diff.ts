import { EngineChoice, render, runLatexdiff } from '@latex-kit/render';
import { LATEX_KIT_STY, Variant } from '@latex-kit/template';
import { execFileSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join, relative } from 'path';

import { buildDocument,BuildError } from './build';
import { Project } from './project';

export interface DiffOptions {
  variant?: Variant;
  engine?: EngineChoice;
  backend?: 'docker' | 'local';
  image?: string;
  platform?: string | null;
}

export interface DiffResult {
  /** The redline PDF. */
  pdf: string;
  /** latexdiff's marked-up .tex. */
  tex: string;
  old: string;
  new: string;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** latexdiff old → new in `dir`, then render the redline. */
async function redline(project: Project, oldTex: string, newTex: string, dir: string, name: string, texInputs: string[], options: DiffOptions): Promise<DiffResult> {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'latex-kit.sty'), LATEX_KIT_STY);
  const tex = join(dir, `${name}.tex`);
  const rel = (p: string) => relative(project.root, p);
  await runLatexdiff({ root: project.root, old: rel(oldTex), new: rel(newTex), output: rel(tex), backend: options.backend, image: project.image(options.image), platform: options.platform });
  const r = await render({
    file: tex,
    root: project.root,
    outDir: rel(dir),
    engine: options.engine ?? project.config.engine ?? 'auto',
    backend: options.backend ?? project.config.backend,
    image: project.image(options.image),
    platform: options.platform !== undefined ? options.platform : project.config.platform,
    texInputs: [rel(dir), ...texInputs.map(rel)],
  });
  return { pdf: r.pdf, tex, old: oldTex, new: newTex };
}

/** Redline two .tex files inside the project. */
export async function diffFiles(project: Project, oldFile: string, newFile: string, options: DiffOptions = {}): Promise<DiffResult> {
  for (const f of [oldFile, newFile]) if (!existsSync(f)) throw new Error(`no such file: ${project.rel(f)}`);
  const name = `${basename(newFile, '.tex')}-vs-${basename(oldFile, '.tex')}`;
  const dir = join(project.outDir, 'diff', name);
  mkdirSync(dir, { recursive: true });
  // copies inside out/, so the files are always visible to Docker
  const oldCopy = join(dir, 'old.tex');
  const newCopy = join(dir, 'new.tex');
  copyFileSync(oldFile, oldCopy);
  copyFileSync(newFile, newCopy);
  return redline(project, oldCopy, newCopy, dir, name, [dirname(newFile)], options);
}

/**
 * Redline a document against an earlier commit: build it as it was at `ref`
 * (in a temporary git worktree) and as it is now, then latexdiff the two.
 */
export async function diffDocument(project: Project, file: string, ref: string, options: DiffOptions = {}): Promise<DiffResult> {
  const variant = options.variant ?? 'final';
  let top: string;
  try {
    top = git(project.root, ['rev-parse', '--show-toplevel']);
  } catch {
    throw new Error('diff --against needs the project to be in a git repository');
  }
  const relDoc = relative(top, file);
  const relProject = relative(top, project.root);
  let sha: string;
  try {
    sha = git(top, ['rev-parse', '--short', `${ref}^{commit}`]);
  } catch {
    throw new Error(`unknown git ref: ${ref}`);
  }
  try {
    git(top, ['cat-file', '-e', `${sha}:${relDoc}`]);
  } catch {
    throw new Error(`${relDoc} does not exist at ${ref}`);
  }

  const name = project.documentName(file);
  const dir = join(project.outDir, name, 'diff');
  const common = { variant, texOnly: true, strict: false, docIdFallback: 'UNASSIGNED' };

  const current = await buildDocument(project, file, { ...common, outDir: join(dir, 'new') }).catch((e) => {
    if (e instanceof BuildError) throw new BuildError(`the current ${name} does not build: ${e.message}`, e.diagnostics);
    throw e;
  });

  const tree = mkdtempSync(join(tmpdir(), 'latex-kit-diff-'));
  try {
    git(top, ['worktree', 'add', '--detach', '--quiet', tree, sha]);
    const oldProject = await Project.open(join(tree, relProject));
    const old = await buildDocument(oldProject, join(tree, relDoc), { ...common, outDir: join(dir, 'old') }).catch((e) => {
      if (e instanceof BuildError) throw new BuildError(`${name} at ${ref} (${sha}) does not build: ${e.message}`, e.diagnostics);
      throw e;
    });
    const template = await project.template(current.template);
    return await redline(project, old.tex, current.tex, dir, `${name}-vs-${sha}`, [template.dir], options);
  } finally {
    try {
      git(top, ['worktree', 'remove', '--force', tree]);
    } catch {
      rmSync(tree, { recursive: true, force: true });
      try {
        git(top, ['worktree', 'prune']);
      } catch {
        // nothing left to clean
      }
    }
  }
}
