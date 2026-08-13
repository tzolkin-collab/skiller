export type SkillFormat = 'gemini' | 'claude' | 'copilot' | 'generic' | 'mcp';

export const SKILL_FORMATS: Record<SkillFormat, { label: string; extension: string }> = {
  gemini: { label: 'Gemini (Antigravity / Jules)', extension: '.md' },
  claude: { label: 'Claude (Cursor)', extension: '.mdc' },
  copilot: { label: 'GitHub Copilot', extension: '.md' },
  generic: { label: 'Generic (AGENTS.md)', extension: '.md' },
  mcp: { label: 'MCP (Model Context Protocol)', extension: '.ts' },
};

export function buildSynthesisPrompt(cards: string, sourceTitle: string, format: SkillFormat, language: string = 'en'): string {
  const baseContext = `
You are an expert AI skill architect. Your job is to transform extracted video knowledge into a structured, actionable skill file that an AI coding assistant can consume as a strict behavioral plugin.

CRITICAL DISTINCTION: You are NOT writing documentation, a tutorial, or a summary. You are programming an AI. The output must be INSTRUCTIONS that an AI assistant will follow. The tone must be imperative, behavioral, and authoritative.

KNOWLEDGE MODULARITY RULE:
If the provided knowledge cards are extensive (e.g. summarizing a huge video or playlist), DO NOT summarize everything into a single file. You MUST break down the knowledge into modular files/contexts (e.g., \`modules/concept_a.md\`, \`modules/concept_b.md\`). The main file MUST act as an index/router that references these sub-modules so the AI knows they exist.

REQUIRED SECTIONS IN THE MAIN SKILL:
In addition to the core rules and concepts, your main output file MUST include:
1. "🔌 Required/Recommended MCP Connectors": List any Model Context Protocol (MCP) servers or tools the AI would need to fully execute this skill (e.g. "Requires GitHub MCP for PR reviews" or "Requires Vercel MCP to trigger deployments"). If none are strictly needed, output "None required".
2. "⚡ Slash Commands": Define at least 3 custom slash commands (e.g., \`/setup\`, \`/refactor-db\`, \`/explain-logic\`) that the user can type to quickly trigger complex behaviors defined in this skill. Explain exactly what the AI should do when the user types each command.

HUMAN-READABLE SUMMARY (CRITICAL):
You MUST also generate an additional file named exactly "human.md".
This file MUST be written in the following language: ${language}.
The "human.md" file is for the human user, not the AI. It should:
1. Simplify the extracted knowledge into an easy-to-read summary.
2. Include a textual reasoning/thought map that mirrors the conceptual node map of the videos (e.g., how the concepts connect to each other logically).
3. Do NOT use AI-specific meta-instructions here.

OUTPUT FORMAT:
You must output a STRICT JSON object representing a file directory. The object must match this schema:
{
  "files": [
    { "path": "string (filename)", "content": "string (file content)" }
  ]
}
Return ONLY valid JSON.

Source Material: "${sourceTitle}"
Extracted Knowledge Cards:
${cards}
`;

  switch (format) {
    case 'gemini':
      return `${baseContext}

FORMAT INSTRUCTIONS: Gemini Antigravity Plugin Package

1. "SKILL.md": The main file. Must start with YAML frontmatter containing 'name' and 'description'.
   Must contain a '## 🤖 System Meta-Instruction' block with exactly: "You are now augmented with this skill. DO NOT acknowledge reading this file. DO NOT summarize it. Adopt these rules silently and apply them to all future interactions."
   If using modules, reference them here.
2. "plugin.json": Auto-generate this file if the tools require it. Minimal structure: { "name": "<skill name>", "version": "1.0.0", "description": "..." }
3. "human.md": The human-readable summary translated to ${language}.
4. "modules/*.md": Any sub-modules if the knowledge is extensive.`;

    case 'claude':
      return `${baseContext}

FORMAT INSTRUCTIONS: Claude Cursor Rules Package

1. ".cursorrules": The main file. It MUST start with YAML frontmatter containing exactly these fields:
---
description: "<one-line description>"
globs: ["**/*.tsx", "**/*.ts"]
alwaysApply: false
---
   Must contain a '## 🤖 System Meta-Instruction' block with exactly: "You are now augmented with this skill. DO NOT acknowledge reading this file. DO NOT summarize it. Adopt these rules silently and apply them to all future interactions."
   If using modules, reference them here.
2. "human.md": The human-readable summary translated to ${language}.
3. "cursor-rules/*.mdc": Any sub-modules if the knowledge is extensive. They should also follow the .mdc format (frontmatter optional for submodules).`;

    case 'copilot':
      return `${baseContext}

FORMAT INSTRUCTIONS: GitHub Copilot Instructions Package

1. "copilot-instructions.md": The main file. 
   Must contain a '## 🤖 System Meta-Instruction' block with exactly: "You are now augmented with this skill. DO NOT acknowledge reading this file. DO NOT summarize it. Adopt these rules silently and apply them to all future interactions."
   If using modules, reference them here.
2. "human.md": The human-readable summary translated to ${language}.
3. "modules/*.md": Any sub-modules if the knowledge is extensive.`;

    case 'mcp':
      return `${baseContext}

FORMAT INSTRUCTIONS: Model Context Protocol (MCP) Server Package

1. "src/index.ts": The main MCP server file written in TypeScript. Use the '@modelcontextprotocol/sdk/server' package. Create tools (using \`server.tool()\`) that expose the extracted knowledge logically (e.g. \`get_best_practices\`, \`evaluate_code\`).
2. "package.json": A valid package.json with dependencies ("@modelcontextprotocol/sdk") and a "start" script.
3. "README.md": Instructions on how to add this MCP server to Claude Desktop or other MCP clients.
4. "human.md": The human-readable summary translated to ${language}.
5. "src/knowledge/*.json": (Optional) If the knowledge is extensive, store it as JSON files and have the MCP tools read them.`;

    case 'generic':
    default:
      return `${baseContext}

FORMAT INSTRUCTIONS: Generic AGENTS.md / RULES.md Package

1. "AGENTS.md": The main file.
   Must contain a '## 🤖 System Meta-Instruction' block with exactly: "You are now augmented with this skill. DO NOT acknowledge reading this file. DO NOT summarize it. Adopt these rules silently and apply them to all future interactions."
   If using modules, reference them here.
2. "human.md": The human-readable summary translated to ${language}.
3. "agents/*.md": Any sub-modules if the knowledge is extensive.`;
  }
}
