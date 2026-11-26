#!/usr/bin/env node
import { setModuleAliases } from '@latex-kit/schema';
import { CLI } from 'inquirerer';
import { dirname } from 'path';

import { commands, version } from './commands';

// Project files import 'latex-kit' (and zod through it). Point those names at
// this CLI's own copies, so a project works without its own node_modules and
// every file shares one zod.
const schemaDir = dirname(require.resolve('@latex-kit/schema'));
setModuleAliases({
  'latex-kit': __dirname,
  '@latex-kit/schema': schemaDir,
  zod: dirname(require.resolve('zod/package.json', { paths: [schemaDir] })),
});

const app = new CLI(commands, {
  noTty: !process.stdin.isTTY,
  // inquirerer answers --version itself; make it report latex-kit
  version: version(),
  minimistOpts: {
    alias: { h: 'help', v: 'version', o: 'out', e: 'engine' },
    boolean: ['help', 'version', 'local', 'verify', 'json', 'final', 'strict', 'tex-only', 'force', 'schema', 'paper', 'check'],
    string: ['out', 'engine', 'image', 'root', 'platform', 'source-date-epoch', 'variant', 'template', 'name', 'against', 'only', 'locale', 'signatures', 'preset', 'blanks'],
    default: { strict: undefined, schema: true },
  },
});

app.run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
