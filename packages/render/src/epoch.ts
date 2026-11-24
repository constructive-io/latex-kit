import { execFileSync } from 'child_process';
import { basename, dirname } from 'path';

export type EpochSource = 'option' | 'env' | 'git' | 'clock';

export interface ResolvedEpoch {
  epoch: number;
  source: EpochSource;
  /** False when the date came from the clock, so two builds will differ. */
  reproducible: boolean;
}

function parseEpoch(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

/**
 * The timestamp a build is stamped with. In order: an explicit option, the
 * SOURCE_DATE_EPOCH environment variable, the last git commit that touched
 * the file, and finally the current time (not reproducible).
 */
export function resolveSourceDateEpoch(
  file: string,
  options: { explicit?: number; env?: NodeJS.ProcessEnv; git?: (file: string) => string | null } = {}
): ResolvedEpoch {
  if (options.explicit !== undefined) {
    if (!Number.isInteger(options.explicit) || options.explicit < 0) {
      throw new Error(`invalid source date epoch: ${options.explicit}`);
    }
    return { epoch: options.explicit, source: 'option', reproducible: true };
  }
  const env = options.env ?? process.env;
  const fromEnv = parseEpoch(env.SOURCE_DATE_EPOCH);
  if (fromEnv !== null) return { epoch: fromEnv, source: 'env', reproducible: true };

  const fromGit = parseEpoch((options.git ?? gitCommitTime)(file) ?? undefined);
  if (fromGit !== null) return { epoch: fromGit, source: 'git', reproducible: true };

  return { epoch: Math.floor(Date.now() / 1000), source: 'clock', reproducible: false };
}

export function gitCommitTime(file: string): string | null {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', basename(file)], {
      cwd: dirname(file),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}
