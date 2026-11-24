# Examples

Fictional documents used to test `latex-kit` end to end. Every name,
address and amount in them is invented. CI renders each one twice and fails
if the PDFs are not byte-identical.

| Example | Shows |
|---|---|
| [`letter/letter.tex`](letter/letter.tex) | Plain `.tex` → PDF with LuaLaTeX, Unicode, escaped specials, a reproducible `\today` |

```bash
pnpm build
node packages/latex-cli/dist/index.js render examples/letter/letter.tex --verify
```
