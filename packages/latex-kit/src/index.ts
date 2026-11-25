/**
 * latex-kit: typed, reproducible LaTeX documents.
 *
 * The CLI is `latex-kit`. This module is what project files import:
 * `defineConfig` for latex-kit.config.ts, and `z` plus the shared types and
 * `ref()` for templates' schema.ts and TypeScript records.
 */
export * from './build';
export * from './check';
export * from './config';
export * from './diff';
export * from './import';
export * from './project';
export * from '@latex-kit/schema';
