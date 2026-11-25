import { existsSync, readFileSync } from 'fs';
import type { CLIOptions, Inquirerer } from 'inquirerer';
import type { ParsedArgs } from 'minimist';
import { join } from 'path';
import chalk from 'yanse';

import { UsageError } from './args';
import { doctorCommand } from './doctor';
import { buildCommand, checkCommand, diffCommand, fieldsCommand, importCommand, styCommand, typegenCommand } from './project-commands';
import { renderCommand } from './render';
import { help } from './usage';

/** The package version, from package.json next to the built files. */
export function version(): string {
  for (const p of [join(__dirname, 'package.json'), join(__dirname, '..', 'package.json')]) {
    if (existsSync(p)) {
      const pkg = JSON.parse(readFileSync(p, 'utf8'));
      if (pkg.name === 'latex-kit') return pkg.version;
    }
  }
  return 'unknown';
}

const COMMANDS: Record<string, (argv: Partial<ParsedArgs>, prompter: Inquirerer) => Promise<number>> = {
  build: buildCommand,
  check: checkCommand,
  fields: fieldsCommand,
  typegen: typegenCommand,
  import: importCommand,
  diff: diffCommand,
  sty: styCommand,
  render: renderCommand,
  doctor: doctorCommand,
};

export const commands = async (argv: Partial<ParsedArgs>, prompter: Inquirerer, _options: CLIOptions) => {
  const [command, ...rest] = (argv._ ?? []).map(String);

  if (argv.version) {
    console.log(version());
    return argv;
  }
  if (!command || argv.help || command === 'help') {
    help(command === 'help' ? rest[0] : argv.help ? command : undefined);
    return argv;
  }

  const run = COMMANDS[command];
  if (!run) {
    console.error(`unknown command: ${command}\n`);
    help();
    process.exitCode = 2;
    return argv;
  }
  try {
    const code = await run({ ...argv, _: rest }, prompter);
    if (code !== 0) process.exitCode = code;
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(chalk.red(e.message));
      process.exitCode = 2;
    } else {
      throw e;
    }
  }
  return argv;
};
