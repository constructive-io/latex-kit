import { isAbsolute, posix, relative, resolve, sep } from 'path';

/**
 * The default image: ghcr.io/constructive-io/latex-kit (official TeX Live 2026,
 * full scheme, plus Noto CJK fonts), built from docker/ in this repo for amd64
 * and arm64, pinned by digest so every build uses the same bytes.
 */
export const DEFAULT_IMAGE =
  'ghcr.io/constructive-io/latex-kit@sha256:e4d5aebb60986780c437ace0c0840c73fa6b0b70c7a60ab3246aee83da483fac';
/** Multi-arch: let Docker pick the native platform. */
export const DEFAULT_IMAGE_PLATFORM: string | null = null;

/** The previous default (TeX Live 2019, amd64 only), for reproducing older PDFs. */
export const LEGACY_IMAGE = 'pyramation/latex@sha256:37c951932d73f61584054ab8c822a5b4af31aefb2cdf08a36f3ba26e5761f3c0';
export const LEGACY_IMAGE_PLATFORM = 'linux/amd64';

export type Engine = 'lualatex' | 'xelatex' | 'pdflatex';
export type Backend = 'docker' | 'local';

export const ENGINES: Engine[] = ['lualatex', 'xelatex', 'pdflatex'];

const ENGINE_FLAG: Record<Engine, string> = {
  lualatex: '-lualatex',
  xelatex: '-xelatex',
  pdflatex: '-pdf',
};

export interface CommandOptions {
  /** Absolute path of the directory made visible to TeX (mounted at /work). */
  root: string;
  /** The .tex file, absolute or relative to `root`. Must be inside `root`. */
  file: string;
  /** Output directory, relative to `root`. */
  outDir: string;
  engine: Engine;
  backend: Backend;
  image: string;
  /** `--platform` for docker run; `null` lets Docker choose. */
  platform: string | null;
  sourceDateEpoch: number;
  /** uid:gid to run the container as, so outputs are owned by the caller. */
  user?: string | null;
  /** Extra directories TeX searches for \\input, packages and images, relative to `root`. */
  texInputs?: string[];
}

export interface Command {
  cmd: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  /** The .tex path relative to root, POSIX separators. */
  texPath: string;
  /** Output directory relative to root, POSIX separators. */
  outPath: string;
}

export class PathOutsideRootError extends Error {
  constructor(what: string, path: string, root: string) {
    super(`${what} ${path} is outside the project root ${root}`);
    this.name = 'PathOutsideRootError';
  }
}

/** Resolve `p` against `root`, refuse anything outside it, return a POSIX relative path. */
export function insideRoot(what: string, root: string, p: string): string {
  const abs = isAbsolute(p) ? p : resolve(root, p);
  const rel = relative(root, abs);
  if (rel === '' && what === 'output directory') return '.';
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new PathOutsideRootError(what, p, root);
  }
  return rel.split(sep).join(posix.sep);
}

export function buildCommand(o: CommandOptions): Command {
  const texPath = insideRoot('file', o.root, o.file);
  const outPath = insideRoot('output directory', o.root, o.outDir);

  const env: Record<string, string> = {
    SOURCE_DATE_EPOCH: String(o.sourceDateEpoch),
    // pdfTeX and LuaTeX also use SOURCE_DATE_EPOCH for \today and \time
    FORCE_SOURCE_DATE: '1',
  };
  // TeX resolves \\input, \\includegraphics and \\bibliography against the working
  // directory (the root), so the source file's own folder goes first.
  const sourceDir = posix.dirname(texPath);
  const dirs = [...(sourceDir === '.' ? [] : [sourceDir]), ...(o.texInputs ?? []).map((d) => insideRoot('output directory', o.root, d))];
  const unique = [...new Set(dirs)];
  if (unique.length) {
    // absolute: latexmk runs bibtex from inside the output folder. A trailing
    // separator keeps TeX's own search path after ours.
    const base = o.backend === 'local' ? o.root : '/work';
    const search = unique.map((rel) => (rel === '.' ? base : posix.join(base.split(sep).join(posix.sep), rel))).join(':') + ':';
    env.TEXINPUTS = search;
    env.BIBINPUTS = search;
  }

  const latexmk = [
    'latexmk',
    ENGINE_FLAG[o.engine],
    // always rebuild: latexmk's up-to-date check ignores SOURCE_DATE_EPOCH,
    // so a changed build date would otherwise return a stale PDF
    '-g',
    '-interaction=nonstopmode',
    '-halt-on-error',
    '-file-line-error',
    `-outdir=${outPath}`,
    texPath,
  ];

  if (o.backend === 'local') {
    return { cmd: latexmk[0], args: latexmk.slice(1), cwd: o.root, env, texPath, outPath };
  }

  const args = ['run', '--rm'];
  if (o.platform) args.push('--platform', o.platform);
  if (o.user) {
    // an arbitrary uid has no home directory; give TeX a writable one
    args.push('--user', o.user, '-e', 'HOME=/tmp', '-e', 'TEXMFVAR=/tmp/texmf-var');
  }
  args.push('-v', `${o.root}:/work`, '-w', '/work');
  for (const [k, v] of Object.entries(env)) args.push('-e', `${k}=${v}`);
  args.push(o.image, ...latexmk);

  return { cmd: 'docker', args, cwd: o.root, env: {}, texPath, outPath };
}
