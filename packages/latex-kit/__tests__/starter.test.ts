import { execFileSync } from 'child_process';
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

  it('copies the agent skills a starter names into the new folder', async () => {
    // a repository that holds a skill, and a starter that asks for it
    const skills = mkdtempSync(join(tmpdir(), 'lk-skills-'));
    mkdirSync(join(skills, '.agents', 'skills', 'how-to'), { recursive: true });
    writeFileSync(join(skills, '.agents', 'skills', 'how-to', 'SKILL.md'), '# how to\n');
    // skills are cloned with git, so the folder is given a commit
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd: skills, stdio: 'ignore' });
    git('init', '--quiet');
    git('add', '--all');
    git('commit', '--quiet', '--message', 'a skill');
    const repo = starterRepo();
    const config = join(repo, 'kit', '.boilerplate.json');
    writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), skills: [{ source: skills, skills: ['how-to', 'not-there'] }] }));
    const dir = join(mkdtempSync(join(tmpdir(), 'lk-made-')), 'with-skills');
    const r = await scaffoldStarter({ dir, template: 'kit', repo, answers: { fullName: 'Ada Marsh' }, noTty: true });
    expect(r.skills.installed).toEqual(['how-to']);
    expect(r.skills.failed.map((f) => f.skill)).toEqual(['not-there']);
    expect(readFileSync(join(dir, '.agents', 'skills', 'how-to', 'SKILL.md'), 'utf8')).toBe('# how to\n');

    const plain = join(mkdtempSync(join(tmpdir(), 'lk-made-')), 'without');
    const none = await scaffoldStarter({ dir: plain, template: 'kit', repo, answers: { fullName: 'Ada Marsh' }, noTty: true, noSkills: true });
    expect(none.skills.installed).toEqual([]);
    expect(existsSync(join(plain, '.agents'))).toBe(false);
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
