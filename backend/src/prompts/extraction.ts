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
    Analyze the following video transcript, title, and description.
    Extract the key educational concepts, a comprehensive summary, and any important code snippets discussed.

    Video Title: ${title}
    Video Description: ${description}
    Transcript:
    ${transcript}
  `;
}
