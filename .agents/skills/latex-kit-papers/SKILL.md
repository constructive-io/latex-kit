---
name: latex-kit-papers
description: Write and build a paper, whitepaper or any plain LaTeX document with latex-kit render — a pinned TeX Live, byte-identical PDFs, CI and a release on every tag. Use when asked to "start a paper", "write a whitepaper", "build this .tex file", "compile LaTeX without installing TeX", "add a diagram with TikZ", "add a code listing", "add references", "release the PDF on a tag", "build the paper in CI", or when a document is written once rather than filled in from data.
compatibility: Node 22+; Docker (or a local TeX Live with --local); latex-kit 0.5+
metadata:
  author: constructive-io
  version: "0.1.0"
---

# Papers and plain LaTeX

A paper is written once. It needs no templates, schemas or records, only a build that gives the same PDF on every machine.

```sh
npx latex-kit init my-paper --paper      # the Constructive whitepaper style
npx latex-kit init my-paper --paper --preset plain    # a minimal LuaLaTeX paper
cd my-paper
latex-kit render paper/main.tex --verify   # -> out/main.pdf, built twice and compared
```

If the document is the same layout filled in for different people (letters, agreements, invoices), this is the wrong skill: use `latex-kit` and start from [constructive-io/latex-kit-boilerplates](https://github.com/constructive-io/latex-kit-boilerplates) with `latex-kit init my-documents --template project`. A repository can hold both: a `paper/` folder built with `render`, and a documents project beside it.

## What --paper writes

```
paper/main.tex                  the document: title, abstract, \input of each section
paper/sections/*.tex            one file per section
paper/headers/colors.tex        the palette
paper/headers/typescript.tex    highlighted TypeScript listings
paper/references.bib            IEEE-style references
.github/workflows/paper.yml     builds on every push; attaches the PDF to a release on every tag
```

The default preset has TikZ and PSTricks diagrams, code listings and a bibliography already working. Edit those rather than adding packages. `--preset plain` is a single small LuaLaTeX file for when you want your own style.

## Any .tex file

```sh
latex-kit render notes.tex                       # -> out/notes.pdf
latex-kit render paper/main.tex -o build --verify
latex-kit render slides.tex --engine xelatex
latex-kit render main.tex --local                # latexmk on PATH: quick, not pinned
latex-kit render main.tex --json                 # a machine-readable summary
```

- **`--root` is the folder TeX can see** (default: the current directory). Every `\input`, image and `.bib` must be inside it. Run from the repository root and pass the path to the file.
- latexmk runs as many passes as references and the bibliography need.
- The build date comes from the file's last git commit, so `\today` is stable. `--source-date-epoch` overrides it.

## Diagrams, listings, references

- **TikZ** works under every engine. Prefer it for new diagrams.
- **PSTricks** needs the `pdfps` engine (latex, dvips, ps2pdf). `--engine auto`, the default, picks it when the file loads a PSTricks package.
- **Listings**: put code in `lstlisting` with the language the header defines. Do not paste code into `verbatim` and colour it by hand.
- **References**: add entries to `references.bib` and `\cite{key}`. An undefined citation prints `[?]`; search the PDF text for it before publishing.
- **Fonts**: LuaLaTeX with fonts from the image. A font installed only on your machine will not be there in CI.

## CI and releases

The workflow `--paper` writes uses the reusable action:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: constructive-io/latex-kit/action@v1
  id: paper
  with:
    file: paper/main.tex
    engine: auto
    verify: 'true'
# steps.paper.outputs.pdf, steps.paper.outputs.sha256
```

Pushing a tag builds the PDF and attaches it to a GitHub release. Never commit the built PDF.

## Before calling it done

Open the PDF and read it. Then:

```sh
pdftotext out/main.pdf - | grep -n '??\|\[?\]'    # unresolved references and citations
```

Look for overfull lines running into the margin, figures that floated pages away from their text, and a last page holding two lines.

## Related skills

- `latex-kit-reproducible-builds`: pins, engines, and what to do when the build fails.
- `latex-kit`: documents filled in from data.
