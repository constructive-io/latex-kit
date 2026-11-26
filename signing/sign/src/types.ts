/**
 * A spot in a PDF for someone to fill in. Lengths are PDF points (1/72 inch);
 * `x` and `y` are the box's bottom-left corner, from the bottom-left corner of
 * the page. This is the shape `latex-kit build` writes to `<document>.form.json`.
 */
export interface FormField {
  type: FieldType | string;
  /** The party that fills it in. */
  who: string;
  /** For typed text: what to type here. */
  label?: string;
  /** From 1. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FieldType = 'signature' | 'date' | 'initials' | 'text';
export const FIELD_TYPES: FieldType[] = ['signature', 'date', 'initials', 'text'];

/** Where the signer was, as their browser reported it, or why there is no position. */
export type SignerLocation =
  | { latitude: number; longitude: number; accuracyMeters: number | null; source: 'reported by the browser' }
  | { declined: string };

export interface Consent {
  agreed: true;
  termsVersion: string;
  termsSha256: string;
  text: string[];
}

export interface Signer {
  who: string;
  name: string;
  email: string;
  /** Only hashes of the link and code are kept. */
  tokenHash: string;
  codeHash: string;
  failedCodes: number;
  signedAt: string | null;
  ip?: string;
  userAgent?: string;
  consent?: Consent;
  location?: SignerLocation;
  /** What they typed into text and initials boxes, by label. */
  values?: Record<string, string>;
  accessCodeUsed?: boolean;
  sha256Before?: string;
  sha256After?: string;
}

export interface EnvelopeEvent {
  at: string;
  what: string;
  who?: string;
  ip?: string;
}

/** One document sent for signing. */
export interface Envelope {
  id: string;
  title: string;
  createdAt: string;
  expiresAt: string;
  sha256Original: string;
  sha256Final?: string;
  /** Signers sign in the order listed; each waits for the one before. */
  ordered: boolean;
  fields: FormField[];
  signers: Signer[];
  events: EnvelopeEvent[];
  completedAt: string | null;
  declinedAt: string | null;
  declinedBy?: { who: string; reason: string };
}

/** A signer's link token and access code. They exist in clear only when issued. */
export interface Secret {
  who: string;
  token: string;
  code: string;
}
