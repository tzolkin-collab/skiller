import { GoogleGenAI, MediaResolution, Type, type ContentListUnion } from '@google/genai';
import { z } from 'zod';
import { buildExtractCardPrompt, buildExtractCardFromVideoPrompt } from '../prompts/extraction.js';
import { isTransientError, backoffMs, dormir } from '../lib/llm-errors.js';
import { buildSynthesisPrompt, buildRepairPrompt } from '../prompts/synthesis.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getErrorMessage } from '../lib/errors.js';
import { CONNECTOR_IDS, SKILL_NICHES, SkillDocumentSchema, type SkillDocument } from '../lib/skill-document.js';

// Inicializa o GenAI. Se a chave não existir, lançaremos erro legível nas funções.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'MISSING_KEY' });

/**
 * Modelo principal e o de reserva.
 *
 * O de reserva só entra quando o principal segue indisponível depois de todos os
 * retries (503 de "alta demanda" chegou a derrubar vídeos). Fica de fora da
 * síntese de propósito: é a etapa onde a qualidade do modelo mais pesa, e um
 * documento pior seria mais difícil de notar do que um erro.
 */
const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash-lite';

const CardSchema = z.object({
  title: z.string().describe('The main topic or title of this video segment'),
  goal: z.string().optional().describe('The overarching intent or objective of the skill extracted from this segment (e.g., "Build a scalable API"). Explain what the bot is trying to achieve.'),
  reasoning: z.string().optional().describe('The reasoning of WHY these concepts are vital to achieve the goal.'),
  setupRequirements: z.array(z.string()).optional().describe('Any environment setup, installations, or configuration steps (e.g., "npm install x", "set ENV_VAR") mentioned in the video.'),
  keyConcepts: z.array(z.string()).describe('Exhaustive list of all granular concepts, topics, formulas, and techniques explained. MUST include timestamps if available (e.g., "[120s] Concept"). Extract as many as possible.'),
  summary: z.string().describe('A detailed summary of the core message and learnings'),
  codeSnippets: z.array(z.string()).describe('Any important code snippets discussed. Empty array if none.'),
  transcriptParagraphs: z.array(z.object({
    startTime: z.number().describe('Start time in seconds of this paragraph'),
    endTime: z.number().describe('End time in seconds of this paragraph'),
    text: z.string().describe('The summarized or rewritten paragraph covering this timeframe'),
    isImportant: z.boolean().describe('Set to true when this paragraph is a turning point in the explanation - a key definition, a decisive result, or where a concept clicks - so the reader can jump straight to it.')
  })).describe('The original transcript structured and grouped into paragraphs chronologically. Each paragraph groups several lines together into a readable text.'),
  sourceUrl: z.string().optional().describe('The URL of the source material')
});

export type ExtractedCard = z.infer<typeof CardSchema>;

/**
 * Mantido apenas para o `skillPackage` já gravado no banco continuar tipado.
 * A síntese não produz mais isto diretamente — ver `lib/renderers.ts`.
 */
export interface PluginPackage {
  files: { path: string; content: string }[];
}

