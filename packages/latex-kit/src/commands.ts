import { readFileSync } from 'fs';
import type { CLIOptions, Inquirerer } from 'inquirerer';
import type { ParsedArgs } from 'minimist';

import { doctorCommand } from './doctor';
import { renderCommand } from './render';
import { help } from './usage';

export function version(): string {
  return JSON.parse(readFileSync(require.resolve('../package.json'), 'utf8')).version;
}

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

  let code: number;
  switch (command) {
  case 'render':
    code = await renderCommand({ ...argv, _: rest }, prompter);
    break;
  case 'doctor':
    code = await doctorCommand({ ...argv, _: rest });
    break;
  default:
    console.error(`unknown command: ${command}\n`);
    help();
    code = 2;
  }
  if (code !== 0) process.exitCode = code;
  return argv;
};
