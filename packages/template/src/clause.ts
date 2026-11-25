import { CompiledTemplate } from './compile';

export interface ClauseMeta {
  title?: string;
  version?: string;
}

/** A clause from the library, compiled, with its header. */
export interface LoadedClause extends ClauseMeta {
  id: string;
  template: CompiledTemplate;
}

export interface ClauseUse {
  id: string;
  version?: string;
  file: string;
}

/**
 * Read a clause file's header: the leading `%` comment lines.
 *
 *     % title: Confidentiality
 *     % version: 3
 */
export function parseClauseHeader(text: string): ClauseMeta {
  const meta: ClauseMeta = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t === '') continue;
    if (!t.startsWith('%')) break;
    const m = /^%\s*(title|version)\s*:\s*(.*?)\s*$/i.exec(t);
    if (m) meta[m[1].toLowerCase() as keyof ClauseMeta] = m[2];
  }
  return meta;
}

export const clauseLabel = (id: string) => `clause:${id}`;
