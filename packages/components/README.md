# @latex-kit/components

<p align="center" width="100%">
  <img height="250" src="https://raw.githubusercontent.com/constructive-io/constructive/refs/heads/main/assets/outline-logo.svg" />
</p>

<p align="center" width="100%">
  <a href="https://github.com/constructive-io/latex-kit/actions/workflows/ci.yml">
    <img height="20" src="https://github.com/constructive-io/latex-kit/actions/workflows/ci.yml/badge.svg" />
  </a>
  <a href="https://github.com/constructive-io/latex-kit/blob/main/LICENSE">
    <img height="20" src="https://img.shields.io/badge/license-MIT-blue.svg"/>
  </a>
  <a href="https://www.npmjs.com/package/@latex-kit/components">
    <img height="20" src="https://img.shields.io/npm/v/@latex-kit/components.svg"/>
  </a>
</p>

<p align="center">TypeScript components for latex-kit templates: tables, signature blocks, exhibits, bilingual names.</p>


A component is a TypeScript function from a value to LaTeX. A template calls
it with `\component{name}{path}`; the value at `path` (or the whole record,
when `path` is empty) is passed in. Long prose stays in `.tex`; components
are for the parts that are easier to compute: tables, repeated signature
blocks, exhibits.

## Built in

| Component | Value | Prints |
|---|---|---|
| `signatures` | a list of parties (or one) | signature blocks, two side by side |
| `exhibits` | a list of `{ title, body }` or strings | each on a new page, "Exhibit A", "Exhibit B", … |
| `bilingual` | `{ en: '…', ja: '…' }` | the record's language first: `株式会社サンプル (Sample KK)` |
| `address` | an `Address` | line1, line2, "City, Region Postal", country on separate lines |

```latex
\component{signatures}{parties}
\component{exhibits}{exhibits}
\component{bilingual}{company.name}
```

## Your own

`components/<name>.ts` in a latex-kit project:

```ts
import { defineComponent, money, table } from 'latex-kit';

export default defineComponent((data: any, ctx) =>
  table(
    data.items,
    [
      { header: 'Description', value: 'description' },
      { header: 'Qty', value: 'quantity', format: 'number', align: 'r' },
      { header: 'Amount', value: 'amount', format: 'money:USD', align: 'r' },
    ],
    ctx,
    { footer: [['Total', '', money(ctx, data.total, 'USD')]] }
  )
);
```

```latex
\component{line-items}{}
```

Return `tex`-tagged LaTeX (values are escaped, the literal parts are not) or
a plain string (escaped). `ctx` has the variant, locale, document ID and
whole record, plus:

| | |
|---|---|
| `ctx.format(value, 'money:USD')` | the template filters, as plain text |
| `ctx.signature(party)` | the block `\signature` prints |
| `ctx.missing('path')` | a red marker in drafts; an error in final builds |

Helpers: `table`, `exhibit`, `signatures`, `bilingual`, `address`, `money`,
`date`, `number`, `percent`, `get`, and `tex` / `raw` / `escapeLatex` from
`@latex-kit/escape`. A blank build calls components with no value; the
helpers print labelled blanks.

## Clauses in TypeScript

`clauses/<id>.ts` next to the `.tex` clauses:

```ts
import { defineClause } from 'latex-kit';

export default defineClause({
  title: 'Term',
  version: 2,
  body: 'This Agreement lasts \\field{termMonths|words} (\\field{termMonths}) months.',
});
```

`body` is template text, checked like any clause. `render: (data, ctx) => tex\`…\``
builds the clause in code instead.

## License

MIT
