import { CompiledTemplate } from './compile';
import type { Component } from './component';

export interface ClauseMeta {
  title?: string;
  version?: string;
}

/** A clause from the library, compiled, with its header. */
export interface LoadedClause extends ClauseMeta {
  id: string;
  /** The clause text (empty for a clause written as a TypeScript function). */
  template: CompiledTemplate;
  /** A TypeScript clause's body, called with the record's data. */
  render?: Component;
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
