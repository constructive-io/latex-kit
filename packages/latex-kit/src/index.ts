#!/usr/bin/env node
import { CLI } from 'inquirerer';

import { commands } from './commands';

const app = new CLI(commands, {
  noTty: !process.stdin.isTTY,
  minimistOpts: {
    alias: { h: 'help', v: 'version', o: 'out', e: 'engine' },
    boolean: ['help', 'version', 'local', 'verify', 'json'],
    string: ['out', 'engine', 'image', 'root', 'platform', 'source-date-epoch'],
  },
});

app.run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
