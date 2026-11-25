import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { importDocument, Project, starterSchema, templateNameFor } from '../src';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(__dirname, '.tmp-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('names templates from file names', () => {
  expect(templateNameFor('/x/Consulting Agreement (v2).docx')).toBe('consulting-agreement-v2');
  expect(templateNameFor('offerLetter.md')).toBe('offer-letter');
});

it('builds a nested starter schema, leaving lists and specials out', () => {
  const s = starterSchema(['party.name', 'party.address.city', 'fee', 'items.0.name', '$docid']);
  expect(s).toContain("import { z } from 'latex-kit';");
  expect(s).toContain('  fee: z.string(),\n  items: z.object({\n    name: z.string(),\n  }),\n  party: z.object({\n    address: z.object({\n      city: z.string(),\n    }),\n    name: z.string(),\n  }),');
  expect(starterSchema(['a', 'a.b'])).toContain('Used both as a value and as a group, check: a');
});

it('imports an older .tex template, converting @GROUP@FIELD@ tokens', async () => {
  const legacy = join(root, 'Consultant NDA.tex');
  writeFileSync(legacy, '\\documentclass{article}\n\\begin{document}\nBetween @COMPANY@LEGAL_NAME@ and @CONSULTANT@NAME@.\n\\end{document}\n');
  const project = await Project.open(root);
  const r = await importDocument(project, legacy);
  expect(r.name).toBe('consultant-nda');
  const tex = readFileSync(r.template, 'utf8');
  expect(tex).toContain('Between \\field{company.legalName} and \\field{consultant.name}.');
  expect(tex).toContain('\\usepackage{latex-kit}\n\\begin{document}');
  expect(readFileSync(r.schema!, 'utf8')).toContain('legalName: z.string(),');
  await expect(importDocument(project, legacy)).rejects.toThrow(/exists; use --force/);
  await expect(importDocument(project, legacy, { force: true })).resolves.toMatchObject({ schema: null });
});
