import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Flat config built from `@next/eslint-plugin-next`'s own flat presets.
 *
 * It deliberately does NOT go through `FlatCompat` + `eslint-config-next`:
 * that path loads the plugin's legacy eslintrc config, whose objects carry a
 * top-level `name` key that the eslintrc validator rejects ("Unexpected
 * top-level property \"name\""), which is what broke linting entirely.
 *
 * Only `no-explicit-any` is added on top, as an error — AGENTS.md rule 1.
 * The full `typescript-eslint` recommended set is intentionally left off so
 * the signal stays on that one rule instead of a wall of pre-existing noise.
 */
export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '*.tsbuildinfo'],
  },
  nextPlugin.configs['core-web-vitals'],
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // react-hooks is registered but its rules are left off: the codebase already
    // carries `eslint-disable-next-line react-hooks/exhaustive-deps` comments,
    // and an unregistered plugin makes those comments themselves an error
    // ("Definition for rule ... was not found").
    plugins: { '@typescript-eslint': tseslint.plugin, 'react-hooks': reactHooks },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
