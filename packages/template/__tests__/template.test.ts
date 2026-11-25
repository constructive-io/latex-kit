import {
  analyzeTemplate,
  CompiledTemplate,
  compileTemplate,
  Diagnostic,
  EvaluateOptions,
  evaluateTemplate,
  formatDiagnostic,
  JsonSchema,
  LATEX_KIT_STY,
  numberToWords,
  parseClauseHeader,
  parseCondition,
  parseFieldSpec,
  wrapDocument,
} from '../src';

const render = (src: string, opts: Partial<EvaluateOptions> & { data?: unknown } = {}, snippets: Record<string, string> = {}) => {
  const t = compileTemplate(src, 't.tex');
  const loadSnippet = (name: string): CompiledTemplate | null =>
    name in snippets ? compileTemplate(snippets[name], `${name}.tex`) : null;
  return evaluateTemplate(t, { variant: 'final', data: {}, loadSnippet, ...opts });
};
const errors = (r: { diagnostics: Diagnostic[] }) => r.diagnostics.filter((d) => d.severity === 'error');

describe('compile + evaluate', () => {
  it('leaves everything that is not a template macro byte-for-byte', () => {
    const src = '\\documentclass{article}\n%  comment \\field{x}\n\\begin{document}\n  Hello,\t\\field{name}!  \n\\end{document}\n';
    expect(render(src, { data: { name: 'Avery' } }).tex).toBe(src.replace('\\field{name}', 'Avery'));
  });

  it('escapes values', () => {
    expect(render('\\field{co}', { data: { co: 'R&D 50% #1' } }).tex).toBe('R\\&D 50\\% \\#1');
  });

  it('inserts \\raw values unescaped', () => {
    expect(render('\\raw{x}', { data: { x: '\\textbf{hi}' } }).tex).toBe('\\textbf{hi}');
  });

  it('ignores macros in comments, verbatim and \\verb', () => {
    const src = '% \\field{a}\n\\begin{verbatim}\\field{a}\\end{verbatim}\\verb|\\field{a}|';
    expect(render(src).tex).toBe(src);
  });

  it('finds fields nested in other macros, groups and math', () => {
    expect(render('\\textbf{\\field{a}} {\\field{a}} $\\field{n}$', { data: { a: 'x', n: 2 } }).tex).toBe('\\textbf{x} {x} $2$');
  });

  it('reads nested paths and list indexes', () => {
    expect(render('\\field{p.address.city} \\field{items.1}', { data: { p: { address: { city: 'Springfield' } }, items: ['a', 'b'] } }).tex).toBe(
      'Springfield b'
    );
  });

  it('does not read inherited properties', () => {
    const r = render('\\field{x.constructor}', { data: { x: {} } });
    expect(errors(r)[0].message).toMatch(/missing value/);
  });

  describe('filters', () => {
    const f = (spec: string, value: unknown, locale = 'en-US') => render(`\\field{v|${spec}}`, { data: { v: value }, locale }).tex;
    it('formats dates in UTC', () => {
      expect(f('date', '2026-11-25')).toBe('November 25, 2026');
      expect(f('date:short', '2026-11-25')).toBe('11/25/26');
      expect(f('date:iso', '2026-11-25')).toBe('2026-11-25');
      expect(f('date', '2026-11-25', 'ja-JP')).toBe('2026年11月25日');
    });
    it('formats money, numbers and percents', () => {
      expect(f('money:USD', 5400)).toBe('\\$5,400.00');
      expect(render('\\field{v|money}', { data: { v: { amount: 12.5, currency: 'EUR' } }, locale: 'de-DE' }).tex).toBe('12,50~€');
      expect(f('number:2', 1234.5)).toBe('1,234.50');
      expect(f('percent', 0.15)).toBe('15\\%');
      // fr-FR groups with a narrow no-break space, which many fonts lack
      expect(f('number', 1234567, 'fr-FR')).toBe('1\\,234\\,567');
    });
    it('spells numbers', () => {
      expect(f('words', 1200)).toBe('one thousand two hundred');
      expect(numberToWords(21)).toBe('twenty-one');
      expect(numberToWords(1000001)).toBe('one million one');
      expect(numberToWords(-3)).toBe('minus three');
    });
    it('changes case and joins', () => {
      expect(f('upper', 'avery')).toBe('AVERY');
      expect(f('title', 'jordan rivera-smith')).toBe('Jordan Rivera-Smith');
      expect(f('join', ['a', 'b&c'])).toBe('a, b\\&c');
      expect(f('join:" and "', ['a', 'b'])).toBe('a and b');
    });
    it('uses default only when missing', () => {
      expect(f('default:"N/A"', undefined)).toBe('N/A');
      expect(f('default:"N/A"', '')).toBe('N/A');
      expect(f('default:"N/A"', 'x')).toBe('x');
      expect(f('upper|default:"none"', undefined)).toBe('none');
      // an empty default means "print nothing", not "missing"
      const r = render('[\\field{v|default:""}]', { data: {} });
      expect(r.tex).toBe('[]');
      expect(errors(r)).toHaveLength(0);
    });
    it('keeps line breaks when asked', () => {
      expect(f('lines', '1 Main St\nSuite 2')).toBe('1 Main St\\newline{}Suite 2');
    });
    it('reports filter errors at the field', () => {
      const r = render('\n  \\field{v|money:USD}', { data: { v: 'lots' } });
      expect(formatDiagnostic(errors(r)[0])).toBe('t.tex:2:3: error: \\field{v|money:USD}: money: expected a number, got "lots"');
    });
  });

  describe('missing values by variant', () => {
    it('final: error with location', () => {
      const r = render('Dear \\field{party.name},', { data: {} });
      expect(r.tex).toBe('Dear ,');
      expect(errors(r).map(formatDiagnostic)).toEqual(['t.tex:1:6: error: missing value for party.name']);
    });
    it('draft: red marker and a warning', () => {
      const r = render('\\field{party.name}', { variant: 'draft' });
      expect(r.tex).toBe('\\lkmissing{party.name}');
      expect(errors(r)).toHaveLength(0);
      expect(r.diagnostics[0].severity).toBe('warning');
    });
    it('draft can be made strict', () => {
      expect(errors(render('\\field{x}', { variant: 'draft', allowMissing: false }))).toHaveLength(1);
    });
    it('blank: every field is a labelled line, even when data exists', () => {
      expect(render('\\field{a} \\docid', { variant: 'blank', data: { a: 'x' } }).tex).toBe('\\lkblank{a} \\lkblank{docid}');
    });
  });

  it('rejects booleans, objects and lists in \\field', () => {
    const r = render('\\field{a}\\field{b}\\field{c}', { data: { a: true, b: {}, c: [1] } });
    expect(errors(r).map((d) => d.message)).toEqual([
      'a is true/false (use \\when to test it)',
      'b is an object (pick a field inside it)',
      'c is a list (use \\each or |join)',
    ]);
  });

  describe('\\when', () => {
    const w = (cond: string, data: unknown) => render(`\\when{${cond}}{yes}\\otherwise{no}`, { data }).tex;
    it('evaluates comparisons and logic', () => {
      expect(w('fee > 0', { fee: 5 })).toBe('yes');
      expect(w('fee > 0', { fee: 0 })).toBe('no');
      expect(w('kind == "llc" && !exempt', { kind: 'llc', exempt: false })).toBe('yes');
      expect(w('(a || b) && c', { b: 1, c: 'x' })).toBe('yes');
      expect(w('missing.path', {})).toBe('no');
      expect(w('items', { items: [] })).toBe('no');
      expect(w('$variant == "final"', {})).toBe('yes');
    });
    it('allows a line break before \\otherwise', () => {
      expect(render('\\when{a}{yes}\n\\otherwise{no}', { data: {} }).tex).toBe('no');
    });
    it('works without \\otherwise and keeps following text', () => {
      expect(render('\\when{a}{A} rest', { data: { a: 1 } }).tex).toBe('A rest');
      expect(render('\\when{a}{A} rest', { data: {} }).tex).toBe(' rest');
    });
    it('nests', () => {
      expect(render('\\when{a}{\\when{b}{AB}\\otherwise{A}}\\otherwise{none}', { data: { a: 1 } }).tex).toBe('A');
    });
    it('reports bad conditions and stray \\otherwise', () => {
      expect(compileTemplate('\\when{a = 1}{x}', 't.tex').diagnostics[0].message).toMatch(/use == to compare/);
      expect(compileTemplate('\\otherwise{x}', 't.tex').diagnostics[0].message).toMatch(/must come right after/);
      expect(compileTemplate('\\when{a}{x}\n\n\\otherwise{y}', 't.tex').diagnostics[0].message).toMatch(/must come right after/);
    });
  });

  describe('\\each', () => {
    it('loops with \\sep and loop values', () => {
      const data = { items: [{ n: 'a' }, { n: 'b' }, { n: 'c' }] };
      expect(render('\\each{items}{it}{\\field{it.n}\\sep{, }}', { data }).tex).toBe('a, b, c');
      expect(render('\\each{items}{it}{\\field{$index}.\\when{$last}{!}}', { data }).tex).toBe('1.2.3.!');
    });
    it('nests and reads outer scopes', () => {
      const data = { groups: [{ name: 'G', items: ['x', 'y'] }] };
      expect(render('\\each{groups}{g}{\\each{g.items}{i}{\\field{g.name}-\\field{i} }}', { data }).tex).toBe('G-x G-y ');
    });
    it('renders an empty list as nothing and a missing list as an error', () => {
      expect(render('[\\each{xs}{x}{\\field{x}}]', { data: { xs: [] } }).tex).toBe('[]');
      expect(errors(render('\\each{xs}{x}{\\field{x}}', { data: {} }))).toHaveLength(1);
    });
    it('renders the body once in a blank form', () => {
      expect(render('\\each{xs}{x}{\\field{x.name}}', { variant: 'blank' }).tex).toBe('\\lkblank{x.name}');
    });
    it('rejects \\sep outside \\each', () => {
      expect(compileTemplate('\\sep{,}', 't.tex').diagnostics[0].message).toMatch(/only works inside/);
    });
  });

  describe('\\snippet', () => {
    it('includes another template with the same data', () => {
      expect(render('A \\snippet{parts/sig} B', { data: { who: 'Avery' } }, { 'parts/sig': '[\\field{who}]' }).tex).toBe('A [Avery] B');
    });
    it('reports missing snippets and cycles', () => {
      expect(errors(render('\\snippet{nope}'))[0].message).toBe('snippet not found: nope');
      const r = render('\\snippet{a}', {}, { a: '\\snippet{b}', b: '\\snippet{a}' });
      expect(errors(r)[0].message).toMatch(/includes itself/);
    });
    it('rejects names that leave the project', () => {
      expect(compileTemplate('\\snippet{../x}', 't.tex').diagnostics[0].message).toMatch(/relative name/);
    });
  });

  it('prints the document ID', () => {
    expect(render('ID: \\docid{} and \\docid.', { docId: 'NDA-2026-AB12' }).tex).toBe('ID: NDA-2026-AB12 and NDA-2026-AB12.');
    expect(errors(render('\\docid'))[0].message).toBe('missing value for the document ID');
  });

  it('reports syntax errors with locations', () => {
    const t = compileTemplate('ok\n\\field x\n\\field{a|nope}\n\\field{a b}\n\\each{xs}{1x}{}\n\\clauseref{../c}', 't.tex');
    expect(t.diagnostics.map(formatDiagnostic)).toEqual([
      't.tex:2:8: error: \\field needs 1 {…} argument',
      't.tex:3:1: error: \\field{a|nope}: unknown filter "nope" (known: upper, lower, title, trim, date, money, number, percent, words, join, default, lines, paragraphs)',
      't.tex:4:1: error: \\field{a b}: invalid field path "a b" (use names and dots, like party.name or items.0.price)',
      't.tex:5:1: error: \\each: invalid item name "1x" (use a simple name like item)',
      "t.tex:6:1: error: \\clauseref{../c}: use the clause's name, like nda/confidentiality",
    ]);
  });

  it('handles Unicode around macros', () => {
    expect(render('Zoë 東京 😀 \\field{a} ✓', { data: { a: 'é' } }).tex).toBe('Zoë 東京 😀 é ✓');
  });
});

