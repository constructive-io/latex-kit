/**
 * Components for latex-kit templates. A component is a TypeScript function
 * from a value to LaTeX; a template calls it with `\component{name}{path}`.
 * The built-in ones are in {@link BUILTIN_COMPONENTS}; a project adds its own
 * in `components/<name>.ts` with {@link defineComponent}.
 */
import type { Component } from '@latex-kit/template';

import { address } from './address';
import { bilingual } from './bilingual';
import { exhibits } from './exhibits';
import { signatures } from './signatures';

export * from './address';
export * from './bilingual';
export * from './clause';
export * from './exhibits';
export * from './format';
export * from './signatures';
export * from './table';
export { escapeLatex, raw, RawLatex, tex } from '@latex-kit/escape';
export type { Component, ComponentContext } from '@latex-kit/template';

/** Type a project component: `export default defineComponent((value, ctx) => tex\`…\`)`. */
export function defineComponent<T = unknown>(fn: (value: T, ctx: Parameters<Component>[1]) => ReturnType<Component>): Component {
  return fn as Component;
}

/** Components every template can use without defining them. */
export const BUILTIN_COMPONENTS: Record<string, Component> = {
  address: (value, ctx) => address(value, ctx),
  bilingual: (value, ctx) => bilingual(value, ctx),
  exhibits: (value, ctx) => exhibits(value, ctx),
  signatures: (value, ctx) => signatures(value, ctx),
};
