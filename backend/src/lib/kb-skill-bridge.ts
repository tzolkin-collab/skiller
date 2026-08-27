/**
 * Ponte entre o Sistema de Skills e a Base da IA (Karpathy LLM-Wiki v2.0).
 *
 * Transforma o conhecimento estruturado de uma Skill (`SkillDocument` ou `SKILL.md`)
 * em páginas temáticas da wiki (`architecture/`, `workflows/`, `decisions/`, `integrations/`),
 * mantendo o Canvas visual, o Índice e o Log de auditoria sincronizados.
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../db/db.js';
import { kbPages, kbLog, type skills } from '../db/schema.js';
import {
  buildPage, pathFor, type Frontmatter, type PageType,
  upsertIndexEntry, appendLog, emptyCanvas, addCanvasNode,
  today, slugify, INDEX_PATH, LOG_PATH, CANVAS_PATH, parseFrontmatter,
} from './kb.js';
import { SkillDocumentSchema, type SkillDocument } from './skill-document.js';

export type SkillRow = typeof skills.$inferSelect;

interface PaginaGerada {
  type: PageType;
  title: string;
  slug: string;
  tags: string[];
  sources: string[];
  body: string;
}

/**
 * Converte uma skill em páginas semânticas da Base da IA.
 */
export function extrairPaginasDaSkill(skill: SkillRow): PaginaGerada[] {
  const baseTitle = skill.name || skill.playlistTitle || 'Skill Sem Nome';
  const baseSlug = slugify(baseTitle) || 'skill';
  const source = skill.playlistUrl || (skill.sourceUrls as string[])?.[0] || `skill:${skill.id}`;
  const sources = [source];
  const tags = ['skill', baseSlug];

  let doc: SkillDocument | null = null;
  if (skill.skillDocument) {
    const p = SkillDocumentSchema.safeParse(skill.skillDocument);
    if (p.success) doc = p.data;
  }

  const paginas: PaginaGerada[] = [];

  if (doc) {
    // 1. Skill Completa (pasta skills/)
    paginas.push({
      type: 'skill',
      title: `${doc.title} — Skill Principal`,
      slug: baseSlug,
      tags: [...tags, ...(doc.niche ? [doc.niche] : [])],
      sources,
      body: `## Objetivo da Skill\n\n${doc.goal}\n\n### Descrição\n\n${doc.description}\n\n### Guia Humano\n\n${doc.humanGuide?.summary ?? ''}`,
    });

    // 2. Arquitetura e Visão Geral (pasta architecture/)
    const modulosTexto = doc.modules.length > 0
      ? `### Módulos e Componentes\n\n` +
        doc.modules
          .map((m) => `#### ${m.title}\n${m.summary}\n\n` +
            m.sections.map((s) => `**${s.heading}**\n${s.body}`).join('\n\n'))
          .join('\n\n')
      : '';

    paginas.push({
      type: 'architecture',
      title: `${doc.title} — Visão Geral & Arquitetura`,
      slug: `${baseSlug}-arquitetura`,
      tags: [...tags, 'architecture', ...(doc.niche ? [doc.niche] : [])],
      sources,
      body: `## Objetivo da Skill\n\n${doc.goal}\n\n### Descrição Geral\n\n${doc.description}\n\n${modulosTexto}`,
    });

    // 2. Workflows e Resolução de Problemas
    if (doc.commands.length > 0) {
      const comandosTexto = doc.commands
        .map((cmd) => {
          const passos = cmd.steps.map((st, i) => `${i + 1}. ${st}`).join('\n');
          return `### ${cmd.name}\n**Descrição:** ${cmd.description}\n\n**Fluxo de Execução:**\n${passos}`;
        })
        .join('\n\n');

      paginas.push({
        type: 'workflow',
        title: `${doc.title} — Fluxos de Resolução e Comandos`,
        slug: `${baseSlug}-workflows`,
        tags: [...tags, 'workflows', 'resolucao'],
        sources,
        body: `## Como o Agente Opera com Esta Skill\n\nEste documento detalha o raciocínio operacional e os passos práticos seguidos pelo agente.\n\n${comandosTexto}`,
      });
    }

    // 3. Decisões, Princípios e Regras (ADRs)
    if (doc.principles.length > 0) {
      const principiosTexto = doc.principles
        .map((p, i) => `### ADR-${String(i + 1).padStart(3, '0')}: ${p.title}\n${p.rule}`)
        .join('\n\n');

      paginas.push({
        type: 'decision',
        title: `${doc.title} — Decisões Técnicas e Princípios`,
        slug: `${baseSlug}-decisoes`,
        tags: [...tags, 'decisions', 'regras'],
        sources,
        body: `## Decisões Técnicas e Padrões Obrigatórios\n\nRegras que o agente deve obedecer ao raciocinar e construir soluções baseadas nesta skill.\n\n${principiosTexto}`,
      });
    }

    // 4. Integrações e Conectores
    if (doc.connectors.length > 0) {
      const conectoresTexto = doc.connectors
        .map((c) => `- **${c.id}** (${c.required ? 'Obrigatório' : 'Opcional'}): ${c.reason}`)
        .join('\n');

      paginas.push({
        type: 'integration',
        title: `${doc.title} — Integrações e Conectores`,
        slug: `${baseSlug}-integracoes`,
        tags: [...tags, 'integrations', 'mcp'],
        sources,
        body: `## Conectores Utilizados\n\nFerramentas de ambiente que o agente utiliza para executar as tarefas desta skill:\n\n${conectoresTexto}`,
      });
    }
  } else {
    // Fallback para skills antigas em markdown puro
    const content = skill.skillMdContent || skill.description || 'Sem conteúdo detalhado.';
    paginas.push({
      type: 'architecture',
      title: `${baseTitle} — Síntese da Skill`,
      slug: `${baseSlug}-sintese`,
      tags,
      sources,
      body: `## Contexto e Diretrizes\n\n${content}`,
    });
  }

  return paginas;
}

