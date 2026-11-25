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
latex-kit doctor                 # is Docker ready?
latex-kit check                  # templates, schemas, records: no TeX needed
latex-kit build                  # drafts: watermark, missing values in red
latex-kit build --final          # final PDFs; mints document IDs once
latex-kit build --variant blank  # every template as an empty form
```

## A project

```
latex-kit.config.ts          optional; these are the defaults
templates/nda/template.tex   a real .tex file with \field{…}, \when, \each
templates/nda/schema.ts      zod schema for the data (+ meta: ID prefix, locale)
snippets/letterhead.tex      shared pieces, included with \snippet{letterhead}
clauses/nda/purpose.tex      versioned clauses: \clause{nda/purpose}, \clauseref{…}
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

| Command | |
|---|---|
| `latex-kit build [documents…]` | `--final`, `--variant draft\|blank\|signed`, `--template`, `--verify`, `--strict` |
| `latex-kit check` | Unknown fields with `file:line:col`, invalid data, broken references, reused IDs |
| `latex-kit fields <template>` | Every field a template reads, with its filters |
| `latex-kit typegen` | JSON Schema (editor autocomplete for records) and `.d.ts` per template |
| `latex-kit sty [dir]` | `latex-kit.sty`, so editors compile templates as blank previews |
| `latex-kit import <file>` | Word/Markdown/HTML (pandoc) or an older `.tex` → a template; `{{x}}` and `@GROUP@FIELD@` become `\field{…}`; writes a starter `schema.ts` |
| `latex-kit diff <document> --against <ref>` | Redline PDF against an earlier commit (also `diff <old.tex> <new.tex>`) |
| `latex-kit render <file.tex>` | Any plain `.tex` → PDF, reproducibly (papers, letters) |
| `latex-kit doctor` | Docker, image and TeX checks |

In GitHub Actions, for plain `.tex` (papers):

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: constructive-io/latex-kit/action@main
  with:
    file: paper/main.tex
```

## Packages

| Package | |
|---|---|
| [`latex-kit`](packages/latex-kit) | The CLI, and `defineConfig` / `z` / shared types for project files |
| [`@latex-kit/template`](packages/template) | The template language: compile, check, fill, variants, `latex-kit.sty` |
| [`@latex-kit/schema`](packages/schema) | zod schemas, shared types, `$ref` records, document IDs, typegen |
| [`@latex-kit/render`](packages/render) | latexmk in a pinned image, reproducible dates, log → diagnostics |
| [`@latex-kit/escape`](packages/escape) | Escape plain text for LaTeX; `tex` tagged template; no dependencies |
| [`action/`](action) | Reusable GitHub Action |
| [`examples/`](examples) | Fictional projects CI checks and builds byte-for-byte |

## Roadmap

- **Boilerplates.** `latex-kit init` for projects, document types and papers.
- **Multi-arch image.** `ghcr.io/constructive-io/latex-kit`, native on arm64
  and amd64, newer TeX Live, so XeLaTeX builds are reproducible too.

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
