import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

import { checkProject, initProject, newDocument, newTemplate, Project, setModuleAliases, skeleton } from '../src';

// starter files import 'latex-kit'; resolve it the way the CLI does
beforeAll(() => setModuleAliases({ 'latex-kit': join(__dirname, '..', 'src', 'index.ts') }));
afterAll(() => setModuleAliases({}));

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(__dirname, '.tmp-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('initializes a project that checks clean, and refuses to clobber one', async () => {
  const r = initProject(root, { version: '9.9.9' });
  expect(r.written.map((f) => f.slice(root.length + 1)).sort()).toEqual([
    '.gitignore',
    'README.md',
    'clauses/.gitkeep',
    'data/orgs/my-company.yaml',
    'data/people/me.yaml',
    'documents/welcome-letter.yaml',
    'latex-kit.config.ts',
    'package.json',
    'snippets/letterhead.tex',
    'templates/letter/schema.ts',
    'templates/letter/template.tex',
  ]);
  expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies).toEqual({ 'latex-kit': '^9.9.9' });
  const check = await checkProject(await Project.open(root));
  expect(check.diagnostics).toEqual([]);
  expect(() => initProject(root, { version: '9.9.9' })).toThrow(/already exists/);
});

it('initializes a paper', () => {
  const r = initProject(root, { paper: true, version: '1.0.0' });
  expect(r.written.map((f) => f.slice(root.length + 1)).sort()).toEqual(['.github/workflows/paper.yml', '.gitignore', 'README.md', 'paper/main.tex', 'paper/refs.bib']);
  expect(readFileSync(join(root, '.github/workflows/paper.yml'), 'utf8')).toContain('uses: constructive-io/latex-kit/action@v1');
});

it('adds a template and a document linked to its schema', async () => {
  initProject(root, { version: '1.0.0' });
  const p = await Project.open(root);
  newTemplate(p, 'proposal');
  expect(() => newTemplate(p, 'proposal')).toThrow(/already exists/);
  const d = await newDocument(p, 'acme', 'proposal');
  const record = JSON.parse(readFileSync(d.written[0], 'utf8'));
  expect(record).toEqual({
    $schema: '../templates/proposal/proposal.schema.json',
    template: 'proposal',
    data: { title: '', date: '2026-01-01', recipient: { name: '' } },
  });
  expect(existsSync(join(root, 'templates/proposal/proposal.schema.json'))).toBe(true);
  await expect(newDocument(p, 'acme', 'proposal')).rejects.toThrow(/already exists/);
  const check = await checkProject(p);
  expect(check.diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
});

it('builds placeholder data from JSON Schema', () => {
  const schema = {
    type: 'object',
    required: ['n', 'flag', 'kind', 'list', 'ref', 'maybe'],
    properties: {
      n: { type: 'integer' },
      flag: { type: 'boolean', default: true },
      kind: { enum: ['a', 'b'] },
      list: { type: 'array', items: { type: 'string' } },
      ref: { $ref: '#/$defs/Thing' },
      maybe: { anyOf: [{ type: 'null' }, { type: 'string' }] },
      optional: { type: 'string' },
    },
    $defs: { Thing: { type: 'object', required: ['x'], properties: { x: { type: 'number' } } } },
  };
  expect(skeleton(schema, schema)).toEqual({ n: 0, flag: true, kind: 'a', list: [], ref: { x: 0 }, maybe: '' });
});
