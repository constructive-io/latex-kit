import { existsSync } from 'fs';
import { resolve } from 'path';

import { insideRoot } from './command';
import { currentUser, runProcess } from './render';

/** Official pandoc image (multi-arch: native on arm64 and amd64), pinned by digest. */
export const PANDOC_IMAGE = 'pandoc/core:3.11@sha256:62518bfb6833705dc90a1634d8d879299bd820b3f74ad3b32fba8b618452553a';

export interface PandocOptions {
  /** Input document (.docx, .odt, .md, .html, .rtf, …), inside root. */
  input: string;
  /** Output .tex file, inside root. */
  output: string;
  root?: string;
  backend?: 'docker' | 'local';
  image?: string;
  /** Folder (inside root) to extract embedded images into. */
  extractMedia?: string;
}

export class PandocError extends Error {
  constructor(
    message: string,
    readonly output: string
  ) {
    super(message);
    this.name = 'PandocError';
  }
}

export function pandocArgs(o: { input: string; output: string; extractMedia?: string }): string[] {
  const args = ['--standalone', '--to=latex', `--output=${o.output}`];
  if (o.extractMedia) args.push(`--extract-media=${o.extractMedia}`);
  args.push(o.input);
  return args;
}

/** Convert a document to standalone LaTeX with pandoc (Docker by default). */
export async function runPandoc(options: PandocOptions): Promise<void> {
  const root = resolve(options.root ?? process.cwd());
  const input = insideRoot('file', root, options.input);
  const output = insideRoot('file', root, options.output);
  const extractMedia = options.extractMedia ? insideRoot('output directory', root, options.extractMedia) : undefined;
  if (!existsSync(resolve(root, input))) throw new PandocError(`file not found: ${options.input}`, '');
  const args = pandocArgs({ input, output, extractMedia });

  let cmd: string;
  let full: string[];
  if (options.backend === 'local') {
    cmd = 'pandoc';
    full = args;
  } else {
    cmd = 'docker';
    full = ['run', '--rm'];
    const user = currentUser();
    if (user) full.push('--user', user);
    full.push('-v', `${root}:/data`, '-w', '/data', options.image ?? PANDOC_IMAGE, ...args);
  }
  let result: { code: number | null; output: string };
  try {
    result = await runProcess({ cmd, args: full, cwd: root, env: {} });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PandocError(cmd === 'docker' ? 'docker not found; install Docker or use --local with pandoc installed' : 'pandoc not found on PATH', '');
    }
    throw e;
  }
  if (result.code !== 0) throw new PandocError(`pandoc failed (exit ${result.code}): ${result.output.trim().split('\n').pop()}`, result.output);
}
