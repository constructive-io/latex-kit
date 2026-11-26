import { defineConfig } from 'latex-kit';

// Every value here is the default; it is spelled out as an example.
export default defineConfig({
  templates: 'templates',
  snippets: 'snippets',
  clauses: 'clauses',
  components: 'components',
  data: 'data',
  documents: 'documents',
  out: 'out',
  locale: 'en-US',
  engine: 'auto',
});
