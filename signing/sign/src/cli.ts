#!/usr/bin/env node
import { randomBytes } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import minimist from 'minimist';
import { join, resolve } from 'path';
import { PDFDocument } from 'pdf-lib';

import { writeGuide } from './guide';
import { createSignServer } from './server';
import { createEnvelope, listEnvelopes, load, reissue, verifyEnvelope } from './store';
import { Envelope, FormField, Secret } from './types';

const USAGE = `latex-kit-sign: get a PDF signed

Everything works from two files: a PDF, and <name>.form.json saying where its
boxes are. latex-kit build writes the second one for templates that mark where
to sign; for any other PDF, draw the boxes with "place".

  latex-kit-sign place <any.pdf>
      Draw the boxes on a PDF in the browser. Saving writes <name>.form.json.
      Only this machine can reach the page.

  latex-kit-sign send <document.pdf> --signer who="Name <email>" [--signer …]
      Make an envelope. Prints, once, each signer's private link and 6-digit
      access code. It does not email anyone: send the link and the code
      yourself, by different routes.
        --days <n>   how long the links work (default 14)
        --ordered    signers sign in the order given; each waits for the one before

  latex-kit-sign serve
      Serve the signing page and its API.

  latex-kit-sign list
  latex-kit-sign status <envelope>
  latex-kit-sign reissue <envelope> <who> [--days <n>]
      A fresh link and code; the old ones stop working.
  latex-kit-sign verify <envelope> [signed.pdf]
      Check a finished envelope: the PDF's hash, the chain of signatures, the seal.

  latex-kit-sign guide <document.pdf>… | --all <folder>
      For placing fields by hand in another signing app: writes <name>.guide.pdf
      (the pages with numbered yellow boxes and a position list) and .guide.json.

Options
      --port <n>     for serve and place (default 8787)
      --fields <f>   read boxes from this file instead of <name>.form.json

Environment
  LATEX_KIT_SIGN_DATA   where envelopes live (default ./.latex-kit-sign)
  LATEX_KIT_SIGN_KEY    the seal key file (default <data>/seal-key.pem)
  LATEX_KIT_SIGN_URL    the address signers reach, printed in links
  LATEX_KIT_SIGN_TRUST_PROXY=1   take the signer's IP from X-Forwarded-For
`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** The boxes for a PDF: --fields, else <name>.form.json, else <name>.fields.json. */
function fieldsFor(pdf: string, option?: string): string {
  const candidates = option ? [option] : [pdf.replace(/\.pdf$/i, '.form.json'), pdf.replace(/\.pdf$/i, '.fields.json')];
  const found = candidates.find((f) => existsSync(f));
  if (!found) fail(`no boxes for ${pdf}: expected ${candidates.join(' or ')}. Draw them with: latex-kit-sign place ${pdf}`);
  return found;
}

