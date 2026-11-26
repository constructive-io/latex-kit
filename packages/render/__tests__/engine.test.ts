import { detectEngine, loadedPackages } from '../src';

const doc = (preamble: string, body = 'Hello') => `\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`;

describe('detectEngine', () => {
  it('defaults to lualatex', () => {
    expect(detectEngine(doc('\\usepackage{fontspec}'))).toMatchObject({ engine: 'lualatex', warnings: [] });
    expect(detectEngine(doc('')).reason).toBe('default');
  });

  it('honours a % !TEX program line', () => {
    expect(detectEngine(`% !TEX program = xelatex\n${doc('')}`)).toMatchObject({ engine: 'xelatex', reason: '% !TEX program = xelatex' });
    expect(detectEngine(`% !TEX TS-program = pdflatex\n${doc('')}`).engine).toBe('pdflatex');
    expect(detectEngine(`%!TEX program = latex\n${doc('')}`).engine).toBe('pdfps');
  });

  it('routes PSTricks through dvips', () => {
    expect(detectEngine(doc('\\usepackage{pstricks,pst-node}')).engine).toBe('pdfps');
    expect(detectEngine(doc('\\usepackage{pst-plot}')).reason).toContain('pst-plot');
  });

  it('picks xelatex for xeCJK and ctex, lualatex for LuaTeX-ja, pdflatex for CJK', () => {
    expect(detectEngine(doc('\\usepackage{xeCJK}', '日本語')).engine).toBe('xelatex');
    expect(detectEngine('\\documentclass{ctexart}\n\\begin{document}中文\\end{document}').engine).toBe('xelatex');
    expect(detectEngine(doc('\\usepackage{luatexja-fontspec}', '日本語'))).toMatchObject({ engine: 'lualatex', warnings: [] });
    expect(detectEngine('\\documentclass{ltjsarticle}\n\\begin{document}日本語\\end{document}').engine).toBe('lualatex');
    expect(detectEngine(doc('\\usepackage{CJKutf8}', '日本語')).engine).toBe('pdflatex');
  });

  it('warns about CJK text with no CJK package', () => {
    const r = detectEngine(doc('\\usepackage{fontspec}', '株式会社'));
    expect(r.engine).toBe('lualatex');
    expect(r.warnings[0]).toMatch(/no CJK package/);
  });

  it('ignores commented-out packages', () => {
    expect(detectEngine(doc('% \\usepackage{pstricks}\n\\usepackage{amsmath} % \\usepackage{xeCJK}')).engine).toBe('lualatex');
    expect(loadedPackages(doc('\\usepackage[margin=1in]{geometry}\n\\RequirePackage{a, b}')).packages).toEqual(['geometry', 'a', 'b']);
  });
});
