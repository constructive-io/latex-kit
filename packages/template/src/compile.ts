import { getParser } from '@unified-latex/unified-latex-util-parse';

import { ConditionError, Expr, parseCondition } from './condition';
import { diag, Diagnostic, LineIndex, Location } from './diagnostics';
import { FieldSpec, FilterError, parseFieldSpec } from './filters';
import { isName, isPath } from './path';

/**
 * The template language's macros and how many {…} arguments each takes.
 * Bare names keep templates readable; \snippet (not \partial, which is the
 * math ∂) and \clauseref (not \ref) avoid LaTeX's own commands.
 */
export const MACROS = {
  field: 1,
  raw: 1,
  when: 2,
  otherwise: 1,
  each: 3,
  sep: 1,
  snippet: 1,
  docid: 0,
  clauseref: 1,
} as const;

export type MacroName = keyof typeof MACROS;

export type Node =
  | { kind: 'text'; text: string }
  | { kind: 'field'; spec: FieldSpec; raw: boolean; source: string; loc: Location }
  | { kind: 'when'; cond: Expr; source: string; then: Node[]; else?: Node[]; loc: Location }
  | { kind: 'each'; path: string; name: string; body: Node[]; loc: Location }
  | { kind: 'sep'; body: Node[]; loc: Location }
  | { kind: 'snippet'; name: string; loc: Location }
  | { kind: 'docid'; loc: Location };

export interface CompiledTemplate {
  file: string;
  text: string;
  nodes: Node[];
  /** Syntax problems found while compiling. */
  diagnostics: Diagnostic[];
}

const parser = getParser({
  macros: Object.fromEntries(
    Object.entries(MACROS).map(([name, n]) => [name, { signature: Array(n).fill('m').join(' ') }])
  ),
});

interface Occurrence {
  name: MacroName;
  start: number;
}

/** Find our macros with unified-latex, so comments, verbatim and \verb are skipped. */
function findMacros(text: string): Occurrence[] {
  const out: Occurrence[] = [];
  const seen = new Set<number>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const n = node as { type?: string; content?: unknown; args?: unknown; position?: { start: { offset: number } } };
    if (n.type === 'macro' && typeof n.content === 'string' && n.content in MACROS && n.position) {
      const start = n.position.start.offset;
      if (!seen.has(start)) {
        seen.add(start);
        out.push({ name: n.content as MacroName, start });
      }
    }
    if (n.content && typeof n.content !== 'string') walk(n.content);
    if (n.args) walk(n.args);
  };
  walk(parser.parse(text));
  return out.sort((a, b) => a.start - b.start);
}

interface Arg {
  start: number;
  end: number;
}

class SyntaxError extends Error {
  constructor(
    message: string,
    readonly offset: number
  ) {
    super(message);
  }
}

/** Skip spaces and at most one line break, as TeX does between arguments. */
function skipSpace(text: string, pos: number): number {
  let newlines = 0;
  while (pos < text.length) {
    const ch = text[pos];
    if (ch === ' ' || ch === '\t' || ch === '\r') pos++;
    else if (ch === '\n' && newlines === 0) {
      newlines++;
      pos++;
    } else break;
  }
  return pos;
}

/** Read `count` brace groups starting at `pos`. Returns the content ranges and the end. */
function readArgs(text: string, pos: number, count: number, macro: string): { args: Arg[]; end: number } {
  const args: Arg[] = [];
  for (let i = 0; i < count; i++) {
    const open = skipSpace(text, pos);
    if (text[open] !== '{') {
      throw new SyntaxError(`\\${macro} needs ${count} {…} argument${count > 1 ? 's' : ''}`, open);
    }
    let depth = 0;
    let j = open;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (ch === '\\') {
        j++;
      } else if (ch === '%') {
        while (j < text.length && text[j] !== '\n') j++;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) throw new SyntaxError(`unbalanced braces in \\${macro}`, open);
    args.push({ start: open + 1, end: j });
    pos = j + 1;
  }
  return { args, end: pos };
}