export async function main(args: string[]): Promise<void> {
  const argv = minimist(args, { string: ['signer', 'port', 'days', 'all', 'fields'], boolean: ['ordered', 'help'], alias: { h: 'help' } });
  const [cmd, ...rest] = argv._.map(String);
  const port = Number(argv.port || 8787);
  const base = process.env.LATEX_KIT_SIGN_URL || `http://localhost:${port}`;
  const days = Number(argv.days || 14);
  const show = (envelope: Envelope, s: Secret) =>
    console.log(`  ${s.who.padEnd(12)} ${envelope.signers.find((x) => x.who === s.who)!.name}\n    link: ${base}/sign/${s.token}\n    code: ${s.code}`);

  if (!cmd || argv.help) {
    console.log(USAGE);
    return;
  }
  if (cmd === 'send') {
    const pdf = rest[0];
    if (!pdf || !existsSync(pdf)) fail('send needs a PDF');
    const signers: Record<string, { name: string; email: string }> = {};
    for (const s of ([] as string[]).concat(argv.signer ?? [])) {
      const m = /^([\w.-]+)=(.+?)\s*<(.+@.+)>$/.exec(s);
      if (!m) fail(`--signer wants who="Name <email>", got: ${s}`);
      signers[m[1]] = { name: m[2], email: m[3] };
    }
    const fields = JSON.parse(readFileSync(fieldsFor(pdf, argv.fields), 'utf8')) as FormField[];
    let made;
    try {
      made = createEnvelope({ pdfPath: pdf, fields, signers, days, ordered: Boolean(argv.ordered) });
    } catch (e) {
      fail(`${(e as Error).message}. The boxes name: ${[...new Set(fields.map((f) => f.who))].join(', ')}`);
    }
    const { envelope, secrets } = made;
    console.log(`envelope ${envelope.id}: ${envelope.title} (links work until ${envelope.expiresAt.slice(0, 10)})`);
    if (envelope.ordered) console.log('They sign in this order; each link opens once the signer before has signed.');
    console.log('These links and codes are shown once and not stored. Send each code by a different route than its link.');
    for (const s of secrets) show(envelope, s);
  } else if (cmd === 'reissue') {
    try {
      const { envelope, secret } = reissue(rest[0] ?? '', rest[1] ?? '', days);
      console.log(`new link and code for ${secret.who}; the old ones no longer work (links now work until ${envelope.expiresAt.slice(0, 10)})`);
      show(envelope, secret);
    } catch (e) {
      fail((e as Error).message);
    }
  } else if (cmd === 'list') {
    for (const e of listEnvelopes()) {
      const state = e.declinedAt ? 'declined' : e.completedAt ? 'complete' : `${e.signers.filter((s) => s.signedAt).length}/${e.signers.length} signed`;
      console.log(`${e.id}  ${e.createdAt.slice(0, 10)}  ${state.padEnd(12)} ${e.title}`);
    }
  } else if (cmd === 'serve') {
    createSignServer().listen(port, () => console.log(`signing page on http://localhost:${port}`));
  } else if (cmd === 'place') {
    const pdf = rest[0] && resolve(rest[0]);
    if (!pdf || !existsSync(pdf)) fail('place needs a PDF');
    const pageSizes = (await PDFDocument.load(readFileSync(pdf))).getPages().map((p) => p.getSize());
    const key = randomBytes(18).toString('base64url');
    const fieldsFile = argv.fields ? resolve(argv.fields) : pdf.replace(/\.pdf$/i, '.form.json');
    // only this machine can reach the placing page
    createSignServer({ placing: new Map([[key, { pdf, fieldsFile, pageSizes }]]) }).listen(port, '127.0.0.1', () => {
      console.log(`draw the fields here: http://localhost:${port}/place/${key}\nsaving writes ${fieldsFile}\npress Ctrl-C when done`);
    });
  } else if (cmd === 'status') {
    const e = load(rest[0] ?? '');
    if (!e) fail('no such envelope');
    console.log(`${e.title}: ${e.declinedAt ? `declined by ${e.declinedBy?.who}` : e.completedAt ? 'complete' : 'waiting'}`);
    for (const s of e.signers) console.log(`  ${s.who.padEnd(12)} ${s.name}: ${s.signedAt ? `signed ${s.signedAt} from ${s.ip}` : s.failedCodes >= 5 ? 'locked (wrong codes)' : 'not yet'}`);
    for (const ev of e.events) console.log(`  ${ev.at}  ${ev.what}${ev.who ? ` (${ev.who})` : ''}${ev.ip ? `  ${ev.ip}` : ''}`);
  } else if (cmd === 'verify') {
    const r = verifyEnvelope(rest[0] ?? '', rest[1]);
    console.log(r.ok ? `ok: ${r.envelope!.title} is the file that was signed, and its record is intact` : `PROBLEMS:\n  ${r.problems.join('\n  ')}`);
    if (!r.ok) process.exit(1);
  } else if (cmd === 'guide') {
    const dir = argv.all as string | undefined;
    const pdfs = dir
      ? (readdirSync(dir, { recursive: true }) as string[])
        .filter((f) => f.endsWith('.form.json'))
        .map((f) => join(dir, f.replace(/\.form\.json$/, '.pdf')))
        .filter((f) => existsSync(f))
      : rest;
    if (!pdfs.length) fail('guide needs PDFs with a .form.json beside them');
    for (const pdf of pdfs) {
      const { out, count } = await writeGuide(pdf, fieldsFor(pdf, dir ? undefined : argv.fields));
      if (!dir) console.log(`${out}: ${count} fields`);
    }
    if (dir) console.log(`guide: wrote ${pdfs.length} .guide.pdf files under ${dir}`);
  } else {
    console.log(USAGE);
    process.exit(1);
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => fail(e instanceof Error ? e.message : String(e)));
}
