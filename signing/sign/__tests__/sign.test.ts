// Signing over the real HTTP API: access codes, terms, location, stamping, the
// audit trail, the seal, declining, expiry, typed boxes, order, reissue, placing
// and the placement guide.
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';

const tmp = mkdtempSync(join(tmpdir(), 'latex-kit-sign-'));
process.env.LATEX_KIT_SIGN_DATA = join(tmp, 'data');

import { writeGuide } from '../src/guide';
import { createSignServer } from '../src/server';
import { createEnvelope, load, pdfPath, reissue, save, sha256, verifyEnvelope } from '../src/store';
import { TERMS } from '../src/terms';
import { FormField, Secret } from '../src/types';

// a 1x1 PNG stands in for a drawn signature
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const box = (type: string, who: string, x: number, y: number): FormField => ({ type, who, page: 1, x, y, width: 198, height: 24 });
const FIELDS = [box('signature', 'company', 72, 500), box('date', 'company', 72, 470), box('signature', 'customer', 330, 500), box('date', 'customer', 330, 470)];
const SIGNERS = { company: { name: 'Sam Sample', email: 'sam@example.test' }, customer: { name: 'Pat Placeholder', email: 'pat@example.test' } };

const file = join(tmp, 'sample.pdf');
const server = createSignServer();
const port = () => (server.address() as AddressInfo).port;
const url = (token: string, rest = '') => `http://localhost:${port()}/api/sign/${token}${rest}`;
type CallOptions = { rest?: string; body?: unknown; code?: string | null };
const call = (s: Secret, { rest = '', body, code = s.code }: CallOptions = {}) =>
  fetch(url(s.token, rest), { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'user-agent': 'test-browser', ...(code ? { 'x-access-code': code } : {}) }, body: body ? JSON.stringify(body) : undefined });
const good = (extra: Record<string, unknown> = {}) => ({ signaturePng: PNG, agreed: true, termsVersion: TERMS.version, ...extra });
const make = (days?: number) => createEnvelope({ pdfPath: file, fields: FIELDS, signers: SIGNERS, days });

beforeAll(async () => {
  const blank = await PDFDocument.create();
  blank.addPage([612, 792]);
  writeFileSync(file, await blank.save());
  writeFileSync(join(tmp, 'sample.form.json'), JSON.stringify(FIELDS));
  await new Promise<void>((r) => server.listen(0, r));
});
afterAll(() => new Promise((r) => server.close(r)));

