# @latex-kit/sign-web

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
  <a href="https://www.npmjs.com/package/@latex-kit/sign-web">
    <img height="20" src="https://img.shields.io/npm/v/@latex-kit/sign-web.svg"/>
  </a>
</p>

<p align="center">The pages @latex-kit/sign serves: signing a PDF, and drawing fields on one.</p>


You do not use this package directly. [`@latex-kit/sign`](https://www.npmjs.com/package/@latex-kit/sign) depends on it and serves its built files.

| Page | What |
|---|---|
| `/sign/<token>` | The signer's page: the real PDF (pdf.js) with a box on each of their spots, a signature pad, the terms popover |
| `/place/<key>` | Drawing fields on a PDF: drag to draw, click to drop a standard box, a popover on the selected box |

## Working on it

```sh
latex-kit-sign serve                           # the API, on 8787
pnpm --filter @latex-kit/sign-web dev          # the pages, on 5173, passing /api to 8787
pnpm --filter @latex-kit/sign-web build        # build the local pages and stage the npm package
```

React, built with Vite. `pnpm test` checks types and the staged npm package; the behaviour is tested through the API in `@latex-kit/sign`.
