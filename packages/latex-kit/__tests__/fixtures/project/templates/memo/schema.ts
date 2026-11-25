import { Person, z } from '@latex-kit/schema';

export const meta = { docIdPrefix: 'MEMO' };

export default z.object({
  to: Person,
  subject: z.string(),
  points: z.array(z.string()).default([]),
});
