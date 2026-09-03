/**
 * Criação de skill pelo LLM que está do outro lado do MCP.
 *
 * A inversão que isto representa: até aqui, quem escrevia o documento era o
 * nosso Gemini, e o cliente pagava por isso em crédito. Aqui quem escreve é o
 * modelo já em execução na IDE de quem pediu — nosso custo cai para
 * armazenamento, e por isso esta porta não debita nada.
 *
 * O caminho descartado foi `sampling/createMessage`, que faria o servidor pedir
 * uma completion ao cliente. A spec o depreciou na revisão `2026-07-28`
 * mandando integrar direto com APIs de LLM, então construir em cima seria
 * apostar num recurso recém-aposentado. Decompor em tools funciona em todo
 * cliente MCP que existe hoje e não usa nada depreciado.
 *
 * Segurança: o documento aqui é conteúdo hostil por definição. Não porque o
 * LLM seja malicioso, mas porque isto é um endpoint autenticado que aceita
 * JSON — quem tem o token manda o que quiser, escrito à mão, tendo lido nosso
 * schema. Por isso nada é validado aqui: tudo vai cru para `persistirSkill`,
 * que é a única porta de escrita e carrega os quatro portões.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { db } from '../db/db.js';
import { skills } from '../db/schema.js';
import { SkillDocumentSchema } from './skill-document.js';
import { persistirSkill, DocumentoInvalidoError } from './persist-skill.js';
import { SanitizeError } from './sanitize.js';
import { resolveAccount } from './mcp-context.js';
import {
  abrirSessao, registrarEvento, fecharSessao,
  pedirFontes, estadoDaSessao, urlDeFontes,
} from './mcp-sessions.js';
import { can, normalizePlan } from './plans.js';
import { SKILL_FORMATS, type SkillFormat } from '../prompts/synthesis.js';
import { resolveChannelId, searchChannelVideos } from '../services/youtube.js';
import { skillQueue } from '../queue/queue.js';

/** Lista dos formatos, derivada do mapa que já os define. */
const FORMATS = Object.keys(SKILL_FORMATS) as SkillFormat[];

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

const texto = (t: string, erro = false): ToolResult => ({
  content: [{ type: 'text', text: t }],
  isError: erro || undefined,
});

/**
 * O JSON Schema sai do Zod, e não escrito à mão.
 *
 * Escrito à mão seriam duas definições da mesma forma: o LLM seguiria uma e a
 * gravação validaria pela outra. Elas divergiriam na primeira mudança de campo,
 * e o sintoma seria um documento que o modelo montou "certo" sendo recusado sem
 * explicação. Derivando, a allowlist de conectores e todos os tetos chegam ao
 * cliente exatamente como a validação vai cobrá-los.
 */
const ESQUEMA_DOCUMENTO = zodToJsonSchema(SkillDocumentSchema, {
  target: 'jsonSchema7',
  // Sem `$ref`: nem todo cliente MCP resolve referência interna, e o schema
  // inteiro cabe em ~3 KB de qualquer forma.
  $refStrategy: 'none',
}) as Record<string, unknown>;

