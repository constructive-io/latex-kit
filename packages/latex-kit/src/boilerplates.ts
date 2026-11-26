/**
 * Files written by `latex-kit init` and `latex-kit new`. Every name, address
 * and amount is a placeholder.
 */

import { WHITEPAPER_COLORS_TEX, WHITEPAPER_TYPESCRIPT_TEX } from './paper-style';

export type FileMap = Record<string, string>;

/** Paper presets for `latex-kit init --paper --preset <name>`. */
export const PAPER_PRESETS = ['whitepaper', 'plain'] as const;
export type PaperPreset = (typeof PAPER_PRESETS)[number];

export function projectFiles(version: string): FileMap {
  return {
    'package.json': `${JSON.stringify(
      {
        name: 'documents',
        private: true,
        scripts: {
          check: 'latex-kit check',
          draft: 'latex-kit build',
          final: 'latex-kit build --final',
          blank: 'latex-kit build --variant blank',
          typegen: 'latex-kit typegen',
        },
        devDependencies: { 'latex-kit': `^${version}` },
      },
      null,
      2
    )}\n`,
    '.gitignore': 'node_modules/\nout/\n',
    'latex-kit.config.ts': `import { defineConfig } from 'latex-kit';

export default defineConfig({
  locale: 'en-US',
});
`,
    'README.md': `# Documents

Built with [latex-kit](https://github.com/constructive-io/latex-kit).

| Folder | |
|---|---|
| \`templates/<name>/template.tex\` | A real \`.tex\` file with \`\\field{…}\`, \`\\when\`, \`\\each\` |
| \`templates/<name>/schema.ts\` | The data the template needs (zod) |
| \`snippets/\` | Shared pieces: \`\\snippet{letterhead}\` |
| \`clauses/\` | Versioned clauses: \`\\clause{id}\`, \`\\clauseref{id}\` |
| \`data/\` | Shared records, used with \`{ "$ref": "orgs/my-company" }\` |
| \`documents/\` | One record per document |
| \`out/\` | Generated .tex, PDFs and manifests (not committed) |

\`\`\`bash
npx latex-kit check            # no TeX needed
npx latex-kit build            # drafts
npx latex-kit build --final    # final PDFs; mints document IDs once
npx latex-kit new document thank-you --template letter
\`\`\`
`,
    'templates/letter/template.tex': `\\documentclass[11pt]{article}
\\usepackage{fontspec}
\\usepackage[margin=25mm]{geometry}
\\usepackage{latex-kit}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}

\\begin{document}
\\snippet{letterhead}

\\vspace{2em}
\\field{date|date:long}

\\vspace{1em}
\\field{to.name}\\\\
\\when{to.address}{\\field{to.address.line1}\\\\
\\field{to.address.city}}

\\vspace{1em}
Dear \\field{to.name},

\\field{body|paragraphs}

\\vspace{2em}
Sincerely,\\\\[3em]
\\field{from.signer.name}\\\\
\\field{from.signer.title|default:""}

\\vfill
{\\small \\docid}
\\end{document}
`,
    'templates/letter/schema.ts': `import { ISODate, Organization, Party, z } from 'latex-kit';

export const meta = { docIdPrefix: 'LTR' };

export default z.object({
  date: ISODate,
  from: Organization,
  to: Party,
  body: z.string(),
});
`,
    'snippets/letterhead.tex': `% Shared letterhead: reads \`from\` from the document's data.
\\begin{flushright}
{\\large\\bfseries \\field{from.name}}\\\\
\\field{from.address.line1}\\\\
\\field{from.address.city}
\\end{flushright}
`,
    'clauses/.gitkeep': '',
    'data/orgs/my-company.yaml': `# Your organization. Documents refer to it as { $ref: orgs/my-company }.
name: My Company, Inc.
address:
  line1: 1 Example Street
  city: Springfield
signer:
  $ref: people/me
`,
    'data/people/me.yaml': `name: Your Name
title: Founder
`,
    'documents/welcome-letter.yaml': `template: letter
data:
  date: "2026-01-15"
  from:
    $ref: orgs/my-company
  to:
    name: Jordan Example
    address:
      line1: 2 Sample Road
      city: Anytown
  body: |
    Welcome aboard! This letter was built by latex-kit from
    documents/welcome-letter.yaml and templates/letter/template.tex.

    Run latex-kit build --final to mint its document ID.
`,
  };
}

