# @latex-kit/template

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
  <a href="https://www.npmjs.com/package/@latex-kit/template">
    <img height="20" src="https://img.shields.io/npm/v/@latex-kit/template.svg"/>
  </a>
</p>

<p align="center">The latex-kit template language: fill-in macros inside real <code>.tex</code> files, checked and escaped.</p>

A latex-kit template is an ordinary LaTeX file with a few extra macros. It
opens in any LaTeX editor and, with `latex-kit.sty`, compiles on its own as
a blank form. latex-kit replaces only those macros: every other byte of the
file is kept exactly as written, and every value is escaped.

```latex
\documentclass{article}
\usepackage{latex-kit}
\begin{document}
This Agreement is made on \field{effectiveDate|date:long} between
\field{discloser.name} and \field{recipient.name}.

\when{mutual}{Each party may disclose}\otherwise{The Discloser may disclose}
Confidential Information for \field{termMonths|words} (\field{termMonths}) months.

Fees: \each{fees}{fee}{\field{fee.label} \field{fee.amount|money:USD}\sep{; }}.

Document ID: \docid
\end{document}
```

## The language

| Macro | Does |
|---|---|
| `\field{path}` | Inserts a value, escaped. Paths use dots: `party.address.city`, `items.0.name` |
| `\field{path\|filter\|filter:arg}` | Runs filters left to right (see below) |
| `\raw{path}` | Inserts a value **unescaped**. `latex-kit check` warns on every use |
| `\when{condition}{…}\otherwise{…}` | Conditional. `\otherwise` is optional and may follow on the next line |
| `\each{list}{item}{…}` | Loop. Inside: `item`, `$index` (1-based), `$first`, `$last` |
| `\sep{…}` | Inside `\each`: printed between items, not after the last |
| `\snippet{name}` | Includes `name.tex` (next to the template, then `snippets/`) with the same data |
| `\docid` | The document's ID, minted once and stored on the record |
| `\clause{id}` | Places a numbered clause from the library (`clauses/<id>.tex`), filled with the same data |
| `\clauseref{id}` | Prints that clause's number. A reference to a clause the document doesn't contain fails a final build |
| `\signature{party}` | A signature block for a party or signer (see below) |
| `\component{name}{path}` | Calls a TypeScript component with the value at `path` (empty: the whole record) |

Special values: `$variant`, `$locale`, `$docid`, `$template`.

`\snippet` and `\clauseref` are named so they never collide with LaTeX's
`\partial` and `\ref`.

### Clauses

A clause is a template fragment with a short header:

```latex
% title: Confidentiality
% version: 3
The Recipient will keep it confidential for \field{termMonths|words} months,
subject to Section~\clauseref{nda/exclusions}.
```

Each placed clause becomes `\lkclause{title}{label}` (a numbered section by
default; redefine `\lkclause` to change the style). Every build's manifest
lists the clause IDs and versions it used. A clause can also be TypeScript
(`defineClause` in [`@latex-kit/components`](../components)): a template
text `body`, or a `render(data, ctx)` function.

### Signatures

`\signature{discloser}` prints `\lksignature{org}{name}{title}{signature}{date}`.
A party with a `signer` (or `kind: "organization"`) is an organization: its
name in bold, then the signer. Anything else with a `name` signs for itself.

| Variant | Signature line | Date line |
|---|---|---|
| `draft`, `final` | empty | empty |
| `blank` | empty; organization, name and title are labelled blanks | empty |
| `signed` | the signer's image (`signatureImage` option), else `/s/ Name` | the date from `signed: { discloser: { date } }` |

Two blocks fit side by side: `\signature{a}\hfill\signature{b}`. Change the
look with `\lksignaturewidth`, `\lksignatureheight`, or by redefining
`\lksignature`.

### Components

`\component{name}{path}` calls a function from the `components` option with
the value at `path` and a context (variant, locale, `format()`,
`signature()`, `missing()`). It returns `tex`-tagged LaTeX, inserted as is,
or a string, which is escaped. Errors are reported at the macro. The
built-in components and helpers are in [`@latex-kit/components`](../components).

### Conditions

A small, safe grammar, never `eval`:
`==` `!=` `<` `<=` `>` `>=`, `&&` `||` `!`, parentheses, paths, numbers,
`"strings"`, `true` `false` `null`. A missing path is false; an empty list
is false.

```latex
\when{fee > 0 && !waived}{…}
\when{party.kind == "organization" || $variant == "blank"}{…}
```

### Filters

| Filter | Example | Output (en-US) |
|---|---|---|
| `date`, `date:long\|short\|medium\|full\|iso` | `2026-11-25` | November 25, 2026 |
| `money`, `money:USD` | `5400` or `{ amount, currency }` | $5,400.00 |
| `number`, `number:2` | `1234.5` | 1,234.50 |
| `percent`, `percent:1` | `0.15` | 15% |
| `words` | `24` | twenty-four |
| `upper`, `lower`, `title`, `trim` | | |
| `join`, `join:" and "` | `["a", "b"]` | a, b |
| `default:"text"` | missing | text |
| `lines`, `paragraphs` | multi-line text | keeps line / paragraph breaks |

Dates, numbers and money follow the record's locale (`ja-JP`, `de-DE`, …).

### Variants

| Variant | Fields | Marks |
|---|---|---|
| `draft` | filled; a missing value prints a red `missing: path` box | DRAFT watermark, date and git commit (`watermark: false` leaves them out) |
| `blank` | every field is a labelled line | none |
| `final` | filled; a missing value is an error | none |
| `signed` | like `final`; `\signature` blocks are signed | none |

## Usage

```ts
import { analyzeTemplate, compileTemplate, evaluateTemplate, wrapDocument } from '@latex-kit/template';

const t = compileTemplate(source, 'templates/nda/template.tex');
const { tex, diagnostics } = evaluateTemplate(t, { data, variant: 'final', locale: 'en-US', docId });
const ready = wrapDocument(tex, { variant: 'final' });

// static checks against a JSON Schema of the data
const { fields, diagnostics: problems } = analyzeTemplate(t, { schema });
```

Diagnostics carry `file`, `line` and `column`, formatted as
`templates/nda/template.tex:12:3: error: unknown field party.nmae`.
