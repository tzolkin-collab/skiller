/**
 * Prompt for the per-video "map" step of the pipeline (PRD F05).
 * AGENTS.md rule 4: prompts live here, never inline in services.
 */
export function buildExtractCardPrompt(
  transcript: string,
  title: string,
  description: string
): string {
  return `
    You are an expert technical indexer and knowledge extractor. Your task is to analyze the following video transcript, title, and description.
    You MUST NOT provide a superficial high-level summary. Instead, you must act as an EXHAUSTIVE INDEXER.

    CRITICAL RULES:
    1. EXTRACT EVERYTHING: Do not skip granular details, secondary topics, code snippets, formulas, or niche explanations. If the video is 1 hour long, I expect dozens of key concepts, not just 5.
    2. BE SPECIFIC: Avoid generic concepts like "Introduction to Python". Use specific concepts like "Python list comprehension syntax and memory efficiency".
    3. USE TIMESTAMPS: Whenever possible, prefix the key concept with the timestamp where it occurs (e.g., "[120s] Initializing the WebGL Context"). The transcript contains lines starting with timestamps (e.g., [120s]).
    4. SETUP & INSTALLATION: If the speaker provides a tutorial on installing tools, configuring environments, or setting environment variables, you MUST explicitly extract these as \`setupRequirements\`.
    5. COMPREHENSIVE SUMMARY: The summary should read like a detailed technical article covering the entire video's narrative arc.

    Video Title: ${title}
    Video Description: ${description}
    Transcript:
    ${transcript}
  `;
}
