export interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
  file?: string;
  line?: number;
}

const FILE_LINE_ERROR = /^(.+?\.(?:tex|sty|cls|ltx|def)):(\d+): (.+)$/;
const BANG_ERROR = /^! (.+)$/;
const WARNING = /^(?:LaTeX|Package [\w-]+|Class [\w-]+) Warning: (.+)$/;
const ON_LINE = /on input line (\d+)\.?/;

/**
 * Pull errors and warnings out of a TeX log written with -file-line-error.
 * TeX wraps log lines at 79 characters; continuation lines of a warning are
 * joined back on.
 */
export function parseLog(log: string): Diagnostic[] {
  const lines = log.replace(/\r\n?/g, '\n').split('\n');
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  const push = (d: Diagnostic) => {
    const key = `${d.severity}|${d.file}|${d.line}|${d.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(d);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fle = FILE_LINE_ERROR.exec(line);
    if (fle) {
      push({ severity: 'error', file: fle[1].replace(/^\.\//, ''), line: Number(fle[2]), message: fle[3].trim() });
      continue;
    }
    const bang = BANG_ERROR.exec(line);
    if (bang) {
      // with -file-line-error most errors are reported above; keep the rest
      // (missing files, emergency stops) that have no location
      const message = bang[1].trim();
      if (!out.some((d) => d.severity === 'error' && d.message === message)) {
        push({ severity: 'error', message });
      }
      continue;
    }
    const warn = WARNING.exec(line);
    if (warn) {
      let message = warn[1];
      // continuation lines are indented to line up under the message
      while (i + 1 < lines.length && /^\(?[\w-]*\)?\s{2,}\S/.test(lines[i + 1])) {
        message += ' ' + lines[++i].replace(/^\(?[\w-]*\)?\s+/, '');
      }
      const onLine = ON_LINE.exec(message);
      push({
        severity: 'warning',
        message: message.replace(ON_LINE, '').replace(/\s+/g, ' ').trim().replace(/\s*\.$/, ''),
        line: onLine ? Number(onLine[1]) : undefined,
      });
    }
  }
  return out;
}

export function formatDiagnostic(d: Diagnostic): string {
  const where = d.file ? `${d.file}${d.line ? `:${d.line}` : ''}: ` : d.line ? `line ${d.line}: ` : '';
  return `${d.severity}: ${where}${d.message}`;
}