/** Espelha `SkillDocumentSchema` para o structured output do Gemini. */
export const SKILL_DOCUMENT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    goal: { type: Type.STRING },
    /**
     * O prompt manda classificar o nicho desde sempre — mas o campo não estava
     * declarado aqui, e o Gemini em structured output só emite o que o
     * `responseSchema` declara. O pedido era descartado na saída: 9 das 11
     * skills nasceram sem nicho, e as 2 que têm vieram por `skiller_create_skill`,
     * onde o agente escreve o documento sem passar por este schema.
     *
     * O enum vem de `SKILL_NICHES` e não de literais soltos: prompt, Zod e
     * provider precisam concordar, e três listas escritas à mão divergem.
     */
    niche: { type: Type.STRING, enum: [...SKILL_NICHES] },
    principles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { title: { type: Type.STRING }, rule: { type: Type.STRING } },
        required: ['title', 'rule']
      }
    },
    modules: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          slug: { type: Type.STRING },
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                heading: { type: Type.STRING },
                body: { type: Type.STRING },
                snippets: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      language: { type: Type.STRING },
                      code: { type: Type.STRING },
                      caption: { type: Type.STRING }
                    },
                    required: ['language', 'code']
                  }
                }
              },
              required: ['heading', 'body']
            }
          }
        },
        required: ['slug', 'title', 'summary', 'sections']
      }
    },
    connectors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, enum: [...CONNECTOR_IDS] },
          reason: { type: Type.STRING },
          required: { type: Type.BOOLEAN }
        },
        required: ['id', 'reason']
      }
    },
    commands: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          steps: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['name', 'description', 'steps']
      }
    },
    humanGuide: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        sections: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { heading: { type: Type.STRING }, body: { type: Type.STRING } },
            required: ['heading', 'body']
          }
        },
        mermaid: { type: Type.STRING }
      },
      required: ['summary']
    }
  },
  /**
   * `modules` e `niche` entraram aqui, e a ausência deles não era detalhe.
   *
   * O que o provider não exige, o modelo omite — e omitiu: 5 de 11 skills sem
   * módulo nenhum, 9 de 11 sem nicho. Medindo para onde o conteúdo ia quando
   * `modules` faltava, ele não sumia: migrava para `commands` e `humanGuide`.
   * Em `vender-saas-b2b` são 6.281 bytes de comando e 5.489 de guia contra ZERO
   * de módulo. Conhecimento de referência virou procedimento a executar e texto
   * para humano ler — dois lugares onde o agente não consulta.
   *
   * `connectors` fica fora de propósito: skill que não usa MCP nenhum é comum e
   * legítima, e forçar o campo faria o modelo inventar conector.
   */
  required: ['name', 'title', 'description', 'goal', 'niche', 'principles', 'modules', 'commands', 'humanGuide']
} as const;

/** Tokens consumed by one call, read from the provider's own accounting. */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

/** A result paired with what it cost to produce. */
export interface LlmResult<T> {
  data: T;
  usage: LlmUsage;
}

export const EMPTY_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0 };

/**
 * Preço por 1M de tokens do gemini-3.6-flash, conforme a pesquisa de stack
 * registrada no Notion. Ajuste aqui quando o provedor mudar a tabela — é o
 * único lugar que converte token em dinheiro.
 */
const PRICE_PER_1M_INPUT_USD = 1.5;
const PRICE_PER_1M_OUTPUT_USD = 7.5;

/**
 * Custo em micro-dólares (1 USD = 1_000_000).
 * Inteiro de propósito: dinheiro em float acumula erro, e a coluna guarda
 * a soma de dezenas de chamadas por job.
 */
export function usageToMicroUsd(usage: LlmUsage): number {
  const input = (usage.inputTokens / 1_000_000) * PRICE_PER_1M_INPUT_USD;
  const output = (usage.outputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT_USD;
  return Math.round((input + output) * 1_000_000);
}

export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens
  };
}

/** O SDK pode omitir `usageMetadata`; nesse caso contabilizamos zero em vez de quebrar. */
function readUsage(meta: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined): LlmUsage {
  return {
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: meta?.candidatesTokenCount ?? 0
  };
}

/**
 * Erro de parse que carrega o suficiente para consertar o prompt.
 *
 * Sem isto, uma reprovação do Zod vira uma string no log e a resposta bruta se
 * perde — que é justamente o artefato necessário para saber o que o modelo
 * realmente devolveu.
 */
export class SynthesisParseError extends Error {
  constructor(
    message: string,
    /** Campos que falharam, com caminho e código. */
    public readonly issues: { path: string; code: string; message: string }[],
    /** Resposta crua, truncada — vai para o log do pipeline. */
    public readonly rawResponse: string
  ) {
    super(message);
    this.name = 'SynthesisParseError';
  }
}

const RAW_EXCERPT_LIMIT = 20_000;

function parseSkillDocument(text: string): SkillDocument {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SynthesisParseError(
      'Resposta da síntese não é JSON válido',
      [],
      text.slice(0, RAW_EXCERPT_LIMIT)
    );
  }

  const result = SkillDocumentSchema.safeParse(json);
  if (result.success) return result.data;

  const issues = result.error.issues.map(i => ({
    path: i.path.join('.') || '(raiz)',
    code: i.code,
    message: i.message
  }));

  const resumo = issues.map(i => `${i.path}: ${i.message}`).join('; ');
  throw new SynthesisParseError(
    `Documento de skill inválido — ${resumo}`,
    issues,
    text.slice(0, RAW_EXCERPT_LIMIT)
  );
}

