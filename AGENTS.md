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
- `latex-kit` is the CLI package (unscoped). Libraries live under the `@latex-kit` npm scope (`@latex-kit/escape`, `@latex-kit/render`, …), in `packages/<name>`.

## Conventions

- pnpm workspace, makage builds, publish from `dist/`, no `exports` map,
  lerna independent versions, conventional commits (`constructive-pnpm`
  skill in `constructive-io/constructive`).
- CLIs use `inquirerer` and `yanse`, not commander/yargs/chalk.
- Supply-chain policy lives in `pnpm-policy.yaml`. After changing it or
  adding a first-party dependency, run `pnpm run policy`; CI runs
  `pnpm run policy:check`.
- Every package README starts with the Constructive outline-logo header and
  ends with the standard Credits and Disclaimer.

## The template language

- Macros: `\field`, `\raw`, `\when`/`\otherwise`, `\each`/`\sep`, `\snippet`,
  `\docid` (`\clauseref` reserved). Never reuse LaTeX's own command names
  (`\partial`, `\ref`, …) for new macros.
- The engine only replaces these macros; every other byte of a template is
  kept. unified-latex is used to *find* them (skipping comments and
  verbatim), never to re-print the document.
- Values are always escaped through `@latex-kit/escape`, except `\raw`.
- Packages that load project files (`schema`, `latex-kit`) run Jest with
  `--experimental-vm-modules`, because jiti imports TypeScript dynamically.

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