describe('clauses', () => {
  const library: Record<string, string> = {
    'nda/confidentiality': '% title: Confidentiality & Care\n% version: 3\nKeep it secret for \\field{months} months.\n',
    'nda/term': '% version: 1\nSee \\clauseref{nda/confidentiality}.\n',
    loop: '% title: Loop\n\\clause{loop}',
  };
  const loadClause = (id: string) =>
    id in library ? { id, template: compileTemplate(library[id], `clauses/${id}.tex`), ...parseClauseHeader(library[id]) } : null;
  const run = (src: string, variant: EvaluateOptions['variant'] = 'final') =>
    evaluateTemplate(compileTemplate(src, 't.tex'), { variant, data: { months: 24 }, loadClause });

  it('reads the header', () => {
    expect(parseClauseHeader('\n% title: A\n%version:2\n% other\nbody % title: no')).toEqual({ title: 'A', version: '2' });
  });

  it('places numbered clauses and resolves references to labels', () => {
    const r = run('\\clauseref{nda/confidentiality} \\clause{nda/confidentiality}\\clause{nda/term}');
    expect(errors(r)).toEqual([]);
    expect(r.tex).toContain('\\ref{clause:nda/confidentiality} \\lkclause{Confidentiality \\& Care}{clause:nda/confidentiality}');
    expect(r.tex).toContain('Keep it secret for 24 months.');
    expect(r.tex).toContain('\\lkclause{}{clause:nda/term}');
    expect(r.clauses).toEqual([
      { id: 'nda/confidentiality', version: '3', file: 'clauses/nda/confidentiality.tex' },
      { id: 'nda/term', version: '1', file: 'clauses/nda/term.tex' },
    ]);
  });

  it('fails a final build that refers to a clause it does not contain', () => {
    expect(errors(run('\\clause{nda/term}')).map((d) => d.message)).toEqual([
      '\\clauseref{nda/confidentiality}: clause nda/confidentiality is not in this document',
    ]);
    expect(errors(run('\\clause{nda/term}', 'draft'))).toEqual([]);
  });

  it('reports missing, repeated and self-including clauses', () => {
    expect(errors(run('\\clause{nope}'))[0].message).toBe('clause not found: nope');
    expect(errors(run('\\clause{nda/term}\\clause{nda/confidentiality}\\clause{nda/term}')).map((d) => d.message)).toContain('clause nda/term is placed twice');
    expect(errors(run('\\clause{loop}'))[0].message).toBe('clause loop includes itself');
  });

  it('is checked statically, including fields inside clauses', () => {
    const schema: JsonSchema = { type: 'object', properties: { months: { type: 'number' } } };
    const ok = analyzeTemplate(compileTemplate('\\clause{nda/confidentiality}\\clause{nda/term}', 't.tex'), { schema, loadClause });
    expect(ok.diagnostics.map((d) => d.message)).toEqual(['clause nda/term has no "% title:" line, so it prints as a bare number']);
    expect(ok.clauses.map((c) => `${c.id}@${c.version}`)).toEqual(['nda/confidentiality@3', 'nda/term@1']);
    const bad = analyzeTemplate(compileTemplate('\\clause{nda/term}', 't.tex'), { schema: { type: 'object', properties: {} }, loadClause });
    expect(bad.diagnostics.map((d) => d.message)).toContain('\\clauseref{nda/confidentiality}: the template never places \\clause{nda/confidentiality}');
  });
});

