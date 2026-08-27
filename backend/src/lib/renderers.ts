import type { SkillFormat } from '../prompts/synthesis.js';
import type { PackageFile } from './skill-package.js';
import { META_INSTRUCTION, type SkillDocument, type SkillModule } from './skill-document.js';
import { escapeMarkdownBody, fenceCode } from './sanitize.js';

/**
 * Renderizadores — um documento estruturado vira arquivos, por formato.
 *
 * O ganho que o ADR-004 prometia e que só existe aqui: o mesmo documento gera
 * os cinco formatos sem nova chamada ao LLM. Trocar de Claude para Copilot
 * deixa de ser regeneração paga e passa a ser uma função pura.
 *
 * Todo texto vindo do modelo passa por `escapeMarkdownBody` antes de entrar no
 * template. A hierarquia de heading, o frontmatter e as cercas de código são
 * nossas — o modelo não consegue abrir nem fechar nenhuma delas.
 */

const yamlString = (value: string) => JSON.stringify(value);

function renderSection(section: SkillDocument['modules'][number]['sections'][number], level: number): string {
  const hashes = '#'.repeat(Math.min(level, 6));
  const parts = [`${hashes} ${escapeMarkdownBody(section.heading)}`, '', escapeMarkdownBody(section.body)];

  for (const snippet of section.snippets) {
    parts.push('');
    if (snippet.caption) parts.push(`_${escapeMarkdownBody(snippet.caption)}_`, '');
    parts.push(fenceCode(snippet.code, snippet.language));
  }

  return parts.join('\n');
}

function renderModuleFile(module: SkillModule): string {
  return [
    `# ${escapeMarkdownBody(module.title)}`,
    '',
    escapeMarkdownBody(module.summary),
    '',
    ...module.sections.map(s => renderSection(s, 2))
  ].join('\n');
}

/** Corpo comum aos formatos de prosa — o que muda entre eles é a casca. */
function renderBody(doc: SkillDocument, moduleDir: string, moduleExt: string): string {
  const parts: string[] = [];

  parts.push('## 🤖 System Meta-Instruction', '', META_INSTRUCTION, '');
  parts.push('## Goal', '', escapeMarkdownBody(doc.goal), '');

  parts.push('## Core Principles', '');
  doc.principles.forEach((p, i) => {
    parts.push(`${i + 1}. **${escapeMarkdownBody(p.title)}** — ${escapeMarkdownBody(p.rule)}`);
  });
  parts.push('');

  if (doc.modules.length > 0) {
    parts.push('## Sub-Modules Reference', '');
    doc.modules.forEach(m => {
      parts.push(`- \`${moduleDir}/${m.slug}${moduleExt}\` — ${escapeMarkdownBody(m.summary)}`);
    });
    parts.push('');
  }

  parts.push('## 🔌 Required/Recommended MCP Connectors', '');
  if (doc.connectors.length === 0) {
    parts.push('None required.');
  } else {
    doc.connectors.forEach(c => {
      const tag = c.required ? '**Required**' : 'Recommended';
      parts.push(`- \`${c.id}\` — ${tag}: ${escapeMarkdownBody(c.reason)}`);
    });
  }
  parts.push('');

  parts.push('## ⚡ Slash Commands', '');
  doc.commands.forEach(c => {
    parts.push(`### \`${c.name}\``, '', escapeMarkdownBody(c.description), '');
    c.steps.forEach((s, i) => parts.push(`${i + 1}. ${escapeMarkdownBody(s)}`));
    parts.push('');
  });

  return parts.join('\n').trimEnd() + '\n';
}

function renderHumanGuide(doc: SkillDocument): string {
  const parts = [`# ${escapeMarkdownBody(doc.title)}`, '', '## Executive Summary', '', escapeMarkdownBody(doc.humanGuide.summary), ''];

  if (doc.humanGuide.mermaid) {
    parts.push('## Overview', '', fenceCode(doc.humanGuide.mermaid, 'mermaid'), '');
  }

  doc.humanGuide.sections.forEach(s => {
    parts.push(`## ${escapeMarkdownBody(s.heading)}`, '', escapeMarkdownBody(s.body), '');
  });

  return parts.join('\n').trimEnd() + '\n';
}

function moduleFiles(doc: SkillDocument, dir: string, ext: string): PackageFile[] {
  return doc.modules.map(m => ({ path: `${dir}/${m.slug}${ext}`, content: renderModuleFile(m) }));
}

function pluginJson(doc: SkillDocument): string {
  return JSON.stringify(
    { name: doc.name, version: '1.0.0', description: doc.description },
    null,
    2
  );
}

// ---------------------------------------------------------------------------

function renderGemini(doc: SkillDocument): PackageFile[] {
  const frontmatter = ['---', `name: ${yamlString(doc.name)}`, `description: ${yamlString(doc.description)}`, '---', ''].join('\n');
  return [
    { path: 'SKILL.md', content: frontmatter + renderBody(doc, 'modules', '.md') },
    { path: 'plugin.json', content: pluginJson(doc) },
    { path: 'human.md', content: renderHumanGuide(doc) },
    ...moduleFiles(doc, 'modules', '.md')
  ];
}

