import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { buildExtractCardPrompt } from '../prompts/extraction.js';
import { buildSynthesisPrompt, SkillFormat } from '../prompts/synthesis.js';
import { getErrorMessage } from '../lib/errors.js';

// Inicializa o GenAI. Se a chave não existir, lançaremos erro legível nas funções.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'MISSING_KEY' });

const CardSchema = z.object({
  title: z.string().describe('The main topic or title of this video segment'),
  goal: z.string().optional().describe('The overarching intent or objective of the skill extracted from this segment (e.g., "Build a scalable API"). Explain what the bot is trying to achieve.'),
  reasoning: z.string().optional().describe('The reasoning of WHY these concepts are vital to achieve the goal.'),
  setupRequirements: z.array(z.string()).optional().describe('Any environment setup, installations, or configuration steps (e.g., "npm install x", "set ENV_VAR") mentioned in the video.'),
  keyConcepts: z.array(z.string()).describe('Exhaustive list of all granular concepts, topics, formulas, and techniques explained. MUST include timestamps if available (e.g., "[120s] Concept"). Extract as many as possible.'),
  summary: z.string().describe('A detailed summary of the core message and learnings'),
  codeSnippets: z.array(z.string()).describe('Any important code snippets discussed. Empty array if none.')
});

export type ExtractedCard = z.infer<typeof CardSchema>;

const SynthesizedSkillSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    content: z.string()
  }))
});

export type PluginPackage = z.infer<typeof SynthesizedSkillSchema>;

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

function checkApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing! Please add it to your .env file. Get it for free at https://aistudio.google.com/');
  }
}

const MAX_TRANSCRIPT_LENGTH = 150000; // Aprox 30k tokens para extração rápida e barata

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      const isRateLimit = msg.includes('429') || (error && typeof error === 'object' && 'status' in error && (error as Record<string, unknown>).status === 429);
      if (isRateLimit && i < retries - 1) {
        console.warn(`Gemini Rate Limit atingido. Tentativa ${i + 1}/${retries}. Aguardando ${delayMs}ms...`);
        await new Promise(res => setTimeout(res, delayMs));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

export async function extractVideoCard(transcript: string, title: string, description: string): Promise<LlmResult<ExtractedCard>> {
  checkApiKey();
  
  let safeTranscript = transcript;
  if (safeTranscript.length > MAX_TRANSCRIPT_LENGTH) {
    console.warn(`[extractVideoCard] Transcrição muito longa (${safeTranscript.length} chars). Truncando para ${MAX_TRANSCRIPT_LENGTH}...`);
    safeTranscript = safeTranscript.substring(0, MAX_TRANSCRIPT_LENGTH) + '\n\n[TRUNCATED DUE TO LENGTH]';
  }
  
  const prompt = buildExtractCardPrompt(safeTranscript, title, description);
  
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            keyConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
            summary: { type: Type.STRING },
            codeSnippets: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['title', 'keyConcepts', 'summary', 'codeSnippets']
        },
        temperature: 0.4
      }
    });

    if (!response.text) {
        throw new Error("No output generated from Gemini");
    }

    const parsed = JSON.parse(response.text);
    return { data: CardSchema.parse(parsed), usage: readUsage(response.usageMetadata) };
  });
}

export async function synthesizeSkill(cards: ExtractedCard[], sourceTitle: string, format: SkillFormat = 'generic', language: string = 'en'): Promise<LlmResult<PluginPackage>> {
  checkApiKey();
  const cardsJson = JSON.stringify(cards, null, 2);
  const prompt = buildSynthesisPrompt(cardsJson, sourceTitle, format, language);

  console.log(`[synthesizeSkill] Synthesizing skill package in "${format}" format for "${sourceTitle}" in language "${language}"`);

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            files: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  path: { type: Type.STRING },
                  content: { type: Type.STRING }
                },
                required: ['path', 'content']
              }
            }
          },
          required: ['files']
        }
      }
    });

    if (!response.text) {
      throw new Error("No output generated from Gemini");
    }

    const json = JSON.parse(response.text);
    const packageData = SynthesizedSkillSchema.parse(json);
    console.log(`[synthesizeSkill] Synthesized package with ${packageData.files.length} files for "${sourceTitle}"`);
    return { data: packageData, usage: readUsage(response.usageMetadata) };
  });
}