/**
 * Ingesta o conhecimento de uma Skill na Base da IA do usuário.
 * Mantém páginas, índice, log e canvas atômicos.
 */
export async function ingestarSkillNaKb(userId: string, skill: SkillRow): Promise<number> {
  const paginas = extrairPaginasDaSkill(skill);
  if (paginas.length === 0) return 0;

  const data = today();

  // Lê estruturas existentes
  const indexRow = (await db
    .select({ content: kbPages.content })
    .from(kbPages)
    .where(and(eq(kbPages.userId, userId), eq(kbPages.path, INDEX_PATH)))
    .limit(1))[0];

  const logRow = (await db
    .select({ content: kbPages.content })
    .from(kbPages)
    .where(and(eq(kbPages.userId, userId), eq(kbPages.path, LOG_PATH)))
    .limit(1))[0];

  const canvasRow = (await db
    .select({ content: kbPages.content })
    .from(kbPages)
    .where(and(eq(kbPages.userId, userId), eq(kbPages.path, CANVAS_PATH)))
    .limit(1))[0];

  let currentIndex = indexRow?.content ?? '# Índice da Base da IA\n';
  let currentLog = logRow?.content ?? '# Log de Alterações\n';
  let currentCanvas = emptyCanvas();
  if (canvasRow?.content) {
    try {
      currentCanvas = JSON.parse(canvasRow.content);
    } catch {}
  }

  for (const pag of paginas) {
    const path = pathFor(pag.type, pag.slug);
    const fm: Frontmatter = {
      title: pag.title,
      type: pag.type,
      tags: pag.tags,
      sources: pag.sources,
      created: data,
      updated: data,
      status: 'active',
    };

    const fullContent = buildPage(fm, pag.body);

    // 1. Grava página
    await db
      .insert(kbPages)
      .values({
        userId,
        path,
        content: fullContent,
        title: pag.title,
        type: pag.type,
        status: 'active',
        tags: pag.tags,
      })
      .onConflictDoUpdate({
        target: [kbPages.userId, kbPages.path],
        set: {
          content: fullContent,
          title: pag.title,
          type: pag.type,
          status: 'active',
          tags: pag.tags,
          updatedAt: new Date(),
        },
      });

    // 2. Atualiza índice
    currentIndex = upsertIndexEntry(currentIndex, fm, path);

    // 3. Atualiza log
    currentLog = appendLog(currentLog, data, 'ingest', pag.title, 'skill-pipeline');

    // 4. Atualiza canvas
    currentCanvas = addCanvasNode(currentCanvas, path, pag.title, data);

    // 5. Registra auditoria
    await db.insert(kbLog).values({
      userId,
      action: 'ingest-skill',
      pagePath: path,
      summary: `Ingestão automática de ${skill.name || 'Skill'}: ${pag.title}`,
      channel: 'skill-pipeline',
    });
  }

  // Grava as estruturas mestras atualizadas
  await db
    .insert(kbPages)
    .values({ userId, path: INDEX_PATH, content: currentIndex, title: 'Índice' })
    .onConflictDoUpdate({
      target: [kbPages.userId, kbPages.path],
      set: { content: currentIndex, updatedAt: new Date() },
    });

  await db
    .insert(kbPages)
    .values({ userId, path: LOG_PATH, content: currentLog, title: 'Log' })
    .onConflictDoUpdate({
      target: [kbPages.userId, kbPages.path],
      set: { content: currentLog, updatedAt: new Date() },
    });

  await db
    .insert(kbPages)
    .values({ userId, path: CANVAS_PATH, content: JSON.stringify(currentCanvas), title: 'Canvas' })
    .onConflictDoUpdate({
      target: [kbPages.userId, kbPages.path],
      set: { content: JSON.stringify(currentCanvas), updatedAt: new Date() },
    });

  return paginas.length;
}
