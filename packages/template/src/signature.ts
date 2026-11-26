import { escapeLatex } from '@latex-kit/escape';

import { FILTERS } from './filters';

/** The signer a signature image is looked up for. */
export interface SignerInfo {
  name: string;
  /** The signer's `signature` field: an image file name in the signatures folder. */
  image?: string;
}

export interface SignatureOptions {
  variant: 'draft' | 'blank' | 'final' | 'signed';
  locale: string;
  /** The data path of the party, for blank labels and messages. */
  path: string;
  /** Text for a missing value: a red marker in drafts, an error otherwise. */
  missing: (what: string) => string;
  /** How this party signed, from the record's `signed` map. */
  signing?: { date?: string; signature?: string };
  /**
   * Signed builds only: a signature image for this signer, as a path TeX can
   * read, or null to print `/s/ Name`.
   */
  signatureImage?: (signer: SignerInfo) => string | null;
}

export class SignatureError extends Error {
  name = 'SignatureError';
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);

/** Image paths must be plain relative names, so they can never inject LaTeX. */
const SAFE_IMAGE_PATH = /^[A-Za-z0-9_./-]+$/;

/**
 * A signature block for a party: `\lksignature{org}{name}{title}{signature}{date}`.
 *
 * A party with a `signer` (or `kind: organization`) is an organization: its
 * name in bold, then the signer's name and title. Anything else signs for
 * itself. The signed variant prints the signer's local signature image when
 * there is one, else `/s/ Name`, and the date from the record's `signed` map.
 */
export function signatureBlock(value: unknown, o: SignatureOptions): string {
  const p = o.path;
  if (o.variant === 'blank') {
    return `\\lksignature{\\lkblank{${p}.name}}{\\lkblank{${p}.signer.name}}{\\lkblank{${p}.signer.title}}{}{}`;
  }
  if (value === undefined || value === null) return o.missing(p);
  if (!isObject(value)) throw new SignatureError(`${p} is not a party (expected an object with a name)`);

  const signerObj = isObject(value.signer) ? value.signer : null;
  const isOrg = !!signerObj || value.kind === 'organization';
  const signer = signerObj ?? (isOrg ? null : value);
  const orgName = isOrg ? text(value.name) : undefined;

  const org = isOrg ? (orgName ? escapeLatex(orgName) : o.missing(`${p}.name`)) : '';
  const signerPath = signerObj ? `${p}.signer` : p;
  const name = signer ? text(signer.name) : undefined;
  const nameTex = name ? escapeLatex(name) : o.missing(isOrg && !signer ? `${p}.signer` : `${signerPath}.name`);
  const title = signer ? text(signer.title) : undefined;
  const titleTex = title ? escapeLatex(title) : '';

  let sign = '';
  let date = '';
  if (o.variant === 'signed' && name) {
    const file = o.signatureImage?.({ name, image: text(o.signing?.signature) ?? text(signer?.signature) }) ?? null;
    if (file) {
      if (!SAFE_IMAGE_PATH.test(file)) throw new SignatureError(`signature image path "${file}" may only use letters, digits, . _ - and /`);
      sign = `\\lksignatureimage{${file}}`;
    } else {
      sign = `/s/~${escapeLatex(name)}`;
    }
    const signed = text(o.signing?.date);
    if (signed) date = escapeLatex(String(FILTERS.date.apply(signed, 'long', { locale: o.locale }, {})));
  }
  return `\\lksignature{${org}}{${nameTex}}{${titleTex}}{${sign}}{${date}}`;
}
