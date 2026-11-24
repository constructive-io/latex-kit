import { renderOptionsFromArgv, UsageError } from '../src/args';

describe('renderOptionsFromArgv', () => {
  it('defaults to lualatex in docker, out/', () => {
    expect(renderOptionsFromArgv({ _: ['letter.tex'] })).toMatchObject({
      file: 'letter.tex',
      engine: 'lualatex',
      backend: 'docker',
      outDir: 'out',
    });
  });

  it('reads flags', () => {
    expect(
      renderOptionsFromArgv({ _: ['a.tex'], engine: 'xelatex', out: 'build', 'source-date-epoch': '1700000000', root: '..' })
    ).toMatchObject({ engine: 'xelatex', outDir: 'build', sourceDateEpoch: 1700000000, root: '..' });
  });

  it('switches to the local backend', () => {
    expect(renderOptionsFromArgv({ _: ['a.tex'], local: true }).backend).toBe('local');
  });

  it('rejects bad input', () => {
    expect(() => renderOptionsFromArgv({ _: ['a.tex'], engine: 'context' })).toThrow(UsageError);
    expect(() => renderOptionsFromArgv({ _: ['a.tex'], 'source-date-epoch': 'yesterday' })).toThrow(UsageError);
    expect(() => renderOptionsFromArgv({ _: ['a.tex'], local: true, image: 'x' })).toThrow(UsageError);
  });

  it('leaves file undefined so the CLI can prompt', () => {
    expect(renderOptionsFromArgv({ _: [] }).file).toBeUndefined();
  });
});
