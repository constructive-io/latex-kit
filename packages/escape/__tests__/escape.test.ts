import { escapeLatex, LatexEscapeError, raw, tex } from '../src';

describe('escapeLatex', () => {
  it('escapes every LaTeX special character', () => {
    expect(escapeLatex('\\ { } $ & # % _ ^ ~ < > | [ ]')).toBe(
      '\\textbackslash{} \\{ \\} \\$ \\& \\# \\% \\_ \\textasciicircum{} ' +
        '\\textasciitilde{} \\textless{} \\textgreater{} \\textbar{} {[} {]}'
    );
  });

  it('does not double-escape the output of a backslash', () => {
    expect(escapeLatex('\\{')).toBe('\\textbackslash{}\\{');
    expect(escapeLatex('\\textbf{x}')).toBe('\\textbackslash{}textbf\\{x\\}');
  });

  it('handles realistic names and amounts', () => {
    expect(escapeLatex('Smith & Jones, LLC')).toBe('Smith \\& Jones, LLC');
    expect(escapeLatex('50% of $1,000 (#3)')).toBe('50\\% of \\$1,000 (\\#3)');
    expect(escapeLatex('user_name@example.com')).toBe('user\\_name@example.com');
  });

  it('keeps hyphen runs literal', () => {
    // `-{}-` still ligates under LuaLaTeX; a zero kern does not (checked by
    // rendering with lualatex, xelatex and pdflatex)
    expect(escapeLatex('A--B')).toBe('A-\\kern0pt-B');
    expect(escapeLatex('A---B')).toBe('A-\\kern0pt-\\kern0pt-B');
    expect(escapeLatex('well-known')).toBe('well-known');
  });

  it('passes Unicode through unchanged', () => {
    expect(escapeLatex('Zoë Ünïcode — 東京 ✓')).toBe('Zoë Ünïcode — 東京 ✓');
  });

  it('turns tabs into spaces and normalises CRLF', () => {
    expect(escapeLatex('a\tb')).toBe('a b');
    expect(escapeLatex('a\r\nb')).toBe('a b');
  });

  describe('newlines', () => {
    const input = '1 Example Street\nSuite 2\n\nSecond paragraph';
    it('space (default)', () => {
      expect(escapeLatex(input)).toBe('1 Example Street Suite 2 Second paragraph');
    });
    it('linebreak', () => {
      expect(escapeLatex(input, { newlines: 'linebreak' })).toBe(
        '1 Example Street\\newline{}Suite 2\\newline{}Second paragraph'
      );
    });
    it('paragraph', () => {
      expect(escapeLatex(input, { newlines: 'paragraph' })).toBe(
        '1 Example Street\\newline{}Suite 2\n\nSecond paragraph'
      );
    });
    it('error', () => {
      expect(() => escapeLatex(input, { newlines: 'error' })).toThrow(LatexEscapeError);
    });
    it('never emits a line break at the start of a paragraph', () => {
      expect(escapeLatex('\n\na\n', { newlines: 'linebreak' })).toBe('a');
    });
  });

  describe('control characters', () => {
    it('throws by default', () => {
      expect(() => escapeLatex('a\u0000b')).toThrow(/U\+0000/);
      expect(() => escapeLatex('a\u000bb')).toThrow(/U\+000B/);
    });
    it('strips when asked', () => {
      expect(escapeLatex('a\u0007b\u007f', { controlChars: 'strip' })).toBe('ab');
    });
    it('is stable across repeated calls (no lastIndex leak)', () => {
      for (let i = 0; i < 3; i++) {
        expect(() => escapeLatex('x\u0001')).toThrow(LatexEscapeError);
        expect(escapeLatex('clean')).toBe('clean');
      }
    });
  });

  it('rejects non-strings', () => {
    expect(() => escapeLatex(undefined as unknown as string)).toThrow(LatexEscapeError);
  });
});

describe('tex', () => {
  it('escapes interpolated values and keeps literal LaTeX', () => {
    const name = 'R&D {Team}';
    expect(tex`\\textbf{${name}}`.value).toBe('\\textbf{R\\&D \\{Team\\}}');
  });

  it('inserts raw() values unchanged', () => {
    expect(tex`a ${raw('\\emph{b}')} c`.value).toBe('a \\emph{b} c');
  });

  it('nests', () => {
    const inner = tex`\\emph{${'50%'}}`;
    expect(tex`Fee: ${inner}`.value).toBe('Fee: \\emph{50\\%}');
  });

  it('formats numbers and bigints', () => {
    expect(tex`${-5} ${1.5} ${10n}`.value).toBe('-5 1.5 10');
  });

  it('throws on missing or non-text values', () => {
    expect(() => tex`${undefined as unknown as string}`).toThrow(/undefined/);
    expect(() => tex`${null as unknown as string}`).toThrow(/null/);
    expect(() => tex`${true as unknown as string}`).toThrow(/boolean/);
    expect(() => tex`${NaN}`).toThrow(/NaN/);
    expect(() => tex`${[1] as unknown as string}`).toThrow(/array/);
  });
});
