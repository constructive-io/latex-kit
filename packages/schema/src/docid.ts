import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { extname } from 'path';
import { isMap, isScalar, parseDocument } from 'yaml';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A new document ID: `PREFIX-YYYYMMDD-XXXXXXXX` (8 random Crockford base-32
 * characters, 40 bits). Minted once, then stored on the record so every
 * re-render reuses it.
 */
export function mintDocId(options: { prefix: string; epoch: number; random?: (n: number) => Buffer }): string {
  const prefix = options.prefix.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'DOC';
  const date = new Date(options.epoch * 1000).toISOString().slice(0, 10).replace(/-/g, '');
  const bytes = (options.random ?? randomBytes)(8);
  let suffix = '';
  for (let i = 0; i < 8; i++) suffix += CROCKFORD[bytes[i] & 31];
  return `${prefix}-${date}-${suffix}`;
}

export class DocIdWriteError extends Error {
  name = 'DocIdWriteError';
}

/**
 * Store a minted ID in a JSON or YAML record, right after `template`.
 * TypeScript/JavaScript records are code, so they are never rewritten: the
 * error tells you the line to add.
 */
export function writeDocId(file: string, docId: string): void {
  const ext = extname(file).toLowerCase();
  const text = readFileSync(file, 'utf8');
  if (ext === '.json') {
    const obj = JSON.parse(text) as Record<string, unknown>;
    const indent = /\n([ \t]+)"/.exec(text)?.[1] ?? '  ';
    const out: Record<string, unknown> = {};
    let placed = false;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'docId') continue;
      out[k] = v;
      if (k === 'template') {
        out.docId = docId;
        placed = true;
      }
    }
    if (!placed) out.docId = docId;
    writeFileSync(file, JSON.stringify(out, null, indent) + '\n');
    return;
  }
  if (ext === '.yaml' || ext === '.yml') {
    const doc = parseDocument(text);
    if (doc.has('docId') || !isMap(doc.contents)) {
      doc.set('docId', docId);
    } else {
      // right after `template:`, where people look for it
      const items = doc.contents.items;
      const at = items.findIndex((p) => isScalar(p.key) && p.key.value === 'template');
      items.splice(at + 1, 0, doc.createPair('docId', docId));
    }
    writeFileSync(file, doc.toString());
    return;
  }
  throw new DocIdWriteError(`${file} is code, so latex-kit will not edit it. Add this line to the record: docId: '${docId}'`);
}
