import { z } from 'zod';

/** A calendar date, `2026-11-25`. Use with the `date` filter. */
export const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a date like 2026-11-25');

/** An amount and an ISO 4217 currency code. Use with the `money` filter. */
export const Money = z.object({
  amount: z.number(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'expected a currency code like USD'),
});

export const Address = z.object({
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  region: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

/** Someone who signs: a name and, usually, a title. */
export const Signer = z.object({
  name: z.string(),
  title: z.string().optional(),
  email: z.string().optional(),
});

export const Person = z.object({
  name: z.string(),
  title: z.string().optional(),
  email: z.string().optional(),
  address: Address.optional(),
});

export const Organization = z.object({
  name: z.string(),
  /** e.g. "Delaware corporation", "Kabushiki Kaisha" */
  entityType: z.string().optional(),
  jurisdiction: z.string().optional(),
  address: Address.optional(),
  signer: Signer.optional(),
});

/** One side of an agreement: a person or an organization. */
export const Party = z.object({
  kind: z.enum(['person', 'organization']).optional(),
  name: z.string(),
  entityType: z.string().optional(),
  jurisdiction: z.string().optional(),
  title: z.string().optional(),
  email: z.string().optional(),
  address: Address.optional(),
  signer: Signer.optional(),
});

/** Text in several languages, keyed by language tag: `{ en: "…", ja: "…" }`. */
export const Localized = z.record(z.string(), z.string());

export type ISODate = z.infer<typeof ISODate>;
export type Money = z.infer<typeof Money>;
export type Address = z.infer<typeof Address>;
export type Signer = z.infer<typeof Signer>;
export type Person = z.infer<typeof Person>;
export type Organization = z.infer<typeof Organization>;
export type Party = z.infer<typeof Party>;
export type Localized = z.infer<typeof Localized>;
