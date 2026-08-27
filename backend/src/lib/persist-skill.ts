/**
 * A única porta de escrita de um pacote de skill.
 *
 * Por que existir: até aqui, validar → sanitizar → renderizar → conferir →
 * gravar eram cinco passos soltos dentro do worker, e funcionavam porque o
 * worker era o único caminho que gravava. No momento em que existir uma segunda
 * porta — `skiller_create_skill` no MCP, com o documento vindo do LLM do
 * cliente — repetir os cinco passos ao lado dela cria duas sequências que
 * precisam ficar em sincronia. Uma delas vai esquecer um portão, e o esquecido
 * não falha barulhento: grava conteúdo não verificado nos arquivos que outra
 * pessoa carrega dentro do agente dela.
 *
 * Fechando tudo aqui, não existe caminho por fora porque não existe caminho por
 * fora: quem quiser gravar chama esta função e passa pelos quatro portões, ou
 * não grava.
 *
 * A ordem importa e é de fora para dentro, do mais barato para o mais caro:
 *
 *   1. Estrutura  — o schema Zod. Allowlist de conectores, tetos de array,
 *                   slug estrito. É a camada que aguenta pressão, porque o
 *                   atacante não consegue emitir um campo que não existe.
 *   2. Conteúdo   — `assertDocumentSafe`. Padrão de sequestro, credencial e
 *                   shell destrutivo. É a camada FRACA: pega ataque preguiçoso,
 *                   não pega variante em outro idioma nem homóglifo. Serve como
 *                   quebra-molas e telemetria, nunca como fronteira.
 *   3. Renderização — o corpo vira dado dentro do NOSSO template, escapado.
 *                   Estrutural como a 1, e é o que o ADR-004 destrancou.
 *   4. Utilidade  — o que saiu precisa carregar uma skill de verdade.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/db.js';
import { skills } from '../db/schema.js';
import { SkillDocumentSchema, type SkillDocument } from './skill-document.js';
import { assertDocumentSafe, type SanitizeFinding } from './sanitize.js';
import { renderSkill } from './renderers.js';
import { assertSynthesisUsable, type PackageFile } from './skill-package.js';
import { buildGitPackage } from '../utils/git-indexer.js';
import type { SkillFormat } from '../prompts/synthesis.js';
import { planOf } from './entitlements.js';
import { can } from './plans.js';
import { ingestarSkillNaKb } from './kb-skill-bridge.js';

/** Erro de forma. Separado do de conteúdo para o chamador distinguir os dois. */
export class DocumentoInvalidoError extends Error {
  constructor(public readonly detalhe: unknown) {
    super('Documento de skill reprovado pelo schema.');
    this.name = 'DocumentoInvalidoError';
  }
}

export interface SkillPersistida {
  document: SkillDocument;
  files: PackageFile[];
  mainFile: PackageFile;
  /** Achados de severidade `warn`. Os bloqueantes já lançaram. */
  avisos: SanitizeFinding[];
}

export interface PedidoDePersistencia {
  skillId: string;
  /**
   * Documento CRU, de propósito.
   *
   * Aceitar `unknown` e validar aqui é o que faz o portão valer para qualquer
   * origem. Se o parâmetro fosse `SkillDocument`, o chamador poderia fazer o
   * cast e entrar já "válido" sem nunca ter passado pelo schema — que é
   * exatamente o buraco que esta função existe para fechar.
   */
  documento: unknown;
  format: SkillFormat;
  /** Cards da extração, quando a origem os produziu. */
  cards?: unknown;
  nome?: string;
  descricao?: string;
}

/**
 * Valida, sanitiza, renderiza e grava. Lança se qualquer portão reprovar, e
 * nesse caso NADA é escrito — a gravação é o último passo de propósito.
 */
export async function persistirSkill(pedido: PedidoDePersistencia): Promise<SkillPersistida> {
  // 1 — estrutura
  const parsed = SkillDocumentSchema.safeParse(pedido.documento);
  if (!parsed.success) throw new DocumentoInvalidoError(parsed.error.format());
  const document = parsed.data;

  // 2 — conteúdo. Bloqueante lança `SanitizeError`; o resto volta como aviso.
  const avisos = assertDocumentSafe(document).filter((f) => f.severity === 'warn');

  // 3 — renderização determinística, com escape do corpo
  const files = renderSkill(document, pedido.format);

  // 4 — utilidade
  const mainFile = assertSynthesisUsable({ files }, pedido.format);

  const humanMd = files.find((f) => f.path.toLowerCase() === 'human.md')?.content ?? '';

  await db
    .update(skills)
    .set({
      ...(pedido.nome ? { name: pedido.nome } : {}),
      ...(pedido.descricao ? { description: pedido.descricao } : {}),
      skillMdContent: mainFile.content,
      humanMdContent: humanMd,
      skillPackage: buildGitPackage(files),
      ...(pedido.cards === undefined ? {} : { skillJsonOutput: pedido.cards }),
      skillDocument: document,
      status: 'completed',
      updatedAt: new Date(),
    })
    .where(eq(skills.id, pedido.skillId));

  // 5 — Ponte com a Base da IA (quando o usuário tem plano Pro / capacidade `kb`)
  const [updatedSkill] = await db
    .select()
    .from(skills)
    .where(eq(skills.id, pedido.skillId))
    .limit(1);

  if (updatedSkill?.userId) {
    try {
      const plano = await planOf(updatedSkill.userId);
      if (can(plano, 'kb')) {
        await ingestarSkillNaKb(updatedSkill.userId, updatedSkill);
      }
    } catch (err) {
      console.error('[kb-bridge] Falha ao ingestar skill na Base da IA:', err);
    }
  }

  return { document, files, mainFile, avisos };
}
