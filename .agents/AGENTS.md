# Skiller — Diretrizes para AI Assistants

## Identidade do Projeto
Skiller é um serviço que gera Skills (documentos SKILL.md) a partir de playlists do YouTube.
Stack: Hono (backend), Next.js (frontend), BullMQ + Redis, PostgreSQL + Drizzle, Gemini Flash.

## Regras Invioláveis
1. **TypeScript strict mode** — `no-explicit-any` proibido, `strict: true` em todo tsconfig.
   Em `catch`, use `catch (error: unknown)` + `getErrorMessage()` (`src/lib/errors.ts` nos dois pacotes).
   A regra é enforced como **error** no ESLint do frontend, não warning.
2. **Zod everywhere** — Todo input/output de API e LLM deve ser validado com Zod.
   Inclui a saída da síntese: markdown vazio ou sem heading falha o job em vez de virar skill `completed`.
3. **Logs antes de ação** — Todo step do pipeline deve logar antes de executar e depois de completar
4. **Sem hardcode de prompts** — Prompts ficam em `/prompts/`, nunca inline em services
   (`extraction.ts` para o step map, `synthesis.ts` para o reduce)
5. **Errors são dados** — Erros devem ser logados estruturadamente, nunca silenciados

## Arquitetura
- Backend é API pura (Hono) — sem SSR, sem template engine
- Frontend consome backend via fetch — sem BFF, sem server actions que acessem DB
- Pipeline roda em workers BullMQ — nunca na request HTTP
- LLM output é sempre JSON validado por Zod — nunca Markdown direto

## Layout
- `backend/src/` é o único código compilado (`tsconfig` inclui só `src/**`)
- `backend/scripts/` guarda utilitários de dev em `.js` puro — rodar de dentro de `backend/`
- Nenhum script pode conter credencial em código; tudo vem do `.env` da raiz

## Convenções de Código
- Arquivos: `kebab-case.ts` (ex: `skill-renderer.ts`)
- Tipos/Interfaces: `PascalCase` (ex: `VideoCard`)
- Funções: `camelCase` (ex: `buildExtractCardPrompt`)
- Constantes: `UPPER_SNAKE_CASE` (ex: `MAX_RETRY_COUNT`)
- Schemas Zod: `PascalCase` + `Schema` suffix (ex: `VideoCardSchema`)

## Antes de Modificar
1. Leia o ADR relevante em `docs/02_engineering/adrs/`
2. Verifique se o schema Zod precisa ser atualizado
3. Rode os testes antes de considerar completo
