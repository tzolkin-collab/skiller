import { CONNECTOR_IDS } from '../lib/skill-document.js';

export type SkillFormat = 'gemini' | 'claude' | 'copilot' | 'generic' | 'mcp';

export const SKILL_FORMATS: Record<SkillFormat, { label: string; extension: string }> = {
  gemini: { label: 'Gemini (Antigravity / Jules)', extension: '.md' },
  claude: { label: 'Claude (Cursor)', extension: '.mdc' },
  copilot: { label: 'GitHub Copilot', extension: '.md' },
  generic: { label: 'Generic (AGENTS.md)', extension: '.md' },
  mcp: { label: 'MCP (Model Context Protocol)', extension: '.ts' }
};

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

FIELD GUIDE

- \`name\`: kebab-case identifier, 3–50 chars, no accents. Example: "next-js-app-router".
- \`title\`: human title of the skill.
- \`description\`: one line, 20–300 chars. Used as the plugin description.
- \`goal\`: what an agent equipped with this skill is able to accomplish.
- \`principles\`: 1–15 behavioural rules. Each has a short \`title\` and a \`rule\`
  written as a directive ("Always…", "Never…", "When X, do Y"). These are the
  heart of the skill — be specific to the source, not generic advice.
- \`modules\`: break extensive knowledge into 0–12 modules. Each needs a kebab-case
  \`slug\`, a \`title\`, a \`summary\`, and 1–20 \`sections\`. A section has a \`heading\`,
  a \`body\`, and optional \`snippets\` (each with \`language\` and \`code\`).
  Only include code that actually appeared in the source.
- \`connectors\`: MCP servers this skill needs. \`id\` MUST be one of:
  ${CONNECTOR_IDS.join(', ')}.
  Omit the array entirely if none apply. Never invent an id.
- \`commands\`: 1–10 slash commands. \`name\` must match /^\\/[a-z][a-z0-9-]{1,30}$/,
  with a \`description\` and ordered \`steps\` telling the agent exactly what to do.
- \`humanGuide\`: written for the HUMAN, in ${language}, with no AI meta-instructions.
  \`summary\` is an executive summary. \`sections\` cover core concepts and a
  step-by-step guide. Include \`mermaid\` ONLY when the subject genuinely involves
  an architecture, state machine or flow — never force a diagram.

Everything except \`humanGuide\` is written in English, regardless of the source language.

Source Material: "${sourceTitle}"

Extracted Knowledge Cards:
${cards}

Return ONLY valid JSON matching the requested schema.`;
}
