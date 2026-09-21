export type SkillFormat = 'gemini' | 'cursor' | 'claude' | 'copilot' | 'generic' | 'mcp';

export const SKILL_FORMATS: Record<SkillFormat, { label: string; extension: string }> = {
  gemini: { label: 'Gemini (Antigravity)', extension: '.md' },
  cursor: { label: 'Cursor IDE', extension: '.mdc' },
  claude: { label: 'Claude Code', extension: '.md' },
  copilot: { label: 'GitHub Copilot', extension: '.md' },
  generic: { label: 'Generic', extension: '.md' },
  mcp: { label: 'MCP Server', extension: '.ts' }
};

/**
 * Pedido de correção quando o documento devolvido reprova na validação.
 * Recebe só a lista do que falhou — o modelo já tem a própria resposta na
 * conversa —, então o custo é o de reescrever o documento, não o de reler tudo.
 */
export function buildRepairPrompt(issues: { path: string; message: string }[]): string {
  const lista = issues.map((i) => `- ${i.path}: ${i.message}`).join('\n');
  return (
    'Your previous JSON was rejected by validation. Fix ONLY the problems below and return the ' +
    'COMPLETE corrected document as JSON, with the same schema, keeping everything else unchanged. ' +
    'Shorten text where a length limit was exceeded; do not drop required content.\n\n' +
    lista
  );
}

/**
 * Prompt de síntese — ADR-004.
 *
 * O formato de saída não aparece mais aqui. O modelo devolve conhecimento
 * estruturado e o TypeScript renderiza para cada alvo (`lib/renderers.ts`),
 * então a mesma geração serve os cinco formatos. Antes o formato estava assado
 * no texto e trocar de alvo exigia nova chamada paga.
 *
 * O modelo também não escreve mais frontmatter, heading nem a meta-instrução:
 * essas são estrutura, e estrutura é nossa.
 */
