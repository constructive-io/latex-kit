import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('stages the README with one shared footer and the pages under dist/', () => {
  const source = read('../README.md').trimEnd();
  const footer = read('../../../FOOTER.md').trim();
  assert.ok(!source.includes(footer));
  assert.equal(read('../dist/npm/README.md'), `${source}\n\n---\n\n${footer}\n`);
  assert.match(read('../dist/npm/dist/index.html'), /<html[\s>]/);
});
