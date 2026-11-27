import { existsSync, readdirSync, readFileSync, rmSync } from 'fs';
import { BoilerplateSkill, SkillInstaller, TemplateScaffolder } from 'genomic';
import { registerDefaultResolver } from 'inquirerer';
import { homedir } from 'os';
import { basename, dirname, isAbsolute, join, resolve } from 'path';

/** Where `latex-kit init --template <name>` gets its starters. */
export const STARTER_REPO = 'constructive-io/latex-kit-boilerplates';

/** The starters in that repository. Another repository may hold others. */
export const STARTERS: Record<string, string> = {
  project: 'One folder of documents: templates, data and records. On its own, or inside a workspace',
  workspace: 'A pnpm workspace: the templates as a package, a project that builds them, bundles and CI',
  module: 'One more template package, inside a pnpm workspace',
};

export interface StarterOptions {
  /** The folder to create. Its name becomes the package or workspace name. */
  dir: string;
  /** A starter's folder in the repository: project, workspace, module, or a path. */
  template: string;
  /** `org/repo`, a git URL, or a local folder. Default: {@link STARTER_REPO}. */
  repo?: string;
  branch?: string;
  /** Answers to the starter's questions, by name (fullName, username, …). */
  answers?: Record<string, unknown>;
  /** Never prompt: every question needs an answer or a default. */
  noTty?: boolean;
  /** Skip copying the starter's agent skills into `.agents/skills/`. */
  noSkills?: boolean;
}

export interface StarterResult {
  dir: string;
  /** The starter's own "what to do next" text, when it has one. */
  motd: string | null;
  /** Agent skills copied into `.agents/skills/`, and any that could not be fetched. */
  skills: { installed: string[]; failed: { source: string; skill: string }[] };
}

/** The nearest folder at or above `from` that holds a pnpm workspace. */
export function findPnpmWorkspace(from: string): string | null {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

/**
 * Start a folder from a starter in a template repository: clone it (cached
 * under ~/.latex-kit), ask the starter's questions, and fill in its
 * placeholders. The same repositories work with `pgpm init --repo`.
 */
export async function scaffoldStarter(options: StarterOptions): Promise<StarterResult> {
  const dir = resolve(options.dir);
  if (existsSync(dir) && readdirSync(dir).length > 0) throw new Error(`${dir} is not empty`);
  const name = basename(dir);
  const repo = options.repo ?? STARTER_REPO;
  const local = repo.startsWith('.') || repo.startsWith('~') || isAbsolute(repo);
  const template = local ? resolve(repo.startsWith('~') ? join(homedir(), repo.slice(1)) : repo) : repo;

  // starters may default a question to the new folder's name
  registerDefaultResolver('workspace.dirname', () => name);

  const scaffolder = new TemplateScaffolder({ toolName: 'latex-kit', defaultRepo: STARTER_REPO, ttlMs: 24 * 60 * 60 * 1000 });
  await scaffolder.scaffold({
    template,
    branch: options.branch,
    fromPath: options.template,
    outputDir: dir,
    // the folder's name answers the questions that ask for one
    answers: { moduleName: name, name, repoName: name, ...options.answers },
    noTty: options.noTty,
  });

  // a starter may name agent skills that belong with what it makes
  const skills: StarterResult['skills'] = { installed: [], failed: [] };
  if (!options.noSkills && !process.env.LATEX_KIT_SKIP_SKILL_INSTALL) {
    const wanted = starterSkills(join(dir, '.boilerplate.json')) ?? (local ? starterSkills(join(template, options.template, '.boilerplate.json')) : null) ?? [];
    if (wanted.length) {
      // inside a workspace, skills belong at its root, where agents look
      const result = new SkillInstaller({ toolName: 'latex-kit' }).install(wanted, findPnpmWorkspace(dirname(dir)) ?? dir);
      skills.installed.push(...result.installed);
      skills.failed.push(...result.failed.map((f) => ({ source: f.source, skill: f.skill })));
    }
  }

  // the starter's own files, not the new folder's
  rmSync(join(dir, '.boilerplate.json'), { force: true });
  const motdFile = join(dir, '.motd');
  const motd = existsSync(motdFile) ? readFileSync(motdFile, 'utf8') : null;
  rmSync(motdFile, { force: true });
  return { dir, motd, skills };
}

/** The `skills` a starter's `.boilerplate.json` asks for, or null when the file is not there. */
function starterSkills(file: string): BoilerplateSkill[] | null {
  if (!existsSync(file)) return null;
  try {
    const skills = (JSON.parse(readFileSync(file, 'utf8')) as { skills?: BoilerplateSkill[] }).skills;
    return Array.isArray(skills) ? skills : [];
  } catch {
    return [];
  }
}
