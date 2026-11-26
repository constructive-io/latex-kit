import { RawLatex, tex } from '@latex-kit/escape';

import { analyzeTemplate, compileTemplate, Component, Diagnostic, EvaluateOptions, evaluateTemplate, LoadedClause } from '../src';

const render = (src: string, opts: Partial<EvaluateOptions> & { data?: unknown } = {}) =>
  evaluateTemplate(compileTemplate(src, 't.tex'), { variant: 'final', data: {}, ...opts });
const errors = (r: { diagnostics: Diagnostic[] }) => r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);

const org = { name: 'Example Widgets, Inc.', signer: { name: 'Avery Example', title: 'CEO' } };
const person = { name: 'Sam Sample' };
const signed = { a: { date: '2026-11-20' }, p: { date: '2026-11-21' } };

describe('\\signature', () => {
  it('prints an organization block: name, signer, title, blank signature and date', () => {
    expect(render('\\signature{a}', { data: { a: org } }).tex).toBe('\\lksignature{Example Widgets, Inc.}{Avery Example}{CEO}{}{}');
  });

  it('prints a person signing for themselves without an organization line', () => {
    expect(render('\\signature{p}', { data: { p: person } }).tex).toBe('\\lksignature{}{Sam Sample}{}{}{}');
  });

  it('signs with /s/ and the signed date in the signed variant', () => {
    const r = render('\\signature{a} \\signature{p}', { variant: 'signed', data: { a: org, p: person }, signed });
    expect(r.tex).toBe('\\lksignature{Example Widgets, Inc.}{Avery Example}{CEO}{/s/~Avery Example}{November 20, 2026} \\lksignature{}{Sam Sample}{}{/s/~Sam Sample}{November 21, 2026}');
  });

  it('prints dates only in signed builds, and warns about signed entries no \\signature uses', () => {
    expect(render('\\signature{a}', { data: { a: org }, signed }).tex).toBe('\\lksignature{Example Widgets, Inc.}{Avery Example}{CEO}{}{}');
    const r = render('\\signature{a}', { variant: 'signed', data: { a: org }, signed: { a: { date: '2026-11-20' }, nobody: { date: '2026-11-20' } } });
    expect(r.diagnostics.map((d) => d.message)).toEqual(['signed.nobody: the document has no \\signature{nobody}']);
  });

  it('uses a signature image when one is found', () => {
    const seen: unknown[] = [];
    const r = render('\\signature{a}', {
      variant: 'signed',
      data: { a: { ...org, signer: { ...org.signer, signature: 'avery.png' } } },
      signatureImage: (s) => (seen.push(s), 'out/x/lk-signatures/avery.png'),
    });
    expect(seen).toEqual([{ name: 'Avery Example', image: 'avery.png' }]);
    expect(r.tex).toContain('{\\lksignatureimage{out/x/lk-signatures/avery.png}}');
  });

  it('refuses an image path that could inject LaTeX', () => {
    const r = render('\\signature{p}', { variant: 'signed', data: { p: person }, signatureImage: () => 'a}{\\input{x}' });
    expect(errors(r)[0]).toMatch(/may only use letters/);
  });

  it('takes the image file from the record before the signer', () => {
    const seen: unknown[] = [];
    render('\\signature{p}', { variant: 'signed', data: { p: { name: 'Sam', signature: 'sam.png' } }, signed: { p: { signature: 'sam-2026.png' } }, signatureImage: (s) => (seen.push(s), null) });
    expect(seen).toEqual([{ name: 'Sam', image: 'sam-2026.png' }]);
  });

  it('escapes names and formats dates in the record locale', () => {
    const r = render('\\signature{p}', { variant: 'signed', locale: 'ja-JP', data: { p: { name: 'R&D 太郎' } }, signed: { p: { date: '2026-11-21' } } });
    expect(r.tex).toBe('\\lksignature{}{R\\&D 太郎}{}{/s/~R\\&D 太郎}{2026年11月21日}');
  });

  it('labels every line in a blank build', () => {
    expect(render('\\signature{discloser}', { variant: 'blank' }).tex).toBe(
      '\\lksignature{\\lkblank{discloser.name}}{\\lkblank{discloser.signer.name}}{\\lkblank{discloser.signer.title}}{}{}'
    );
  });

  it('fails a final build when the party or its signer is missing, and marks it in a draft', () => {
    expect(errors(render('\\signature{a}'))).toEqual(['missing value for a']);
    expect(errors(render('\\signature{a}', { data: { a: { name: 'Org', kind: 'organization' } } }))).toEqual(['missing value for a.signer']);
    const draft = render('\\signature{a}', { variant: 'draft', data: {} });
    expect(draft.tex).toBe('\\lkmissing{a}');
    expect(errors(draft)).toEqual([]);
    expect(errors(render('\\signature{a}', { data: { a: 'text' } }))[0]).toMatch(/a is not a party/);
  });

  it('is checked against the schema', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'object', properties: { name: { type: 'string' } } }, n: { type: 'number' } },
    };
    const r = analyzeTemplate(compileTemplate('\\signature{a}\\signature{n}\\signature{zz}', 't.tex'), { schema });
    expect(r.fields.map((f) => `${f.kind} ${f.absolute}`)).toEqual(['signature a', 'signature n', 'signature zz']);
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      '\\signature{n}: n has no name in the schema, so it is not a party or signer',
      "unknown field zz (not in the template's schema)",
    ]);
  });
});

