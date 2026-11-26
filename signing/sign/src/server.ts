// The signing server. No framework: a handful of routes over http.
//
//   GET  /api/sign/:token          what this signer needs: title, terms, their boxes
//   GET  /api/sign/:token/pdf      the document as it stands
//   POST /api/sign/:token          { signaturePng, agreed: true, location, values } -> stamps and records
//   POST /api/sign/:token/decline  { reason } -> nobody can sign after that
//   GET  /api/place/:key[/pdf]     the placing page's PDF and saved boxes; PUT saves them
//   GET  /sign/:token, /place/:key the pages (from @latex-kit/sign-web)
//
// Every /api/sign call needs the signer's access code in the x-access-code header.
// The audit facts (IP address, browser, time) are taken here, on the server,
// never from what the browser says about itself. Location is the exception: only
// the browser knows it, so it is recorded as "reported by the browser".
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { dirname, extname, join, normalize } from 'path';

import { addCertificate, stampSigner } from './stamp';
import { codeMatches, findByToken, load, MAX_CODE_TRIES, pdfPath, save, seal, sha256 } from './store';
import { TERMS } from './terms';
import { Envelope, FIELD_TYPES, FormField, Signer, SignerLocation } from './types';

/** The built pages: LATEX_KIT_SIGN_WEB, else the @latex-kit/sign-web package. */
function webDir(): string | null {
  if (process.env.LATEX_KIT_SIGN_WEB) return process.env.LATEX_KIT_SIGN_WEB;
  try {
    return join(dirname(require.resolve('@latex-kit/sign-web/package.json')), 'dist');
  } catch {
    return null;
  }
}

const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
// The signing link is the secret, so it must not leak in a Referer header or sit in a cache;
// and the page must not be framed by another site.
const headers = {
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; frame-ancestors 'none'",
  'permissions-policy': 'geolocation=(self)',
};

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>
  ) {
    super(message);
  }
}

type Found = { envelope: Envelope; signer: Signer };

const json = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { ...headers, 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const fail = (status: number, message: string, extra?: Record<string, unknown>): HttpError => new HttpError(status, message, extra);

/** Behind a proxy we trust (LEGAL_KIT_SIGN_TRUST_PROXY=1), the first forwarded address; else the socket's. */
function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (process.env.LEGAL_KIT_SIGN_TRUST_PROXY === '1' && fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

async function body(req: IncomingMessage, limit = 1_500_000): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw fail(413, 'That is too large.');
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw fail(400, 'Could not read the request.');
  }
}

// One change to an envelope at a time, so two requests cannot both sign.
const queues = new Map<string, Promise<unknown>>();
function oneAtATime<T>(id: string, work: () => Promise<T>): Promise<T> {
  const next = (queues.get(id) || Promise.resolve()).then(work, work);
  queues.set(id, next.catch(() => {}));
  return next;
}

const event = (envelope: Envelope, req: IncomingMessage, what: string, more: { who?: string } = {}): number => envelope.events.push({ at: new Date().toISOString(), what, ip: clientIp(req), ...more });

