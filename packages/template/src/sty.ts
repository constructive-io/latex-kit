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
\\ProvidesPackage{latex-kit}[2026/11/25 v0.4 latex-kit template support]

\\newif\\iflk@rendered
\\newif\\iflk@draft
\\DeclareOption{rendered}{\\lk@renderedtrue}
\\DeclareOption{draft}{\\lk@drafttrue}
\\DeclareOption{blank}{}
\\DeclareOption{final}{}
\\DeclareOption{signed}{}
\\ProcessOptions\\relax

\\RequirePackage{xcolor}
\\RequirePackage{graphicx}
% tables from latex-kit components (table(), line items)
\\RequirePackage{array,tabularx,booktabs}
\\definecolor{lkmeta}{gray}{0.55}
\\providecommand\\lkstamp{}

% A labelled blank line: \\lkblank{party.name}
\\newlength\\lkblankwidth
\\setlength\\lkblankwidth{3.5cm}
\\newcommand\\lkblank[1]{\\leavevmode\\underline{\\makebox[\\lkblankwidth][l]{\\color{lkmeta}\\tiny\\ttfamily\\detokenize{#1}}}}

% A clause from the library: \\lkclause{title}{label}. Numbered like a
% section; with no title, a bold number. Redefine it to change the style.
\\providecommand\\lkclause[2]{\\ifx\\relax#1\\relax\\par\\refstepcounter{section}\\label{#2}\\noindent\\textbf{\\thesection.}~\\else\\section{#1}\\label{#2}\\fi}

% A signature block: \\lksignature{organization}{name}{title}{signature}{date}.
% The organization line is left out when empty (a person signing for
% themselves). The signature sits on the line: an image or /s/ text in signed
% builds, nothing otherwise. Two blocks fit side by side with \\hfill.
\\newlength\\lksignaturewidth
\\setlength\\lksignaturewidth{0.45\\linewidth}
\\newlength\\lksignatureheight
\\setlength\\lksignatureheight{2.2em}
\\providecommand\\lksignatureimage[1]{\\includegraphics[height=\\lksignatureheight,keepaspectratio]{#1}}
\\providecommand\\lksignature[5]{%
  \\begin{minipage}[t]{\\lksignaturewidth}\\raggedright\\setlength\\parindent{0pt}%
  \\ifx\\relax#1\\relax\\else\\textbf{#1}\\par\\fi
  \\vspace{\\dimexpr\\lksignatureheight+0.4em\\relax}%
  \\rlap{\\smash{\\raisebox{1pt}{#4}}}\\rule{\\linewidth}{0.4pt}\\par
  #2\\par
  \\ifx\\relax#3\\relax\\else#3\\par\\fi
  \\vspace{0.5em}%
  Date:~\\ifx\\relax#5\\relax\\rule{0.55\\linewidth}{0.4pt}\\else#5\\fi
  \\end{minipage}}

% An exhibit: a new page headed "Exhibit A", then its title.
\\newcounter{lkexhibit}
\\renewcommand\\thelkexhibit{\\Alph{lkexhibit}}
\\providecommand\\lkexhibit[2]{%
  \\clearpage\\refstepcounter{lkexhibit}\\label{#2}%
  \\begin{center}{\\large\\bfseries Exhibit \\thelkexhibit}\\ifx\\relax#1\\relax\\else\\\\[0.3em]{\\bfseries #1}\\fi\\end{center}\\par}

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
  \\newcommand\\clause[1]{\\par\\lkblank{clause #1}\\par}
  \\newcommand\\clauseref[1]{\\lkblank{ref #1}}
  \\newcommand\\signature[1]{\\lksignature{\\lkblank{#1.name}}{\\lkblank{#1.signer.name}}{\\lkblank{#1.signer.title}}{}{}}
  \\newcommand\\component[2]{\\par\\lkblank{component #1}\\par}
\\fi

\\endinput
`;
