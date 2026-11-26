import { DEFAULT_IMAGE } from '@latex-kit/render';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildBlank, buildDocument, checkProject, currentPins, LOCK_FILE, Project, readLock, signerSlug, writeLock } from '../src';
import { onlyMatcher } from '../src/project-commands';

const FIXTURE = join(__dirname, 'fixtures', 'project');
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(__dirname, '.tmp-'));
  cpSync(FIXTURE, root, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const write = (rel: string, text: string) => {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const messages = (ds: { severity: string; message: string }[]) => ds.map((d) => `${d.severity}: ${d.message}`);

describe('components and TypeScript clauses', () => {
  beforeEach(() => {
    write(
      'components/shout.ts',
      `import { defineComponent, tex } from '@latex-kit/components';
export default defineComponent((v: string) => tex\`\\\\textbf{\${v.toUpperCase()}}\`);
`
    );
    write(
      'clauses/memo/closing.ts',
      `import { defineClause } from '@latex-kit/components';
export default defineClause({ title: 'Closing', version: 3, body: 'Regards to \\\\field{to.name}.' });
`
    );
    write(
      'templates/memo/template.tex',
      '\\documentclass{article}\n\\begin{document}\n\\component{shout}{subject}\n\\component{address}{to.address}\n\\clause{memo/closing}\n\\signature{to}\n\\end{document}\n'
    );
  });

  it('loads components/ and clauses/*.ts, and builds with them', async () => {
    const p = await Project.open(root);
    expect(p.componentNames()).toEqual(['address', 'bilingual', 'exhibits', 'shout', 'signatures']);
    const r = await buildDocument(p, join(root, 'documents/memo-a.json'), { variant: 'draft', texOnly: true, strict: false });
    const tex = readFileSync(r.tex, 'utf8');
    expect(tex).toContain('\\textbf{R\\&D BUDGET}');
    expect(tex).toContain('\\lkclause{Closing}{clause:memo/closing}Regards to Sam Sample.');
    expect(tex).toContain('\\lksignature{}{Sam Sample}{Editor}{}{}');
    expect(messages(r.diagnostics)).toEqual(['warning: missing value for to.address']);
  });

  it('checks component names and reports components that fail to load', async () => {
    write('components/broken.ts', 'export default 42;\n');
    write('templates/loose/template.tex', '\\documentclass{article}\n\\begin{document}\\component{nope}{}\\end{document}\n');
    const r = await checkProject(await Project.open(root));
    expect(messages(r.diagnostics)).toEqual(
      expect.arrayContaining([
        'error: component broken: the default export must be a component function (use defineComponent)',
        'error: unknown component nope (known: address, bilingual, broken, exhibits, shout, signatures)',
      ])
    );
  });
});

describe('signed builds', () => {
  let sigs: string;
  beforeEach(() => {
    sigs = mkdtempSync(join(tmpdir(), 'lk-sigs-'));
    writeFileSync(join(sigs, 'sam-sample.png'), 'not really a png');
    write('templates/memo/template.tex', '\\documentclass{article}\n\\begin{document}\n\\signature{to}\n\\end{document}\n');
  });
  afterEach(() => rmSync(sigs, { recursive: true, force: true }));

  it('uses the signer image from the signatures folder and removes the copy afterwards', async () => {
    const p = await Project.open(root);
    const r = await buildDocument(p, join(root, 'documents/memo-b.yaml'), { variant: 'signed', texOnly: true, signatures: sigs });
    expect(readFileSync(r.tex, 'utf8')).toContain('{\\lksignatureimage{out/memo-b/lk-signatures/sam-sample.png}}');
    expect(existsSync(join(root, 'out/memo-b/lk-signatures'))).toBe(false);
  });

  it('falls back to /s/ with a warning when there is no image', async () => {
    rmSync(join(sigs, 'sam-sample.png'));
    const p = await Project.open(root);
    const r = await buildDocument(p, join(root, 'documents/memo-b.yaml'), { variant: 'signed', texOnly: true, signatures: sigs });
    expect(readFileSync(r.tex, 'utf8')).toContain('{/s/~Sam Sample}');
    expect(messages(r.diagnostics)[0]).toMatch(/^warning: no signature image for Sam Sample .*looked for sam-sample\.pdf, sam-sample\.png/);
  });

  it('warns when the signatures folder is inside the project', async () => {
    mkdirSync(join(root, 'sigs'));
    const p = await Project.open(root);
    const r = await buildDocument(p, join(root, 'documents/memo-b.yaml'), { variant: 'signed', texOnly: true, signatures: join(root, 'sigs') });
    expect(messages(r.diagnostics)[0]).toMatch(/inside the project/);
  });

  it('slugs signer names for file names', () => {
    expect(signerSlug('Zoë  Ann-Marie O’Brien')).toBe('zoe-ann-marie-o-brien');
  });
});

describe('--locale', () => {
  it('builds another language next to the usual output', async () => {
    write('templates/memo/template.tex', '\\documentclass{article}\n\\begin{document}\\field{when|date:long}\\end{document}\n');
    write('documents/dated.json', JSON.stringify({ template: 'loose', data: {} }));
    write('templates/loose/template.tex', '\\documentclass{article}\n\\begin{document}\\field{$locale}\\end{document}\n');
    const p = await Project.open(root);
    const r = await buildDocument(p, join(root, 'documents/dated.json'), { variant: 'draft', texOnly: true, locale: 'ja-JP' });
    expect(r.name).toBe('dated-ja-JP');
    expect(readFileSync(r.tex, 'utf8')).toContain('ja-JP');
    const same = await buildDocument(p, join(root, 'documents/dated.json'), { variant: 'draft', texOnly: true, locale: 'en-US' });
    expect(same.name).toBe('dated');
    expect((await buildBlank(p, 'loose', { texOnly: true, locale: 'de-DE' })).name).toBe('loose-de-DE');
  });
});

describe('--only', () => {
  it('matches comma-separated names with *', () => {
    const m = onlyMatcher('nda-*, invoice-0001')!;
    expect(['nda-a', 'invoice-0001', 'invoice-0002', 'letter'].filter(m)).toEqual(['nda-a', 'invoice-0001']);
    expect(onlyMatcher(undefined)).toBeNull();
    expect(onlyMatcher('a.b')!('axb')).toBe(false);
  });
});

describe('latex-kit.lock', () => {
  it('pins the images and wins over the built-in default', async () => {
    expect(existsSync(join(root, LOCK_FILE))).toBe(false);
    expect((await Project.open(root)).image()).toBeUndefined();
    writeLock(root);
    expect(readLock(root)).toEqual(currentPins());
    expect(currentPins().image).toBe(DEFAULT_IMAGE);
    const older = { lockfileVersion: 1, image: `old/image@sha256:${'a'.repeat(64)}`, pandocImage: `pandoc@sha256:${'b'.repeat(64)}` };
    writeFileSync(join(root, LOCK_FILE), JSON.stringify(older));
    const p = await Project.open(root);
    expect(p.image()).toBe(older.image);
    expect(p.image('cli/override:1')).toBe('cli/override:1');
    const { previous } = writeLock(root);
    expect(previous).toEqual(older);
  });

  it('rejects a lock that is not pinned by digest', () => {
    writeFileSync(join(root, LOCK_FILE), JSON.stringify({ lockfileVersion: 1, image: 'texlive/texlive:latest', pandocImage: 'x' }));
    expect(() => readLock(root)).toThrow(/pinned by digest/);
    writeFileSync(join(root, LOCK_FILE), '{"lockfileVersion": 9}');
    expect(() => readLock(root)).toThrow(/lockfileVersion/);
  });
});
