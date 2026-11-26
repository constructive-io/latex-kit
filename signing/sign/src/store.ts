import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, KeyObject, randomBytes, randomInt, scryptSync, sign as edSign, timingSafeEqual, verify as edVerify } from 'crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';

import { Envelope, FormField, Secret } from './types';

/** Where envelopes live: LATEX_KIT_SIGN_DATA, else `.latex-kit-sign/` in the current folder. */
export const dataDir = (): string => process.env.LATEX_KIT_SIGN_DATA || join(process.cwd(), '.latex-kit-sign');
export const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const codeHash = (code: string, salt: string): string => scryptSync(String(code), salt, 32).toString('hex');
const same = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const MAX_CODE_TRIES = 5;

export interface CreateOptions {
  /** A PDF, from latex-kit or anywhere else. */
  pdfPath: string;
  /** Its boxes: the `.form.json` beside it, or ones drawn with `place`. */
  fields: FormField[];
  /** Every `who` in the fields needs one. Their order is the signing order when `ordered`. */
  signers: Record<string, { name: string; email: string }>;
  title?: string;
  /** How long the links work. Default 14. */
  days?: number;
  ordered?: boolean;
}

/**
 * Make an envelope. Returns it with `secrets`: each signer's link token and
 * access code. This is the only time they exist in clear; hand them out.
 */