describe('parseFieldSpec', () => {
  it('splits filters, honouring quotes', () => {
    expect(parseFieldSpec(' a.b | date:long | default:"x | y" ')).toEqual({
      path: 'a.b',
      filters: [{ name: 'date', arg: 'long' }, { name: 'default', arg: 'x | y' }],
    });
  });
  it('validates arguments', () => {
    expect(() => parseFieldSpec('a|money:usd')).toThrow(/currency code/);
    expect(() => parseFieldSpec('a|upper:x')).toThrow(/takes no argument/);
    expect(() => parseFieldSpec('a|default')).toThrow(/needs an argument/);
    expect(() => parseFieldSpec('a|date:soon')).toThrow(/expected one of/);
  });
});

describe('parseCondition', () => {
  it('parses precedence', () => {
    expect(parseCondition('a || b && !c')).toEqual({
      type: 'or',
      left: { type: 'path', path: 'a' },
      right: { type: 'and', left: { type: 'path', path: 'b' }, right: { type: 'not', expr: { type: 'path', path: 'c' } } },
    });
  });
  it('rejects anything outside the grammar', () => {
    expect(() => parseCondition('a; b')).toThrow();
    expect(() => parseCondition('f(x)')).toThrow();
    expect(() => parseCondition('a &')).toThrow(/use &&/);
    expect(() => parseCondition('')).toThrow(/empty/);
  });
});

