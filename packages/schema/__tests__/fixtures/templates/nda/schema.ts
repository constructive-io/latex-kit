import { ISODate, Party, z } from '../../../../src';

export const meta = { docIdPrefix: 'NDA' };

export default z.object({
  effectiveDate: ISODate,
  discloser: Party,
  recipient: Party,
  termMonths: z.number().int().positive(),
  mutual: z.boolean().default(true),
});
