import { Backend, EngineChoice, ENGINES, RenderOptions } from '@latex-kit/render';
import type { ParsedArgs } from 'minimist';

export class UsageError extends Error {
  name = 'UsageError';
}

/** Turn `latex-kit render` flags into render options. Pure, for testing. */
export function renderOptionsFromArgv(argv: Partial<ParsedArgs>): Omit<RenderOptions, 'file'> & { file?: string } {
  const engine = (argv.engine ?? 'auto') as EngineChoice;
  if (engine !== 'auto' && !ENGINES.includes(engine)) {
    throw new UsageError(`--engine must be auto or one of ${ENGINES.join(', ')}`);
  }
  let sourceDateEpoch: number | undefined;
  if (argv['source-date-epoch'] !== undefined) {
    const raw = String(argv['source-date-epoch']);
    if (!/^\d+$/.test(raw)) throw new UsageError('--source-date-epoch must be a whole number of seconds');
    sourceDateEpoch = Number(raw);
  }
  const backend: Backend = argv.local ? 'local' : 'docker';
  if (backend === 'local' && (argv.image || argv.platform)) {
    throw new UsageError('--image and --platform only apply to the docker backend');
  }
  return {
    file: argv._?.[0] !== undefined ? String(argv._[0]) : argv.file,
    root: argv.root,
    outDir: argv.out ?? 'out',
    engine,
    backend,
    image: argv.image,
    platform: argv.platform,
    sourceDateEpoch,
  };
}
