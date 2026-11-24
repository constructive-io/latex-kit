import { formatDiagnostic, parseLog } from '../src';

const LOG = `This is LuaHBTeX, Version 1.11.0 (TeX Live 2019)
(./letter.tex
LaTeX Warning: Reference \`sec:fees' on page 1 undefined on input line 14.

Package hyperref Warning: Token not allowed in a PDF string (Unicode):
(hyperref)                removing \`\\\\' on input line 20.

./letter.tex:31: Undefined control sequence.
l.31 \\fieldx
             {party.name}
! LaTeX Error: File \`missing.sty' not found.
! Emergency stop.
`;

describe('parseLog', () => {
  const d = parseLog(LOG);

  it('finds file:line errors', () => {
    expect(d).toContainEqual({ severity: 'error', file: 'letter.tex', line: 31, message: 'Undefined control sequence.' });
  });

  it('keeps location-less errors', () => {
    expect(d).toContainEqual({ severity: 'error', message: "LaTeX Error: File `missing.sty' not found." });
  });

  it('finds warnings with their input line, joining wrapped lines', () => {
    expect(d).toContainEqual({ severity: 'warning', message: "Reference `sec:fees' on page 1 undefined", line: 14 });
    const hyper = d.find((x) => x.message.startsWith('Token not allowed'));
    expect(hyper).toMatchObject({ severity: 'warning', line: 20 });
    expect(hyper!.message).toContain('removing');
  });

  it('formats for the terminal', () => {
    expect(formatDiagnostic(d[d.length - 1])).toMatch(/^error: /);
    expect(formatDiagnostic({ severity: 'error', file: 'a.tex', line: 3, message: 'x' })).toBe('error: a.tex:3: x');
  });
});