/** A minimal LuaLaTeX paper: fontspec, natbib. */
export function plainPaperFiles(): FileMap {
  return {
    '.gitignore': 'out/\n',
    'paper/main.tex': `\\documentclass[11pt]{article}
\\usepackage{fontspec}
\\usepackage[margin=25mm]{geometry}
\\usepackage{amsmath,natbib,hyperref}

\\title{Paper Title}
\\author{Your Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
One paragraph that says what the paper shows.
\\end{abstract}

\\section{Introduction}
Cite related work like this~\\citep{knuth1984}.

\\section{Results}
\\begin{equation}
  e^{i\\pi} + 1 = 0
\\end{equation}

\\bibliographystyle{plainnat}
\\bibliography{refs}
\\end{document}
`,
    'paper/refs.bib': `@book{knuth1984,
  author    = {Donald E. Knuth},
  title     = {The {\\TeX}book},
  publisher = {Addison-Wesley},
  year      = {1984}
}
`,
    '.github/workflows/paper.yml': `name: Paper

on:
  push:
    branches: [main]
  pull_request:

jobs:
  pdf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # the build date comes from the last commit
      - uses: constructive-io/latex-kit/action@v1
        with:
          file: paper/main.tex
          verify: 'true'
`,
    'README.md': `# Paper

\`\`\`bash
npx latex-kit render paper/main.tex --verify   # → out/main.pdf, byte-identical on every build
\`\`\`

CI builds the PDF on every push and attaches it to the run.
`,
  };
}

export function templateFiles(name: string): FileMap {
  return {
    [`templates/${name}/template.tex`]: `\\documentclass[11pt]{article}
\\usepackage{fontspec}
\\usepackage[margin=25mm]{geometry}
\\usepackage{latex-kit}

\\begin{document}
\\section*{\\field{title}}

Prepared for \\field{recipient.name} on \\field{date|date:long}.

\\docid
\\end{document}
`,
    [`templates/${name}/schema.ts`]: `import { ISODate, Party, z } from 'latex-kit';

export const meta = { docIdPrefix: '${name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 12)}' };

export default z.object({
  title: z.string(),
  date: ISODate,
  recipient: Party,
});
`,
  };
}

const PAPER_WORKFLOW = (file: string, name: string) => `name: Paper

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:

jobs:
  pdf:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # the build date comes from the last commit
      - uses: constructive-io/latex-kit/action@v1
        with:
          file: ${file}
          engine: auto
          verify: 'true'
          artifact-name: ${name}.pdf

  # pushing a tag like v1.0.0 attaches the PDF to a GitHub release
  release:
    needs: pdf
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: ${name}.pdf
          path: pdf
      - env:
          GH_TOKEN: \${{ github.token }}
        run: |
          pdf=$(find pdf -name '*.pdf' | head -n 1)
          cp "$pdf" "${name}-$GITHUB_REF_NAME.pdf"
          gh release create "$GITHUB_REF_NAME" "${name}-$GITHUB_REF_NAME.pdf" -R "$GITHUB_REPOSITORY" --title "$GITHUB_REF_NAME" --generate-notes
`;

/**
 * The Constructive whitepaper style (rls-whitepaper, hyperweb-whitepaper):
 * article class, the code colour palette and TypeScript listings style,
 * TikZ and PSTricks, IEEE references. PSTricks means latex → dvips → ps2pdf,
 * which `engine: auto` picks.
 */
