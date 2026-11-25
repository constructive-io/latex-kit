import { z } from 'zod';

import { loadFile } from './load';
import { resolveRefs } from './ref';

/** The file that describes one document: which template, its ID, its data. */
export const DocumentRecord = z
  .object({
    $schema: z.string().optional(),
    template: z.string().min(1),
    docId: z.string().min(1).optional(),
    locale: z.string().optional(),
    data: z.unknown(),
  })
  .strict();

export type DocumentRecord = z.infer<typeof DocumentRecord>;

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
    throw new RecordError(`${file}: not a document record (${msg}). Expected { template, docId?, locale?, data }`, file);
  }
  const { value, files } = await resolveRefs(parsed.data.data ?? {}, { dataDir: options.dataDir });
  return { file, record: parsed.data, data: value, refFiles: files };
}
