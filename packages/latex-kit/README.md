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

<p align="center">Build typed, reproducible LaTeX documents from the command line.</p>

latex-kit comes from the people who made [LaTeX2JS](https://github.com/Mathapedia/LaTeX2JS) and [Mathapedia](https://github.com/Mathapedia), which brought LaTeX, TikZ-style diagrams, and PSTricks to the browser. This is the other half: a command-line toolkit for parsing, templating, and programmatically generating LaTeX documents.

## Installation

```bash
npm install -g latex-kit
```

## Agent skills

```bash
npx skills add constructive-io/latex-kit
```

Eight skills teach a coding agent the template language, the commands, signing
and the starter kits. They are listed in the
[repository README](https://github.com/constructive-io/latex-kit#agent-skills).

## Usage

A project (templates, data, records) is described in the
[repository README](https://github.com/constructive-io/latex-kit#a-project):

```bash
latex-kit init my-documents && cd my-documents
latex-kit check                                   # no TeX needed
latex-kit build                                   # drafts
latex-kit build --final --only 'nda-*'            # final PDFs for some documents
latex-kit build --variant signed --signatures ~/signatures
latex-kit build --locale ja-JP                    # another language, next to the usual PDFs
latex-kit lock                                    # pin the images in latex-kit.lock
```

`latex-kit help build` lists every flag. Project files import helpers from
this package: `defineConfig`, `defineDocument`, `defineComponent`,
`defineClause`, `table`, `tex`, `ref`, `z` and the shared types.

Plain `.tex` files:

```bash
latex-kit doctor                                  # is Docker ready?
latex-kit render examples/letter/letter.tex       # → out/letter.pdf
latex-kit render paper.tex --engine xelatex -o build
latex-kit render letter.tex --verify              # build twice, fail if the bytes differ
latex-kit render letter.tex --json                # machine-readable summary
```

### `render <file.tex>`

| Flag | Default | |
|---|---|---|
| `-o, --out <dir>` | `out` | Output directory, relative to `--root` |
| `-e, --engine <name>` | `auto` | `auto` (from the packages the file loads), `lualatex`, `xelatex`, `pdflatex`, `pdfps` (PSTricks) |
| `--root <dir>` | current directory | Directory TeX can see |
| `--image <ref>` | pinned `constructiveio/latex-kit` on Docker Hub (TeX Live 2026) | Docker image |
| `--platform <os/arch>` | native | Docker `--platform` |
| `--local` | | Use `latexmk` on `PATH` instead of Docker (not pinned) |
| `--source-date-epoch <s>` | `SOURCE_DATE_EPOCH`, else the last git commit | Build timestamp |
| `--verify` | | Build twice; exit 1 if the PDFs differ |
| `--json` | | Print a JSON summary |

### `doctor`

Checks Node, the Docker daemon, whether the image is pulled and runs
natively on this machine, and whether a local `latexmk` exists. Exits 1 if
rendering cannot work.

## Credits

**🛠 Built by the [Constructive](https://constructive.io) team — creators of modular Postgres tooling for secure, composable backends. If you like our work, contribute on [GitHub](https://github.com/constructive-io).**

## Disclaimer

AS DESCRIBED IN THE LICENSES, THE SOFTWARE IS PROVIDED "AS IS", AT YOUR OWN RISK, AND WITHOUT WARRANTIES OF ANY KIND.

No developer or entity involved in creating this software will be liable for any claims or damages whatsoever associated with your use, inability to use, or your interaction with other users of the code, including any direct, indirect, incidental, special, exemplary, punitive or consequential damages, or loss of profits, cryptocurrencies, tokens, or anything else of value.