export function whitepaperFiles(): FileMap {
  return {
    '.gitignore': 'out/\n',
    'paper/main.tex': `% A paper in the Constructive whitepaper style (as rls-whitepaper and
% hyperweb-whitepaper). It loads PSTricks, so latex-kit builds it with
% latex -> bibtex -> dvips -> ps2pdf; \`latex-kit render paper/main.tex\` picks that.
\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{xcolor}
\\usepackage{listings}
\\usepackage{geometry}
\\usepackage{enumitem}
\\usepackage{amsfonts}
\\usepackage{amssymb}
\\usepackage[hidelinks]{hyperref}
\\usepackage{cleveref}

\\usepackage{pstricks}
\\usepackage{tikz}
\\usetikzlibrary{arrows.meta, positioning, shapes, calc}

\\input{headers/colors.tex}
\\input{headers/typescript.tex}

\\title{Paper Title: What the Paper Shows}
\\author{Your Name, A. Co-Author
\\\\ \\\\
\\texttt{info@example.com}}
\\date{v0.0.1 --- \\today}

\\begin{document}

\\maketitle

\\begin{abstract}
One paragraph: the problem, why existing approaches fall short, what this
paper presents, and what it achieves.
\\end{abstract}

\\tableofcontents

\\input{sections/introduction.tex}
\\input{sections/design.tex}
\\input{sections/conclusion.tex}

\\newpage

\\section{Bibliography}
\\bibliographystyle{IEEEtran}
\\bibliography{references}

\\end{document}
`,
    'paper/headers/colors.tex': WHITEPAPER_COLORS_TEX,
    'paper/headers/typescript.tex': WHITEPAPER_TYPESCRIPT_TEX,
    'paper/sections/introduction.tex': `\\section{Introduction}

State the problem and why it matters. Cite prior work like this~\\cite{stonebraker1986}.
\\Cref{fig:flow} is drawn with PSTricks.

\\begin{figure}[ht]
\\centering
\\begin{pspicture}(0,0)(9,3)
  \\psframe[fillstyle=solid,fillcolor=lightpurple,framearc=0.2](0,0.75)(3,2.25)
  \\rput(1.5,1.5){Client}
  \\psline[linewidth=1pt]{->}(3,1.5)(6,1.5)
  \\rput(4.5,1.85){\\small request}
  \\pscircle[fillstyle=solid,fillcolor=codelightgreen](7.5,1.5){1.2}
  \\rput(7.5,1.5){Server}
\\end{pspicture}
\\caption{A request flow, drawn with PSTricks.}
\\label{fig:flow}
\\end{figure}
`,
    'paper/sections/design.tex': `\\section{Design}

\\Cref{fig:layers} is drawn with TikZ, and \\cref{lst:counter} uses the
TypeScript listing style.

\\begin{figure}[ht]
\\centering
\\begin{tikzpicture}[
    node distance=1.2cm,
    box/.style={rectangle, draw, rounded corners, fill=blue!10, text width=2.8cm, text centered, minimum height=0.9cm},
    store/.style={rectangle, draw, rounded corners, fill=orange!10, text width=2.8cm, text centered, minimum height=0.9cm},
    arrow/.style={-{Stealth}, thick}
]
\\node[box] (api) {API};
\\node[box, below=of api] (policy) {Policy check};
\\node[store, right=1.6cm of policy] (data) {Data};
\\draw[arrow] (api) -- (policy);
\\draw[arrow] (policy) -- node[above] {\\small allowed} (data);
\\end{tikzpicture}
\\caption{Layers, drawn with TikZ.}
\\label{fig:layers}
\\end{figure}

\\begin{lstlisting}[language=typescript, caption=A small contract, label=lst:counter, style=typescript]
export default class Counter {
  state = { count: 0 };

  increment(by: number) {
    this.state.count += by;
    return this.state.count;
  }
}
\\end{lstlisting}
`,
    'paper/sections/conclusion.tex': `\\section{Conclusion}

Summarize what the paper showed and what comes next.
`,
    'paper/references.bib': `@techreport{stonebraker1986,
  author      = {Michael Stonebraker and Lawrence A. Rowe},
  title       = {The Design of {POSTGRES}},
  institution = {University of California, Berkeley},
  number      = {UCB/ERL M85/95},
  year        = {1986}
}
`,
    '.github/workflows/paper.yml': PAPER_WORKFLOW('paper/main.tex', 'paper'),
    'README.md': `# Paper

\`\`\`bash
npx latex-kit render paper/main.tex --verify   # → out/main.pdf, byte-identical on every build
\`\`\`

The Constructive whitepaper style: \`paper/headers/colors.tex\` (code colours)
and \`paper/headers/typescript.tex\` (\`style=typescript\` listings), TikZ and
PSTricks figures, IEEE references. PSTricks builds through latex → dvips →
ps2pdf, which latex-kit picks by itself.

CI builds the PDF on every push and attaches it to the run. Pushing a tag
like \`v1.0.0\` publishes it as a GitHub release.
`,
  };
}

/** Files for `latex-kit init --paper`. */
export function paperFiles(preset: PaperPreset = 'whitepaper'): FileMap {
  return preset === 'plain' ? plainPaperFiles() : whitepaperFiles();
}

