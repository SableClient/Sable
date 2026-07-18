export default {
  locales: ['en', 'ro'],
  extract: {
    input: 'src/**/*.tsx',
    output: 'public/locales/{{language}}/{{namespace}}.json',
  },
};
