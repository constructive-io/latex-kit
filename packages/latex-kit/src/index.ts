/**
 * latex-kit: typed, reproducible LaTeX documents.
 *
 * The CLI is `latex-kit`. This module is what project files import:
 * `defineConfig` for latex-kit.config.ts; `z`, the shared types and `ref()`
 * for schema.ts; `defineDocument` for TypeScript records; `defineComponent`,
 * `table`, `tex` and friends for components/; `defineClause` for clauses.
 */
export * from './build';
export * from './check';
export * from './config';
export * from './diff';
export * from './import';
export * from './lock';
export * from './project';
export * from './scaffold';
// named, not `export *`: two CommonJS star re-exports clash under jiti
export type { Cell, ClauseDefinition, Column, Component, ComponentContext, Exhibit, TableOptions } from '@latex-kit/components';
export {
  address,
  bilingual,
  BUILTIN_COMPONENTS,
  date,
  defineClause,
  defineComponent,
  escapeLatex,
  exhibit,
  exhibits,
  get,
  money,
  number,
  percent,
  raw,
  RawLatex,
  signatures,
  table,
  tex,
} from '@latex-kit/components';
export * from '@latex-kit/schema';
