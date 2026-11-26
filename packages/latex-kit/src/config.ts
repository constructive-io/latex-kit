import type { Backend, EngineChoice } from '@latex-kit/render';
import { loadModule } from '@latex-kit/schema';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

/** latex-kit.config.ts (or .js, .mjs, .cjs, .json) at the project root. */
export interface LatexKitConfig {
  /** One folder per template: `<templates>/<name>/template.tex` and optional `schema.ts`. Default `templates`. */
  templates?: string;
  /** Shared pieces for \snippet{name}. Default `snippets`. */
  snippets?: string;
  /** The clause library for \\clause{id}: `<clauses>/<id>.tex` or `.ts`. Default `clauses`. */
  clauses?: string;
  /** TypeScript components for \\component{name}{path}: `<components>/<name>.ts`. Default `components`. */
  components?: string;
  /** Shared records that references point at: `<data>/<collection>/<id>.json`. Default `data`. */
  data?: string;
  /** Document records: `<documents>/<name>.json|yaml|ts`. Default `documents`. */
  documents?: string;
  /** Generated .tex and PDFs. Default `out`. */
  out?: string;
  /** Default locale for dates, numbers and money. Default `en-US`. */
  locale?: string;
  /** Default `auto`: chosen from the packages each document loads. */
  engine?: EngineChoice;
  /**
   * Folder with signature images for signed builds (`<name>.png|pdf|jpg`).
   * Keep it outside the repository; `--signatures` and LATEX_KIT_SIGNATURES
   * override it. A leading ~ is the home folder.
   */
  signatures?: string;
  backend?: Backend;
  image?: string;
  platform?: string | null;
}

export type ResolvedConfig = Required<Pick<LatexKitConfig, 'templates' | 'snippets' | 'clauses' | 'components' | 'data' | 'documents' | 'out' | 'locale'>> &
  Pick<LatexKitConfig, 'engine' | 'backend' | 'image' | 'platform' | 'signatures'> & { file: string | null };

export function defineConfig(config: LatexKitConfig): LatexKitConfig {
  return config;
}

export const CONFIG_FILES = ['latex-kit.config.ts', 'latex-kit.config.mts', 'latex-kit.config.js', 'latex-kit.config.mjs', 'latex-kit.config.cjs', 'latex-kit.config.json'];

const DEFAULTS = { templates: 'templates', snippets: 'snippets', clauses: 'clauses', components: 'components', data: 'data', documents: 'documents', out: 'out', locale: 'en-US' };

export async function loadConfig(root: string): Promise<ResolvedConfig> {
  for (const name of CONFIG_FILES) {
    const file = join(resolve(root), name);
    if (!existsSync(file)) continue;
    let config: LatexKitConfig;
    if (name.endsWith('.json')) {
      config = JSON.parse(readFileSync(file, 'utf8'));
    } else {
      const mod = await loadModule(file);
      config = (mod.default ?? mod) as LatexKitConfig;
    }
    return { ...DEFAULTS, ...config, file };
  }
  return { ...DEFAULTS, file: null };
}
