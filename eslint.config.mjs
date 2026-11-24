import base from '@constructive-io/eslint-config';

export default [
  ...base,
  {
    ignores: ['**/dist/**', '**/out/**', 'examples/**']
  },
  {
    // the escaper matches control characters on purpose
    files: ['packages/escape/**'],
    rules: {
      'no-control-regex': 'off'
    }
  }
];
