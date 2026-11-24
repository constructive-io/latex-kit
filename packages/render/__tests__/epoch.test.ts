import { resolveSourceDateEpoch } from '../src';

const noGit = () => null;

describe('resolveSourceDateEpoch', () => {
  it('prefers an explicit value', () => {
    expect(resolveSourceDateEpoch('x.tex', { explicit: 5, env: { SOURCE_DATE_EPOCH: '9' } })).toEqual({
      epoch: 5,
      source: 'option',
      reproducible: true,
    });
  });
  it('then SOURCE_DATE_EPOCH', () => {
    expect(resolveSourceDateEpoch('x.tex', { env: { SOURCE_DATE_EPOCH: ' 42 ' }, git: () => '7' }).source).toBe('env');
  });
  it('then the last git commit of the file', () => {
    expect(resolveSourceDateEpoch('x.tex', { env: {}, git: () => '1700000000' })).toEqual({
      epoch: 1700000000,
      source: 'git',
      reproducible: true,
    });
  });
  it('falls back to the clock and says so', () => {
    const r = resolveSourceDateEpoch('x.tex', { env: { SOURCE_DATE_EPOCH: 'nope' }, git: noGit });
    expect(r.source).toBe('clock');
    expect(r.reproducible).toBe(false);
  });
  it('rejects a bad explicit value', () => {
    expect(() => resolveSourceDateEpoch('x.tex', { explicit: -1 })).toThrow();
  });
});
