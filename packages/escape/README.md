# @latex-kit/escape

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
  <a href="https://www.npmjs.com/package/@latex-kit/escape">
    <img height="20" src="https://img.shields.io/npm/v/@latex-kit/escape.svg"/>
  </a>
</p>

<p align="center">Escape strings so they print exactly as written in LaTeX.</p>

A value like `R&D (50%) user_name` breaks a LaTeX document or silently
changes it: `&` is a table separator, `%` starts a comment and `_` is a
subscript. `@latex-kit/escape` turns any plain string into LaTeX that prints
the same characters, and refuses input it can't make safe. It has no
dependencies.

## Installation

```bash
npm install @latex-kit/escape
```

## Usage

```ts
import { escapeLatex, raw, tex } from '@latex-kit/escape';

escapeLatex('Smith & Jones, 50% off #3');
// => 'Smith \& Jones, 50\% off \#3'

// tagged template: literal parts are LaTeX, every value is escaped
const doc = tex`\textbf{${company}} owes \$${amount}.`;
doc.value; // string

// opt out for LaTeX you trust
tex`Signed: ${raw('\\rule{4cm}{0.4pt}')}`;
```

`tex` throws on `undefined`, `null`, booleans, `NaN` and objects, so a
missing value can never print as the word "undefined".

### What it escapes

| Input | Output |
|---|---|
| `\` | `\textbackslash{}` |
| `{` `}` `$` `&` `#` `%` `_` | `\{` `\}` `\$` `\&` `\#` `\%` `\_` |
| `^` `~` | `\textasciicircum{}` `\textasciitilde{}` |
| `<` `>` `\|` | `\textless{}` `\textgreater{}` `\textbar{}` |
| `[` `]` | `{[}` `{]}`, so they are never read as an optional argument |
| `--`, `---` | `-\kern0pt-`, `-\kern0pt-\kern0pt-`: literal hyphens, not dashes, in every engine |

Unicode passes through unchanged. Output assumes LuaLaTeX or XeLaTeX, or
pdfLaTeX with `\usepackage[T1]{fontenc}`.

### Options

```ts
escapeLatex(text, {
  newlines: 'space',     // 'space' | 'linebreak' | 'paragraph' | 'error'
  controlChars: 'error', // 'error' | 'strip'
});
```

- `newlines`: `space` (default) joins lines; `linebreak` emits
  `\newline{}`; `paragraph` turns blank lines into paragraph breaks.
- `controlChars`: ASCII control characters (other than tab and line
  breaks) throw by default rather than being dropped silently.

## Credits

**🛠 Built by the [Constructive](https://constructive.io) team — creators of modular Postgres tooling for secure, composable backends. If you like our work, contribute on [GitHub](https://github.com/constructive-io).**

## Disclaimer

AS DESCRIBED IN THE LICENSES, THE SOFTWARE IS PROVIDED "AS IS", AT YOUR OWN RISK, AND WITHOUT WARRANTIES OF ANY KIND.

No developer or entity involved in creating this software will be liable for any claims or damages whatsoever associated with your use, inability to use, or your interaction with other users of the code, including any direct, indirect, incidental, special, exemplary, punitive or consequential damages, or loss of profits, cryptocurrencies, tokens, or anything else of value.
