import { doctor } from '@latex-kit/render';
import type { ParsedArgs } from 'minimist';
import chalk from 'yanse';

const MARK = { ok: chalk.green('✓'), warn: chalk.yellow('!'), fail: chalk.red('✗'), info: chalk.dim('·') };

export async function doctorCommand(argv: Partial<ParsedArgs>): Promise<number> {
  const checks = await doctor(argv.image);
  if (argv.json) {
    console.log(JSON.stringify(checks, null, 2));
  } else {
    for (const c of checks) {
      console.log(`${MARK[c.status]} ${c.name.padEnd(14)} ${c.detail}`);
      if (c.hint) console.log(`  ${''.padEnd(14)} ${chalk.dim(c.hint)}`);
    }
  }
  return checks.some((c) => c.status === 'fail') ? 1 : 0;
}
