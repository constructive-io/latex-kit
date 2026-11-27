# AGENTS.md

Guidance for AI agents working in `constructive-io/latex-kit`.

## Rules

- **This repo is public and open source.** Examples and fixtures use
  invented names, addresses and amounts only. Never add real people,
  companies, contracts or anything copied from a private document repo.
- **No encryption here.** Encrypting and decrypting private inputs belongs
  to `constructive-io/decryption` (`dcrypt`). latex-kit only reads plaintext
  that is already on disk.
- **Don't commit built PDFs.** They are CI artifacts.
- The CLI binary is `latex-kit`. Never add a bin called `latex`: it would
  shadow TeX's own command.
- Signing lives in its own workspace folder, `signing/`: `@latex-kit/sign`
  (`signing/sign`, the server, CLI `latex-kit-sign`) and `@latex-kit/sign-web`
  (`signing/web`, the React pages, built with Vite and published as `dist/`).
  It takes any PDF plus a `.form.json`; it must never import from `packages/`.
  Envelopes (`.latex-kit-sign/`) hold signers' details: never commit one.
- `latex-kit` is the CLI package (unscoped). Libraries live under the `@latex-kit` npm scope (`@latex-kit/escape`, `@latex-kit/render`, …), in `packages/<name>`.

## Conventions

- pnpm workspace, makage builds, publish from `dist/`, no `exports` map,
  lerna independent versions, conventional commits (`constructive-pnpm`
  skill in `constructive-io/constructive`).
- CLIs use `inquirerer` and `yanse`, not commander/yargs/chalk.
- `latex-kit init --template` scaffolds with `genomic` (cache through
  `appstash`, questions through `inquirerer`) from
  `constructive-io/latex-kit-boilerplates`, the same shape of repository
  `pgpm init --repo` reads. Starters live there, not in this repo; only the
  small offline `init` and `init --paper` are built into the CLI.
- Supply-chain policy lives in `pnpm-policy.yaml`. After changing it or
  adding a first-party dependency, run `pnpm run policy`; CI runs
  `pnpm run policy:check`.
- Every package README starts with the Constructive outline-logo header and
  ends with the standard Credits and Disclaimer.

## The template language

- Macros: `\field`, `\raw`, `\when`/`\otherwise`, `\each`/`\sep`, `\snippet`,
  `\docid`, `\clause`/`\clauseref`, `\signature`, `\component`. `\formfield`
  is different: it is a real LaTeX command in `latex-kit.sty`, not replaced by
  the engine, so it works in snippets and in hand-written LaTeX too. Never reuse
  LaTeX's own command names (`\partial`, `\ref`, …) for new macros.
- Components (`@latex-kit/components`) return `tex`-tagged LaTeX; strings are
  escaped. The component types live in `@latex-kit/template` so the engine
  does not depend on the components package.
- Signature images are never committed, and never written anywhere but
  `out/<doc>/lk-signatures/` for the length of one build.
- `packages/latex-kit/src/index.ts` re-exports `@latex-kit/components` by
  name: two `export *` of CommonJS packages clash when jiti loads the source
  (tests alias `latex-kit` to it).
- The engine only replaces these macros; every other byte of a template is
  kept. unified-latex is used to *find* them (skipping comments and
  verbatim), never to re-print the document.
- Values are always escaped through `@latex-kit/escape`, except `\raw`.
- Packages that load project files (`schema`, `latex-kit`) run Jest with
  `--experimental-vm-modules`, because jiti imports TypeScript dynamically.

## Skills

`.agents/skills/` holds the skills other people's agents install: `latex-kit`,
`latex-kit-sign` and `latex-kit-starter-kits`. They are documentation that
gets executed. When a command, flag, macro or starter changes, change the
skill in the same commit, and keep each one pointing at
`constructive-io/latex-kit-boilerplates` as the way to start. The starters'
`.boilerplate.json` files install them by name, so do not rename one without
changing those too.

## Releases

Dan publishes (`pnpm lerna publish`); agents never do. Never push a tag that
isn't lerna's `name@version`: lerna's change detection uses the nearest tag
of any name, so a stray tag makes the next release skip changed packages
(0.4.0 shipped a `latex-kit` built against stale `@latex-kit/template` this
way). The GitHub Action's `v1` is a **branch**; move it with
`git push origin <sha>:refs/heads/v1`. CI fails if a non-release tag is on
main.

## Checks before committing

```bash
pnpm build && pnpm lint && pnpm typecheck && pnpm test
node packages/latex-kit/dist/cli.js render examples/letter/letter.tex --verify
(cd examples/workspace && node ../../packages/latex-kit/dist/cli.js check && node ../../packages/latex-kit/dist/cli.js build --final --verify)
```

Escaping changes must also be checked in a real PDF (render, then
`pdftotext`): some tricks that look right in a unit test, like `-{}-`, still
produce dashes under LuaLaTeX.
