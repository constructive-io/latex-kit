import { buildCommand, DEFAULT_IMAGE, insideRoot, latexdiffScript, pandocArgs, PathOutsideRootError } from '../src';

const base = {
  root: '/proj',
  file: 'examples/letter/letter.tex',
  outDir: 'out',
  engine: 'lualatex' as const,
  backend: 'docker' as const,
  image: DEFAULT_IMAGE,
  platform: 'linux/amd64',
  sourceDateEpoch: 1700000000,
};

describe('buildCommand', () => {
  it('builds a pinned, reproducible docker run', () => {
    const c = buildCommand(base);
    expect(c.cmd).toBe('docker');
    expect(c.args).toEqual([
      'run', '--rm', '--platform', 'linux/amd64',
      '-v', '/proj:/work', '-w', '/work',
      '-e', 'SOURCE_DATE_EPOCH=1700000000', '-e', 'FORCE_SOURCE_DATE=1',
      DEFAULT_IMAGE,
      'latexmk', '-lualatex', '-g', '-interaction=nonstopmode', '-halt-on-error', '-file-line-error',
      '-outdir=out', 'examples/letter/letter.tex',
    ]);
  });

  it('runs as the caller with a writable home when a user is given', () => {
    const c = buildCommand({ ...base, user: '1001:121' });
    expect(c.args.join(' ')).toContain('--user 1001:121 -e HOME=/tmp -e TEXMFVAR=/tmp/texmf-var');
  });

  it('adds search directories as TEXINPUTS, keeping the defaults', () => {
    const c = buildCommand({ ...base, texInputs: ['templates/nda', 'out/doc', '.'] });
    expect(c.args).toContain('TEXINPUTS=./templates/nda:./out/doc:.:');
    expect(() => buildCommand({ ...base, texInputs: ['../elsewhere'] })).toThrow(PathOutsideRootError);
  });

  it('omits --platform when null', () => {
    expect(buildCommand({ ...base, platform: null }).args).not.toContain('--platform');
  });

  it('maps engines to latexmk flags', () => {
    expect(buildCommand({ ...base, engine: 'xelatex' }).args).toContain('-xelatex');
    expect(buildCommand({ ...base, engine: 'pdflatex' }).args).toContain('-pdf');
  });

  it('runs latexmk directly for the local backend', () => {
    const c = buildCommand({ ...base, backend: 'local' });
    expect(c.cmd).toBe('latexmk');
    expect(c.cwd).toBe('/proj');
    expect(c.env).toEqual({ SOURCE_DATE_EPOCH: '1700000000', FORCE_SOURCE_DATE: '1' });
  });

  it('accepts absolute paths inside the root', () => {
    expect(buildCommand({ ...base, file: '/proj/a.tex', outDir: '/proj/build/x' }).args.slice(-2)).toEqual([
      '-outdir=build/x',
      'a.tex',
    ]);
  });
});

describe('insideRoot', () => {
  it('refuses paths outside the root', () => {
    expect(() => insideRoot('file', '/proj', '../secret.tex')).toThrow(PathOutsideRootError);
    expect(() => insideRoot('file', '/proj', '/etc/passwd')).toThrow(PathOutsideRootError);
    expect(() => insideRoot('file', '/proj', '/proj')).toThrow(PathOutsideRootError);
  });
  it('allows the root itself as an output directory', () => {
    expect(insideRoot('output directory', '/proj', '.')).toBe('.');
  });
});

describe('tool commands', () => {
  it('quotes latexdiff paths for the shell', () => {
    expect(latexdiffScript('out/a b/old.tex', "out/it's/new.tex", 'out/d.tex')).toBe(
      "latexdiff --encoding=utf8 --type=UNDERLINE 'out/a b/old.tex' 'out/it'\\''s/new.tex' > 'out/d.tex'"
    );
  });
  it('builds standalone pandoc LaTeX with media extraction', () => {
    expect(pandocArgs({ input: 'in.docx', output: 'templates/x/template.tex', extractMedia: 'templates/x/media' })).toEqual([
      '--standalone',
      '--to=latex',
      '--output=templates/x/template.tex',
      '--extract-media=templates/x/media',
      'in.docx',
    ]);
  });
});
