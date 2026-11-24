const MAIN = `latex-kit — build typed, reproducible LaTeX documents

Usage
  latex-kit <command> [options]

Commands
  render <file.tex>   Build a PDF with latexmk in a pinned Docker image
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
      --image <ref>            Docker image (default: pinned pyramation/latex digest)
      --platform <os/arch>     Docker --platform (default: linux/amd64 for the default image)
      --local                  Use latexmk on PATH instead of Docker (not pinned)
      --source-date-epoch <s>  Build timestamp in seconds since 1970
      --verify                 Build twice and fail if the PDFs differ
      --json                   Print a JSON summary on stdout

Only lualatex is byte-reproducible in the default image.
`;

const DOCTOR = `latex-kit doctor [--image <ref>] [--json]

Reports the Node version, whether Docker is running, whether the image is
pulled and whether it runs natively on this machine, and whether latexmk
is available for --local builds. Exits 1 if rendering cannot work.
`;

export function help(command?: string): void {
  console.log(command === 'render' ? RENDER : command === 'doctor' ? DOCTOR : MAIN);
}
