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

<p align="center">Typed, reproducible LaTeX documents: safe templates, pinned builds, the same PDF bytes every time.</p>

`latex-kit` turns LaTeX into a build you can trust. Values are escaped so a
stray `&` or `%` can't break or change a document, builds run in a Docker
image pinned by digest, and the build date comes from git, so the same
commit always produces the same PDF.

## Quick start

```bash
npm install -g latex-kit
latex-kit doctor
latex-kit render letter.tex --verify   # → out/letter.pdf, built twice, bytes compared
```

In GitHub Actions:

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
| [`latex-kit`](packages/latex-kit) | The CLI: `render`, `doctor` |
| [`@latex-kit/escape`](packages/escape) | Escape plain text for LaTeX; `tex` tagged template; no dependencies |
| [`@latex-kit/render`](packages/render) | latexmk in a pinned image, reproducible dates, log → diagnostics |
| [`action/`](action) | Reusable GitHub Action |
| [`examples/`](examples) | Fictional documents CI renders and checks for byte-identical output |

## Roadmap

- **Template language.** Templates stay valid `.tex` files, with fill-in
  macros (`\field{party.name|date:long}`, `\when`, `\each`, `\partial`,
  `\clauseref`, `\docid`) parsed with
  [unified-latex](https://github.com/siefkenj/unified-latex). Every value is
  escaped, and `latex-kit check` reports unknown or missing fields with
  `file:line:col` before anything renders.
- **Typed data.** JSON, YAML or TypeScript records validated with zod, with
  generated types and references between records. Document IDs are minted
  once and stored on the record.
- **Variants.** `draft`, `blank`, `final` and `signed` from one template.
- **Clauses, redlines, import.** A versioned clause library, `latex-kit diff`
  (latexdiff) and `latex-kit import` (pandoc).
- **Multi-arch image.** `ghcr.io/constructive-io/latex-kit`, native on arm64
  and amd64, based on official TeX Live.
- **Boilerplates.** `latex-kit init` for workspaces, document types and papers.

## Development

```bash
git clone https://github.com/constructive-io/latex-kit.git
cd latex-kit
pnpm install
pnpm build
pnpm test
node packages/latex-kit/dist/index.js render examples/letter/letter.tex --verify
```

Dependencies follow the workspace supply-chain policy in
[`pnpm-policy.yaml`](pnpm-policy.yaml): third-party releases wait two days
before they can be installed. After editing it, run `pnpm run policy`.

## Credits

**🛠 Built by the [Constructive](https://constructive.io) team — creators of modular Postgres tooling for secure, composable backends. If you like our work, contribute on [GitHub](https://github.com/constructive-io).**

## Disclaimer

AS DESCRIBED IN THE LICENSES, THE SOFTWARE IS PROVIDED "AS IS", AT YOUR OWN RISK, AND WITHOUT WARRANTIES OF ANY KIND.

No developer or entity involved in creating this software will be liable for any claims or damages whatsoever associated with your use, inability to use, or your interaction with other users of the code, including any direct, indirect, incidental, special, exemplary, punitive or consequential damages, or loss of profits, cryptocurrencies, tokens, or anything else of value.
