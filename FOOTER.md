## LaTeX Kit ecosystem

LaTeX Kit turns real LaTeX templates and typed records into PDFs you can build, review, and sign.

| Package | What it does |
| --- | --- |
| [`latex-kit` on npm](https://www.npmjs.com/package/latex-kit) · [source](https://github.com/constructive-io/latex-kit/tree/main/packages/latex-kit) | Scaffold projects, check records, and build documents from the command line. |
| [`@latex-kit/template` on npm](https://www.npmjs.com/package/@latex-kit/template) · [source](https://github.com/constructive-io/latex-kit/tree/main/packages/template) | Fill and check real `.tex` templates with fields, conditions, loops, and clauses. |
| [`@latex-kit/components` on npm](https://www.npmjs.com/package/@latex-kit/components) · [source](https://github.com/constructive-io/latex-kit/tree/main/packages/components) | Compose tables, signature blocks, exhibits, and other reusable pieces in TypeScript. |
| [`@latex-kit/schema` on npm](https://www.npmjs.com/package/@latex-kit/schema) · [source](https://github.com/constructive-io/latex-kit/tree/main/packages/schema) | Validate records with Zod, resolve references, and generate JSON Schema and TypeScript types. |
| [`@latex-kit/render` on npm](https://www.npmjs.com/package/@latex-kit/render) · [source](https://github.com/constructive-io/latex-kit/tree/main/packages/render) | Run `latexmk` in a pinned TeX image with reproducible dates and compiler diagnostics. |
| [`@latex-kit/escape` on npm](https://www.npmjs.com/package/@latex-kit/escape) · [source](https://github.com/constructive-io/latex-kit/tree/main/packages/escape) | Escape text for LaTeX and interpolate it safely with the `tex` tag. |
| [`@latex-kit/sign` on npm](https://www.npmjs.com/package/@latex-kit/sign) · [source](https://github.com/constructive-io/latex-kit/tree/main/signing/sign) | Run a PDF signing server and keep a sealed audit trail. |
| [`@latex-kit/sign-web` on npm](https://www.npmjs.com/package/@latex-kit/sign-web) · [source](https://github.com/constructive-io/latex-kit/tree/main/signing/web) | Use the React pages for placing fields on a PDF and signing it. |

### What you can do

- Check typed records before TeX runs, escape interpolated values, and reuse snippets and components.
- Build reproducible PDFs with pinned TeX images, generate drafts and blank forms, and produce final copies with stable document IDs.
- Review highlighted values, compare redlines against a previous commit, and add signature fields and signed copies.
- Import Word, Markdown, HTML, or existing LaTeX documents as templates.

### Start building

- [Starter kits](https://github.com/constructive-io/latex-kit-boilerplates): scaffold a project, workspace, or template module with `latex-kit init --template`.
- [Document templates](https://github.com/constructive-io/latex-kit-templates): start with a letter, invoice, services agreement, or NDA.
- [GitHub Action](https://github.com/constructive-io/latex-kit/tree/main/action): build and verify PDFs in CI.
- [Agent skills](https://github.com/constructive-io/latex-kit#agent-skills): guides for templates, TypeScript components, review, import, signing, reproducible builds, papers, and starter kits. Install them with `npx skills add constructive-io/latex-kit`.

## Credits

**🛠 Built by the [Constructive](https://constructive.io) team — creators of modular Postgres tooling for secure, composable backends. If you like our work, contribute on [GitHub](https://github.com/constructive-io).**

## Disclaimer

AS DESCRIBED IN THE LICENSES, THE SOFTWARE IS PROVIDED "AS IS", AT YOUR OWN RISK, AND WITHOUT WARRANTIES OF ANY KIND.

No developer or entity involved in creating this software will be liable for any claims or damages whatsoever associated with your use, inability to use, or your interaction with other users of the code, including any direct, indirect, incidental, special, exemplary, punitive or consequential damages, or loss of profits, cryptocurrencies, tokens, or anything else of value.
