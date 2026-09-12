export const demos = {
  nested: { label: 'Nested source files', before: 'src/**/*.ts', after: 'src/*.ts' },
  typescript: { label: 'Add TypeScript', before: '**/*.js', after: '**/*.{js,ts}' },
  docs: { label: 'Document depth', before: 'docs/**', after: 'docs/*' },
  tests: { label: 'Looser test names', before: '**/*.test.js', after: '**/*test.js' }
};
