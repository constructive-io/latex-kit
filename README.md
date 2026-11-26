# latex-kit

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
  <a href="https://www.npmjs.com/package/latex-kit">
    <img height="20" src="https://img.shields.io/npm/v/latex-kit.svg"/>
  </a>
</p>

<p align="center">Typed, reproducible LaTeX documents: real <code>.tex</code> templates, checked data, pinned builds, the same PDF bytes every time.</p>

`latex-kit` turns LaTeX into a build you can trust. Templates are real
`.tex` files with a few fill-in macros. Data is typed and checked before TeX
runs. Every value is escaped, so a stray `&` or `%` can't break or change a
document. Builds run in a Docker image pinned by digest, and the build date
comes from git, so the same commit always produces the same PDF bytes.

## Quick start

```bash
npm install -g latex-kit
latex-kit init my-documents      # or: latex-kit init my-paper --paper
cd my-documents
latex-kit doctor                 # is Docker ready?
latex-kit check                  # templates, schemas, records: no TeX needed
latex-kit build                  # drafts: watermark, missing values in red
latex-kit build --final          # final PDFs; mints document IDs once
latex-kit build --variant blank  # every template as an empty form
```

## A project

```
latex-kit.config.ts          optional; these are the defaults
latex-kit.lock               the exact TeX and pandoc images (commit it)
templates/nda/template.tex   a real .tex file with \field{…}, \when, \each
templates/nda/schema.ts      zod schema for the data (+ meta: ID prefix, locale)
snippets/letterhead.tex      shared pieces, included with \snippet{letterhead}
clauses/nda/purpose.tex      versioned clauses: \clause{nda/purpose}, \clauseref{…}
clauses/nda/term.ts          a clause in TypeScript (defineClause)
components/line-items.ts     TypeScript for tables and other computed parts
data/orgs/example.json       shared records, used via { "$ref": "orgs/example" }
documents/nda-acme.yaml      one record per document: template, docId, data
out/nda-acme/                generated .tex, PDF and a manifest of every input hash
```

```latex
This Agreement is made on \field{effectiveDate|date:long} between
\field{discloser.name} and \field{recipient.name}.
\when{mutual}{Each party}\otherwise{The Discloser} may share information for
\field{termMonths|words} (\field{termMonths}) months.
\each{exclusions}{x}{\item \field{x}}

\signature{discloser}\hfill\signature{recipient}
\component{exhibits}{exhibits}
```

```yaml
template: nda
docId: NDA-20261125-3HV8RT2N      # minted by the first final build
data:
  effectiveDate: "2026-11-25"
  discloser: { $ref: orgs/example-widgets }
  recipient: { $ref: orgs/placeholder-labs }
  mutual: false
  termMonths: 24
```

The full language (filters, conditions, variants) is in
[`@latex-kit/template`](packages/template). A complete project with an
invoice, an NDA and a bilingual Japanese/English letter is in
[`examples/workspace`](examples/workspace).

### Signatures

`\signature{party}` prints a signature block: the organization in bold (when
the party has a `signer`), a line, the signer's name and title, and a date
line. Blank builds label every line. `--variant signed` signs it: each
signer's image from a folder outside the repository, else `/s/ Name`, with
the date from the record:

```yaml
signed:
  discloser: { date: "2026-11-25" }
  recipient: { date: "2026-11-26" }
```

```bash
latex-kit build --variant signed --signatures ~/signatures   # avery-example.png, …
```

Images are copied next to the `.tex` for the build and deleted after it. The
manifest lists which signers had one, never the images.

### Forms and signing

`\formfield[hints]{content}` prints its content unchanged in a finished
document. The hints tell blank forms how to print that spot, and tell signing
tools where it is:

```latex
\textbf{\formfield[blank=label,label={Company Name}]{\field{company.name}}}  % a blank shows [Company Name]
\formfield[type=signature,who=buyer,width=6cm]{}\rule{6cm}{0.4pt}            % a place for the buyer to sign
```

| Hint | |
|---|---|
| `blank=line`, `wide`, `none`, `label` (with `label={…}`) | How a blank prints here |
| `type=signature`, `date`, `initials`, `text` and `who=<party>` | A spot for someone to fill in |
| `width=`, `height=`, `raise=` | That spot's box (defaults 7cm, 24pt, 0pt) |

`\signature` blocks mark their own signature and date lines. When a document
marks any spots, the build writes `<document>.form.json` beside the PDF: each
spot's page and position in PDF points.
[`@latex-kit/sign`](signing/sign) takes that file and the PDF and gets it
signed, or draws a placement guide for another signing app.

Blank builds come three ways: `--blanks labelled` (the default: the field's
name, small, on a line), `--blanks lines` (an empty line to write on) and
`--blanks names` (the name in brackets, written to `<name>-names.pdf`). Set a
project default with `blanks:` in the config.

### Components and TypeScript

Long prose stays in `.tex`. For computed parts, a template calls a
TypeScript component: `\component{line-items}{}` runs
`components/line-items.ts` with the record's data (or the value at a path).
Built in: `signatures`, `exhibits`, `bilingual`, `address`. Helpers such as
`table()`, `money()` and `tex` are exported from `latex-kit`; see
[`@latex-kit/components`](packages/components). Clauses can be TypeScript
too (`defineClause`), and records typed with the generated types:

```ts
import { defineDocument, ref } from 'latex-kit';
import type { InvoiceData } from '../templates/invoice/types';

export default defineDocument<InvoiceData>({ template: 'invoice', data: { from: ref('orgs/acme'), … } });
```

### Engines, pins and the cache