export function compileTemplate(text: string, file: string): CompiledTemplate {
  const diagnostics: Diagnostic[] = [];
  const lines = new LineIndex(text);
  const at = (offset: number): Location => ({ file, ...lines.locate(offset) });

  let occurrences: Occurrence[];
  try {
    occurrences = findMacros(text);
  } catch (e) {
    diagnostics.push(diag('error', `could not parse: ${(e as Error).message}`, at(0)));
    return { file, text, nodes: [{ kind: 'text', text }], diagnostics };
  }

  let next = 0; // index into occurrences

  const compileRange = (start: number, end: number, inEach: boolean): Node[] => {
    const nodes: Node[] = [];
    let pos = start;
    const pushText = (to: number) => {
      if (to > pos) nodes.push({ kind: 'text', text: text.slice(pos, to) });
    };

    while (next < occurrences.length && occurrences[next].start < end) {
      const occ = occurrences[next++];
      if (occ.start < pos) continue; // inside an argument already consumed
      pushText(occ.start);
      const loc = at(occ.start);
      const nameEnd = occ.start + 1 + occ.name.length;
      pos = nameEnd;
      try {
        const { args, end: macroEnd } = readArgs(text, nameEnd, MACROS[occ.name], occ.name);
        const argText = (i: number) => text.slice(args[i].start, args[i].end).trim();

        switch (occ.name) {
        case 'field':
        case 'raw': {
          try {
            nodes.push({ kind: 'field', spec: parseFieldSpec(argText(0)), raw: occ.name === 'raw', source: argText(0), loc });
          } catch (e) {
            if (!(e instanceof FilterError)) throw e;
            diagnostics.push(diag('error', `\\${occ.name}{${argText(0)}}: ${e.message}`, loc));
          }
          pos = macroEnd;
          break;
        }
        case 'when': {
          let cond: Expr | null = null;
          try {
            cond = parseCondition(argText(0));
          } catch (e) {
            if (!(e instanceof ConditionError)) throw e;
            diagnostics.push(diag('error', `\\when{${argText(0)}}: ${e.message}`, loc));
          }
          const thenNodes = compileRange(args[1].start, args[1].end, inEach);
          pos = macroEnd;
          let elseNodes: Node[] | undefined;
          const after = skipSpace(text, macroEnd);
          const nextOcc = occurrences[next];
          if (nextOcc && nextOcc.name === 'otherwise' && nextOcc.start === after) {
            next++;
            const o = readArgs(text, after + '\\otherwise'.length, 1, 'otherwise');
            elseNodes = compileRange(o.args[0].start, o.args[0].end, inEach);
            pos = o.end;
          }
          if (cond) nodes.push({ kind: 'when', cond, source: argText(0), then: thenNodes, else: elseNodes, loc });
          break;
        }
        case 'otherwise':
          diagnostics.push(diag('error', '\\otherwise must come right after \\when{…}{…}', loc));
          pos = macroEnd;
          break;
        case 'each': {
          const path = argText(0);
          const name = argText(1);
          if (!isPath(path)) diagnostics.push(diag('error', `\\each: invalid list path "${path}"`, loc));
          if (!isName(name)) diagnostics.push(diag('error', `\\each: invalid item name "${name}" (use a simple name like item)`, loc));
          const body = compileRange(args[2].start, args[2].end, true);
          nodes.push({ kind: 'each', path, name, body, loc });
          pos = macroEnd;
          break;
        }
        case 'sep': {
          if (!inEach) diagnostics.push(diag('error', '\\sep only works inside \\each', loc));
          nodes.push({ kind: 'sep', body: compileRange(args[0].start, args[0].end, inEach), loc });
          pos = macroEnd;
          break;
        }
        case 'snippet': {
          const name = argText(0);
          if (!/^[A-Za-z0-9_\-./]+$/.test(name) || name.split('/').some((s) => s === '..' || s === '')) {
            diagnostics.push(diag('error', `\\snippet{${name}}: use a relative name like parts/header`, loc));
          } else {
            nodes.push({ kind: 'snippet', name, loc });
          }
          pos = macroEnd;
          break;
        }
        case 'docid': {
          nodes.push({ kind: 'docid', loc });
          // allow \docid{} as in plain LaTeX usage
          pos = text.startsWith('{}', macroEnd) ? macroEnd + 2 : macroEnd;
          break;
        }
        case 'clauseref':
          diagnostics.push(diag('error', '\\clauseref is reserved for the clause library, which is not available yet', loc));
          pos = macroEnd;
          break;
        }
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
        diagnostics.push(diag('error', e.message, at(e.offset)));
      }
    }
    pushText(end);
    pos = end;
    return nodes;
  };

  const nodes = compileRange(0, text.length, false);
  return { file, text, nodes, diagnostics };
}
