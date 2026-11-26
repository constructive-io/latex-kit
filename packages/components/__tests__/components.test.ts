import { compileTemplate, Component, EvaluateOptions,evaluateTemplate } from '@latex-kit/template';

import { BUILTIN_COMPONENTS, defineClause, defineComponent, money, raw, table, tex } from '../src';

const run = (src: string, opts: Partial<EvaluateOptions> & { data?: unknown; components?: Record<string, Component> } = {}) =>
  evaluateTemplate(compileTemplate(src, 't.tex'), { variant: 'final', data: {}, ...opts, components: { ...BUILTIN_COMPONENTS, ...opts.components } });

const items = [
  { description: 'Widgets & bolts', quantity: 12, amount: 5400 },
  { description: 'Setup', quantity: 1, amount: 300 },
];

describe('table', () => {
  const lineItems = defineComponent<{ items: typeof items; total: number }>((data, ctx) =>
    table(
      data?.items,
      [
        { header: 'Description', value: 'description' },
        { header: 'Qty', value: 'quantity', format: 'number', align: 'r' },
        { header: 'Amount', value: (r) => r.amount, format: 'money:USD', align: 'r' },
      ],
      ctx,
      { footer: [[raw('\\textbf{Total}'), '', money(ctx, data?.total, 'USD')]] }
    )
  );

  it('prints a booktabs tabularx with formatted, escaped cells and a footer', () => {
    const r = run('\\component{line-items}{}', { data: { items, total: 5700 }, components: { 'line-items': lineItems } });
    expect(r.diagnostics).toEqual([]);
    expect(r.tex).toBe(
      [
        '\\begin{tabularx}{\\linewidth}{@{}Xrr@{}}',
        '\\toprule',
        'Description & Qty & Amount \\\\',
        '\\midrule',
        'Widgets \\& bolts & 12 & \\$5,400.00 \\\\',
        'Setup & 1 & \\$300.00 \\\\',
        '\\midrule',
        '\\textbf{Total} &  & \\$5,700.00 \\\\',
        '\\bottomrule',
        '\\end{tabularx}',
      ].join('\n')
    );
  });

  it('formats in the record locale', () => {
    const r = run('\\component{line-items}{}', { locale: 'de-DE', data: { items, total: 5700 }, components: { 'line-items': lineItems } });
    expect(r.tex).toContain('Widgets \\& bolts & 12 & 5.400,00~\\$ \\\\');
  });

  it('prints a row of labelled blanks in a blank build', () => {
    const r = run('\\component{line-items}{}', { variant: 'blank', components: { 'line-items': lineItems } });
    expect(r.tex).toContain('\\lkblank{description} & \\lkblank{quantity} & \\lkblank{Amount} \\\\');
  });
});

describe('built-in components', () => {
  const parties = [
    { name: 'Example Widgets, Inc.', signer: { name: 'Avery Example', title: 'CEO' } },
    { name: 'Sam Sample' },
    { name: 'Third Co', signer: { name: 'Jo Third' } },
  ];

  it('signatures: two blocks per row', () => {
    const r = run('\\component{signatures}{parties}', { data: { parties } });
    expect(r.tex).toBe(
      '\\par\\noindent \\lksignaturefor{parties.0}\\lksignature{Example Widgets, Inc.}{Avery Example}{CEO}{}{}\\hfill \\lksignaturefor{parties.1}\\lksignature{}{Sam Sample}{}{}{}\\par' +
        '\\vspace{2em}\\par\\noindent \\lksignaturefor{parties.2}\\lksignature{Third Co}{Jo Third}{}{}{}\\par'
    );
    expect(run('\\component{signatures}{parties}', { variant: 'signed', data: { parties } }).tex).toContain('{/s/~Sam Sample}');
  });

  it('exhibits: lettered pages from { title, body } or strings', () => {
    const r = run('\\component{exhibits}{ex}', { data: { ex: [{ title: 'Pricing', body: 'Fees:\n5%.\n\nNet 30.\n' }, 'Plain'] } });
    expect(r.tex).toBe('\\lkexhibit{Pricing}{exhibit:1}\nFees: 5\\%.\n\nNet 30.\n\\lkexhibit{}{exhibit:2}\nPlain\n');
    expect(run('\\component{exhibits}{ex}').tex).toBe('');
  });

  it('bilingual: the record language first', () => {
    const name = { en: 'Sample KK', ja: '株式会社サンプル' };
    expect(run('\\component{bilingual}{n}', { locale: 'ja-JP', data: { n: name } }).tex).toBe('株式会社サンプル (Sample KK)');
    expect(run('\\component{bilingual}{n}', { locale: 'en-US', data: { n: name } }).tex).toBe('Sample KK (株式会社サンプル)');
    expect(run('\\component{bilingual}{n}', { data: { n: 'Just one' } }).tex).toBe('Just one');
  });

  it('address: one line per part', () => {
    const r = run('\\component{address}{a}', { data: { a: { line1: '1 Example St', city: 'Springfield', region: 'IL', postalCode: '62701', country: 'USA' } } });
    expect(r.tex).toBe('1 Example St\\\\\nSpringfield, IL 62701\\\\\nUSA');
    expect(run('\\component{address}{a}', { variant: 'draft' }).tex).toBe('\\lkmissing{a}');
  });

  it('tex escapes values in components', () => {
    expect(tex`\\textbf{${'50%'}}`.value).toBe('\\textbf{50\\%}');
  });
});

describe('defineClause', () => {
  it('needs a body or a render function', () => {
    expect(defineClause({ title: 'T', body: 'x' })).toEqual({ title: 'T', body: 'x' });
    expect(() => defineClause({ title: 'T' })).toThrow(/body/);
  });
});