describe('\\component', () => {
  const upper: Component = (v) => String(v).toUpperCase();
  const money: Component = (v, ctx) => tex`\\textbf{${ctx.format(v, 'money:USD')}}`;

  it('calls a component with the value at the path; strings are escaped, tex is not', () => {
    const r = render('\\component{upper}{co} \\component{money}{total}', { data: { co: 'r&d', total: 1200 }, components: { upper, money } });
    expect(r.tex).toBe('R\\&D \\textbf{\\$1,200.00}');
    expect(r.components).toEqual(['money', 'upper']);
  });

  it('passes the whole record for an empty path, and loop items by name', () => {
    const count: Component = (v) => String((v as { items: unknown[] }).items.length);
    const name: Component = (v) => (v as { n: string }).n;
    const r = render('\\component{count}{} \\each{items}{i}{\\component{name}{i}\\sep{,}}', { data: { items: [{ n: 'a' }, { n: 'b' }] }, components: { count, name } });
    expect(r.tex).toBe('2 a,b');
  });

  it('reports unknown components and thrown errors at the macro', () => {
    const boom: Component = () => {
      throw new Error('no rows');
    };
    const r = render('\\component{nope}{x}\n\\component{boom}{}', { components: { boom } });
    expect(r.diagnostics.map((d) => `${d.line}: ${d.message}`)).toEqual(['1: unknown component nope (known: boom)', '2: \\component{boom}: no rows']);
  });

  it('gives components the variant, a signature helper and a missing marker', () => {
    const c: Component = (v, ctx) => (v === undefined ? ctx.missing('rows') : new RawLatex(`${ctx.variant}:${ctx.signature(v, 'p').value}`));
    expect(render('\\component{c}{p}', { variant: 'draft', components: { c } }).tex).toBe('\\lkmissing{rows}');
    expect(render('\\component{c}{p}', { data: { p: { name: 'Sam' } }, components: { c } }).tex).toBe('final:\\lksignature{}{Sam}{}{}{}');
  });

  it('is checked by analyze', () => {
    const r = analyzeTemplate(compileTemplate('\\component{table}{rows}\\component{x}{}\\component{../x}{}', 't.tex'), { components: ['table'] });
    expect(r.components).toEqual(['table', 'x']);
    expect(r.fields.map((f) => f.absolute)).toEqual(['rows']);
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      '\\component{../x}: use a name like line-items or tables/fees',
      'unknown component x (known: table)',
    ]);
  });
});

describe('TypeScript clauses', () => {
  it('renders a clause body built in code after its heading', () => {
    const clause: LoadedClause = {
      id: 'nda/term',
      title: 'Term',
      version: '2',
      template: compileTemplate('', 'clauses/nda/term.ts'),
      render: (data) => tex`Lasts ${String((data as { months: number }).months)} months.`,
    };
    const r = render('\\clause{nda/term}', { data: { months: 24 }, loadClause: (id) => (id === 'nda/term' ? clause : null) });
    expect(r.tex).toBe('\\lkclause{Term}{clause:nda/term}Lasts 24 months.');
    expect(r.clauses).toEqual([{ id: 'nda/term', version: '2', file: 'clauses/nda/term.ts' }]);
  });
});
