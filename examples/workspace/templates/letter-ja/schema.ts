import { ISODate, Localized, Organization, z } from 'latex-kit';

export const meta = { docIdPrefix: 'LTR', locale: 'ja-JP', title: 'Bilingual letter (Japanese / English)' };

export default z.object({
  from: Organization,
  to: Organization,
  date: ISODate,
  subject: Localized,
  body: Localized,
  amount: z.object({ amount: z.number(), currency: z.string() }).optional(),
});
