/**
 * Files written by `latex-kit init` and `latex-kit new`. Every name, address
 * and amount is a placeholder.
 */

export type FileMap = Record<string, string>;

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

export function paperFiles(): FileMap {
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
