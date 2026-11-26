/**
 * What a signer agrees to. The exact text and its version are stored with each
 * signature, so changing the wording means changing the version.
 */
export interface Terms {
  version: string;
  text: string[];
}

export const TERMS: Terms = {
  version: '2026-11-26',
  text: [
    'I agree to sign this document electronically, and that my electronic signature is as valid as a handwritten one.',
    'I have read the whole document. I can download a copy now and after signing.',
    'I understand that the time, my IP address, my browser, and my location (if I allow it) are recorded with my signature.',
  ],
};
