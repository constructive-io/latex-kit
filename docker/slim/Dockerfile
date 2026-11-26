# latex-kit's slim image: the full image, pinned below, minus the TeX Live
# collections few documents need (fontsextra, ConTeXt, PSTricks, music,
# games, …). It is a copy of the full image's own files with some removed,
# so a document that builds on both gives the same PDF bytes on both.
#
# Use the full image for PSTricks (the pdfps engine) and for the extra fonts.
# To update: change the digest to the new full image and rebuild.
FROM ghcr.io/constructive-io/latex-kit@sha256:e4d5aebb60986780c437ace0c0840c73fa6b0b70c7a60ab3246aee83da483fac AS trimmed

# --no-execute-actions: keep the full image's formats and font maps as they
# are (rebuilding them would make different files, and could change PDFs).
# Schemes are only lists of collections; drop the lists (not their contents)
# so the collections below can go.
RUN tlmgr remove --no-depends $(tlmgr info --list --only-installed --data name | grep '^scheme-') \
 && tlmgr remove --no-execute-actions \
      collection-fontsextra collection-context collection-pstricks \
      collection-games collection-music collection-humanities \
      collection-publishers collection-mathscience collection-texworks \
      collection-langarabic collection-langgreek collection-langcyrillic \
      collection-langother collection-langczechslovak collection-langpolish \
 && rm -f /usr/local/texlive/*/texmf-var/web2c/tlmgr*.log

# One layer with what is left, so the removed files are really gone.
FROM scratch
COPY --from=trimmed / /

ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    LANG=C.UTF-8 LC_ALL=C.UTF-8 \
    TEXLIVE_INSTALL_NO_CONTEXT_CACHE=1 NOPERLDOC=1 DEBIAN_FRONTEND=noninteractive \
    HOME=/tmp TEXMFVAR=/tmp/texmf-var
WORKDIR /work
CMD ["bash"]

LABEL org.opencontainers.image.source="https://github.com/constructive-io/latex-kit" \
      org.opencontainers.image.description="latex-kit's TeX Live image without the rarely used collections (no PSTricks, no fontsextra)" \
      org.opencontainers.image.licenses="MIT"
