import { isPath } from './path';

/**
 * The condition language for \when{…}: a small, safe expression grammar.
 * Never evaluated with eval.
 *
 *   expr    := or
 *   or      := and ('||' and)*
 *   and     := not ('&&' not)*
 *   not     := '!' not | compare
 *   compare := primary (('==' | '!=' | '<' | '<=' | '>' | '>=') primary)?
 *   primary := path | number | "string" | true | false | null | '(' expr ')'
 */
export type Expr =
  | { type: 'path'; path: string }
  | { type: 'literal'; value: string | number | boolean | null }
  | { type: 'not'; expr: Expr }
  | { type: 'and' | 'or'; left: Expr; right: Expr }
  | { type: 'compare'; op: CompareOp; left: Expr; right: Expr };

export type CompareOp = '==' | '!=' | '<' | '<=' | '>' | '>=';

export class ConditionError extends Error {
  name = 'ConditionError';
}

type Token =
  | { t: 'op'; v: string }
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'word'; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['&&', '||', '==', '!=', '<=', '>='].includes(two)) {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('!<>()'.includes(ch)) {
      out.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    if (ch === '"') {
      let s = '';
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length) i++;
        s += src[i++];
      }
      if (src[i] !== '"') throw new ConditionError('unterminated string');
      i++;
      out.push({ t: 'str', v: s });
      continue;
    }
    const num = /^-?\d+(?:\.\d+)?/.exec(src.slice(i));
    if (num) {
      out.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const word = /^\$?[A-Za-z_][A-Za-z0-9_]*(?:\.(?:[A-Za-z_][A-Za-z0-9_]*|\d+))*/.exec(src.slice(i));
    if (word) {
      out.push({ t: 'word', v: word[0] });
      i += word[0].length;
      continue;
    }
    if (ch === '=') throw new ConditionError('use == to compare, not =');
    if (ch === '&' || ch === '|') throw new ConditionError(`use ${ch}${ch}, not ${ch}`);
    throw new ConditionError(`unexpected "${ch}"`);
  }
  return out;
}

export function parseCondition(src: string): Expr {
  const tokens = tokenize(src);
  if (tokens.length === 0) throw new ConditionError('empty condition');
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;

  const primary = (): Expr => {
    const tok = tokens[pos++];
    if (!tok) throw new ConditionError('condition ends too early');
    if (tok.t === 'op' && tok.v === '(') {
      const e = or();
      if (!isOp(')')) throw new ConditionError('missing )');
      pos++;
      return e;
    }
    if (tok.t === 'num') return { type: 'literal', value: tok.v };
    if (tok.t === 'str') return { type: 'literal', value: tok.v };
    if (tok.t === 'word') {
      if (tok.v === 'true') return { type: 'literal', value: true };
      if (tok.v === 'false') return { type: 'literal', value: false };
      if (tok.v === 'null') return { type: 'literal', value: null };
      if (!isPath(tok.v)) throw new ConditionError(`invalid path ${tok.v}`);
      return { type: 'path', path: tok.v };
    }
    throw new ConditionError(`unexpected "${tok.v}"`);
  };
  const compare = (): Expr => {
    const left = primary();
    const tok = peek();
    if (tok?.t === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(tok.v)) {
      pos++;
      return { type: 'compare', op: tok.v as CompareOp, left, right: primary() };
    }
    return left;
  };
  const not = (): Expr => {
    if (isOp('!')) {
      pos++;
      return { type: 'not', expr: not() };
    }
    return compare();
  };
  const and = (): Expr => {
    let left = not();
    while (isOp('&&')) {
      pos++;
      left = { type: 'and', left, right: not() };
    }
    return left;
  };
  const or = (): Expr => {
    let left = and();
    while (isOp('||')) {
      pos++;
      left = { type: 'or', left, right: and() };
    }
    return left;
  };

  const expr = or();
  if (pos < tokens.length) {
    const t = tokens[pos];
    throw new ConditionError(`unexpected "${t.t === 'str' ? `"${t.v}"` : t.v}"`);
  }
  return expr;
}

export function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== 0 && v !== '';
}

export function evaluateCondition(expr: Expr, lookup: (path: string) => unknown): boolean {
  return truthy(value(expr, lookup));
}

function value(expr: Expr, lookup: (path: string) => unknown): unknown {
  switch (expr.type) {
  case 'path':
    return lookup(expr.path);
  case 'literal':
    return expr.value;
  case 'not':
    return !truthy(value(expr.expr, lookup));
  case 'and':
    return truthy(value(expr.left, lookup)) && truthy(value(expr.right, lookup));
  case 'or':
    return truthy(value(expr.left, lookup)) || truthy(value(expr.right, lookup));
  case 'compare': {
    const l = value(expr.left, lookup);
    const r = value(expr.right, lookup);
    switch (expr.op) {
    case '==':
      return (l ?? null) === (r ?? null);
    case '!=':
      return (l ?? null) !== (r ?? null);
    default: {
      // ordering only between two numbers or two strings; anything else is false
      if (!((typeof l === 'number' && typeof r === 'number') || (typeof l === 'string' && typeof r === 'string'))) return false;
      if (expr.op === '<') return l < r;
      if (expr.op === '<=') return l <= r;
      if (expr.op === '>') return l > r;
      return l >= r;
    }
    }
  }
  }
}

export function conditionPaths(expr: Expr, out: string[] = []): string[] {
  switch (expr.type) {
  case 'path':
    out.push(expr.path);
    break;
  case 'not':
    conditionPaths(expr.expr, out);
    break;
  case 'and':
  case 'or':
  case 'compare':
    conditionPaths(expr.left, out);
    conditionPaths(expr.right, out);
    break;
  }
  return out;
}
