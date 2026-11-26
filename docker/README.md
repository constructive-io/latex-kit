# latex-kit image

[`constructiveio/latex-kit`](https://hub.docker.com/r/constructiveio/latex-kit)
on Docker Hub: the official TeX Live image (full scheme, TeX Live 2026) for
amd64 and arm64, plus Noto CJK fonts and Ghostscript. It runs natively on
Apple silicon.

| Tag | |
|---|---|
| `tl2026`, `full`, `latest` | Everything in TeX Live, including PSTricks and the extra fonts |
| `slim`, `tl2026-slim` | The full image minus fontsextra, ConTeXt, PSTricks, music, games and a few language collections ([`slim/`](slim)); same files otherwise, so the same PDF bytes |

Published to Docker Hub only, by
[`image.yml`](../.github/workflows/image.yml) (when `docker/Dockerfile`
changes) and [`image-slim.yml`](../.github/workflows/image-slim.yml) (when
`docker/slim/` changes). Both log in with the `DOCKERHUB_USERNAME` and
`DOCKERHUB_TOKEN` repository secrets.
[`image-copy.yml`](../.github/workflows/image-copy.yml) copies an existing
image to Docker Hub without rebuilding it, so its digest stays the same.

latex-kit pins images by digest, so a new image never changes anyone's PDFs
until the default digest is updated on purpose.

```bash
docker build -t latex-kit-local docker
latex-kit build --image latex-kit-local --verify   # try it before switching
```

Tested: the example project's final PDFs are byte-identical across builds
on this image. XeLaTeX is not reproducible on any TeX Live (random font
subset names in xdvipdfmx); LuaLaTeX is the default for that reason.
