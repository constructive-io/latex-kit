import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { parseFormFile, writeFormJson } from '../src/form';

// 72.27 TeX points to the inch, 65536 scaled points to a TeX point
const sp = (inches: number) => Math.round(inches * 72.27 * 65536);

describe('form fields', () => {
  it('reads the spots TeX wrote, in PDF points from the bottom-left', () => {
    const line = `signature company 8 ${sp(1)} ${sp(7)} ${sp(2.75)} ${sp(0.25)} ${sp(0.125)}`;
    expect(parseFormFile(`${line}\n`)).toEqual([{ type: 'signature', who: 'company', page: 8, x: 72, y: 513, width: 198, height: 18 }]);
  });

  it('skips anything that is not a spot, and reads "-" as no party', () => {
    const fields = parseFormFile(['', 'not a line', 'date - 1 0 0 65536 65536 0', 'date x 0 0 0 1 1 0', 'date x 1 a 0 1 1 0'].join('\n'));
    expect(fields).toEqual([{ type: 'date', who: '', page: 1, x: 0, y: 0, width: 1, height: 1 }]);
  });

  it('writes <document>.form.json, and removes a stale one when nothing is marked', () => {
    const base = join(mkdtempSync(join(tmpdir(), 'lk-form-')), 'doc');
    expect(writeFormJson(base)).toBeNull();
    writeFileSync(`${base}.form`, `date sam 2 ${sp(1)} ${sp(1)} ${sp(1)} ${sp(1)} 0\n`);
    expect(writeFormJson(base)).toBe(`${base}.form.json`);
    expect(JSON.parse(readFileSync(`${base}.form.json`, 'utf8'))).toEqual([{ type: 'date', who: 'sam', page: 2, x: 72, y: 72, width: 72, height: 72 }]);
    writeFileSync(`${base}.form`, '');
    expect(writeFormJson(base)).toBeNull();
    expect(() => readFileSync(`${base}.form.json`)).toThrow();
  });
});
