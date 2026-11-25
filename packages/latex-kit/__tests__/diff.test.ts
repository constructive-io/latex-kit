import { execFileSync } from 'child_process';
import { cpSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';

import { diffDocument, diffFiles, Project } from '../src';

let root: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });

beforeEach(() => {
  root = mkdtempSync(join(__dirname, '.tmp-'));
  cpSync(join(__dirname, 'fixtures', 'project'), root, { recursive: true });
  git('init', '-q');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('explains bad refs and files that did not exist yet', async () => {
  const p = await Project.open(root);
  await expect(diffDocument(p, join(root, 'documents/memo-b.yaml'), 'no-such-ref')).rejects.toThrow('unknown git ref: no-such-ref');
  cpSync(join(root, 'documents/memo-b.yaml'), join(root, 'documents/memo-new.yaml'));
  await expect(diffDocument(p, join(root, 'documents/memo-new.yaml'), 'HEAD')).rejects.toThrow('documents/memo-new.yaml does not exist at HEAD');
});

it('reports missing input files', async () => {
  const p = await Project.open(root);
  await expect(diffFiles(p, join(root, 'nope.tex'), join(root, 'also-nope.tex'))).rejects.toThrow('no such file');
});
