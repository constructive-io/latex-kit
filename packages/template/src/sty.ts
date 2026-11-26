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
\\ProvidesPackage{latex-kit}[2026/11/26 v0.6 latex-kit template support]

\\newif\\iflk@rendered
\\newif\\iflk@draft
\\DeclareOption{rendered}{\\lk@renderedtrue}
\\DeclareOption{draft}{\\lk@drafttrue}
\\DeclareOption{blank}{}
\\DeclareOption{final}{}
\\DeclareOption{signed}{}
% how a blank prints (blank builds and template previews)
\\newif\\iflk@blanklines
\\newif\\iflk@blanknames
\\DeclareOption{blanklines}{\\lk@blanklinestrue}
\\DeclareOption{blanknames}{\\lk@blanknamestrue}
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
% Four ways to print it. Redefine any of them to change the look.
%   labelled  (default) the field's name, small, on a line
%   line      an empty line to write on            (option blanklines)
%   names     the field's name in brackets, no line (option blanknames)
% and per field, through \\formfield[blank=…]: wide, none, label.
\\newcommand\\lkblanklabelled[1]{\\leavevmode\\underline{\\makebox[\\lkblankwidth][l]{\\color{lkmeta}\\tiny\\ttfamily\\detokenize{#1}}}}
\\newcommand\\lkblankline[1]{\\leavevmode\\underline{\\hspace{\\lkblankwidth}}}
\\newcommand\\lkblankwide[1]{\\leavevmode\\underline{\\hspace{2\\lkblankwidth}}}
\\newcommand\\lkblanknone[1]{}
\\newcommand\\lkblanklabel[1]{\\mbox{[\\ifx\\lkf@label\\@empty\\detokenize{#1}\\else\\lkf@label\\fi]}}
\\newcommand\\lkblanknames[1]{\\mbox{\\color{lkmeta}\\small\\ttfamily[\\detokenize{#1}]}}
\\newcommand\\lkblank[1]{%
  \\iflk@blanknames\\lkblanknames{#1}%
  \\else\\ifx\\lkf@blank\\@empty
    \\iflk@blanklines\\lkblankline{#1}\\else\\lkblanklabelled{#1}\\fi
  \\else
    \\@ifundefined{lkblank\\lkf@blank}{\\lkblanklabelled{#1}}{\\csname lkblank\\lkf@blank\\endcsname{#1}}%
  \\fi\\fi}

% Form hints: \\formfield[hints]{content} prints its content unchanged in a
% finished document. The hints tell blank forms how to print the spot, and
% tell form and signing software where it is.
%   blank=line|wide|none|label   how a blank prints here; label={Company Name}
%                                sets the bracketed text for blank=label
%   type=signature|date|initials|text, who=<party>
%                                a spot for someone to fill in. Its page and
%                                position are written to <document>.form, which
%                                latex-kit turns into <document>.form.json
%   width=, height=, raise=      the box for that spot: its bottom-left corner
%                                is where the content starts, moved up by raise
%                                (defaults 7cm, 24pt, 0pt)
\\def\\lkf@blank{}\\def\\lkf@label{}\\def\\lkf@type{}\\def\\lkf@who{}
\\newlength\\lkf@width
\\newlength\\lkf@height
\\newlength\\lkf@raise
\\define@key{lkf}{blank}{\\def\\lkf@blank{#1}}
\\define@key{lkf}{label}{\\def\\lkf@label{#1}}
\\define@key{lkf}{type}{\\def\\lkf@type{#1}}
\\define@key{lkf}{who}{\\def\\lkf@who{#1}}
\\define@key{lkf}{width}{\\setlength\\lkf@width{#1}}
\\define@key{lkf}{height}{\\setlength\\lkf@height{#1}}
\\define@key{lkf}{raise}{\\setlength\\lkf@raise{#1}}
\\newcommand\\formfield[2][]{{%
  \\setlength\\lkf@width{7cm}\\setlength\\lkf@height{24pt}\\setlength\\lkf@raise{0pt}%
  \\setkeys{lkf}{#1}\\lkf@mark #2}}

% Where a marked spot landed. One line per spot in <document>.form:
%   type who page x y width height raise
% lengths in scaled points; x and y from the bottom-left corner of the page.
% Needs an engine that can report positions (LuaTeX, pdfTeX, XeTeX).
\\newwrite\\lkf@out
\\newif\\iflkf@open
\\newif\\iflkf@can
\\@ifundefined{ReadonlyShipoutCounter}{}{%
  \\ifdefined\\savepos
    \\lkf@cantrue\\let\\lkf@savepos\\savepos
    \\def\\lkf@x{\\the\\lastxpos}\\def\\lkf@y{\\the\\lastypos}%
  \\else\\ifdefined\\pdfsavepos
    \\lkf@cantrue\\let\\lkf@savepos\\pdfsavepos
    \\def\\lkf@x{\\the\\pdflastxpos}\\def\\lkf@y{\\the\\pdflastypos}%
  \\fi\\fi}
\\newcommand\\lkf@mark{%
  \\ifx\\lkf@type\\@empty\\else\\iflkf@can
    \\iflkf@open\\else\\immediate\\openout\\lkf@out=\\jobname.form\\relax\\global\\lkf@opentrue\\fi
    \\leavevmode\\lkf@savepos
    \\edef\\lkf@next{\\write\\lkf@out{\\lkf@type\\space\\ifx\\lkf@who\\@empty -\\else\\lkf@who\\fi\\space
      \\noexpand\\the\\noexpand\\ReadonlyShipoutCounter\\space\\noexpand\\lkf@x\\space\\noexpand\\lkf@y\\space
      \\number\\lkf@width\\space\\number\\lkf@height\\space\\number\\lkf@raise}}%
    \\lkf@next
  \\fi\\fi}
% \\signature blocks mark their own signature and date lines for the party
% named by \\lksignaturefor{party}, which latex-kit writes before each block.
\\def\\lk@sigwho{}
\\newcommand\\lksignaturefor[1]{\\gdef\\lk@sigwho{#1}}
\\newcommand\\lk@sigmark[3]{\\ifx\\lk@sigwho\\@empty\\else{%
  \\def\\lkf@type{#1}\\let\\lkf@who\\lk@sigwho
  \\setlength\\lkf@width{#2}\\setlength\\lkf@height{#3}\\setlength\\lkf@raise{0pt}\\lkf@mark}\\fi}

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
  \\lk@sigmark{signature}{\\linewidth}{\\lksignatureheight}\\rlap{\\smash{\\raisebox{1pt}{#4}}}\\rule{\\linewidth}{0.4pt}\\par
  #2\\par
  \\ifx\\relax#3\\relax\\else#3\\par\\fi
  \\vspace{0.5em}%
  Date:~\\ifx\\relax#5\\relax\\lk@sigmark{date}{0.55\\linewidth}{1.2em}\\rule{0.55\\linewidth}{0.4pt}\\else#5\\fi
  \\end{minipage}\\gdef\\lk@sigwho{}}

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
  \\newcommand\\signature[1]{\\lksignaturefor{#1}\\lksignature{\\lkblank{#1.name}}{\\lkblank{#1.signer.name}}{\\lkblank{#1.signer.title}}{}{}}
  \\newcommand\\component[2]{\\par\\lkblank{component #1}\\par}
\\fi

\\endinput
`;
