// A companion to a plain PDF for anyone (or any agent) placing fields by hand in
// another signing app such as DocuSign or Dropbox Sign:
//
//   <name>.guide.pdf   the same pages with a numbered yellow box on every spot,
//                      and a last page listing each box's position
//   <name>.guide.json  the same list as data
//
// You upload the plain PDF to the signing app, and use the guide as the picture
// of where each field goes. Positions are from the TOP-LEFT corner of the page,
// the way signing apps and screens measure, and are given as a share of the page
// so they hold at any zoom.
import { readFileSync, writeFileSync } from 'fs';
import { PDFDocument, PDFFont, rgb, StandardFonts } from 'pdf-lib';

import { FormField } from './types';

const pct = (n: number): number => Math.round(n * 1000) / 10;
const inch = (pt: number): number => Math.round((pt / 72) * 100) / 100;

type Box = { left: number; top: number; width: number; height: number };

/** One box to place, measured from the top-left corner of its page. */
export interface Placement {
  number: number;
  type: string;
  signer: string;
  page: number;
  fromTopLeft: { percent: Box; inches: Box; points: Box };
}

/** The placement list: one entry per box, numbered in reading order. */
export function placements(fields: FormField[], pageSizes: { width: number; height: number }[]): Placement[] {
  return [...fields]
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
    .map((f, i) => {
      const { width: W, height: H } = pageSizes[f.page - 1];
      const top = H - f.y - f.height;
      return {
        number: i + 1,
        type: f.type,
        signer: f.who,
        page: f.page,
        fromTopLeft: {
          percent: { left: pct(f.x / W), top: pct(top / H), width: pct(f.width / W), height: pct(f.height / H) },
          inches: { left: inch(f.x), top: inch(top), width: inch(f.width), height: inch(f.height) },
          points: { left: f.x, top: Math.round(top * 100) / 100, width: f.width, height: f.height },
        },
      };
    });
}

export async function writeGuide(pdfFile: string, fieldsFile: string = pdfFile.replace(/\.pdf$/i, '.form.json')): Promise<{ out: string; count: number }> {
  const fields = JSON.parse(readFileSync(fieldsFile, 'utf8')) as FormField[];
  const pdf = await PDFDocument.load(readFileSync(pdfFile));
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const plain = await pdf.embedFont(StandardFonts.Helvetica);
  const sizes = pdf.getPages().map((p) => p.getSize());
  const list = placements(fields, sizes);
  const yellow = rgb(1, 0.85, 0.1);
  const edge = rgb(0.8, 0.45, 0);

  for (const p of list) {
    const f = p.fromTopLeft.points;
    const page = pdf.getPage(p.page - 1);
    const y = sizes[p.page - 1].height - f.top - f.height;
    page.drawRectangle({ x: f.left, y, width: f.width, height: f.height, color: yellow, opacity: 0.5, borderColor: edge, borderWidth: 1.2 });
    page.drawCircle({ x: f.left + 9, y: y + f.height / 2, size: 7.5, color: edge });
    page.drawText(String(p.number), { x: f.left + (p.number > 9 ? 4.4 : 6.6), y: y + f.height / 2 - 3, size: 8.5, font, color: rgb(1, 1, 1) });
    page.drawText(`${p.type.toUpperCase()}  ·  ${p.signer}`, { x: f.left + 21, y: y + f.height / 2 - 3, size: 8.5, font, color: rgb(0.35, 0.2, 0) });
    // a banner at the top of any page that has boxes, so the page is easy to find
    page.drawText(`GUIDE COPY: do not send this file. Page ${p.page} has fields.`, { x: 36, y: sizes[p.page - 1].height - 18, size: 8, font, color: edge });
  }

  // the list, on its own last page
  const page = pdf.addPage([612, 792]);
  let y = 740;
  const line = (text: string, { f = plain, size = 9, gap = 13, x = 48 }: { f?: PDFFont; size?: number; gap?: number; x?: number } = {}) => {
    page.drawText(text, { x, y, size, font: f });
    y -= gap;
  };
  line('Field placement guide', { f: font, size: 16, gap: 22 });
  const intro = [
    'This file is a picture of where the fields go. Upload the PLAIN PDF (without yellow boxes) to the signing app,',
    'then add one field for each numbered box below, on the page shown, assigned to the signer shown.',
    'Positions are measured from the TOP-LEFT corner of the page to the top-left corner of the box.',
    'Percentages are of the page width (left, width) and page height (top, height), so they hold at any zoom.',
    `The document has ${sizes.length} pages before this one; this guide page is not part of it.`,
  ];
  for (const t of intro) line(t);
  y -= 8;
  const cols = [48, 70, 140, 225, 262, 318, 372, 430, 492];
  const row = (cells: (string | number)[], f: PDFFont = plain) => {
    cells.forEach((c, i) => page.drawText(String(c), { x: cols[i], y, size: 8.5, font: f }));
    y -= 13;
  };
  row(['#', 'Field', 'Signer', 'Page', 'Left %', 'Top %', 'Width %', 'Height %', 'Left, top (in)'], font);
  for (const p of list) {
    const c = p.fromTopLeft;
    row([p.number, p.type, p.signer, p.page, c.percent.left, c.percent.top, c.percent.width, c.percent.height, `${c.inches.left}, ${c.inches.top}`]);
  }
  y -= 8;
  line("After placing, compare the signing app's preview with the yellow boxes in this file before sending.", { size: 8.5 });

  const out = pdfFile.replace(/\.pdf$/, '.guide.pdf');
  writeFileSync(out, await pdf.save());
  writeFileSync(pdfFile.replace(/\.pdf$/, '.guide.json'), JSON.stringify({ document: pdfFile.split('/').pop(), pages: sizes.length, pageSizePoints: sizes[0], fields: list }, null, 2) + '\n');
  return { out, count: list.length };
}