export function buildSynthesisPrompt(cards: string, sourceTitle: string, language: string = 'en'): string {
  return `You are an expert AI skill architect. Transform the extracted video knowledge below
into a STRUCTURED SKILL DOCUMENT.

CRITICAL DISTINCTION: you are NOT writing documentation, a tutorial or a summary.
You are programming an AI. The \`principles\`, \`commands\` and module \`sections\` must be
INSTRUCTIONS an assistant will follow — imperative, behavioural, specific.

You are filling FIELDS, not writing files. Do not write Markdown headings, YAML
frontmatter, file paths or code fences anywhere. The rendering layer builds those.
Write plain prose in each field; the only place code belongs is inside \`snippets[].code\`.

TRACEABILITY REQUIREMENT: Every principle, module section, and command step MUST cite its source. Whenever you use information from the extracted knowledge, append a short citation in brackets (e.g. "[Source: GitHub README]" or "[Source: Video 1 @ 04:20]"). This is critical for auditing.

FIELD GUIDE

- \`name\`: kebab-case identifier, 3–50 chars, no accents. Example: "next-js-app-router".
- \`title\`: human title of the skill.
- \`description\`: one line, 20–300 chars. Used as the plugin description.
- \`goal\`: what an agent equipped with this skill is able to accomplish.
- \`niche\`: classify the skill content into EXACTLY ONE of these values (lowercase, no accents):
  \`marketing\` | \`sales\` | \`traffic\` | \`development\` | \`productivity\` | \`design\` | \`finance\` | \`other\`
  Choose the primary domain. When in doubt, choose \`other\`. Do NOT invent new values.
- \`principles\`: 1–15 behavioural rules. Each has a short \`title\` and a \`rule\`
  written as a directive ("Always…", "Never…", "When X, do Y"). These are the
  heart of the skill — be specific to the source, not generic advice.
- \`modules\`: break the knowledge into 1–12 modules. REQUIRED — never return an
  empty list. Each needs a kebab-case \`slug\`, a \`title\`, a \`summary\`, and 1–20
  \`sections\`. A section has a \`heading\`, a \`body\`, and optional \`snippets\`
  (each with \`language\` and \`code\`). Only include code that actually appeared
  in the source.
  Modules are where an agent LOOKS THINGS UP. Reference knowledge belongs here —
  not in \`commands\` (which are procedures to execute) and not in \`humanGuide\`
  (which the agent never reads). If the source is thin, return ONE module
  covering it. Never split artificially to reach a count.
- \`connectors\`: MCP servers the slash commands will ACTIVELY USE during execution.
  Pick only connectors an agent will actually call — not ones merely related to the topic.
  \`id\` MUST be exactly one of the values below. Never invent an id.

  | id | covers |
  |----|--------|
  | \`filesystem\` | read, write, move or delete local files and directories |
  | \`github\` | repos, PRs, issues, commits, Actions, code search |
  | \`gitlab\` | same as github but for GitLab |
  | \`postgres\` | SQL queries, migrations, schema inspection on PostgreSQL |
  | \`sqlite\` | SQL queries on local SQLite databases |
  | \`supabase\` | Supabase DB, auth, storage and realtime |
  | \`stripe\` | payments, customers, subscriptions, invoices, webhooks |
  | \`notion\` | read/write Notion pages and databases |
  | \`slack\` | send messages, read channels, manage threads |
  | \`vercel\` | deployments, env vars, domains, edge function logs |
  | \`cloudflare\` | Workers, KV, R2, DNS, Access policies |
  | \`sentry\` | query production errors, stack traces, releases, performance |
  | \`figma\` | read designs, extract tokens, inspect components, post comments |
  | \`puppeteer\` | browser automation, screenshots, scraping, E2E flows |
  | \`fetch\` | HTTP calls to any external API not listed above |
  | \`terminal\` | run shell commands, scripts, build tools, package managers |
  | \`sequential-thinking\` | multi-step reasoning where each step depends on the previous (debugging, design, planning) |
  | \`memory\` | persist context across sessions (user preferences, project state, decisions) |

  Selection rules:
  - A principle that says "query the database" → needs \`postgres\` or \`sqlite\`.
  - A command that posts a summary somewhere → needs \`slack\` or \`notion\`.
  - A skill about debugging → needs \`sentry\` + \`sequential-thinking\`.
  - A skill about multi-step analysis or architecture design → needs \`sequential-thinking\`.
  - A skill that must remember user choices between sessions → needs \`memory\`.
  - If NO command performs an external action, omit \`connectors\` entirely.
- \`commands\`: 1–10 slash commands. \`name\` must match /^\\/[a-z][a-z0-9-]{1,30}$/,
  with a \`description\` and ordered \`steps\` telling the agent exactly what to do.
- \`humanGuide\`: written for the HUMAN, with no AI meta-instructions.
  \`summary\` is an executive summary. \`sections\` cover core concepts and a
  step-by-step guide. Include \`mermaid\` ONLY when the subject genuinely involves
  an architecture, state machine or flow — never force a diagram. 
  If the extracted knowledge contains markdown images (e.g. \`![Screenshot](./assets/...)\`), you MUST embed them naturally into the \`body\` of relevant sections.

HARD LIMITS — the validator rejects the WHOLE document if any of these is exceeded, so stay well inside them (they mirror \`lib/skill-document.ts\`):
- \`principles\` 1–15: \`title\` 3–120 chars, \`rule\` 10–1000 chars.
- \`modules\` 1–12: \`title\` 3–120, \`summary\` 20–600, 1–20 \`sections\` each with \`heading\` 3–120 and \`body\` 10–8000; up to 10 \`snippets\` per section, \`code\` at most 4000 chars, \`caption\` at most 200.
- \`connectors\` at most 10: \`reason\` 5–200 chars AND at least 5 words — one short sentence saying what the skill does with it.
- \`commands\` 1–10: \`description\` 10–300 chars; 1–12 \`steps\`, each 3–500 chars.
- \`humanGuide\`: \`summary\` 50–3000 chars; at most 15 \`sections\` with \`body\` 10–6000; \`mermaid\` at most 3000.
- \`name\` 3–50, \`description\` 20–300, \`goal\` 10–500.
Citations count toward these lengths: keep each one short.

IMPORTANT: The ENTIRE document (including principles, modules, commands, and humanGuide) MUST be written in ${language}, regardless of the source language.

Source Material: "${sourceTitle}"

Extracted Knowledge Cards:
${cards}

Return ONLY valid JSON matching the requested schema.`;
}