test('two signers sign; the PDF is stamped, the audit trail kept, and the result sealed', async () => {
  const { envelope, secrets } = make();
  const [company, customer] = secrets;
  const stored = readFileSync(join(process.env.LATEX_KIT_SIGN_DATA!, envelope.id, 'envelope.json'), 'utf8');
  // links and codes are not stored in clear
  for (const s of secrets) expect(stored.includes(s.token) || stored.includes(`"${s.code}"`)).toBe(false);

  expect((await fetch(url('not-a-real-token-at-all-0000'))).status).toBe(404);
  expect((await call(company, { code: null })).status).toBe(401);
  expect((await call(company, { rest: '/pdf', code: null })).status).toBe(401);

  const res = await call(company);
  expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  const seen = await res.json();
  expect(seen.signer.who).toBe('company');
  // a signer only gets their own boxes
  expect(seen.fields).toHaveLength(2);

  // agreeing to the current terms and a real PNG signature are all required
  expect((await call(company, { body: { signaturePng: PNG } })).status).toBe(400);
  expect((await call(company, { body: good({ termsVersion: 'old' }) })).status).toBe(400);
  expect((await call(company, { body: { agreed: true, termsVersion: TERMS.version } })).status).toBe(400);
  expect((await call(company, { body: good({ signaturePng: 'data:image/png;base64,AAAA' }) })).status).toBe(400);

  // both requests at once: only one may win
  const race = await Promise.all([call(company, { body: good({ location: { latitude: 10.5, longitude: 20.25, accuracy: 25 } }) }), call(company, { body: good() })]);
  expect(race.map((r) => r.status).sort()).toEqual([200, 409]);

  const last = await (await call(customer, { body: good({ location: { declined: 'denied' } }) })).json();
  expect(last.completed).toBe(true);

  const saved = load(envelope.id)!;
  const final = readFileSync(pdfPath(saved));
  for (const s of saved.signers) {
    expect(s.signedAt && s.ip && s.consent?.agreed).toBeTruthy();
    expect(s.consent?.termsVersion).toBe(TERMS.version);
    expect(s.userAgent).toBe('test-browser');
  }
  // a refusal is recorded as a refusal
  expect(saved.signers[1].location).toEqual({ declined: 'denied' });
  // each signature starts from the one before, back to the original
  expect(saved.signers[0].sha256Before).toBe(saved.sha256Original);
  expect(saved.signers[1].sha256Before).toBe(saved.signers[0].sha256After);
  expect(saved.sha256Final).toBe(sha256(final));
  // the certificate page was added
  expect((await PDFDocument.load(final)).getPageCount()).toBe(2);

  expect(verifyEnvelope(envelope.id).problems).toEqual([]);
  // change the record: the seal no longer matches
  saved.signers[0].ip = '203.0.113.9';
  save(saved);
  expect(verifyEnvelope(envelope.id).problems.join()).toMatch(/audit record was changed/);
  // change the file: its hash no longer matches
  const edited = join(tmp, 'edited.pdf');
  writeFileSync(edited, Buffer.concat([final, Buffer.from('\n% edited')]));
  expect(verifyEnvelope(envelope.id, edited).problems.join()).toMatch(/not the file that was signed/);
});

test('wrong access codes lock the link', async () => {
  const { envelope, secrets } = make();
  const s = secrets[0];
  const wrong = s.code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) expect((await call(s, { code: wrong })).status).toBe(401);
  // the fifth wrong code locks it, and then even the right code is refused
  expect((await call(s, { code: wrong })).status).toBe(423);
  expect((await call(s)).status).toBe(423);
  expect(load(envelope.id)!.events.filter((e) => e.what === 'wrong code')).toHaveLength(5);
});

test('an expired link cannot be used', async () => {
  const { secrets } = make(-1);
  expect((await call(secrets[0])).status).toBe(410);
  expect((await call(secrets[0], { body: good() })).status).toBe(410);
});

test('declining stops everyone', async () => {
  const { envelope, secrets } = make();
  expect((await call(secrets[0], { rest: '/decline', body: { reason: 'wrong amount' } })).status).toBe(200);
  expect((await call(secrets[1], { body: good() })).status).toBe(410);
  expect(load(envelope.id)!.declinedBy!.reason).toBe('wrong amount');
});

test('typed boxes are required, stamped and recorded; signing order is enforced; links can be reissued', async () => {
  const fields: FormField[] = [box('signature', 'first', 72, 500), { ...box('text', 'first', 72, 440), label: 'Printed name' }, { ...box('initials', 'second', 330, 500), width: 60 }];
  const signers = { first: { name: 'Sam Sample', email: 'sam@example.test' }, second: { name: 'Pat Placeholder', email: 'pat@example.test' } };
  const { envelope, secrets } = createEnvelope({ pdfPath: file, fields, ordered: true, signers });
  const [first, second] = secrets;

  // the second signer waits for the first
  expect((await call(second)).status).toBe(409);
  const seen = await (await call(first)).json();
  expect(seen.fields.map((f: { index: number; type: string }) => [f.index, f.type])).toEqual([
    [0, 'signature'],
    [1, 'text'],
  ]);
  // the text box must be filled, and letters the PDF font cannot draw are refused, not dropped
  expect((await call(first, { body: good() })).status).toBe(400);
  expect((await call(first, { body: good({ values: { 1: '山田' } }) })).status).toBe(400);
  expect((await call(first, { body: good({ values: { 1: 'Sam Sample' } }) })).status).toBe(200);

  // the second signer lost their link: the old one dies, the new one works
  const { secret } = reissue(envelope.id, 'second');
  expect((await call(second)).status).toBe(404);
  // only initials to fill, so no drawn signature is needed
  expect((await call(secret, { body: { agreed: true, termsVersion: TERMS.version, values: { 2: 'PP' } } })).status).toBe(200);
  expect(() => reissue(envelope.id, 'second')).toThrow(/already signed/);

  const saved = load(envelope.id)!;
  expect(saved.signers[0].values).toEqual({ 'Printed name (page 1)': 'Sam Sample' });
  expect(saved.signers[1].values).toEqual({ 'initials (page 1)': 'PP' });
  expect(verifyEnvelope(envelope.id).problems).toEqual([]);
});

