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

export async function extractVideoCard(transcript: string, title: string, description: string): Promise<ExtractedCard> {
  checkApiKey();
  const prompt = buildExtractCardPrompt(transcript, title, description);
  
  try {
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
  } catch (error) {
    console.error('Failed to extract video card via Gemini:', error);
    throw error;
  }
}

export async function synthesizeSkill(cards: ExtractedCard[], sourceTitle: string, format: SkillFormat = 'generic', language: string = 'en'): Promise<PluginPackage> {
  checkApiKey();
  const cardsJson = JSON.stringify(cards, null, 2);
  const prompt = buildSynthesisPrompt(cardsJson, sourceTitle, format, language);

  console.log(`[synthesizeSkill] Synthesizing skill package in "${format}" format for "${sourceTitle}" in language "${language}"`);

  try {
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
  } catch (error) {
    console.error('Failed to synthesize skill package via Gemini:', error);
    throw error;
  }
}