/** Is this link still usable, and did the caller give the right access code? */
function gate(req: IncomingMessage, { envelope, signer }: Found): void {
  if (envelope.declinedAt) throw fail(410, 'This document was declined, so it can no longer be signed.');
  if (!signer.signedAt && new Date(envelope.expiresAt) < new Date()) throw fail(410, 'This signing link has expired. Ask the sender for a new one.');
  if (signer.failedCodes >= MAX_CODE_TRIES) throw fail(423, 'Too many wrong codes. This link is locked; ask the sender for a new one.');
  const code = req.headers['x-access-code'];
  const waitingFor = envelope.ordered && !signer.signedAt && envelope.signers.slice(0, envelope.signers.indexOf(signer)).find((s) => !s.signedAt);
  if (!code) throw fail(401, 'Enter your access code.', { needCode: true });
  if (!codeMatches(envelope, signer, String(code))) {
    signer.failedCodes += 1;
    event(envelope, req, 'wrong code', { who: signer.who });
    save(envelope);
    const left = MAX_CODE_TRIES - signer.failedCodes;
    throw fail(left ? 401 : 423, left ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. This link is locked.', { needCode: true });
  }
  if (waitingFor) throw fail(409, `It is not your turn yet: ${waitingFor.name} signs first. You will be able to sign once they have.`);
}

const view = ({ envelope, signer }: Found) => ({
  title: envelope.title,
  terms: TERMS,
  expiresAt: envelope.expiresAt,
  signer: { who: signer.who, name: signer.name, email: signer.email, signedAt: signer.signedAt },
  // `index` is the field's place in the envelope: typed values are sent back under it
  fields: envelope.fields.map((f, index) => ({ ...f, index })).filter((f) => f.who === signer.who),
  others: envelope.signers.filter((s) => s !== signer).map((s) => ({ who: s.who, name: s.name, signed: Boolean(s.signedAt) })),
  completed: Boolean(envelope.completedAt),
});

/** Only what we expect: a real position, or a short note on why there is none. */
function cleanLocation(l: any): SignerLocation {
  const n = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  if (l && n(l.latitude, -90, 90) && n(l.longitude, -180, 180))
    return { latitude: l.latitude, longitude: l.longitude, accuracyMeters: n(l.accuracy, 0, 1e7) ? Math.round(l.accuracy) : null, source: 'reported by the browser' };
  const why = ['denied', 'unavailable', 'timeout', 'unsupported'].includes(l?.declined) ? l.declined : 'not given';
  return { declined: why };
}

async function sign(req: IncomingMessage, found: Found) {
  const { envelope, signer } = found;
  if (signer.signedAt) throw fail(409, 'You have already signed this document.');
  const input = await body(req);
  if (input.agreed !== true || input.termsVersion !== TERMS.version) throw fail(400, 'You need to agree to the terms shown before signing.');
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(input.signaturePng || '');
  const png = m && Buffer.from(m[1], 'base64');
  const mustDraw = envelope.fields.some((f) => f.who === signer.who && f.type === 'signature');
  if (mustDraw && (!png || png.length < 67 || png.readUInt32BE(0) !== 0x89504e47)) throw fail(400, 'A drawn or typed signature is required.');

  // what the signer typed into their text and initials boxes; every one is required
  const values: Record<number, string> = {};
  const typed: Record<string, string> = {};
  for (const [i, f] of envelope.fields.entries()) {
    if (f.who !== signer.who || (f.type !== 'text' && f.type !== 'initials')) continue;
    const v = String(input.values?.[i] ?? '').trim();
    if (!v || v.length > (f.type === 'initials' ? 6 : 200)) throw fail(400, f.type === 'initials' ? 'Please type your initials in every initials box.' : 'Please fill in every text box.');
    if (!/^[\x20-\x7e\xa0-\xff]+$/.test(v)) throw fail(400, 'Only Latin letters, numbers and punctuation can be typed into a box for now.');
    values[i] = v;
    typed[`${f.label || f.type} (page ${f.page})`] = v;
  }

  const before = readFileSync(pdfPath(envelope));
  const signedAt = new Date().toISOString();
  let after: Buffer;
  try {
    after = Buffer.from(await stampSigner(before, envelope.fields, signer.who, { signaturePng: mustDraw ? png : null, signedAt, values }));
  } catch {
    throw fail(400, 'That signature image could not be read. Please draw it again.');
  }
  Object.assign(signer, {
    signedAt,
    ip: clientIp(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    consent: { agreed: true, termsVersion: TERMS.version, termsSha256: sha256(TERMS.text.join('\n')), text: TERMS.text },
    location: cleanLocation(input.location),
    values: typed,
    accessCodeUsed: true,
    sha256Before: sha256(before),
    sha256After: sha256(after),
  });
  event(envelope, req, 'signed', { who: signer.who });
  if (envelope.signers.every((s) => s.signedAt)) {
    envelope.completedAt = new Date().toISOString();
    after = Buffer.from(await addCertificate(after, envelope));
    envelope.sha256Final = sha256(after);
    event(envelope, req, 'completed');
  }
  writeFileSync(pdfPath(envelope), after);
  save(envelope);
  if (envelope.completedAt) seal(envelope);
  return view(found);
}

async function decline(req: IncomingMessage, found: Found) {
  const { envelope, signer } = found;
  if (signer.signedAt || envelope.completedAt) throw fail(409, 'You have already signed this document.');
  const input = await body(req);
  envelope.declinedAt = new Date().toISOString();
  envelope.declinedBy = { who: signer.who, reason: String(input.reason || '').slice(0, 500) };
  event(envelope, req, 'declined', { who: signer.who });
  save(envelope);
  return { declined: true };
}

function page(res: ServerResponse, path: string): void {
  const dist = webDir();
  let file = dist ? normalize(join(dist, path)) : '';
  if (dist && (!file.startsWith(dist) || !existsSync(file) || !extname(file))) file = join(dist, 'index.html');
  if (!dist || !existsSync(file)) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('The signing pages are not built. Install @latex-kit/sign-web, or in the latex-kit repo run: pnpm --filter @latex-kit/sign-web build');
    return;
  }
  const html = extname(file) === '.html';
  res.writeHead(200, { ...headers, 'cache-control': html ? 'no-store' : 'public, max-age=31536000, immutable', 'content-type': types[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}

/** Checks boxes drawn in the placing page before they are written to disk. */
export type PageSize = { width: number; height: number };

export function cleanFields(input: unknown, pageSizes: PageSize[]): FormField[] {
  if (!Array.isArray(input) || input.length > 500) throw fail(400, 'Expected a list of fields.');
  return input.map((f: any) => {
    const size = pageSizes[f.page - 1];
    const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    if (!size || !FIELD_TYPES.includes(f.type) || !/^[\w-]{1,40}$/.test(f.who || '') || ![f.x, f.y, f.width, f.height].every(ok)) throw fail(400, 'A field is not valid.');
    if (f.width < 4 || f.height < 4 || f.x < 0 || f.y < 0 || f.x + f.width > size.width + 1 || f.y + f.height > size.height + 1) throw fail(400, 'A field is off the page.');
    const r = (v: number) => Math.round(v * 100) / 100;
    const label = typeof f.label === 'string' && f.label.trim() ? { label: f.label.trim().slice(0, 60) } : {};
    return { type: f.type, who: f.who, ...label, page: f.page, x: r(f.x), y: r(f.y), width: r(f.width), height: r(f.height) };
  });
}

/**
 * The placing page: draw boxes on any PDF and save them beside it.
 * `sessions` maps a random key to a session; the CLI makes one per run.
 */
export interface PlacingSession {
  pdf: string;
  /** Where saving writes the boxes. */
  fieldsFile: string;
  pageSizes: PageSize[];
}

async function place(req: IncomingMessage, res: ServerResponse, sessions: Map<string, PlacingSession>, key: string, rest?: string): Promise<void> {
  const s = sessions.get(key);
  if (!s) throw fail(404, 'This placing session is not open. Start it again from the command line.');
  if (rest === '/pdf') {
    res.writeHead(200, { ...headers, 'content-type': 'application/pdf' });
    res.end(readFileSync(s.pdf));
    return;
  }
  if (req.method === 'PUT') {
    const fields = cleanFields((await body(req)).fields, s.pageSizes);
    writeFileSync(s.fieldsFile, JSON.stringify(fields, null, 2) + '\n');
    return json(res, 200, { saved: fields.length, file: s.fieldsFile });
  }
  json(res, 200, { title: s.pdf.split('/').pop(), types: FIELD_TYPES, fields: existsSync(s.fieldsFile) ? JSON.parse(readFileSync(s.fieldsFile, 'utf8')) : [] });
}

export function createSignServer({ placing = new Map() }: { placing?: Map<string, PlacingSession> } = {}): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const pl = /^\/api\/place\/([\w-]{20,64})(\/pdf)?$/.exec(url.pathname);
      if (pl) return await place(req, res, placing, pl[1], pl[2]);
      const api = /^\/api\/sign\/([\w-]{20,64})(\/pdf|\/decline)?$/.exec(url.pathname);
      if (!api) {
        if (url.pathname.startsWith('/api/')) throw fail(404, 'This signing link is not valid.');
        return page(res, url.pathname);
      }
      const first = findByToken(api[1]);
      if (!first) throw fail(404, 'This signing link is not valid.');
      const result: any = await oneAtATime(first.envelope.id, async () => {
        // read again inside the queue: an earlier request may have changed it
        const envelope = load(first.envelope.id)!;
        const found: Found = { envelope, signer: envelope.signers.find((s) => s.who === first.signer.who)! };
        gate(req, found);
        if (api[2] === '/pdf') return { pdf: readFileSync(pdfPath(envelope)) };
        if (api[2] === '/decline' && req.method === 'POST') return decline(req, found);
        if (req.method === 'POST') return sign(req, found);
        if (req.method !== 'GET') throw fail(405, 'Not allowed.');
        event(envelope, req, 'opened', { who: found.signer.who });
        save(envelope);
        return view(found);
      });
      if (result.pdf) {
        res.writeHead(200, { ...headers, 'content-type': 'application/pdf' });
        res.end(result.pdf);
        return;
      }
      json(res, 200, result);
    } catch (e) {
      const known = e instanceof HttpError ? e : null;
      if (!known) console.error(e);
      json(res, known?.status ?? 500, { error: known ? known.message : 'Something went wrong.', ...(known?.extra ?? {}) });
    }
  });
}