export const SKILL_TOOLS = [
  {
    name: 'skiller_search_channel',
    description:
      'Busca vídeos de um canal do YouTube por palavra-chave e devolve a lista para você escolher. ' +
      'Use antes de skiller_create_from_channel quando quiser ver os resultados antes de processar, ' +
      'ou quando o usuário quiser selecionar manualmente quais vídeos incluir na skill.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        channelUrl: {
          type: 'string',
          description: 'URL do canal. Aceita qualquer formato: @handle, /channel/UCxxx, /c/nome.',
        },
        query: {
          type: 'string',
          description: 'Palavra-chave ou tema a buscar dentro do canal (ex: "tráfego pago", "copywriting").',
        },
        maxResults: {
          type: 'number',
          description: 'Máximo de vídeos a retornar (1–50). Padrão: 20.',
        },
        publishedAfter: {
          type: 'string',
          description: 'ISO 8601 — ignora vídeos anteriores a esta data (ex: "2024-01-01T00:00:00Z").',
        },
      },
      required: ['channelUrl', 'query'],
    },
  },
  {
    name: 'skiller_create_from_channel',
    description:
      'Busca vídeos de um canal do YouTube por tema e enfileira a criação de uma skill com os ' +
      'resultados. O pipeline completo roda em segundo plano: transcrição, extração por Gemini e ' +
      'síntese. Use quando o usuário quiser criar uma skill automaticamente a partir de um canal. ' +
      'Devolve o skillId para acompanhar o progresso no painel.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        channelUrl: {
          type: 'string',
          description: 'URL do canal YouTube. Aceita @handle, /channel/UCxxx, /c/nome.',
        },
        query: {
          type: 'string',
          description: 'Tema a buscar no canal (ex: "tráfego pago Google Ads").',
        },
        maxResults: {
          type: 'number',
          description: 'Máximo de vídeos a incluir (1–50). Padrão: 20.',
        },
        publishedAfter: {
          type: 'string',
          description: 'ISO 8601 — ignora vídeos anteriores a esta data.',
        },
        videoUrls: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Lista de URLs de vídeos específicos a incluir além da busca, ou em vez dela ' +
            '(se informada sem query, usa apenas estes). Útil quando skiller_search_channel ' +
            'já foi chamado e você selecionou os vídeos manualmente.',
        },
        sessionId: {
          type: 'string',
          description: 'Id devolvido por skiller_open_session, para o usuário acompanhar ao vivo.',
        },
      },
      required: ['channelUrl'],
    },
  },
  {
    name: 'skiller_request_sources',
    description:
      'Pede ao usuário que escolha as fontes (vídeos e playlists) na tela do Skiller. ' +
      'Devolve um link que abre a aba de criação já ligada a esta sessão — mostre esse link ' +
      'e AGUARDE. Depois chame skiller_session_state para ler o que a pessoa selecionou. ' +
      'Use isto em vez de pedir URLs no chat: a tela de busca faz esse trabalho melhor.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string', description: 'Id devolvido por skiller_open_session.' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'skiller_session_state',
    description:
      'Lê o estado da sessão: se ainda aguarda algo do usuário e o que ele já devolveu. ' +
      'Chame depois de skiller_request_sources para saber se as fontes chegaram.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string', description: 'Id da sessão.' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'skiller_open_session',
    description:
      'Abre uma sessão espelho e devolve um link. SEMPRE chame isto ANTES de criar uma skill, ' +
      'e mostre o link ao usuário: é por ele que a pessoa acompanha, ao vivo, o que você está ' +
      'fazendo dentro do Skiller. Passe o `sessionId` devolvido nas chamadas seguintes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'O que você vai fazer nesta sessão, em uma linha. Aparece no topo da tela.',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'skiller_create_skill',
    description:
      'Cria uma skill no Skiller a partir de um documento estruturado que VOCÊ escreve. ' +
      'Use quando o usuário pedir para transformar conhecimento em skill — de uma playlist, ' +
      'de uma documentação, de uma conversa. Você monta o documento; o Skiller valida, ' +
      'sanitiza e renderiza nos seis formatos (Claude, Cursor, Copilot, Gemini, MCP e ' +
      'genérico). Não consome créditos: o raciocínio é seu, não nosso.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document: {
          ...ESQUEMA_DOCUMENTO,
          description: 'O documento da skill. Todos os campos obrigatórios precisam vir preenchidos.',
        },
        format: {
          type: 'string',
          enum: FORMATS,
          description: 'Formato principal a renderizar. Padrão: claude.',
        },
        sourceUrl: {
          type: 'string',
          description: 'Origem do conhecimento, quando houver. Fica registrado na skill.',
        },
        sessionId: {
          type: 'string',
          description: 'Id devolvido por skiller_open_session, para o usuário acompanhar ao vivo.',
        },
      },
      required: ['document'],
    },
  },
];

