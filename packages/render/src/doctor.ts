import { execFile } from 'child_process';

import { DEFAULT_IMAGE } from './command';

export interface Check {
  name: string;
  status: 'ok' | 'warn' | 'fail' | 'info';
  detail: string;
  hint?: string;
}

function exec(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((done) => {
    execFile(cmd, args, { timeout: 15000 }, (err, stdout) => done(err ? null : stdout.trim()));
  });
}

const DOCKER_ARCH: Record<string, string> = { x86_64: 'amd64', aarch64: 'arm64' };

/** Check what a machine needs to render. Never throws. */
export async function doctor(image: string = DEFAULT_IMAGE): Promise<Check[]> {
  const checks: Check[] = [];

  const major = Number(process.versions.node.split('.')[0]);
  checks.push({
    name: 'node',
    status: major >= 22 ? 'ok' : 'warn',
    detail: `v${process.versions.node}`,
    hint: major >= 22 ? undefined : 'Node 22 or newer is supported',
  });

  const serverArch = await exec('docker', ['version', '--format', '{{.Server.Arch}}']);
  if (serverArch === null) {
    const client = await exec('docker', ['--version']);
    checks.push({
      name: 'docker',
      status: 'fail',
      detail: client ? 'installed, but the daemon is not running' : 'not installed',
      hint: client ? 'start Docker Desktop (or the docker service)' : 'install Docker, or use --local with TeX Live',
    });
  } else {
    const arch = DOCKER_ARCH[serverArch] ?? serverArch;
    checks.push({ name: 'docker', status: 'ok', detail: `daemon running (${arch})` });

    const imageArch = await exec('docker', ['image', 'inspect', image, '--format', '{{.Architecture}}']);
    if (imageArch === null) {
      checks.push({
        name: 'image',
        status: 'info',
        detail: `${image} not pulled yet`,
        hint: 'the first render pulls it',
      });
    } else {
      const emulated = imageArch !== arch;
      checks.push({
        name: 'image',
        status: emulated ? 'warn' : 'ok',
        detail: `${image} (${imageArch})`,
        hint: emulated
          ? `runs under emulation on this ${arch} machine: slower, but output is identical`
          : undefined,
      });
    }
  }

  const latexmk = await exec('latexmk', ['-v']);
  checks.push({
    name: 'local latexmk',
    status: 'info',
    detail: latexmk ? latexmk.split('\n').find((l) => /Version/i.test(l))?.trim() ?? 'found' : 'not found',
    hint: latexmk ? 'available for --local builds (not pinned, may not be reproducible)' : undefined,
  });

  return checks;
}

