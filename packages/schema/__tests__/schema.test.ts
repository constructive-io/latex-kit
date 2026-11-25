import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  DocIdWriteError,
  documentJsonSchema,
  generateTypes,
  loadDocument,
  loadFile,
  loadTemplateSchema,
  mintDocId,
  RecordError,
  ref,
  resolveRefs,
  toJsonSchema,
  validate,
  writeDocId,
  z,
} from '../src';

const FIX = join(__dirname, 'fixtures');
const dataDir = join(FIX, 'data');
const tmp = () => mkdtempSync(join(tmpdir(), 'latex-kit-schema-'));

describe('loadFile', () => {
  it('reads JSON, YAML and TypeScript', async () => {
    expect(await loadFile(join(dataDir, 'people/avery.yaml'))).toMatchObject({ name: 'Avery Example' });
    expect(await loadFile(join(dataDir, 'orgs/widgets.json'))).toMatchObject({ entityType: 'Delaware corporation' });
    expect(await loadFile(join(dataDir, 'orgs/labs.ts'))).toEqual({ name: 'Placeholder Labs LLC', signer: { $ref: 'people/avery' } });
  });
  it('names the file on parse errors', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'bad.json'), '{ nope');
    await expect(loadFile(join(dir, 'bad.json'))).rejects.toThrow(/bad\.json/);
  });
});

describe('resolveRefs', () => {
  it('resolves nested references and reports the files read', async () => {
    const { value, files } = await resolveRefs({ a: ref('orgs/widgets'), list: [ref('people:avery')] }, { dataDir });
    expect(value).toEqual({
      a: {
        name: 'Example Widgets, Inc.',
        entityType: 'Delaware corporation',
        signer: { name: 'Avery Example', title: 'CEO', email: 'avery@example.com' },
      },
      list: [{ name: 'Avery Example', title: 'CEO', email: 'avery@example.com' }],
    });
    expect(files.map((f) => f.slice(dataDir.length + 1)).sort()).toEqual(['orgs/widgets.json', 'people/avery.yaml']);
  });
  it('reports missing records, cycles and escapes', async () => {
    await expect(resolveRefs({ x: ref('people/nobody') }, { dataDir })).rejects.toThrow(/x: no record for "people\/nobody"/);
    await expect(resolveRefs(ref('orgs/loop-a'), { dataDir })).rejects.toThrow(/reference cycle: orgs\/loop-a → orgs\/loop-b → orgs\/loop-a/);
    await expect(resolveRefs(ref('../secrets/x'), { dataDir })).rejects.toThrow(/invalid reference/);
  });
  it('leaves objects with more keys than $ref alone', async () => {
    const v = { $ref: 'x', other: 1 };
    expect((await resolveRefs(v, { dataDir })).value).toEqual(v);
  });
});

describe('templates and validation', () => {
  it('loads a schema.ts with meta and validates resolved data', async () => {
    const { schema, meta } = await loadTemplateSchema(join(FIX, 'templates/nda/schema.ts'));
    expect(meta).toEqual({ docIdPrefix: 'NDA' });
    const doc = await loadDocument(join(FIX, 'doc.json'), { dataDir });
    const ok = validate(schema, doc.data);
    expect(ok).toMatchObject({ ok: true, value: { mutual: true, recipient: { name: 'Placeholder Labs LLC' } } });
    const bad = validate(schema, { ...(doc.data as object), termMonths: 0, effectiveDate: 'soon' });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.issues.map((i) => i.path)).toEqual(['effectiveDate', 'termMonths']);
  });

  it('rejects files that are not document records', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'x.json'), JSON.stringify({ template: 'nda', data: {}, extra: 1 }));
    await expect(loadDocument(join(dir, 'x.json'), { dataDir })).rejects.toThrow(RecordError);
  });

  it('exports JSON Schema for editors and TypeScript types', async () => {
    const { schema } = await loadTemplateSchema(join(FIX, 'templates/nda/schema.ts'));
    const json = toJsonSchema(schema);
    expect(json).toMatchObject({ type: 'object', properties: { termMonths: { type: 'integer' } } });
    // input shape: `mutual` has a default, so it is optional in the file
    expect(json.required).not.toContain('mutual');
    const doc = documentJsonSchema('nda', json);
    expect(doc).toMatchObject({ properties: { template: { const: 'nda' } }, required: ['template', 'data'] });
    const ts = generateTypes('nda', json);
    expect(ts).toContain('export interface NdaData');
    expect(ts).toContain('termMonths: number');
  });
});

describe('document IDs', () => {
  const zeros = () => Buffer.alloc(8, 0);
  it('mints PREFIX-DATE-RANDOM', () => {
    expect(mintDocId({ prefix: 'nda', epoch: 1764028800, random: zeros })).toBe('NDA-20251125-00000000');
    expect(mintDocId({ prefix: 'Consulting Agreement', epoch: 0, random: () => Buffer.from([1, 2, 3, 31, 32, 33, 255, 10]) })).toBe(
      'CONSULTING-AGREEMENT-19700101-123Z01ZA'
    );
    expect(mintDocId({ prefix: 'x', epoch: 0 })).toMatch(/^X-19700101-[0-9A-HJKMNP-TV-Z]{8}$/);
  });
  it('writes the ID into JSON after template, keeping indentation', () => {
    const dir = tmp();
    const f = join(dir, 'd.json');
    writeFileSync(f, '{\n    "template": "nda",\n    "data": {}\n}\n');
    writeDocId(f, 'NDA-1');
    expect(readFileSync(f, 'utf8')).toBe('{\n    "template": "nda",\n    "docId": "NDA-1",\n    "data": {}\n}\n');
  });
  it('writes the ID into YAML, keeping comments', () => {
    const dir = tmp();
    const f = join(dir, 'd.yaml');
    writeFileSync(f, '# keep me\ntemplate: nda\ndata:\n  a: 1 # and me\n');
    writeDocId(f, 'NDA-2');
    expect(readFileSync(f, 'utf8')).toBe('# keep me\ntemplate: nda\ndocId: NDA-2\ndata:\n  a: 1 # and me\n');
  });
  it('never rewrites code', () => {
    const dir = tmp();
    copyFileSync(join(dataDir, 'orgs/labs.ts'), join(dir, 'd.ts'));
    expect(() => writeDocId(join(dir, 'd.ts'), 'NDA-3')).toThrow(DocIdWriteError);
  });
});

it('re-exports zod', () => {
  expect(typeof z.object).toBe('function');
});
