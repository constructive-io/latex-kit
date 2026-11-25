#!/usr/bin/env node
import { CLI } from 'inquirerer';

import { commands, version } from './commands';

const app = new CLI(commands, {
  noTty: !process.stdin.isTTY,
  // inquirerer answers --version itself; make it report latex-kit
  version: version(),
  minimistOpts: {
    alias: { h: 'help', v: 'version', o: 'out', e: 'engine' },
    boolean: ['help', 'version', 'local', 'verify', 'json', 'final', 'strict', 'tex-only'],
    string: ['out', 'engine', 'image', 'root', 'platform', 'source-date-epoch', 'variant', 'template'],
    default: { strict: undefined },
  },
});

app.run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