function renderCursor(doc: SkillDocument): PackageFile[] {
  const frontmatter = [
    '---',
    `description: ${yamlString(doc.description)}`,
    'globs: ["**/*.ts", "**/*.tsx"]',
    'alwaysApply: false',
    '---',
    ''
  ].join('\n');
  return [
    { path: '.cursor/rules/main.mdc', content: frontmatter + renderBody(doc, 'cursor-rules', '.mdc') },
    { path: 'human.md', content: renderHumanGuide(doc) },
    ...moduleFiles(doc, '.cursor/rules', '.mdc')
  ];
}

function renderClaude(doc: SkillDocument): PackageFile[] {
  return [
    { path: 'CLAUDE.md', content: `# ${escapeMarkdownBody(doc.title)}\n\n` + renderBody(doc, 'modules', '.md') },
    { path: 'human.md', content: renderHumanGuide(doc) }
  ];
}

function renderCopilot(doc: SkillDocument): PackageFile[] {
  return [
    {
      path: '.github/copilot-instructions.md',
      content: `# ${escapeMarkdownBody(doc.title)}\n\n` + renderBody(doc, 'modules', '.md')
    },
    { path: 'human.md', content: renderHumanGuide(doc) },
    ...moduleFiles(doc, 'modules', '.md')
  ];
}

function renderGeneric(doc: SkillDocument): PackageFile[] {
  return [
    {
      path: 'AGENTS.md',
      content: `# ${escapeMarkdownBody(doc.title)}\n\n` + renderBody(doc, 'agents', '.md')
    },
    { path: 'human.md', content: renderHumanGuide(doc) },
    ...moduleFiles(doc, 'agents', '.md')
  ];
}

/**
 * MCP: o conhecimento vira dado JSON e o servidor é template fixo.
 *
 * Antes o LLM escrevia o TypeScript do servidor inteiro — código executável
 * gerado por modelo, a partir de vídeo. Agora o código é nosso e o modelo só
 * preenche o `knowledge.json` que ele lê.
 */
function renderMcp(doc: SkillDocument): PackageFile[] {
  const knowledge = {
    name: doc.name,
    title: doc.title,
    goal: doc.goal,
    principles: doc.principles,
    modules: doc.modules,
    commands: doc.commands
  };

  const server = `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const knowledge = JSON.parse(
  readFileSync(fileURLToPath(new URL('./knowledge/skill.json', import.meta.url)), 'utf8')
);

const server = new McpServer({ name: ${JSON.stringify(doc.name)}, version: '1.0.0' });

server.tool('get_principles', 'Behavioral rules this skill enforces.', {}, async () => ({
  content: [{ type: 'text', text: JSON.stringify(knowledge.principles, null, 2) }]
}));

server.tool(
  'get_module',
  'Full content of one knowledge module.',
  { slug: z.string() },
  async ({ slug }) => {
    const found = knowledge.modules.find((m) => m.slug === slug);
    return {
      content: [
        { type: 'text', text: found ? JSON.stringify(found, null, 2) : \`No module "\${slug}".\` }
      ]
    };
  }
);

server.tool('list_modules', 'Available modules, by slug.', {}, async () => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify(
        knowledge.modules.map((m) => ({
          slug: m.slug,
          title: m.title,
          summary: m.summary
        })),
        null,
        2
      )
    }
  ]
}));

server.tool(
  'get_connectors',
  'MCP connectors this skill requires or recommends. Each entry has id, reason and required.',
  {},
  async () => ({
    content: [{ type: 'text', text: JSON.stringify(knowledge.connectors ?? [], null, 2) }]
  })
);

await server.connect(new StdioServerTransport());
`;

  const pkg = {
    name: doc.name,
    version: '1.0.0',
    type: 'module',
    description: doc.description,
    scripts: { start: 'node src/index.js' },
    dependencies: { '@modelcontextprotocol/sdk': '^1.0.0', zod: '^3.24.1' }
  };

  const readme = [
    `# ${escapeMarkdownBody(doc.title)} — MCP Server`,
    '',
    escapeMarkdownBody(doc.description),
    '',
    '## Install',
    '',
    fenceCode('npm install\nnpm start', 'bash'),
    '',
    '## Connect',
    '',
    'Add to your client config:',
    '',
    fenceCode(
      JSON.stringify({ mcpServers: { [doc.name]: { command: 'node', args: ['src/index.js'] } } }, null, 2),
      'json'
    ),
    ''
  ].join('\n');

  return [
    { path: 'src/index.js', content: server },
    { path: 'src/knowledge/skill.json', content: JSON.stringify(knowledge, null, 2) },
    { path: 'package.json', content: JSON.stringify(pkg, null, 2) },
    { path: 'README.md', content: readme },
    { path: 'human.md', content: renderHumanGuide(doc) }
  ];
}

const RENDERERS: Record<SkillFormat, (doc: SkillDocument) => PackageFile[]> = {
  gemini: renderGemini,
  cursor: renderCursor,
  claude: renderClaude,
  copilot: renderCopilot,
  generic: renderGeneric,
  mcp: renderMcp
};

/** Renderiza o documento para um formato. Função pura — sem rede, sem LLM. */
export function renderSkill(doc: SkillDocument, format: SkillFormat): PackageFile[] {
  return RENDERERS[format](doc);
}

/** Renderiza para todos os formatos de uma vez. Uma geração, cinco saídas. */
export function renderAllFormats(doc: SkillDocument): Record<SkillFormat, PackageFile[]> {
  return {
    gemini: renderGemini(doc),
    cursor: renderCursor(doc),
    claude: renderClaude(doc),
    copilot: renderCopilot(doc),
    generic: renderGeneric(doc),
    mcp: renderMcp(doc)
  };
}
