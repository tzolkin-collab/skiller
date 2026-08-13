import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { buildExtractCardPrompt } from '../prompts/extraction.js';
import { buildSynthesisPrompt, SkillFormat } from '../prompts/synthesis.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const CardSchema = z.object({
  title: z.string().describe('The main topic or title of this video segment'),
  keyConcepts: z.array(z.string()).describe('List of key concepts explained'),
  summary: z.string().describe('A detailed summary of the core message and learnings'),
  codeSnippets: z.array(z.string()).describe('Any important code snippets discussed, formatted in markdown. Use empty array if none.')
});

export type ExtractedCard = z.infer<typeof CardSchema>;

const SynthesizedSkillSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    content: z.string()
  }))
});

export type PluginPackage = z.infer<typeof SynthesizedSkillSchema>;

export async function extractVideoCard(transcript: string, title: string, description: string): Promise<ExtractedCard> {
  const prompt = buildExtractCardPrompt(transcript, title, description);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an extraction AI. You must ALWAYS reply with valid JSON ONLY.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    });

    const content = response.choices[0].message.content;
    if (!content) {
        throw new Error("No output generated from OpenAI");
    }

    return CardSchema.parse(JSON.parse(content));
  } catch (error) {
    console.error('Failed to extract video card via OpenAI:', error);
    throw error;
  }
}

export async function synthesizeSkill(cards: ExtractedCard[], sourceTitle: string, format: SkillFormat = 'generic'): Promise<PluginPackage> {
  const cardsJson = JSON.stringify(cards, null, 2);
  const prompt = buildSynthesisPrompt(cardsJson, sourceTitle, format);

  console.log(`[synthesizeSkill] Synthesizing skill package in "${format}" format for "${sourceTitle}"`);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a synthesis AI. You must ALWAYS reply with valid JSON ONLY matching the requested structure.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No output generated from OpenAI");
    }

    const packageData = SynthesizedSkillSchema.parse(JSON.parse(content));
    console.log(`[synthesizeSkill] Synthesized package with ${packageData.files.length} files for "${sourceTitle}"`);
    return packageData;
  } catch (error) {
    console.error('Failed to synthesize skill package via OpenAI:', error);
    throw error;
  }
}
