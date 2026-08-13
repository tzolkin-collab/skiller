import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { buildExtractCardPrompt } from '../prompts/extraction.js';
import { buildSynthesisPrompt, SkillFormat } from '../prompts/synthesis.js';

// Inicializa o GenAI. Se a chave não existir, lançaremos erro legível nas funções.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'MISSING_KEY' });

const CardSchema = z.object({
  title: z.string().describe('The main topic or title of this video segment'),
  keyConcepts: z.array(z.string()).describe('List of key concepts explained'),
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
    } catch (error: any) {
      const isRateLimit = error?.status === 429 || error?.message?.includes('429');
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

export async function extractVideoCard(transcript: string, title: string, description: string): Promise<ExtractedCard> {
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
        temperature: 0.2
      }
    });

    if (!response.text) {
        throw new Error("No output generated from Gemini");
    }

    const parsed = JSON.parse(response.text);
    return CardSchema.parse(parsed);
  });
}

export async function synthesizeSkill(cards: ExtractedCard[], sourceTitle: string, format: SkillFormat = 'generic', language: string = 'en'): Promise<PluginPackage> {
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
    return packageData;
  });
}
