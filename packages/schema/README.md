# @latex-kit/schema

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
  <a href="https://www.npmjs.com/package/@latex-kit/schema">
    <img height="20" src="https://img.shields.io/npm/v/@latex-kit/schema.svg"/>
  </a>
</p>

<p align="center">Typed data for latex-kit documents: zod schemas, shared types, references and document IDs.</p>

## Installation

```bash
npm install @latex-kit/schema
```

Everything here is also exported from `latex-kit`, so a project usually
imports from there.

## Schemas

Each template can have a `schema.ts` next to its `template.tex`. The default
export is a zod schema for the document's data; `meta` is optional.

```ts
// templates/nda/schema.ts
import { ISODate, Party, z } from 'latex-kit';

export const meta = { docIdPrefix: 'NDA' };

export default z.object({
  effectiveDate: ISODate,
  discloser: Party,
  recipient: Party,
  termMonths: z.number().int().positive(),
  mutual: z.boolean().default(true),
});
```

Shared types: `ISODate`, `Money`, `Address`, `Signer`, `Person`,
`Organization`, `Party`, `Localized` (`{ en: "…", ja: "…" }`). A signer,
person or party may name its signature image file (`signature`), for signed
builds.

## Records and references

A document record names its template and holds the data. JSON, YAML,
TypeScript and JavaScript all work.

```json
{
  "template": "nda",
  "docId": "NDA-20261125-8K2M4Q7Z",
  "locale": "en-US",
  "data": {
    "effectiveDate": "2026-11-25",
    "discloser": { "$ref": "orgs/example-widgets" },
    "recipient": { "$ref": "orgs/placeholder-labs" },
    "termMonths": 24
  }
}
```

`{ "$ref": "orgs/example-widgets" }` (or `ref('orgs/example-widgets')` in
TypeScript) is replaced by `data/orgs/example-widgets.json|yaml|ts`, so a
company or person is written once and used everywhere. References resolve
recursively; cycles and paths outside `data/` are errors.

A record may also say how each party signed it, for `--variant signed`.
Keys are the paths `\signature` uses:

```yaml
signed:
  discloser: { date: "2026-11-25" }
  recipient: { date: "2026-11-26", signature: jordan-2026.png }
```

In TypeScript, `defineDocument` types a record against a template's
generated type; any object in it may be a `ref()`:

```ts
import { defineDocument, ref } from 'latex-kit';
import type { InvoiceData } from '../templates/invoice/types';

export default defineDocument<InvoiceData>({ template: 'invoice', data: { from: ref('orgs/acme'), … } });
```

## Document IDs

`mintDocId({ prefix, epoch })` makes `NDA-20261125-8K2M4Q7Z` (40 random
bits). latex-kit mints one on a document's first successful final build and
writes it into the record (JSON or YAML; TypeScript records are never
edited: you are told the line to add). Re-renders reuse it, and
`latex-kit check` fails if two records share one.

## API

| Function | |
|---|---|
| `loadFile(file)` | JSON, YAML, or a TS/JS module's default export |
| `resolveRefs(value, { dataDir })` | Replace every `$ref`; returns the files read |
| `loadDocument(file, { dataDir })` | Read and check a record, resolve its references |
| `defineDocument<Data>(record)` | Type a TypeScript record |
| `loadTemplateSchema(file)` | `{ schema, meta }` from a `schema.ts` |
| `validate(schema, value)` | `{ ok, value }` or `{ ok: false, issues: [{ path, message }] }` |
| `toJsonSchema(schema)` | JSON Schema of the data as written in records |
| `documentJsonSchema(name, json)` | Schema for a whole record, for editor autocomplete |
| `generateTypes(name, json)` | TypeScript declarations (via schema-typescript) |
| `mintDocId`, `writeDocId` | Create and store document IDs |

## Credits

**🛠 Built by the [Constructive](https://constructive.io) team — creators of modular Postgres tooling for secure, composable backends. If you like our work, contribute on [GitHub](https://github.com/constructive-io).**

## Disclaimer

AS DESCRIBED IN THE LICENSES, THE SOFTWARE IS PROVIDED "AS IS", AT YOUR OWN RISK, AND WITHOUT WARRANTIES OF ANY KIND.

No developer or entity involved in creating this software will be liable for any claims or damages whatsoever associated with your use, inability to use, or your interaction with other users of the code, including any direct, indirect, incidental, special, exemplary, punitive or consequential damages, or loss of profits, cryptocurrencies, tokens, or anything else of value.
