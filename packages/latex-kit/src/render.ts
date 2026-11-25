import { formatDiagnostic, render, RenderError, RenderResult } from '@latex-kit/render';
import type { Inquirerer } from 'inquirerer';
import type { ParsedArgs } from 'minimist';
import { relative } from 'path';
import chalk from 'yanse';

import { renderOptionsFromArgv, UsageError } from './args';

function summary(r: RenderResult) {
  return {
    pdf: relative(process.cwd(), r.pdf),
    sha256: r.sha256,
    engine: r.engine,
    backend: r.backend,
    image: r.image,
    sourceDateEpoch: r.sourceDateEpoch,
    epochSource: r.epochSource,
    reproducible: r.reproducible,
    warnings: r.diagnostics.filter((d) => d.severity === 'warning').length,
  };
}

export async function renderCommand(argv: Partial<ParsedArgs>, prompter: Inquirerer): Promise<number> {
  let opts;
  try {
    opts = renderOptionsFromArgv(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(chalk.red(e.message));
      return 2;
    }
    throw e;
  }

  if (!opts.file) {
    const answers = await prompter.prompt({} as Record<string, string>, [
      { type: 'text', name: 'file', message: 'Which .tex file?', required: true },
    ]);
    opts.file = answers.file;
  }

  const log = (s: string) => {
    if (!argv.json) console.error(s);
  };

  try {
    log(chalk.dim(`rendering ${opts.file} with ${opts.engine} (${opts.backend})…`));
    const first = await render({ ...opts, file: opts.file! });
    for (const d of first.diagnostics) log(chalk.yellow(formatDiagnostic(d)));
    if (!first.reproducible) {
      log(chalk.yellow('warning: no SOURCE_DATE_EPOCH and the file is not committed; the build date is "now", so builds will differ'));
    }

    let verified: boolean | undefined;
    if (argv.verify) {
      // same output path: some tools (Ghostscript) hash the path into the PDF ID
      log(chalk.dim('rendering again to check the output is byte-identical…'));
      const second = await render({ ...opts, file: opts.file!, sourceDateEpoch: first.sourceDateEpoch });
      verified = second.sha256 === first.sha256;
    }

    if (argv.json) {
      console.log(JSON.stringify({ ...summary(first), verified }, null, 2));
    } else {
      console.log(`${chalk.green('✓')} ${relative(process.cwd(), first.pdf)}`);
      console.log(chalk.dim(`  sha256 ${first.sha256}`));
      console.log(chalk.dim(`  date   ${new Date(first.sourceDateEpoch * 1000).toISOString()} (from ${first.epochSource})`));
      if (verified !== undefined) {
        console.log(verified ? `${chalk.green('✓')} byte-identical on a second build` : chalk.red('✗ second build differs'));
      }
    }
    return verified === false ? 1 : 0;
  } catch (e) {
    if (e instanceof RenderError) {
      console.error(chalk.red(e.message));
      for (const d of e.diagnostics) console.error(formatDiagnostic(d));
      if (e.diagnostics.length === 0 && e.output) {
        console.error(chalk.dim(e.output.split('\n').slice(-25).join('\n')));
      }
      return 1;
    }
    throw e;
  }
}
