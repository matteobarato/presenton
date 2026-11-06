import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'public/vendor', 'src/api/schema.d.ts', 'test-results', 'playwright-report', 'src/render/legacy/**'],
  },
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    rules: {
      // shadcn-vue style wrappers are single-word names (Button, Dialog, ...).
      'vue/multi-word-component-names': 'off',
      // Optional props are typed with TypeScript; undefined is a valid default.
      'vue/require-default-prop': 'off',
      // Formatting is not enforced by lint.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
    },
  },
)