test('the placement guide marks every field and lists it from the top-left', async () => {
  const { out, count } = await writeGuide(file);
  expect(count).toBe(4);
  // the pages plus the list
  expect((await PDFDocument.load(readFileSync(out))).getPageCount()).toBe(2);
  const guide = JSON.parse(readFileSync(file.replace(/\.pdf$/, '.guide.json'), 'utf8'));
  const first = guide.fields[0];
  expect([first.number, first.type, first.signer, first.page]).toEqual([1, 'signature', 'company', 1]);
  // x=72 of 612 wide; top = 792 - 500 - 24 = 268 of 792 tall
  expect(first.fromTopLeft.percent).toEqual({ left: 11.8, top: 33.8, width: 32.4, height: 3 });
  expect(first.fromTopLeft.inches).toEqual({ left: 1, top: 3.72, width: 2.75, height: 0.33 });
});

test('the placing page saves checked fields beside any PDF', async () => {
  const pdf = join(tmp, 'outside.pdf');
  writeFileSync(pdf, readFileSync(file));
  const fieldsFile = join(tmp, 'outside.form.json');
  const placing = new Map([['a-placing-session-key-0001', { pdf, fieldsFile, pageSizes: [{ width: 612, height: 792 }] }]]);
  const s = createSignServer({ placing });
  await new Promise<void>((r) => s.listen(0, r));
  const u = (rest = '') => `http://localhost:${(s.address() as AddressInfo).port}/api/place/a-placing-session-key-0001${rest}`;
  const put = (fields: unknown[]) => fetch(u(), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields }) });
  const one = (over: Record<string, unknown>) => [{ type: 'signature', who: 'signer1', page: 1, x: 10, y: 10, width: 100, height: 20, ...over }];
  try {
    expect((await (await fetch(u())).json()).fields).toEqual([]);
    expect((await fetch(u('/pdf'))).headers.get('content-type')).toBe('application/pdf');
    // only the session the CLI opened
    expect((await fetch(u().replace('0001', '0002'))).status).toBe(404);
    // no such page, off the page, unknown type
    expect((await put(one({ page: 2 }))).status).toBe(400);
    expect((await put(one({ x: 600 }))).status).toBe(400);
    expect((await put(one({ type: 'stamp' }))).status).toBe(400);
    expect((await put(one({ x: 72.123456, y: 500, width: 198, height: 24, extra: 'dropped' }))).status).toBe(200);
    expect(JSON.parse(readFileSync(fieldsFile, 'utf8'))).toEqual([{ type: 'signature', who: 'signer1', page: 1, x: 72.12, y: 500, width: 198, height: 24 }]);
    // and what was saved can be sent for signing like any generated document
    const { envelope } = createEnvelope({ pdfPath: pdf, fields: JSON.parse(readFileSync(fieldsFile, 'utf8')), signers: { signer1: { name: 'Pat Placeholder', email: 'pat@example.test' } } });
    expect(envelope.signers).toHaveLength(1);
  } finally {
    await new Promise((r) => s.close(r));
  }
});
