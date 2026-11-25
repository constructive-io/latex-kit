# latex-kit image

`ghcr.io/constructive-io/latex-kit`: the official TeX Live image (full
scheme, TeX Live 2026) for amd64 and arm64, plus Noto CJK fonts and
Ghostscript. It runs natively on Apple silicon.

Built and published by [`.github/workflows/image.yml`](../.github/workflows/image.yml)
when this folder changes. latex-kit pins images by digest, so a new image
never changes anyone's PDFs until the default digest is updated on purpose.

```bash
docker build -t latex-kit-local docker
latex-kit build --image latex-kit-local --verify   # try it before switching
```

Tested: the example project's final PDFs are byte-identical across builds
on this image. XeLaTeX is not reproducible on any TeX Live (random font
subset names in xdvipdfmx); LuaLaTeX is the default for that reason.
