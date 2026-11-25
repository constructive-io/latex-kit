const IDENT = '[A-Za-z_][A-Za-z0-9_]*';
const PATH_RE = new RegExp(`^\\$?${IDENT}(?:\\.(?:${IDENT}|\\d+))*$`);
const NAME_RE = new RegExp(`^${IDENT}$`);

/** Values every template can read. */
export const GLOBAL_SPECIALS = ['$variant', '$locale', '$docid', '$template'] as const;
/** Values only readable inside \each. */
export const LOOP_SPECIALS = ['$index', '$first', '$last'] as const;

export function isPath(text: string): boolean {
  return PATH_RE.test(text);
}

export function isName(text: string): boolean {
  return NAME_RE.test(text) && !text.startsWith('$');
}

export function splitPath(path: string): string[] {
  return path.split('.');
}