The engine is chosen per document unless you set one: a `% !TEX program =`
line wins; PSTricks packages use `pdfps` (latex → dvips → ps2pdf); `xeCJK`
or `ctex` use XeLaTeX; `CJK`/`CJKutf8` use pdfLaTeX; everything else uses
LuaLaTeX, the only engine whose PDFs are byte-reproducible in the image.
Chinese, Japanese or Korean text without a CJK package gets a warning.

`latex-kit.lock` pins the TeX Live and pandoc images by digest, so a newer
latex-kit never changes your PDFs until you run `latex-kit lock`. A build
whose `.tex`, template folder, engine, image and build date all match the
last one reuses its PDF (`--force` rebuilds).

| Command | |
|---|---|
| `latex-kit init [dir] [--paper]` | A working project (letter template, data, a record) or a paper with a CI workflow |
| `latex-kit new template <name>` / `new document <name> --template <t>` | Skeletons; new records get every required field and editor autocomplete |
| `latex-kit build [documents…]` | `--final`, `--variant draft\|blank\|signed`, `--only 'nda-*'`, `--locale ja-JP`, `--template`, `--verify`, `--strict`, `--force`, `--signatures <dir>`, `--blanks labelled\|lines\|names` |
| `latex-kit watch [documents…]` | Rebuild drafts whenever a template, snippet, clause or record changes |
| `latex-kit check` | Unknown fields with `file:line:col`, invalid data, broken references, reused IDs |
| `latex-kit fields <template>` | Every field a template reads, with its filters |
| `latex-kit typegen` | JSON Schema (editor autocomplete for records) and `.d.ts` per template |
| `latex-kit sty [dir]` | `latex-kit.sty`, so editors compile templates as blank previews |
| `latex-kit import <file>` | Word/Markdown/HTML (pandoc) or an older `.tex` → a template; `{{x}}` and `@GROUP@FIELD@` become `\field{…}`; writes a starter `schema.ts` |
| `latex-kit diff <document> --against <ref>` | Redline PDF against an earlier commit (also `diff <old.tex> <new.tex>`) |
| `latex-kit render <file.tex>` | Any plain `.tex` → PDF, reproducibly (papers, letters) |
| `latex-kit lock [--check]` | Pin (or check) the images in `latex-kit.lock` |
| `latex-kit doctor` / `clean` | Docker, image and TeX checks / delete `out/` |

In GitHub Actions, for plain `.tex` (papers):

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: constructive-io/latex-kit/action@v1
  with:
    file: paper/main.tex
    engine: auto    # or lualatex (default), xelatex, pdflatex, pdfps
    verify: 'true'  # build twice, fail unless byte-identical
```

## Packages

| Package | |
|---|---|
| [`latex-kit`](packages/latex-kit) | The CLI, and `defineConfig` / `z` / shared types for project files |
| [`@latex-kit/template`](packages/template) | The template language: compile, check, fill, variants, `latex-kit.sty` |
| [`@latex-kit/components`](packages/components) | Components: `table`, signature blocks, exhibits, bilingual names; `defineComponent`, `defineClause` |
| [`@latex-kit/schema`](packages/schema) | zod schemas, shared types, `$ref` records, document IDs, typegen |
| [`@latex-kit/render`](packages/render) | latexmk in a pinned image, engine detection, reproducible dates, log → diagnostics |
| [`@latex-kit/escape`](packages/escape) | Escape plain text for LaTeX; `tex` tagged template; no dependencies |
| [`@latex-kit/sign`](signing/sign) | Get a PDF signed: `latex-kit-sign`, the signing server, the sealed audit trail, the placement guide |
| [`@latex-kit/sign-web`](signing/web) | The pages it serves: signing a PDF, drawing fields on one |
| [`action/`](action) | Reusable GitHub Action |
| [`examples/`](examples) | Fictional projects CI checks and builds byte-for-byte |

## Roadmap

- **HTML preview** of templates in the browser (a vendored LaTeX2JS slice).
- **Tectonic** as an optional no-Docker backend, and a slim image tag.
- **Postgres records** (pgpm) generated from the same schemas; files stay
  the default.

The default image, [`constructiveio/latex-kit`](https://hub.docker.com/r/constructiveio/latex-kit) on Docker Hub (TeX Live 2026, native
on arm64 and amd64), is built from [`docker/`](docker). XeLaTeX is fully
supported but never byte-identical: its PDF writer gives embedded fonts
random subset names, on any TeX Live.

## Development

```bash
git clone https://github.com/constructive-io/latex-kit.git
cd latex-kit
pnpm install
pnpm build
pnpm test
node packages/latex-kit/dist/cli.js render examples/letter/letter.tex --verify
cd examples/workspace && node ../../packages/latex-kit/dist/cli.js build --final --verify
```

Dependencies follow the workspace supply-chain policy in
[`pnpm-policy.yaml`](pnpm-policy.yaml): third-party releases wait two days
before they can be installed. After editing it, run `pnpm run policy`.

## Credits

**🛠 Built by the [Constructive](https://constructive.io) team — creators of modular Postgres tooling for secure, composable backends. If you like our work, contribute on [GitHub](https://github.com/constructive-io).**

## Disclaimer

AS DESCRIBED IN THE LICENSES, THE SOFTWARE IS PROVIDED "AS IS", AT YOUR OWN RISK, AND WITHOUT WARRANTIES OF ANY KIND.

No developer or entity involved in creating this software will be liable for any claims or damages whatsoever associated with your use, inability to use, or your interaction with other users of the code, including any direct, indirect, incidental, special, exemplary, punitive or consequential damages, or loss of profits, cryptocurrencies, tokens, or anything else of value.
