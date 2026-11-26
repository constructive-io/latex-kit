/** A box on a page, in PDF points from the bottom-left corner. */
export interface Field {
  type: string;
  who: string;
  label?: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the server tells a signer about their envelope. */
export interface SignInfo {
  title: string;
  terms: { version: string; text: string[] };
  expiresAt: string;
  signer: { who: string; name: string; email: string; signedAt: string | null };
  /** `index` is the field's place in the envelope; typed values are sent back under it. */
  fields: (Field & { index: number })[];
  others: { who: string; name: string; signed: boolean }[];
  completed: boolean;
}

export interface PlaceInfo {
  title: string;
  types: string[];
  fields: Field[];
}
