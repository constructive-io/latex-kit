import { resolve } from 'path';

import { DEFAULT_IMAGE, DEFAULT_IMAGE_PLATFORM, insideRoot, LEGACY_IMAGE, LEGACY_IMAGE_PLATFORM } from './command';
import { currentUser, runProcess } from './render';

export interface LatexdiffOptions {
  /** Directory visible to the tool; all paths are inside it. */
  root?: string;
  old: string;
  new: string;
  /** Where to write the marked-up .tex. */
  output: string;
  backend?: 'docker' | 'local';
  image?: string;
  platform?: string | null;
}

export class LatexdiffError extends Error {
  constructor(
    message: string,
    readonly output: string
  ) {
    super(message);
    this.name = 'LatexdiffError';
  }
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** The shell command run inside the container (or locally). */
export function latexdiffScript(old: string, next: string, output: string): string {
  return `latexdiff --encoding=utf8 --type=UNDERLINE ${shellQuote(old)} ${shellQuote(next)} > ${shellQuote(output)}`;
}

/** Mark up the changes from `old` to `new` with latexdiff (in the LaTeX image by default). */
export async function runLatexdiff(options: LatexdiffOptions): Promise<void> {
  const root = resolve(options.root ?? process.cwd());
  const script = latexdiffScript(
    insideRoot('file', root, options.old),
    insideRoot('file', root, options.new),
    insideRoot('file', root, options.output)
  );
  let cmd = 'sh';
  let args = ['-c', script];
  if (options.backend !== 'local') {
    const image = options.image ?? DEFAULT_IMAGE;
    const platform = options.platform !== undefined ? options.platform : image === LEGACY_IMAGE ? LEGACY_IMAGE_PLATFORM : DEFAULT_IMAGE_PLATFORM;
    cmd = 'docker';
    args = ['run', '--rm'];
    if (platform) args.push('--platform', platform);
    const user = currentUser();
    if (user) args.push('--user', user);
    args.push('-v', `${root}:/work`, '-w', '/work', image, 'sh', '-c', script);
  }
  const r = await runProcess({ cmd, args, cwd: root, env: {} }).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') throw new LatexdiffError(`${cmd} not found`, '');
    throw e;
  });
  if (r.code !== 0) throw new LatexdiffError(`latexdiff failed (exit ${r.code}): ${r.output.trim().split('\n').pop() ?? ''}`, r.output);
}