/**
 * Grava a resposta crua em disco quando SKILLER_RECORD_LLM=1.
 *
 * É a metade "record" do modo replay: com o arquivo salvo, iterar no prompt
 * deixa de exigir nova chamada paga. Desligado por padrão para não sujar
 * ambiente que não está sendo depurado.
 */
async function recordRawResponse(kind: string, label: string, text: string): Promise<void> {
  if (process.env.SKILLER_RECORD_LLM !== '1') return;
  try {
    const dir = path.resolve(process.cwd(), 'fixtures', kind);
    await fs.mkdir(dir, { recursive: true });
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'sem-titulo';
    const file = path.join(dir, `${Date.now()}-${slug}.json`);
    await fs.writeFile(file, text, 'utf8');
    console.log(`[record] resposta bruta salva em ${file}`);
  } catch (error: unknown) {
    console.warn('[record] não foi possível salvar a resposta bruta:', getErrorMessage(error));
  }
}

export async function extractFromGoogleSearch(query: string): Promise<{ data: ExtractedCard; usage: LlmUsage }> {
  checkApiKey();
  const prompt = `You are an expert researcher. Conduct a comprehensive web search on the following query and extract the knowledge into a structured card. 
The output MUST strictly match the provided schema.
Gather definitions, tutorials, concepts, and code snippets relevant to the query.

Query: "${query}"`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            goal: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            setupRequirements: { type: Type.ARRAY, items: { type: Type.STRING } },
            keyConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
            summary: { type: Type.STRING },
            codeSnippets: { type: Type.ARRAY, items: { type: Type.STRING } },
            transcriptParagraphs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  startTime: { type: Type.NUMBER },
                  endTime: { type: Type.NUMBER },
                  text: { type: Type.STRING },
                  isImportant: { type: Type.BOOLEAN }
                },
                required: ['startTime', 'endTime', 'text', 'isImportant']
              }
            }
          },
          required: ['title', 'keyConcepts', 'summary', 'codeSnippets', 'transcriptParagraphs']
        },
        temperature: 0.1
      }
    });

    const text = response.text;
    if (!text) throw new Error('Empty response from model');

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e: unknown) {
      throw new Error(`Invalid JSON format from Gemini: ${text}`, { cause: e });
    }

    const validation = CardSchema.safeParse(parsed);
    if (!validation.success) {
      throw new Error(`Schema mismatch from Gemini: ${validation.error.message}`);
    }

    return {
      data: validation.data,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0
      }
    };
  } catch (error: unknown) {
    throw new Error(`Failed to extract from Google Search: ${getErrorMessage(error)}`, { cause: error });
  }
}

function checkApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing! Please add it to your .env file. Get it for free at https://aistudio.google.com/');
  }
}

const MAX_TRANSCRIPT_LENGTH = 150000; // Aprox 30k tokens para extração rápida e barata

/**
 * Repete só o que tem chance de passar: sobrecarga, limite de taxa e rede.
 * Erro permanente (400, schema, política) sobe na primeira ocorrência — repetir
 * gastaria tokens para chegar ao mesmo lugar.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 4, baseMs = 2000 }: { attempts?: number; baseMs?: number } = {}
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (!isTransientError(error) || i >= attempts - 1) throw error;
      const espera = backoffMs(i, baseMs);
      console.warn(
        `[gemini] falha transitória (${getErrorMessage(error).slice(0, 120)}). ` +
          `Tentativa ${i + 1}/${attempts}; nova em ${espera}ms.`
      );
      await dormir(espera);
    }
  }
}

/**
 * Tenta o modelo principal com retries; se ele seguir indisponível, o de
 * reserva. Se o reserva também falhar, sobe o erro ORIGINAL: ele é o que
 * explica o problema, e um 404 do reserva só o esconderia.
 */
