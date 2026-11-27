import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { findPnpmWorkspace, scaffoldStarter } from '../src/starter';

/** A tiny template repository on disk: one starter with a question and two placeholders. */
function starterRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'lk-starters-'));
  const kit = join(repo, 'kit');
  mkdirSync(join(kit, 'docs'), { recursive: true });
  writeFileSync(join(repo, '.boilerplates.json'), '{ "dir": "." }\n');
  writeFileSync(
    join(kit, '.boilerplate.json'),
    JSON.stringify({ type: 'generic', requiresWorkspace: false, questions: [{ name: '____fullName____', message: 'Who', required: true }] })
  );
  writeFileSync(join(kit, 'package.json'), '{ "name": "____moduleName____", "author": "____fullName____" }\n');
  writeFileSync(join(kit, 'docs', '____moduleName____.md'), 'kept by ____fullName____\n');
  writeFileSync(join(kit, '.motd'), '\n  next: read ____moduleName____\n');
  return repo;
}

describe('starters', () => {
  it('fills a starter from a local repository, named after the new folder', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'lk-made-')), 'harbour-docs');
    const r = await scaffoldStarter({ dir, template: 'kit', repo: starterRepo(), answers: { fullName: 'Ada Marsh' }, noTty: true });
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))).toEqual({ name: 'harbour-docs', author: 'Ada Marsh' });
    expect(readFileSync(join(dir, 'docs', 'harbour-docs.md'), 'utf8')).toBe('kept by Ada Marsh\n');
    // the starter's own files are read, then left out
    expect(r.motd).toContain('next: read harbour-docs');
    expect(existsSync(join(dir, '.motd'))).toBe(false);
    expect(existsSync(join(dir, '.boilerplate.json'))).toBe(false);
  });

  it('refuses a folder that already has something in it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lk-made-'));
    writeFileSync(join(dir, 'mine.txt'), 'x');
    await expect(scaffoldStarter({ dir, template: 'kit', repo: starterRepo(), noTty: true })).rejects.toThrow(/not empty/);
  });

  it('finds the pnpm workspace a module would join', () => {
    const root = mkdtempSync(join(tmpdir(), 'lk-ws-'));
    mkdirSync(join(root, 'packages', 'a'), { recursive: true });
    expect(findPnpmWorkspace(join(root, 'packages', 'a'))).toBeNull();
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    expect(findPnpmWorkspace(join(root, 'packages', 'a'))).toBe(root);
  });
});