export function createEnvelope({ pdfPath, fields, signers, title, days = 14, ordered = false }: CreateOptions): { envelope: Envelope; secrets: Secret[] } {
  const inFields = [...new Set(fields.map((f) => f.who))];
  for (const who of inFields) if (!signers[who]) throw new Error(`no signer given for "${who}"`);
  // the order the caller listed them in, which is the signing order when `ordered`
  const roles = Object.keys(signers).filter((who) => inFields.includes(who));
  const id = randomBytes(8).toString('hex');
  const dir = join(dataDir(), id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const pdf = readFileSync(pdfPath);
  writeFileSync(join(dir, 'original.pdf'), pdf);
  writeFileSync(join(dir, 'current.pdf'), pdf);
  const now = new Date();
  const secrets: Secret[] = roles.map((who) => ({ who, token: randomBytes(24).toString('base64url'), code: String(randomInt(0, 1_000_000)).padStart(6, '0') }));
  const envelope: Envelope = {
    id,
    title: title || basename(pdfPath, '.pdf'),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
    sha256Original: sha256(pdf),
    ordered,
    fields,
    signers: secrets.map(({ who, token, code }) => ({
      who,
      name: signers[who].name,
      email: signers[who].email,
      tokenHash: sha256(token),
      codeHash: codeHash(code, id + who),
      failedCodes: 0,
      signedAt: null,
    })),
    events: [{ at: now.toISOString(), what: 'created' }],
    completedAt: null,
    declinedAt: null,
  };
  save(envelope);
  return { envelope, secrets };
}

/** Written to a temporary file and renamed, so a crash never leaves half a record. */
export function save(envelope: Envelope): void {
  const file = join(dataDir(), envelope.id, 'envelope.json');
  writeFileSync(`${file}.tmp`, JSON.stringify(envelope, null, 2) + '\n', { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}
export const pdfPath = (envelope: Envelope, which: 'current' | 'original' = 'current'): string => join(dataDir(), envelope.id, `${which}.pdf`);
export function load(id: string): Envelope | null {
  const file = join(dataDir(), id, 'envelope.json');
  return /^[0-9a-f]{16}$/.test(id) && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

/** The envelope and signer a signing link belongs to. */
export function findByToken(token: string): { envelope: Envelope; signer: Envelope['signers'][number] } | null {
  if (!existsSync(dataDir())) return null;
  const hash = sha256(token);
  for (const id of readdirSync(dataDir())) {
    const envelope = load(id);
    const signer = envelope?.signers.find((s) => same(s.tokenHash, hash));
    if (envelope && signer) return { envelope, signer };
  }
  return null;
}
/** Everyone's envelopes, newest first. */
export function listEnvelopes(): Envelope[] {
  if (!existsSync(dataDir())) return [];
  return readdirSync(dataDir())
    .map(load)
    .filter((e): e is Envelope => !!e)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * A fresh link and code for one signer who has not signed: the old ones stop
 * working, a lock from wrong codes is cleared, and the expiry starts again.
 */
export function reissue(id: string, who: string, days = 14): { envelope: Envelope; secret: Secret } {
  const envelope = load(id);
  const signer = envelope?.signers.find((s) => s.who === who);
  if (!envelope || !signer) throw new Error('no such envelope or signer');
  if (signer.signedAt) throw new Error(`${signer.name} has already signed`);
  if (envelope.declinedAt) throw new Error('this document was declined');
  const token = randomBytes(24).toString('base64url');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  Object.assign(signer, { tokenHash: sha256(token), codeHash: codeHash(code, id + who), failedCodes: 0 });
  envelope.expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  envelope.events.push({ at: new Date().toISOString(), what: 'reissued', who });
  save(envelope);
  return { envelope, secret: { who, token, code } };
}

export const codeMatches = (envelope: Envelope, signer: Envelope['signers'][number], code: string): boolean => same(signer.codeHash, codeHash(code, envelope.id + signer.who));

// --- the seal: proof the finished file and its audit record have not changed since ---

function key(): KeyObject {
  const file = process.env.LATEX_KIT_SIGN_KEY || join(dataDir(), 'seal-key.pem');
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    chmodSync(file, 0o600);
  }
  return createPrivateKey(readFileSync(file));
}

/** What the seal covers: the hashes, and each signer's audit facts. */
const sealed = (e: Envelope): string => JSON.stringify({
  id: e.id, title: e.title, sha256Original: e.sha256Original, sha256Final: e.sha256Final, completedAt: e.completedAt,
  signers: e.signers.map((s) => ({ who: s.who, name: s.name, email: s.email, signedAt: s.signedAt, ip: s.ip, userAgent: s.userAgent, consent: s.consent, location: s.location, values: s.values, sha256Before: s.sha256Before, sha256After: s.sha256After })),
});

export interface Seal {
  algorithm: 'ed25519';
  publicKey: string;
  signature: string;
  sealedAt: string;
}

export function seal(envelope: Envelope): Seal {
  const k = key();
  const record: Seal = {
    algorithm: 'ed25519',
    publicKey: createPublicKey(k).export({ type: 'spki', format: 'pem' }) as string,
    signature: edSign(null, Buffer.from(sealed(envelope)), k).toString('base64'),
    sealedAt: new Date().toISOString(),
  };
  writeFileSync(join(dataDir(), envelope.id, 'seal.json'), JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  return record;
}

/** Checks a finished envelope: the PDF still has the recorded hash, and the record still matches its seal. */
export function verifyEnvelope(id: string, pdfFile?: string): { ok: boolean; problems: string[]; envelope?: Envelope } {
  const envelope = load(id);
  if (!envelope) return { ok: false, problems: ['no such envelope'] };
  const problems: string[] = [];
  if (!envelope.completedAt) problems.push('not everyone has signed yet');
  const sealFile = join(dataDir(), id, 'seal.json');
  if (!existsSync(sealFile)) problems.push('no seal');
  else {
    const s = JSON.parse(readFileSync(sealFile, 'utf8')) as Seal;
    if (!edVerify(null, Buffer.from(sealed(envelope)), createPublicKey(s.publicKey), Buffer.from(s.signature, 'base64'))) problems.push('the audit record was changed after it was sealed');
    if (createPublicKey(key()).export({ type: 'spki', format: 'pem' }) !== s.publicKey) problems.push("sealed with a key that is not this server's");
  }
  const file = pdfFile || pdfPath(envelope);
  if (sha256(readFileSync(file)) !== envelope.sha256Final) problems.push(`${file} is not the file that was signed (hash differs)`);
  if (sha256(readFileSync(pdfPath(envelope, 'original'))) !== envelope.sha256Original) problems.push('the stored original was changed');
  for (let i = 1; i < envelope.signers.length; i++) {
    const order = [...envelope.signers].filter((s) => s.signedAt).sort((a, b) => a.signedAt!.localeCompare(b.signedAt!));
    if (order[i] && order[i].sha256Before !== order[i - 1].sha256After) problems.push('the chain of signatures is broken');
  }
  return { ok: problems.length === 0, problems, envelope };
}
