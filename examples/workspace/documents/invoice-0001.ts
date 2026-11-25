// A TypeScript record: the totals are computed here, so the template only
// formats them. latex-kit never edits code, so the docId is written by hand.
import { ref } from 'latex-kit';

const items = [
  { description: 'Widgets, standard (box of 100)', quantity: 12, unitPrice: 450 },
  { description: 'Widget calibration & setup', quantity: 1, unitPrice: 300 },
  { description: 'On-site support_hours', quantity: 6, unitPrice: 50 },
].map((i) => ({ ...i, amount: i.quantity * i.unitPrice }));

const subtotal = items.reduce((sum, i) => sum + i.amount, 0);
const taxRate = 0.08;
const tax = Math.round(subtotal * taxRate * 100) / 100;

export default {
  template: 'invoice',
  docId: 'INV-20261125-7QX2M9KD',
  data: {
    from: ref('orgs/example-widgets'),
    to: ref('orgs/placeholder-labs'),
    issued: '2026-11-25',
    due: '2026-12-25',
    items,
    subtotal,
    taxRate,
    tax,
    total: subtotal + tax,
    notes: 'Thank you for your business.\nWire transfers only; card payments add a 3% fee.',
  },
};
