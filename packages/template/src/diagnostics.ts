export interface Location {
  file: string;
  line: number;
  column: number;
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
  file?: string;
  line?: number;
  column?: number;
}

export class TemplateError extends Error {
  constructor(
    message: string,
    readonly diagnostics: Diagnostic[]
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}

export function diag(severity: Diagnostic['severity'], message: string, loc?: Location): Diagnostic {
  return loc ? { severity, message, file: loc.file, line: loc.line, column: loc.column } : { severity, message };
}

/** `file:line:col: error: message`, the format editors and CI annotate. */
export function formatDiagnostic(d: Diagnostic): string {
  const where = d.file ? `${d.file}${d.line ? `:${d.line}${d.column ? `:${d.column}` : ''}` : ''}: ` : '';
  return `${where}${d.severity}: ${d.message}`;
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

/** Maps string offsets to 1-based line and column. */
export class LineIndex {
  private starts: number[] = [0];

  constructor(text: string) {
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) this.starts.push(i + 1);
  }

  locate(offset: number): { line: number; column: number } {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - this.starts[lo] + 1 };
  }
}
