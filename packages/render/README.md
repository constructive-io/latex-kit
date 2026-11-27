# @latex-kit/render

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
  <a href="https://www.npmjs.com/package/@latex-kit/render">
    <img height="20" src="https://img.shields.io/npm/v/@latex-kit/render.svg"/>
  </a>
</p>

<p align="center">Render LaTeX to PDF with latexmk in a pinned Docker image, reproducibly.</p>

Runs `latexmk` inside a Docker image pinned by digest, stamps the build
with a fixed date, and turns the TeX log into `file:line` diagnostics. Same
source + same image + same date = the same PDF bytes.

## Installation

```bash
npm install @latex-kit/render
```

## Usage

```ts
import { doctor, render, RenderError } from '@latex-kit/render';

try {
  const result = await render({ file: 'examples/letter/letter.tex' });
  result.pdf;          // absolute path to out/letter.pdf
  result.sha256;       // hash of the PDF bytes
  result.epochSource;  // 'option' | 'env' | 'git' | 'clock'
  result.diagnostics;  // warnings from the log
} catch (e) {
  if (e instanceof RenderError) console.error(e.diagnostics);
}

await doctor(); // [{ name: 'docker', status: 'ok', detail: 'daemon running (arm64)' }, …]
```

### Options

| Option | Default | |
|---|---|---|
| `file` | | The `.tex` file |
| `root` | `process.cwd()` | Directory TeX can see. Inputs and outputs must be inside it |
| `outDir` | `out` | Relative to `root` |
| `engine` | `auto` | `auto`, `lualatex`, `xelatex`, `pdflatex` or `pdfps` (latex → dvips → ps2pdf, for PSTricks). `auto` uses `detectEngine` on the file |
| `backend` | `docker` | `local` runs `latexmk` from `PATH` (not pinned) |
| `image` | `DEFAULT_IMAGE` | `constructiveio/latex-kit` on Docker Hub (TeX Live 2026), pinned by digest |
| `platform` | native (the image is multi-arch) | Docker `--platform` |
| `sourceDateEpoch` | see below | Build timestamp, seconds since 1970 |

### Choosing the engine

`detectEngine(source)` returns `{ engine, reason, warnings }`: a
`% !TEX program =` line wins; PSTricks (`pstricks`, `pst-*`) → `pdfps`;
`xeCJK`, `xltxtra`, `ctex` → `xelatex`; LuaTeX-ja → `lualatex`; `CJK`,
`CJKutf8` → `pdflatex`; otherwise `lualatex`. It warns when the text has
Chinese, Japanese or Korean characters but no CJK package loads.

### Reproducible builds

The build date (which also drives `\today`) comes from, in order: the
`sourceDateEpoch` option, the `SOURCE_DATE_EPOCH` environment variable, or
the last git commit that touched the file. Only if none exists does it fall
back to the current time, and then the result says `reproducible: false`.

**LuaLaTeX output is byte-identical** across builds. XeLaTeX works, but its
PDF writer gives embedded fonts random subset names, so it is never
byte-identical; that is why LuaLaTeX is the default.

### Docker notes

- The default image runs natively on amd64 and arm64 (Apple silicon). It is
  about 2.8 GB; the first build pulls it. `LEGACY_IMAGE` is the previous
  default (TeX Live 2019, amd64), for reproducing PDFs made with it.
- On Linux the container runs as your uid, so outputs aren't owned by root.
