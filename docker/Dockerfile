# latex-kit's TeX image: official TeX Live (full scheme), multi-arch, plus
# Noto CJK fonts. Native on arm64 (Apple silicon) and amd64.
#
# The base is pinned by digest: same digest, same TeX, same PDF bytes.
# To update: pull texlive/texlive:latest-full, take its index digest
# (docker buildx imagetools inspect), replace it here, rebuild, and check
# the examples are still byte-identical.
FROM texlive/texlive:latest-full@sha256:b20c42c2a5b1be892c26e6d3b896e9aa20350528ddd0d4444d23e5925ea1545d

LABEL org.opencontainers.image.source="https://github.com/constructive-io/latex-kit" \
      org.opencontainers.image.description="TeX Live (full) with latexmk, latexdiff, biber and Noto CJK fonts, for latex-kit" \
      org.opencontainers.image.licenses="MIT"

RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-noto-cjk ghostscript \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f

# A writable home for any uid (docker run --user), so luaotfload can cache fonts.
ENV HOME=/tmp TEXMFVAR=/tmp/texmf-var
WORKDIR /work
