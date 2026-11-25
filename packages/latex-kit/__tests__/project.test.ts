import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { buildBlank, buildDocument, BuildError, checkProject, Project, templateFields } from '../src';

const FIXTURE = join(__dirname, 'fixtures', 'project');
let root: string;

beforeEach(() => {
  // inside the package, so schema.ts can resolve @latex-kit/schema
  root = mkdtempSync(join(__dirname, '.tmp-'));
  cpSync(FIXTURE, root, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const messages = (ds: { severity: string; message: string; file?: string }[]) => ds.map((d) => `${d.severity}: ${d.message}`);

describe('Project', () => {
  it('finds templates and documents', async () => {
    const p = await Project.open(root);
    expect(p.templateNames()).toEqual(['loose', 'memo']);
    expect(p.documentFiles().map((f) => p.documentName(f))).toEqual(['memo-a', 'memo-b', 'memo-code']);
  });
});

describe('checkProject', () => {
  it('passes a clean project, warning about templates without a schema', async () => {
    const r = await checkProject(await Project.open(root));
    expect(messages(r.diagnostics)).toEqual(['warning: template loose has no schema.ts, so field names are not checked']);
  });

  it('catches unknown fields, bad data and reused IDs', async () => {
    writeFileSync(join(root, 'templates/memo/template.tex'), '\\documentclass{article}\\begin{document}\\field{to.nmae}\\end{document}');
    writeFileSync(join(root, 'documents/memo-c.yaml'), 'template: memo\ndocId: MEMO-1\ndata:\n  to: { name: X }\n  subject: 5\n');
    const r = await checkProject(await Project.open(root));
    expect(messages(r.diagnostics)).toEqual([
      'warning: template loose has no schema.ts, so field names are not checked',
      "error: unknown field to.nmae (not in the template's schema)",
      'error: document ID MEMO-1 is also used by ' + join(root, 'documents/memo-b.yaml').replace(process.cwd() + '/', '') + '; never reuse an ID',
      'error: data.subject: Invalid input: expected string, received number',
    ]);
  });

  it('reports broken references', async () => {
    writeFileSync(join(root, 'documents/memo-d.json'), JSON.stringify({ template: 'memo', data: { to: { $ref: 'people/nobody' }, subject: 'x' } }));
    const r = await checkProject(await Project.open(root));
    expect(messages(r.diagnostics).pop()).toMatch(/to: no record for "people\/nobody"/);
  });
});

describe('build (tex only)', () => {
  it('fills a draft without minting an ID', async () => {
    const p = await Project.open(root);
    const r = await buildDocument(p, join(root, 'documents/memo-a.json'), { variant: 'draft', texOnly: true, strict: false });
    const tex = readFileSync(r.tex, 'utf8');
    expect(tex).toContain('To: Sam Sample\\\\');
    expect(tex).toContain('Re: R\\&D budget');
    expect(tex).toContain('one; two');
    expect(tex).toContain('Ref \\lkmissing{the document ID}');
    expect(tex.startsWith('\\PassOptionsToPackage{rendered,draft}{latex-kit}')).toBe(true);
    expect(readFileSync(join(root, 'out/memo-a/latex-kit.sty'), 'utf8')).toContain('\\ProvidesPackage{latex-kit}');
    expect(r.docId).toBeNull();
  });

  it('refuses a final build with missing values', async () => {
    const p = await Project.open(root);
    writeFileSync(join(root, 'documents/memo-a.json'), JSON.stringify({ template: 'memo', data: { to: { name: 'X' } } }));
    await expect(buildDocument(p, join(root, 'documents/memo-a.json'), { variant: 'final', texOnly: true })).rejects.toThrow(BuildError);
  });

  it('uses the stored ID on a final build', async () => {
    const p = await Project.open(root);
    const r = await buildDocument(p, join(root, 'documents/memo-b.yaml'), { variant: 'final', texOnly: true });
    expect(r.docId).toBe('MEMO-1');
    expect(readFileSync(r.tex, 'utf8')).toContain('Ref MEMO-1');
    expect(r.tex.endsWith('memo-b.tex')).toBe(true);
  });

  it('asks for an ID by hand for TypeScript records', async () => {
    const p = await Project.open(root);
    const err = await buildDocument(p, join(root, 'documents/memo-code.ts'), { variant: 'final', texOnly: true }).catch((e) => e);
    expect(err).toBeInstanceOf(BuildError);
    expect(messages(err.diagnostics)[0]).toMatch(/does not edit code\. Add: docId: 'MEMO-\d{8}-[0-9A-Z]{8}'/);
  });

  it('builds a blank form from a template alone', async () => {
    const p = await Project.open(root);
    const r = await buildBlank(p, 'memo', { texOnly: true });
    const tex = readFileSync(r.tex, 'utf8');
    expect(r.tex.endsWith('memo-blank.tex')).toBe(true);
    expect(tex).toContain('To: \\lkblank{to.name}');
    expect(tex).toContain('\\lkblank{p}');
  });
});

it('lists fields through snippets', async () => {
  const { fields } = await templateFields(await Project.open(root), 'memo');
  expect(fields.map((f) => `${f.kind} ${f.absolute}`)).toEqual(['field to.name', 'field subject', 'each points', 'field points[]']);
});
