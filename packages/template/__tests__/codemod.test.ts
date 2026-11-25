import { camelSegment, convertPlaceholders, ensureLatexKitPackage } from '../src';

describe('camelSegment', () => {
  it('camel-cases SNAKE and UPPER names, keeps camelCase', () => {
    expect(camelSegment('COMPANY')).toBe('company');
    expect(camelSegment('LEGAL_NAME')).toBe('legalName');
    expect(camelSegment('LEGAL\\_NAME')).toBe('legalName');
    expect(camelSegment('legalName')).toBe('legalName');
    expect(camelSegment('ADDRESS_LINE_1')).toBe('addressLine1');
  });
});

describe('convertPlaceholders', () => {
  it('converts the legacy @GROUP@FIELD@ tokens', () => {
    const r = convertPlaceholders('Between @COMPANY@LEGAL_NAME@ and\n@CONSULTANT@NAME@, effective @AGREEMENT@START_DATE@.');
    expect(r.tex).toBe('Between \\field{company.legalName} and\n\\field{consultant.name}, effective \\field{agreement.startDate}.');
    expect(r.converted.map((c) => [c.from, c.line])).toEqual([
      ['@COMPANY@LEGAL_NAME@', 1],
      ['@CONSULTANT@NAME@', 2],
      ['@AGREEMENT@START_DATE@', 2],
    ]);
  });

  it('converts pandoc-escaped tokens', () => {
    expect(convertPlaceholders('@COMPANY@LEGAL\\_NAME@').tex).toBe('\\field{company.legalName}');
    expect(convertPlaceholders('Dear \\{\\{candidate.first\\_name\\}\\},').tex).toBe('Dear \\field{candidate.first_name},');
  });

  it('converts {{ path }} placeholders', () => {
    const r = convertPlaceholders('Dear {{ candidate.name }}, salary {{salary}}.');
    expect(r.tex).toBe('Dear \\field{candidate.name}, salary \\field{salary}.');
    expect(r.converted).toHaveLength(2);
  });

  it('leaves email addresses and invalid paths alone, reporting the latter', () => {
    expect(convertPlaceholders('mail jo@example.com').tex).toBe('mail jo@example.com');
    const r = convertPlaceholders('{{ not a path }} {{ ok }}');
    expect(r.tex).toBe('{{ not a path }} \\field{ok}');
    expect(r.skipped.map((s) => s.from)).toEqual(['{{ not a path }}']);
  });
});

describe('ensureLatexKitPackage', () => {
  it('adds the package once, before \\begin{document}', () => {
    const t = '\\documentclass{article}\n\\begin{document}x\\end{document}';
    const once = ensureLatexKitPackage(t);
    expect(once).toBe('\\documentclass{article}\n\\usepackage{latex-kit}\n\\begin{document}x\\end{document}');
    expect(ensureLatexKitPackage(once)).toBe(once);
  });
});
