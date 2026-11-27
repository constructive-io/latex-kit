# @latex-kit/sign

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
  <a href="https://www.npmjs.com/package/@latex-kit/sign">
    <img height="20" src="https://img.shields.io/npm/v/@latex-kit/sign.svg"/>
  </a>
</p>

<p align="center">Get a PDF signed: a signing page, a sealed audit trail, and a placement guide for other signing apps.</p>


> **Status: new.** It works end to end and is tested, but it has not been reviewed by a lawyer or run in production. Read [Limits](#limits) before putting a real agreement through it.

```sh
npm install @latex-kit/sign
```

## Two files in, a signed PDF out

Everything works from two files: a PDF, and a `.form.json` beside it saying where its boxes are.

| You have | Do this |
|---|---|
| A latex-kit document whose template marks where to sign | `latex-kit build`. `\signature` blocks mark themselves; `\formfield[type=signature,who=buyer]{…}` marks your own. The build writes `<document>.form.json` |
| Any other PDF | `latex-kit-sign place file.pdf`: draw the boxes on it in the browser, save |
| Both files, from anywhere | `send` to use this signer, or `guide` to sign through another app |

Nothing here needs LaTeX. The only link to latex-kit is the shape of `.form.json`: a list of `{ type, who, page, x, y, width, height }` in PDF points, from the bottom-left corner of the page. `type` is `signature`, `date`, `initials` or `text`.

## Sign with this package

```sh
latex-kit build --final                                    # writes out/nda/nda.pdf and nda.form.json
latex-kit-sign send out/nda/nda.pdf \
  --signer 'discloser=Avery Example <avery@example.test>' \
  --signer 'recipient=Sam Sample <sam@example.test>'
latex-kit-sign serve
```

`send` prints, once, a private link and a 6-digit access code for each signer. It does not email anyone: you send the link and the code, by different routes.

The signer opens the link and enters the code. The page shows the real PDF with a box on each of their spots. They draw or type a signature, fill any text boxes, and press Finish. A popover shows the signing terms to agree to; then the browser asks to share their location, which they can refuse and still sign. The server stamps the PDF and records the audit facts. When everyone has signed, a certificate page is added and the result is sealed.

### What is recorded for each signer

| Fact | Where it comes from |
|---|---|
| Time signed | The server's clock |
| IP address, browser | The server, from the connection. Set `LATEX_KIT_SIGN_TRUST_PROXY=1` only behind your own proxy |
| Location | The browser, if the signer allows it; otherwise the refusal is recorded. It is the signer's device reporting on itself: supporting detail, not proof |
| Agreement to the terms | The exact text, its version and its hash |
| Identity | That the private link and the access code were both used |
| What they typed | The contents of their text and initials boxes |
| SHA-256 before and after | Each signature's "before" is the previous one's "after", back to the untouched original |

### Protections

- **Links and codes are stored only as hashes.** A copy of the data folder cannot be used to sign.
- **Five wrong codes lock a link.** Links expire (14 days by default, `--days`). `reissue` replaces a lost, locked or expired link; the old one stops working.
- **One change at a time per envelope**, so two requests cannot both sign.
- **The seal.** When complete, the final file's hash and the audit record are signed with the server's Ed25519 key. `verify` fails if the PDF, the record, or the stored original changed afterwards.
- **Signing order.** With `send --ordered`, each link opens only once the signer before has signed.
- **A signer can decline**, which stops everyone.
- **The signing link is kept out of Referer headers and caches**, and the page cannot be framed.

## Sign with another app

```sh
latex-kit-sign guide out/nda/nda.pdf
```

This writes `nda.guide.pdf`: the same pages with a numbered yellow box on every spot, and a last page listing each box's page, signer and position from the top-left corner, as a share of the page and in inches. `nda.guide.json` holds the same list as data.

Upload the plain PDF to the signing app and place the fields from the guide. It is for a person, or an agent working the app's screen, who would otherwise guess where the boxes go. Never send the guide copy itself for signature.

## Commands

```
latex-kit-sign place <any.pdf>                     draw boxes on a PDF (this machine only)
latex-kit-sign send <document.pdf> --signer who="Name <email>" … [--days 14] [--ordered]
latex-kit-sign serve [--port 8787]
latex-kit-sign list
latex-kit-sign status <envelope>
latex-kit-sign reissue <envelope> <who>
latex-kit-sign verify <envelope> [signed.pdf]
latex-kit-sign guide <document.pdf>… | --all <folder>
```

| Environment | |
|---|---|
| `LATEX_KIT_SIGN_DATA` | Where envelopes live. Default `./.latex-kit-sign`. Never commit it |
| `LATEX_KIT_SIGN_KEY` | The seal key file. Default `<data>/seal-key.pem`. Back it up |
| `LATEX_KIT_SIGN_URL` | The address signers reach, printed in links |
| `LATEX_KIT_SIGN_TRUST_PROXY` | `1` to take the signer's IP from `X-Forwarded-For` |

## As a library

```ts
import { createEnvelope, createSignServer, verifyEnvelope, writeGuide } from '@latex-kit/sign';

const { envelope, secrets } = createEnvelope({ pdfPath, fields, signers: { buyer: { name, email } } });
createSignServer().listen(8787);
```

## Limits

- **The access code is only as good as how you deliver it.** Nothing here sends email or texts, and there is no login.
- **The seal is this package's own, not a standard PDF signature.** A PDF reader will not show the file as signed; checking needs `verify` and the stored record.
- **Four kinds of box:** signature, date, initials and typed text. Typed text is limited to Latin letters, because the PDF's built-in font cannot draw others.
- **No reminders.** Nobody is told when their turn comes.
- **Storage is files on one machine**, with no backups and no HTTPS of its own. Put it behind a proxy that provides HTTPS before anyone outside uses it; browsers only offer location on HTTPS or localhost.
- **Not legal advice.** Whether an electronic signature made this way is acceptable for a given agreement is a legal question.
