const MAIN = `latex-kit — build typed, reproducible LaTeX documents

Usage
  latex-kit <command> [options]

Start
  init [dir]          A new project: a letter template, data and a record
  init [dir] --paper  A paper: main.tex, refs.bib and a GitHub Actions workflow
  new template <name> A template folder with template.tex and schema.ts
  new document <name> --template <t>
                      A record with every required field, linked to its schema

Project commands (run in a folder with templates/, data/, documents/)
  build [documents…]  Fill templates with records and build PDFs
  check               Check templates, schemas, records and IDs without TeX
  fields <template>   List every field a template reads
  typegen             Write JSON Schema and .d.ts for each template's data
  sty [dir]           Write latex-kit.sty so editors can preview templates
  import <file>       Turn a Word/Markdown/HTML document (or an older .tex)
                      into a template; {{x}} and @GROUP@FIELD@ become \\field
  diff <document> --against <ref>
                      Redline PDF of a document against an earlier commit
  diff <old.tex> <new.tex>
                      Redline PDF of any two .tex files

Other commands
  render <file.tex>   Build a plain .tex file with latexmk in a pinned image
  doctor              Check Docker, the image and local TeX

Options
  -h, --help          Show help (latex-kit help <command> for details)
  -v, --version       Show the version
`;

const RENDER = `latex-kit render <file.tex> [options]

Builds <file.tex> with latexmk. The build date is taken from
SOURCE_DATE_EPOCH, else the file's last git commit, so the same commit
always produces the same PDF bytes.

Options
  -o, --out <dir>              Output directory, relative to --root (default: out)
  -e, --engine <name>          lualatex (default), xelatex or pdflatex
      --root <dir>             Directory TeX can see (default: current directory)
      --image <ref>            Docker image (default: pinned ghcr.io/constructive-io/latex-kit)
      --platform <os/arch>     Docker --platform (default: native)
      --local                  Use latexmk on PATH instead of Docker (not pinned)
      --source-date-epoch <s>  Build timestamp in seconds since 1970
      --verify                 Build twice and fail if the PDFs differ
      --json                   Print a JSON summary on stdout

Only lualatex is byte-reproducible in the default image.
`;

const BUILD = `latex-kit build [documents…] [options]

Fills each document's template with its data and builds a PDF in
out/<document>/. Without arguments, builds every record in documents/.

Variants
  --variant draft    (default) DRAFT watermark and stamp; missing values show
                     as red markers (they fail instead when CI=true or --strict)
  --variant final    No marks. Missing values fail. Mints a document ID on the
  --final            first build and saves it in the record (JSON/YAML)
  --variant signed   Like final; templates can test \\when{$variant == "signed"}
  --variant blank    Every field is a labelled line. With no documents, builds
                     each template (or --template <name>) as an empty form

Options
      --template <name>  Only documents that use this template
      --strict           Fail on missing values in drafts too
  -e, --engine <name>    lualatex (default), xelatex or pdflatex
      --local            Use latexmk on PATH instead of Docker
      --image <ref>      Docker image (default: pinned ghcr.io/constructive-io/latex-kit)
      --verify           Build twice and fail unless the PDFs are identical
      --tex-only         Write the .tex without running TeX
      --json             JSON results on stdout
      --root <dir>       Project folder (default: current directory)
`;

const DOCTOR = `latex-kit doctor [--image <ref>] [--json]

Reports the Node version, whether Docker is running, whether the image is
pulled and whether it runs natively on this machine, and whether latexmk
is available for --local builds. Exits 1 if rendering cannot work.
`;

export function help(command?: string): void {
  console.log(command === 'render' ? RENDER : command === 'doctor' ? DOCTOR : command === 'build' ? BUILD : MAIN);
}