describe('analyzeTemplate', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      party: { type: 'object', properties: { name: { type: 'string' }, address: { $ref: '#/$defs/Address' } } },
      items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, price: { type: 'number' } } } },
      fee: { type: 'number' },
      meta: { type: 'object', additionalProperties: { type: 'string' } },
      kind: { anyOf: [{ type: 'object', properties: { a: { type: 'string' } } }, { type: 'object', properties: { b: { type: 'string' } } }] },
    },
    $defs: { Address: { type: 'object', properties: { city: { type: 'string' } } } },
  };
  const analyze = (src: string) => analyzeTemplate(compileTemplate(src, 't.tex'), { schema });

  it('lists fields with absolute paths', () => {
    const r = analyze('\\field{party.name|upper} \\each{items}{it}{\\field{it.price|money:USD}} \\when{fee > 0}{}');
    expect(r.diagnostics).toEqual([]);
    expect(r.fields.map((f) => [f.kind, f.absolute, f.filters.join('|')])).toEqual([
      ['field', 'party.name', 'upper'],
      ['each', 'items', ''],
      ['field', 'items[].price', 'money:USD'],
      ['when', 'fee', ''],
    ]);
  });

  it('follows $ref, unions and maps', () => {
    expect(analyze('\\field{party.address.city}\\field{meta.anything}\\field{kind.a}\\field{kind.b}').diagnostics).toEqual([]);
  });

  it('reports unknown fields, non-lists and specials out of place', () => {
    const r = analyze('\\field{party.nmae}\n\\each{fee}{f}{}\n\\field{$index}\n\\field{$nope}\n\\field{items.0.price}');
    expect(r.diagnostics.map(formatDiagnostic)).toEqual([
      't.tex:1:1: error: unknown field party.nmae (not in the template\'s schema)',
      't.tex:2:1: error: \\each{fee}: fee is not a list in the schema',
      't.tex:3:1: error: $index only works inside \\each',
      't.tex:4:1: error: unknown special value $nope (known: $variant, $locale, $docid, $template, $index, $first, $last)',
    ]);
  });

  it('warns about \\raw', () => {
    expect(analyze('\\raw{party.name}').diagnostics[0]).toMatchObject({ severity: 'warning' });
  });

  it('checks syntax only when there is no schema', () => {
    expect(analyzeTemplate(compileTemplate('\\field{whatever.you.like}', 't.tex')).diagnostics).toEqual([]);
  });
});

describe('wrapDocument', () => {
  it('passes the variant on line 1 and loads the package', () => {
    const out = wrapDocument('\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n', { variant: 'draft', stamp: '2026-11-25 abc_123' });
    expect(out.split('\n')[0]).toBe('\\PassOptionsToPackage{rendered,draft}{latex-kit}\\def\\lkstamp{2026-11-25 abc\\_123}\\documentclass{article}');
    expect(out).toContain('\\usepackage{latex-kit}\\begin{document}');
    expect(out.split('\n')).toHaveLength(5);
  });
  it('does not load the package twice', () => {
    const out = wrapDocument('\\documentclass{article}\n\\usepackage[x]{geometry,latex-kit}\n\\begin{document}\\end{document}', { variant: 'final' });
    expect(out.match(/latex-kit\}/g)).toHaveLength(2); // PassOptions + the template's own
  });
});

it('ships latex-kit.sty', () => {
  expect(LATEX_KIT_STY).toContain('\\ProvidesPackage{latex-kit}');
  expect(LATEX_KIT_STY).toContain('\\newcommand\\field[1]');
});
