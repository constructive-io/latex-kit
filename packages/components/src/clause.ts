import type { Component } from '@latex-kit/template';

/**
 * A clause written in TypeScript: `clauses/<id>.ts`.
 *
 *     export default defineClause({
 *       title: 'Term',
 *       version: 2,
 *       body: 'This Agreement lasts \\field{termMonths|words} months.',
 *     });
 *
 * `body` is template text, checked like a .tex clause. `render` builds the
 * clause from the record's data instead, like a component.
 */
export interface ClauseDefinition {
  title?: string;
  version?: string | number;
  body?: string;
  render?: Component;
}

export function defineClause(def: ClauseDefinition): ClauseDefinition {
  if (def.body === undefined && def.render === undefined) throw new Error('defineClause: give a body (template text) or a render function');
  return def;
}
