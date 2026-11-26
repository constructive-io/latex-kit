import { z } from 'zod';

import { loadFile } from './load';
import { Ref, resolveRefs } from './ref';
import { ISODate } from './types';

/** How one party signed this document: `signed: { discloser: { date: 2026-11-25 } }`. */
export const Signing = z
  .object({
    /** Printed on the signature block's date line in signed builds. */
    date: ISODate.optional(),
    /** Signature image file for this document, instead of the signer's default. */
    signature: z.string().optional(),
  })
  .strict();
export type Signing = z.infer<typeof Signing>;

/** The file that describes one document: which template, its ID, its data. */
export const DocumentRecord = z
  .object({
    $schema: z.string().optional(),
    template: z.string().min(1),
    docId: z.string().min(1).optional(),
    locale: z.string().optional(),
    /** Signing facts per party, keyed by the path \\signature uses. */
    signed: z.record(z.string(), Signing).optional(),
    data: z.unknown(),
  })
  .strict();

export type DocumentRecord = z.infer<typeof DocumentRecord>;

/** `T`, where any object may instead be a reference to a shared record. */
export type WithRefs<T> = T extends readonly (infer U)[] ? WithRefs<U>[] : T extends object ? { [K in keyof T]: WithRefs<T[K]> } | Ref : T;

/** A document record written in TypeScript. */
export interface DocumentInput<Data = unknown> {
  template: string;
  docId?: string;
  locale?: string;
  signed?: Record<string, Signing>;
  data: WithRefs<Data>;
}

/**
 * Type a TypeScript record: `documents/<name>.ts`. Pass the template's
 * generated type to check the data as you write it:
 *
 *     import type { InvoiceData } from '../templates/invoice/types';
 *     export default defineDocument<InvoiceData>({ template: 'invoice', data: { … } });
 *
 * Computed values (totals, dates) belong here, not in the template.
 */
export function defineDocument<Data = unknown>(record: DocumentInput<Data>): DocumentInput<Data> {
  return record;
}

export interface LoadedDocument {
  file: string;
  record: DocumentRecord;
  /** `data` with every reference resolved. */
  data: unknown;
  /** Shared record files the document read through references. */
  refFiles: string[];
}

export class RecordError extends Error {
  constructor(
    message: string,
    readonly file: string
  ) {
    super(message);
    this.name = 'RecordError';
  }
}

export async function loadDocument(file: string, options: { dataDir: string }): Promise<LoadedDocument> {
  const raw = await loadFile(file);
  const parsed = DocumentRecord.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.') || 'record'}: ${i.message}`).join('; ');
    throw new RecordError(`${file}: not a document record (${msg}). Expected { template, docId?, locale?, signed?, data }`, file);
  }
  const { value, files } = await resolveRefs(parsed.data.data ?? {}, { dataDir: options.dataDir });
  return { file, record: parsed.data, data: value, refFiles: files };
}
