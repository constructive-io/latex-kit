import { loadDocument, validate } from '@latex-kit/schema';
import { analyzeTemplate, diag, Diagnostic, FieldRef } from '@latex-kit/template';

import { Project } from './project';

export interface CheckResult {
  diagnostics: Diagnostic[];
  templates: string[];
  documents: string[];
}

/**
 * Everything that can be checked without TeX: template syntax, field names
 * against each schema, every document's data, references, and duplicate IDs.
 */
export async function checkProject(project: Project): Promise<CheckResult> {
  const diagnostics: Diagnostic[] = [];
  const templates = project.templateNames();

  for (const name of templates) {
    try {
      const t = await project.template(name);
      if (!t.jsonSchema) {
        diagnostics.push(diag('warning', `template ${name} has no schema.ts, so field names are not checked`, { file: t.compiled.file, line: 1, column: 1 }));
      }
      diagnostics.push(...analyzeTemplate(t.compiled, { schema: t.jsonSchema ?? undefined, loadSnippet: project.loadSnippet, loadClause: project.loadClause }).diagnostics);
    } catch (e) {
      diagnostics.push(diag('error', (e as Error).message, { file: project.rel(project.path(project.config.templates, name)), line: 1, column: 1 }));
    }
  }

  const files = project.documentFiles();
  const ids = new Map<string, string>();
  for (const file of files) {
    const at = { file: project.rel(file), line: 1, column: 1 };
    try {
      const doc = await loadDocument(file, { dataDir: project.dataDir });
      if (doc.record.docId) {
        const prev = ids.get(doc.record.docId);
        if (prev) diagnostics.push(diag('error', `document ID ${doc.record.docId} is also used by ${prev}; never reuse an ID`, at));
        else ids.set(doc.record.docId, project.rel(file));
      }
      const t = await project.template(doc.record.template);
      if (t.schema) {
        const v = validate(t.schema, doc.data);
        if (!v.ok) for (const i of v.issues) diagnostics.push(diag('error', `data.${i.path}: ${i.message}`, at));
      }
    } catch (e) {
      diagnostics.push(diag('error', (e as Error).message.replace(`${file}: `, ''), at));
    }
  }

  return { diagnostics, templates, documents: files.map((f) => project.rel(f)) };
}

/** Every field a template reads, including through snippets. */
export async function templateFields(project: Project, name: string): Promise<{ fields: FieldRef[]; diagnostics: Diagnostic[] }> {
  const t = await project.template(name);
  const r = analyzeTemplate(t.compiled, { schema: t.jsonSchema ?? undefined, loadSnippet: project.loadSnippet, loadClause: project.loadClause });
  return { fields: r.fields, diagnostics: r.diagnostics };
}