async function withModelFallback<T>(run: (model: string) => Promise<T>): Promise<T> {
  try {
    return await withRetry(() => run(PRIMARY_MODEL));
  } catch (error: unknown) {
    if (!FALLBACK_MODEL || FALLBACK_MODEL === PRIMARY_MODEL || !isTransientError(error)) throw error;
    console.warn(`[gemini] ${PRIMARY_MODEL} segue indisponível; tentando ${FALLBACK_MODEL}.`);
    try {
      return await withRetry(() => run(FALLBACK_MODEL), { attempts: 2 });
    } catch (fallbackError: unknown) {
      console.warn(`[gemini] o modelo de reserva também falhou: ${getErrorMessage(fallbackError).slice(0, 120)}`);
      throw error;
    }
  }
}

/**
 * Forma do card no provider. Um só lugar: com structured output o Gemini só
 * preenche campos declarados aqui — `goal` e `setupRequirements`, opcionais no
 * Zod, chegariam sempre nulos sem esta declaração, e a síntese perderia a
 * âncora de intenção.
 */
const CARD_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    goal: { type: Type.STRING },
    setupRequirements: { type: Type.ARRAY, items: { type: Type.STRING } },
    keyConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING },
    codeSnippets: { type: Type.ARRAY, items: { type: Type.STRING } },
    transcriptParagraphs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          startTime: { type: Type.NUMBER },
          endTime: { type: Type.NUMBER },
          text: { type: Type.STRING },
          isImportant: { type: Type.BOOLEAN }
        },
        required: ['startTime', 'endTime', 'text', 'isImportant']
      }
    }
  },
  required: ['title', 'goal', 'keyConcepts', 'summary', 'codeSnippets', 'transcriptParagraphs']
};

/** Uma chamada de extração, contra o modelo indicado. */
async function generateCard(
  model: string,
  contents: ContentListUnion,
  label: string,
  extraConfig: { mediaResolution?: MediaResolution } = {}
): Promise<LlmResult<ExtractedCard>> {
  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      responseMimeType: 'application/json',
      responseSchema: CARD_RESPONSE_SCHEMA,
      temperature: 0.4,
      ...extraConfig
    }
  });

  if (!response.text) {
    throw new Error('No output generated from Gemini');
  }

  await recordRawResponse('extraction', label, response.text);

  const parsed = JSON.parse(response.text);
  return { data: CardSchema.parse(parsed), usage: readUsage(response.usageMetadata) };
}

export async function extractVideoCard(transcript: string, title: string, description: string): Promise<LlmResult<ExtractedCard>> {
  checkApiKey();

  let safeTranscript = transcript;
  if (safeTranscript.length > MAX_TRANSCRIPT_LENGTH) {
    console.warn(`[extractVideoCard] Transcrição muito longa (${safeTranscript.length} chars). Truncando para ${MAX_TRANSCRIPT_LENGTH}...`);
    safeTranscript = safeTranscript.substring(0, MAX_TRANSCRIPT_LENGTH) + '\n\n[TRUNCATED DUE TO LENGTH]';
  }

  const prompt = buildExtractCardPrompt(safeTranscript, title, description);

  return withModelFallback((model) => generateCard(model, prompt, title));
}

/**
 * Extrai o card lendo o VÍDEO, sem transcrição em texto.
 *
 * Plano B para quando `getVideoTranscript` falha — legenda desativada ou IP do
 * servidor bloqueado pelo YouTube, as duas causas medidas nas falhas de
 * produção. O Gemini aceita a URL de um vídeo público e processa áudio e
 * quadros, então também lê o que aparece na tela.
 *
 * Bem mais caro em tokens que a transcrição (~100 tokens/s de vídeo contra ~3–4
 * tokens/s de fala transcrita), por isso é só reserva: o chamador limita a
 * duração antes de vir para cá.
 */
export async function extractVideoCardFromUrl(
  videoId: string,
  title: string,
  description: string,
  durationSeconds?: number | null
): Promise<LlmResult<ExtractedCard>> {
  checkApiKey();

  const contents: ContentListUnion = [
    {
      role: 'user',
      parts: [
        { fileData: { fileUri: `https://www.youtube.com/watch?v=${videoId}` } },
        { text: buildExtractCardFromVideoPrompt(title, description, durationSeconds) }
      ]
    }
  ];

  // Resolução baixa: ~100 tokens/s em vez de ~300, sem perda relevante para
  // fala e slides — e é o que mantém uma hora de vídeo dentro do contexto.
  return withModelFallback((model) =>
    generateCard(model, contents, title, { mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW })
  );
}

