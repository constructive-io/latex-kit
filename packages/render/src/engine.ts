import type { Engine } from './command';

/** An engine, or `auto`: chosen from what the document loads. */
export type EngineChoice = Engine | 'auto';

export interface EngineDetection {
  engine: Engine;
  /** Why this engine, for messages: "loads xeCJK". */
  reason: string;
  /** Problems worth telling the author, e.g. CJK text with no CJK package. */
  warnings: string[];
}

const MAGIC = /^[ \t]*%[ \t]*!\s*T[eE]X\s+(?:TS-)?program\s*=\s*([A-Za-z]+)/m;
const CJK_TEXT = /[぀-ヿ㐀-䶿一-鿿가-힯ｦ-ﾟ]/;

/** Remove comments (an unescaped % to the end of the line). */
function stripComments(tex: string): string {
  return tex.replace(/(^|[^\\])%.*$/gm, '$1');
}

/** Packages and the document class a source loads. */
export function loadedPackages(tex: string): { packages: string[]; documentClass: string | null } {
  const src = stripComments(tex);
  const packages: string[] = [];
  for (const m of src.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) {
    packages.push(...m[1].split(',').map((p) => p.trim()).filter(Boolean));
  }
  const cls = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(src);
  return { packages, documentClass: cls ? cls[1].trim() : null };
}

/**
 * Pick the engine a document needs, from (in order) a `% !TEX program =`
 * line, then the packages and class it loads. LuaLaTeX is the default: it
 * handles Unicode and is the only engine whose PDFs are byte-reproducible in
 * the default image. XeLaTeX only when the document needs it (xeCJK, ctex),
 * pdfLaTeX for the CJK package, latex → dvips → ps2pdf for PSTricks.
 */
export function detectEngine(tex: string): EngineDetection {
  const warnings: string[] = [];
  const { packages, documentClass } = loadedPackages(tex);
  const has = (...names: string[]) => names.find((n) => packages.includes(n));
  const cls = documentClass ?? '';
  const pstricks = packages.find((p) => p === 'pstricks' || p.startsWith('pst-'));
  const cjkPackage = has('xeCJK', 'luatexja', 'luatexja-fontspec', 'luatexja-preset', 'CJK', 'CJKutf8', 'ctex') ?? (/^(ltj|ctex)/.test(cls) ? cls : undefined);

  if (CJK_TEXT.test(stripComments(tex)) && !cjkPackage) {
    warnings.push('the document has Chinese, Japanese or Korean text but loads no CJK package (luatexja-fontspec for LuaLaTeX, xeCJK for XeLaTeX); those characters may be missing');
  }

  const magic = MAGIC.exec(tex.split('\n').slice(0, 30).join('\n'));
  if (magic) {
    const name = magic[1].toLowerCase();
    const fromMagic: Record<string, Engine> = { lualatex: 'lualatex', xelatex: 'xelatex', pdflatex: 'pdflatex', latex: 'pdfps' };
    if (fromMagic[name]) return { engine: fromMagic[name], reason: `% !TEX program = ${magic[1]}`, warnings };
  }
  if (pstricks) return { engine: 'pdfps', reason: `loads ${pstricks} (PSTricks needs latex → dvips → ps2pdf)`, warnings };
  const xe = has('xeCJK', 'xltxtra', 'xunicode', 'ctex') ?? (/^ctex/.test(cls) ? cls : undefined);
  if (xe) return { engine: 'xelatex', reason: `loads ${xe}`, warnings };
  const lua = has('luatexja', 'luatexja-fontspec', 'luatexja-preset', 'luacode', 'luaotfload') ?? (/^ltj/.test(cls) ? cls : undefined);
  if (lua) return { engine: 'lualatex', reason: `loads ${lua}`, warnings };
  const pdf = has('CJK', 'CJKutf8');
  if (pdf) return { engine: 'pdflatex', reason: `loads ${pdf}`, warnings };
  return { engine: 'lualatex', reason: 'default', warnings };
}
