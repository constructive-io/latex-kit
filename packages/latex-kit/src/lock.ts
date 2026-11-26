import { DEFAULT_IMAGE, PANDOC_IMAGE } from '@latex-kit/render';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * latex-kit.lock: the exact images a project builds with. Commit it. A newer
 * latex-kit with a newer default image keeps building this project with the
 * locked one, so PDFs do not change until `latex-kit lock` moves the pins.
 */
export const LOCK_FILE = 'latex-kit.lock';

export interface Lock {
  lockfileVersion: 1;
  /** The TeX Live image, by digest. */
  image: string;
  /** The pandoc image `latex-kit import` uses, by digest. */
  pandocImage: string;
}

export class LockError extends Error {
  name = 'LockError';
}

const PINNED = /@sha256:[0-9a-f]{64}$/;

/** The pins this version of latex-kit would write. */
export function currentPins(): Lock {
  return { lockfileVersion: 1, image: DEFAULT_IMAGE, pandocImage: PANDOC_IMAGE };
}

export function readLock(root: string): Lock | null {
  const file = join(root, LOCK_FILE);
  if (!existsSync(file)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new LockError(`${LOCK_FILE} is not valid JSON: ${(e as Error).message}`);
  }
  const l = raw as Partial<Lock>;
  if (!l || typeof l !== 'object' || l.lockfileVersion !== 1) throw new LockError(`${LOCK_FILE}: unknown lockfileVersion (this latex-kit reads version 1)`);
  for (const k of ['image', 'pandocImage'] as const) {
    if (typeof l[k] !== 'string' || !PINNED.test(l[k]!)) throw new LockError(`${LOCK_FILE}: ${k} must be an image pinned by digest (…@sha256:<64 hex>)`);
  }
  return l as Lock;
}

/** Write the current pins. Returns the previous lock, if any. */
export function writeLock(root: string): { lock: Lock; previous: Lock | null } {
  let previous: Lock | null = null;
  try {
    previous = readLock(root);
  } catch {
    // an unreadable lock is replaced
  }
  const lock = currentPins();
  writeFileSync(join(root, LOCK_FILE), JSON.stringify(lock, null, 2) + '\n');
  return { lock, previous };
}
