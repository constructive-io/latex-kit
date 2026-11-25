import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { basename, extname, join, resolve } from 'path';

import {
  Backend,
  buildCommand,
  Command,
  DEFAULT_IMAGE,
  DEFAULT_IMAGE_PLATFORM,
  Engine,
  ENGINES,
  LEGACY_IMAGE,
  LEGACY_IMAGE_PLATFORM,
} from './command';
import { EpochSource, resolveSourceDateEpoch } from './epoch';
import { Diagnostic, parseLog } from './log';

export interface RenderOptions {
  /** The .tex file to build. */
  file: string;
  /** Directory TeX can see; inputs and outputs must be inside it. Default: cwd. */
  root?: string;
  /** Output directory relative to root. Default: `out`. */
  outDir?: string;
  /** Default: `lualatex` (the only engine that is byte-reproducible in the v1 image). */
  engine?: Engine;
  /** Default: `docker`. */
  backend?: Backend;
  /** Docker image. Default: {@link DEFAULT_IMAGE}. */
  image?: string;
  /** Docker `--platform`. Default: unset (native), or linux/amd64 for LEGACY_IMAGE. */
  platform?: string | null;
  /** Override the build timestamp (seconds since 1970). */
  sourceDateEpoch?: number;
  /** Extra directories TeX searches (TEXINPUTS), relative to root. */
  texInputs?: string[];
  /** Receives latexmk/docker output as it arrives. */
  onOutput?: (chunk: string) => void;
}

export interface RenderResult {
  pdf: string;
  log: string;
  sha256: string;
  engine: Engine;
  backend: Backend;
  image: string | null;
  sourceDateEpoch: number;
  epochSource: EpochSource;
  reproducible: boolean;
  diagnostics: Diagnostic[];
  command: Command;
}

export class RenderError extends Error {
  constructor(
    message: string,
    readonly diagnostics: Diagnostic[],
    readonly output: string,
    readonly exitCode: number | null
  ) {
    super(message);
    this.name = 'RenderError';
  }
}

/** uid:gid for `docker run --user` on Linux, so outputs are not root-owned. */
export function currentUser(): string | null {
  // Linux bind mounts keep the container's uid; run as the caller so the
  // outputs are not root-owned. Docker Desktop (macOS/Windows) maps this.
  if (process.platform !== 'linux' || typeof process.getuid !== 'function') return null;
  return `${process.getuid()}:${process.getgid!()}`;
}

/** Run a command, collecting stdout and stderr together. */
export function runProcess(c: Pick<Command, 'cmd' | 'args' | 'cwd' | 'env'>, onOutput?: (s: string) => void): Promise<{ code: number | null; output: string }> {
  return new Promise((done, fail) => {
    const child = spawn(c.cmd, c.args, { cwd: c.cwd, env: { ...process.env, ...c.env } });
    let output = '';
    const collect = (b: Buffer) => {
      const s = b.toString();
      output += s;
      onOutput?.(s);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', fail);
    child.on('close', (code) => done({ code, output }));
  });
}

export async function render(options: RenderOptions): Promise<RenderResult> {
  const root = resolve(options.root ?? process.cwd());
  const file = resolve(root, options.file);
  if (extname(file) !== '.tex') throw new Error(`expected a .tex file, got ${options.file}`);
  if (!existsSync(file)) throw new Error(`file not found: ${options.file}`);

  const engine = options.engine ?? 'lualatex';
  if (!ENGINES.includes(engine)) throw new Error(`unknown engine ${engine}; use ${ENGINES.join(', ')}`);
  const backend = options.backend ?? 'docker';
  const image = options.image ?? DEFAULT_IMAGE;
  const platform =
    options.platform !== undefined ? options.platform : image === LEGACY_IMAGE ? LEGACY_IMAGE_PLATFORM : DEFAULT_IMAGE_PLATFORM;
  const epoch = resolveSourceDateEpoch(file, { explicit: options.sourceDateEpoch });

  const command = buildCommand({
    root,
    file,
    outDir: options.outDir ?? 'out',
    engine,
    backend,
    image,
    platform,
    sourceDateEpoch: epoch.epoch,
    user: backend === 'docker' ? currentUser() : null,
    texInputs: options.texInputs,
  });

  let result: { code: number | null; output: string };
  try {
    result = await runProcess(command, options.onOutput);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new RenderError(
        backend === 'docker'
          ? 'docker not found; install Docker or use the local backend (needs latexmk)'
          : 'latexmk not found on PATH; install TeX Live or use the docker backend',
        [],
        '',
        null
      );
    }
    throw e;
  }

  const job = basename(file, '.tex');
  const outAbs = join(root, command.outPath);
  const log = join(outAbs, `${job}.log`);
  const pdf = join(outAbs, `${job}.pdf`);
  const diagnostics = existsSync(log) ? parseLog(readFileSync(log, 'utf8')) : [];

  if (result.code !== 0 || !existsSync(pdf)) {
    const first = diagnostics.find((d) => d.severity === 'error');
    throw new RenderError(
      first ? `build failed: ${first.message}` : `build failed (exit ${result.code})`,
      diagnostics,
      result.output,
      result.code
    );
  }

  return {
    pdf,
    log,
    sha256: createHash('sha256').update(readFileSync(pdf)).digest('hex'),
    engine,
    backend,
    image: backend === 'docker' ? image : null,
    sourceDateEpoch: epoch.epoch,
    epochSource: epoch.source,
    reproducible: epoch.reproducible,
    diagnostics,
    command,
  };
}