/**
 * Sintetiza o documento estruturado. Não recebe mais `format`: o formato é
 * decidido na renderização, então uma geração serve os cinco.
 */
export async function synthesizeSkill(
  cards: ExtractedCard[],
  sourceTitle: string,
  language: string = 'en'
): Promise<LlmResult<SkillDocument>> {
  // Defesa-em-profundidade: o worker já chama assertCardsUsable, mas qualquer
  // chamador direto (script, teste, outro worker) também precisa desta guarda.
  if (cards.length === 0) {
    throw new Error(
      'synthesizeSkill chamada com zero cards — recusando produzir uma skill de nada'
    );
  }

  checkApiKey();
  const cardsJson = JSON.stringify(cards, null, 2);
  const prompt = buildSynthesisPrompt(cardsJson, sourceTitle, language);

  console.log(`[synthesizeSkill] Synthesizing skill document for "${sourceTitle}" (humanGuide in "${language}")`);

  const config = {
    temperature: 0.3,
    responseMimeType: 'application/json',
    responseSchema: SKILL_DOCUMENT_RESPONSE_SCHEMA
  };

  return withRetry(async () => {
    const response = await ai.models.generateContent({ model: PRIMARY_MODEL, contents: prompt, config });

    if (!response.text) {
      throw new Error('No output generated from Gemini');
    }

    await recordRawResponse('synthesis', sourceTitle, response.text);

    let usage = readUsage(response.usageMetadata);

    try {
      // O structured output do provedor garante a forma; o Zod garante o
      // conteúdo — tamanho mínimo, slug válido, conector dentro da allowlist.
      const document = requireModules(parseSkillDocument(response.text), true);
      return { data: document, usage: logSynthesis(document, usage) };
    } catch (error: unknown) {
      // JSON quebrado não tem o que consertar; só reprovação de conteúdo.
      if (!(error instanceof SynthesisParseError) || error.issues.length === 0) throw error;

      console.warn(`[synthesizeSkill] documento reprovado (${error.message}); pedindo correção ao modelo…`);

      // Devolve ao modelo a resposta dele e a lista exata do que falhou, em vez
      // de descartar a execução: uma reprovação por `reason` com 201 caracteres
      // custou US$ 0,11 e 7 minutos e terminava sem skill.
      const repair = await ai.models.generateContent({
        model: PRIMARY_MODEL,
        contents: [
          { role: 'user', parts: [{ text: prompt }] },
          { role: 'model', parts: [{ text: response.text }] },
          { role: 'user', parts: [{ text: buildRepairPrompt(error.issues) }] }
        ],
        config
      });

      if (!repair.text) throw error;

      await recordRawResponse('synthesis-repair', sourceTitle, repair.text);
      usage = addUsage(usage, readUsage(repair.usageMetadata));

      // Na segunda passada `modules` vazio vira aviso, não erro: perder a
      // execução inteira por isso seria pior que entregar uma skill sem módulos.
      const document = requireModules(parseSkillDocument(repair.text), false);
      return { data: document, usage: logSynthesis(document, usage) };
    }
  });
}

/**
 * `modules` é onde o agente CONSULTA conhecimento. O schema aceita lista vazia
 * (skills criadas à mão pelo MCP podem não ter módulo), então a exigência vive
 * só na síntese: as duas skills mais recentes do banco saíram com zero módulos
 * — 15 princípios e 4 comandos, nenhum conhecimento de referência.
 */
function requireModules(document: SkillDocument, strict: boolean): SkillDocument {
  if (document.modules.length > 0) return document;

  if (!strict) {
    console.warn('[synthesizeSkill] documento sem módulos mesmo após a correção; seguindo assim.');
    return document;
  }

  throw new SynthesisParseError(
    'Documento de skill inválido — modules: precisa de ao menos 1 módulo',
    [{ path: 'modules', code: 'too_small', message: 'must contain at least 1 module' }],
    JSON.stringify(document).slice(0, RAW_EXCERPT_LIMIT)
  );
}

function logSynthesis(document: SkillDocument, usage: LlmUsage): LlmUsage {
  console.log(
    `[synthesizeSkill] Document "${document.name}": ${document.principles.length} principles, ` +
      `${document.modules.length} modules, ${document.commands.length} commands`
  );
  return usage;
}

