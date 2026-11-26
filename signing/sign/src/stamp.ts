// Puts a signer's signature and date into the PDF, and adds the certificate page.
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';

import { Envelope, FormField } from './types';

const longDate = (iso: string): string => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** Stamps every box that belongs to `who`. Returns the new PDF bytes. */
export interface StampInput {
  /** A PNG of the drawn or typed signature; null when the signer has no signature box. */
  signaturePng: Uint8Array | null;
  signedAt: string;
  /** What was typed into text and initials boxes, by the field's index. */
  values?: Record<number, string>;
}

export async function stampSigner(pdfBytes: Uint8Array, fields: FormField[], who: string, { signaturePng, signedAt, values = {} }: StampInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const image = signaturePng ? await pdf.embedPng(signaturePng) : null;
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  /** Text set on the box's bottom edge, shrunk if it would run past the box. */
  const write = (page: PDFPage, f: FormField, text: string, fnt: PDFFont, size = 10) => {
    const fit = Math.min(size, f.height - 2, (size * (f.width - 4)) / Math.max(1, fnt.widthOfTextAtSize(text, size)));
    page.drawText(text, { x: f.x + 2, y: f.y + 3, size: Math.max(5, fit), font: fnt, color: rgb(0, 0, 0) });
  };
  for (const [i, f] of fields.entries()) {
    if (f.who !== who) continue;
    const page = pdf.getPage(f.page - 1);
    if (f.type === 'text') write(page, f, values[i], font);
    else if (f.type === 'initials') write(page, f, values[i], italic, 14);
    else if (f.type === 'signature' && image) {
      // fit inside the box, keeping the drawing's shape, resting on the line
      const scale = Math.min(f.width / image.width, f.height / image.height);
      page.drawImage(image, { x: f.x + 2, y: f.y, width: image.width * scale, height: image.height * scale });
    } else if (f.type === 'date') {
      write(page, f, longDate(signedAt), font);
    }
  }
  return pdf.save();
}

/** Appends a page listing who signed, when, from where, and the file hashes. */
export async function addCertificate(pdfBytes: Uint8Array, envelope: Envelope): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  let y = 730;
  const line = (text: string, { f = font, size = 9, gap = 13 }: { f?: PDFFont; size?: number; gap?: number } = {}) => {
    page.drawText(String(text).slice(0, 110), { x: 54, y, size, font: f });
    y -= gap;
  };
  line('Signing certificate', { f: bold, size: 16, gap: 24 });
  line(`Document: ${envelope.title}`);
  line(`Envelope: ${envelope.id}`);
  line(`Sent for signing: ${envelope.createdAt}`);
  line(`SHA-256 of the document before signing: ${envelope.sha256Original}`, { gap: 22 });
  for (const s of envelope.signers) {
    line(`${s.name} (${s.who})`, { f: bold, size: 11, gap: 15 });
    line(`Email the signing link was issued to: ${s.email}`);
    line(`Signed: ${s.signedAt} (UTC)`);
    line(`IP address: ${s.ip}`);
    line(`Browser: ${s.userAgent}`);
    const l = (s.location || {}) as { latitude?: number; longitude?: number; accuracyMeters?: number | null; declined?: string };
    line(`Location: ${l.latitude !== undefined ? `${l.latitude.toFixed(5)}, ${l.longitude!.toFixed(5)} (within ${l.accuracyMeters ?? '?'} m, reported by the browser)` : `not recorded (${l.declined || 'not given'})`}`);
    for (const [label, v] of Object.entries(s.values || {})) line(`Typed in "${label}": ${v}`);
    line(`Identity: opened with a private link and a one-time access code`);
    line(`Agreed to the signing terms, version ${s.consent?.termsVersion} (SHA-256 ${String(s.consent?.termsSha256).slice(0, 16)}…)`);
    line(`SHA-256 before this signature: ${s.sha256Before}`);
    line(`SHA-256 after this signature:  ${s.sha256After}`, { gap: 22 });
  }
  y -= 6;
  line('Signing terms each signer agreed to', { f: bold, size: 10, gap: 14 });
  for (const t of envelope.signers[0]?.consent?.text || []) for (const part of wrap(t, 108)) line(part, { size: 8, gap: 11 });
  y -= 6;
  line('The final file hash and this record are sealed by the signing server; `latex-kit-sign verify` checks them.', { size: 8 });
  return pdf.save();
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    if ((cur + ' ' + word).trim().length > width) {
      out.push(cur);
      cur = word;
    } else cur = (cur + ' ' + word).trim();
  }
  if (cur) out.push(cur);
  return out;
}
