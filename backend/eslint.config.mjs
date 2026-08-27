// @ts-check
/**
 * Lint do backend.
 *
 * Existe porque não existia: o frontend tinha ESLint e o backend não, então a
 * regra 1 do AGENTS.md — nada de `any` — nunca foi aplicável aqui. Três tinham
 * escapado para `queue/worker.ts`, e um regex escrito com bytes de controle
 * LITERAIS sobreviveu num arquivo de schema sem ninguém notar (`no-control-regex`
 * é a regra que teria pego aquele).
 *
 * Escopo: `src/` e os scripts em TypeScript. Os `.js` soltos em `scripts/` são
 * ferramentas descartáveis de depuração, escritas em CommonJS e sem manutenção —
 * lintá-las só produziria ruído que ninguém vai corrigir.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Globais do Node. O ambiente é servidor; não há `window` nem `document`. */
const globaisNode = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  fetch: 'readonly',
  Headers: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  AbortController: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  crypto: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'drizzle/**',
      'node_modules/**',
      // Ferramentas descartáveis de depuração, em CommonJS.
      'scripts/**/*.js',
      // Trabalho em andamento de outra pessoa: captura de frames (feature
      // descontinuada), sem dependências instaladas e sem ninguém importando.
      'src/services/renderer.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: globaisNode,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      // AGENTS.md, regra 1. `error`, não `warn`: aviso que ninguém lê não é regra.
      '@typescript-eslint/no-explicit-any': 'error',
      // Byte de controle literal em regex é invisível no editor e some quando
      // qualquer ferramenta normaliza o arquivo. Use escapes.
      'no-control-regex': 'error',
      // Variável não usada geralmente é resto de refactor. `_` no começo isenta,
      // para o caso legítimo de assinatura obrigatória.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Os scripts são ferramentas de linha de comando: `console` é a saída deles.
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  }
);