/**
 * Trata as tools de skill. Devolve `null` quando o nome não é nosso, para o
 * chamador seguir tentando os outros grupos.
 */
export async function handleSkillTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  const MINHAS = [
    'skiller_create_skill', 'skiller_open_session', 'skiller_request_sources',
    'skiller_session_state', 'skiller_search_channel', 'skiller_create_from_channel',
  ];
  if (!MINHAS.includes(name)) return null;

  const conta = await resolveAccount();
  if (!conta) {
    return texto(
      'Conecte esta IDE a uma conta Skiller para criar skills. Abra Configurações > Conectores no painel.',
      true
    );
  }

  const plano = normalizePlan(conta.plan);

  // Busca de canal: retorna lista de vídeos para o agente escolher.
  if (name === 'skiller_search_channel') {
    if (!can(plano, 'connectors.mcp')) {
      return texto(`O plano atual (${plano}) não permite usar o conector.`, true);
    }
    const channelUrl = typeof args.channelUrl === 'string' ? args.channelUrl : '';
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!channelUrl) return texto('channelUrl é obrigatório.', true);
    if (!query) return texto('query é obrigatório.', true);

    const maxResults = typeof args.maxResults === 'number' ? Math.min(Math.max(args.maxResults, 1), 50) : 20;
    const publishedAfter = typeof args.publishedAfter === 'string' ? args.publishedAfter : undefined;

    const channelId = await resolveChannelId(channelUrl);
    if (!channelId) return texto(`Não foi possível resolver o channelId de "${channelUrl}". Verifique a URL.`, true);

    const videos = await searchChannelVideos(channelId, query, maxResults, { publishedAfter });
    if (videos.length === 0) return texto(`Nenhum vídeo encontrado para "${query}" neste canal.`);

    const linhas = [
      `${videos.length} vídeo(s) encontrado(s) para "${query}":`,
      '',
      ...videos.map((v, i) =>
        `${i + 1}. ${v.title}\n   ${v.url}\n   publicado: ${v.publishedAt.slice(0, 10)}`
      ),
      '',
      'Para criar uma skill com todos, use skiller_create_from_channel com a mesma channelUrl e query.',
      'Para usar uma seleção, passe as URLs escolhidas em videoUrls para skiller_create_from_channel.',
    ];
    return texto(linhas.join('\n'));
  }

  // Criação automática a partir de canal: busca + enfileira pipeline.
  if (name === 'skiller_create_from_channel') {
    if (!can(plano, 'connectors.mcp') || !can(plano, 'skill.generate')) {
      return texto(`O plano atual (${plano}) não permite criar skills pelo conector.`, true);
    }
    const channelUrl = typeof args.channelUrl === 'string' ? args.channelUrl : '';
    if (!channelUrl) return texto('channelUrl é obrigatório.', true);

    const query = typeof args.query === 'string' ? args.query.trim() : '';
    const maxResults = typeof args.maxResults === 'number' ? Math.min(Math.max(args.maxResults, 1), 50) : 20;
    const publishedAfter = typeof args.publishedAfter === 'string' ? args.publishedAfter : undefined;
    const extraUrls = Array.isArray(args.videoUrls) ? (args.videoUrls as unknown[]).filter((u): u is string => typeof u === 'string') : [];
    const sessionId = typeof args.sessionId === 'string' ? args.sessionId : null;

    await registrarEvento(sessionId, 'info', `Buscando vídeos sobre "${query || '(seleção manual)'}" no canal…`);

    let urls: string[] = [...extraUrls];

    if (query) {
      const channelId = await resolveChannelId(channelUrl);
      if (!channelId) return texto(`Não foi possível resolver o channelId de "${channelUrl}".`, true);
      const encontrados = await searchChannelVideos(channelId, query, maxResults, { publishedAfter });
      urls = [...new Set([...encontrados.map((v) => v.url), ...extraUrls])];
      await registrarEvento(sessionId, 'info', `${encontrados.length} vídeo(s) encontrado(s). Enfileirando pipeline…`);
    }

    if (urls.length === 0) return texto('Nenhum vídeo para processar. Informe query ou videoUrls.', true);

    const skillId = randomUUID();
    await db.insert(skills).values({
      id: skillId,
      userId: conta.userId,
      sourceType: 'youtube',
      sourceQuery: query || channelUrl,
      playlistUrl: channelUrl,
      targetFormat: 'claude',
      language: 'pt',
      status: 'queued',
    });

    await skillQueue.add('generate-skill', {
      skillId,
      sourceType: 'youtube',
      sourceQuery: query || channelUrl,
      urls,
      targetFormat: 'claude',
      language: 'pt',
      userId: conta.userId,
      sessionId,
    }, { jobId: skillId });

    await registrarEvento(sessionId, 'ok', `${urls.length} vídeo(s) enfileirado(s). Skill em processamento.`, { skillId, urls });
    // Não fechar a sessão aqui: o worker fechará e postará o cockpit completo quando terminar.

    return texto([
      `Skill enfileirada com ${urls.length} vídeo(s).`,
      `skillId: ${skillId}`,
      `Acompanhe o progresso no painel: /dashboard/skills/${skillId}`,
    ].join('\n'));
  }

  // Abertura de sessão: só precisa de conta e do direito ao conector. Criar
  // skill exige mais, e o portão disso fica logo abaixo.
  if (name === 'skiller_open_session') {
    if (!can(plano, 'connectors.mcp')) {
      return texto(`O plano atual (${plano}) não permite usar o conector. Assine o Starter para liberar.`, true);
    }
    const titulo = typeof args.title === 'string' ? args.title.slice(0, 200) : null;
    const s = await abrirSessao({ userId: conta.userId, title: titulo, client: 'mcp' });
    await registrarEvento(s.id, 'info', titulo ?? 'Sessão aberta.');
    return texto(
      [
        'Sessão aberta. Mostre este link ao usuário para ele acompanhar ao vivo:',
        '',
        s.url,
        '',
        `sessionId: ${s.id}`,
        'Passe este sessionId nas próximas chamadas.',
      ].join('\n')
    );
  }

  if (name === 'skiller_request_sources' || name === 'skiller_session_state') {
    if (!can(plano, 'connectors.mcp')) {
      return texto(`O plano atual (${plano}) não permite usar o conector.`, true);
    }
    const sid = typeof args.sessionId === 'string' ? args.sessionId : '';
    // Passa pelo filtro de dono antes de qualquer coisa: id de sessão é uuid,
    // e sem isto adivinhar um daria leitura da sessão de outra conta.
    const estado = await estadoDaSessao(sid, conta.userId);
    if (!estado) return texto('Sessão não encontrada nesta conta.', true);

    if (name === 'skiller_request_sources') {
      await pedirFontes(sid);
      await registrarEvento(sid, 'info', 'Aguardando o usuário escolher as fontes…');
      return texto(
        [
          'Mostre este link ao usuário e aguarde a seleção:',
          '',
          urlDeFontes(sid),
          '',
          'Depois chame skiller_session_state para ler as fontes escolhidas.',
        ].join('\n')
      );
    }

    const fontes = (estado.handoff as { sources?: string[] } | null)?.sources ?? null;
    if (estado.awaiting === 'sources') {
      return texto('Ainda aguardando o usuário escolher as fontes na tela. Tente de novo em instantes.');
    }
    if (!fontes) {
      return texto(`Sessão "${estado.title ?? sid}" · status ${estado.status} · nada pendente e nada devolvido.`);
    }
    return texto(
      [`${fontes.length} fonte(s) selecionada(s) pelo usuário:`, ...fontes.map((u) => `  ${u}`)].join('\n')
    );
  }

  // Dois portões, de propósito. `connectors.mcp` diz que esta pessoa pode falar
  // com o servidor; `skill.generate` diz que ela pode criar. Hoje os dois valem
  // a partir do Starter, mas separá-los é o que permite mover um sem o outro —
  // e `skill.generate` nunca teve portão explícito em lugar nenhum do código.
  if (!can(plano, 'connectors.mcp') || !can(plano, 'skill.generate')) {
    return texto(
      `O plano atual (${plano}) não permite criar skills pelo conector. Assine o Starter para liberar.`,
      true
    );
  }

  const formatPedido = typeof args.format === 'string' ? args.format : 'claude';
  if (!FORMATS.includes(formatPedido as SkillFormat)) {
    return texto(`Formato inválido: ${formatPedido}. Use um de: ${FORMATS.join(', ')}.`, true);
  }
  const format = formatPedido as SkillFormat;

  const sourceUrl = typeof args.sourceUrl === 'string' ? args.sourceUrl : null;
  const sessionId = typeof args.sessionId === 'string' ? args.sessionId : null;
  const skillId = randomUUID();

  await registrarEvento(sessionId, 'info', 'Validando o documento da skill…', { format, sourceUrl });

  await db.insert(skills).values({
    id: skillId,
    userId: conta.userId,
    sourceType: 'mcp',
    sourceQuery: sourceUrl,
    playlistUrl: sourceUrl,
    targetFormat: format,
    language: 'pt',
    status: 'processing',
  });

  try {
    // Cru de propósito: quem valida é a porta, não nós.
    const r = await persistirSkill({
      skillId,
      documento: args.document,
      format,
      nome: `Skill: ${skillId.slice(0, 8)}`,
      descricao: 'Criada pelo conector MCP',
    });

    const linhas = [
      `Skill criada: ${r.document.title}`,
      `id: ${skillId}`,
      `arquivo principal: ${r.mainFile.path}`,
      `arquivos: ${r.files.map((f) => f.path).join(', ')}`,
    ];
    if (r.avisos.length > 0) {
      linhas.push(
        '',
        `${r.avisos.length} aviso(s) de sanitização (não bloqueiam, mas revise):`,
        ...r.avisos.map((a) => `  ${a.field}: ${a.pattern}`)
      );
    }
    await registrarEvento(sessionId, 'ok', `Skill criada: ${r.document.title}`, {
      skillId,
      mainFile: r.mainFile.path,
      files: r.files.map((f) => f.path),
    });
    for (const a of r.avisos) {
      await registrarEvento(sessionId, 'warn', `Aviso de sanitização em ${a.field}: ${a.pattern}`);
    }
    await fecharSessao(sessionId, 'done');

    return texto(linhas.join('\n'));
  } catch (e) {
    // A linha nasceu antes da validação para ter id estável no erro. Como o
    // documento não passou, ela não vira skill — some.
    await db.delete(skills).where(eq(skills.id, skillId)).catch(() => {});

    if (e instanceof DocumentoInvalidoError) {
      await registrarEvento(sessionId, 'error', 'Documento reprovado pelo schema. Nada foi gravado.', e.detalhe);
      await fecharSessao(sessionId, 'error');
      // Devolve o detalhe do Zod: é o que permite ao modelo corrigir e tentar
      // de novo sozinho, em vez de só saber que falhou.
      return texto(
        'O documento não passou no schema. Corrija e chame de novo.\n\n' +
          JSON.stringify(e.detalhe, null, 2).slice(0, 2000),
        true
      );
    }
    if (e instanceof SanitizeError) {
      await registrarEvento(sessionId, 'error', 'Documento reprovado pela sanitização. Nada foi gravado.', e.findings);
      await fecharSessao(sessionId, 'error');
      return texto(
        'O documento foi reprovado pela sanitização e NÃO foi gravado:\n' +
          e.findings.map((f) => `  ${f.field}: ${f.pattern}`).join('\n'),
        true
      );
    }
    return texto(`Falha ao criar a skill: ${e instanceof Error ? e.message : String(e)}`, true);
  }
}
