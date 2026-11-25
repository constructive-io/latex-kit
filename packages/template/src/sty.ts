/**
 * latex-kit.sty, the LaTeX side of the template language. Written next to
 * every generated document; `latex-kit sty <dir>` writes it for previewing
 * templates in an editor.
 */
export const LATEX_KIT_STY = `% latex-kit.sty: support for latex-kit templates.
%
% Load it in a template with \\usepackage{latex-kit}. Compiled directly, a
% template previews as a blank form: every \\field becomes a labelled line.
% When latex-kit renders a document it passes the \`rendered\` option and the
% variant (draft, blank, final, signed); the template macros are gone by then.
%
% https://github.com/constructive-io/latex-kit  (MIT)
\\NeedsTeXFormat{LaTeX2e}
\\ProvidesPackage{latex-kit}[2026/11/25 v0.3 latex-kit template support]

\\newif\\iflk@rendered
\\newif\\iflk@draft
\\DeclareOption{rendered}{\\lk@renderedtrue}
\\DeclareOption{draft}{\\lk@drafttrue}
\\DeclareOption{blank}{}
\\DeclareOption{final}{}
\\DeclareOption{signed}{}
\\ProcessOptions\\relax

\\RequirePackage{xcolor}
\\definecolor{lkmeta}{gray}{0.55}
\\providecommand\\lkstamp{}

% A labelled blank line: \\lkblank{party.name}
\\newlength\\lkblankwidth
\\setlength\\lkblankwidth{3.5cm}
\\newcommand\\lkblank[1]{\\leavevmode\\underline{\\makebox[\\lkblankwidth][l]{\\color{lkmeta}\\tiny\\ttfamily\\detokenize{#1}}}}

% A value the data does not have yet (draft builds only).
\\newcommand\\lkmissing[1]{\\leavevmode{\\color{red}\\fbox{\\scriptsize\\ttfamily missing: \\detokenize{#1}}}}

\\iflk@draft
  \\RequirePackage{draftwatermark}
  \\SetWatermarkText{DRAFT}
  \\SetWatermarkScale{1}
  \\SetWatermarkColor[gray]{0.9}
  \\RequirePackage{eso-pic}
  \\AddToShipoutPictureFG{%
    \\AtPageLowerLeft{\\raisebox{6mm}{\\hspace{10mm}\\color{lkmeta}\\scriptsize\\ttfamily DRAFT \\lkstamp}}}
\\fi

\\iflk@rendered\\else
  % Previewing the template itself: show its structure.
  \\newcommand\\field[1]{\\lkblank{#1}}
  \\newcommand\\raw[1]{\\lkblank{#1}}
  \\newcommand\\docid{\\lkblank{docid}}
  \\newcommand\\when[2]{{\\color{lkmeta}\\tiny[if \\detokenize{#1}]}#2}
  \\newcommand\\otherwise[1]{{\\color{lkmeta}\\tiny[otherwise]}#1}
  \\newcommand\\each[3]{{\\color{lkmeta}\\tiny[each \\detokenize{#2} in \\detokenize{#1}]}#3}
  \\newcommand\\sep[1]{#1}
  \\newcommand\\snippet[1]{\\InputIfFileExists{#1}{}{\\lkblank{snippet #1}}}
  \\newcommand\\clauseref[1]{\\lkblank{clause #1}}
\\fi

\\endinput
`;
