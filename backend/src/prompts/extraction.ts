/**
 * Prompts for the per-video "map" step of the pipeline (PRD F05).
 * AGENTS.md rule 4: prompts live here, never inline in services.
 */

/** Regras comuns às duas entradas (transcrição em texto ou o próprio vídeo). */
function extractionRules(timestampSource: string, paragraphsSource: string): string {
  return `
    You are an expert technical indexer and knowledge extractor.
    You MUST NOT provide a superficial high-level summary. Instead, you must act as an EXHAUSTIVE INDEXER.

    CRITICAL RULES:
    1. EXTRACT EVERYTHING: Do not skip granular details, secondary topics, code snippets, formulas, or niche explanations. If the video is 1 hour long, I expect dozens of key concepts, not just 5.
    2. BE SPECIFIC: Avoid generic concepts like "Introduction to Python". Use specific concepts like "Python list comprehension syntax and memory efficiency".
    3. USE TIMESTAMPS: Whenever possible, prefix the key concept with the timestamp where it occurs (e.g., "[120s] Initializing the WebGL Context"). ${timestampSource}
    4. SETUP & INSTALLATION: If the speaker provides a tutorial on installing tools, configuring environments, or setting environment variables, you MUST explicitly extract these as \`setupRequirements\`.
    5. COMPREHENSIVE SUMMARY: The summary should read like a detailed technical article covering the entire video's narrative arc.
    6. TRANSCRIPT PARAGRAPHS: ${paragraphsSource} Each paragraph should cover a meaningful block of time and text. If a paragraph is a turning point in the explanation (a key definition, a decisive result, or the moment a concept clicks), mark \`isImportant\` as true so the reader can jump straight to it.`;
}

export function buildExtractCardPrompt(
  transcript: string,
  title: string,
  description: string
): string {
  return `
    ${extractionRules(
      'The transcript contains lines starting with timestamps (e.g., [120s]).',
      'You MUST group the raw transcript lines into chronological, readable paragraphs.'
    )}

    Your task is to analyze the following video transcript, title, and description.

    Video Title: ${title}
    Video Description: ${description}
    Transcript:
    ${transcript}
  `;
}

/**
 * Variante para quando não existe transcrição em texto: o vídeo vai anexado e o
 * modelo lê o áudio e os quadros. É o plano B de vídeos com legenda desativada
 * ou cuja transcrição o YouTube não entrega ao servidor.
 */
export function buildExtractCardFromVideoPrompt(
  title: string,
  description: string,
  durationSeconds?: number | null
): string {
  // Sem esta linha o modelo continuou "narrando" depois do fim: num vídeo de
  // 412 s, 7 de 24 parágrafos vieram com tempo até 652 s.
  const duration =
    durationSeconds && durationSeconds > 0
      ? `8. VIDEO LENGTH: the video lasts exactly ${Math.round(durationSeconds)} seconds. NEVER output a timestamp greater than ${Math.round(durationSeconds)}. When the video ends, stop — do not invent content for a later time.`
      : '';

  return `
    ${extractionRules(
      'There is no transcript text: the video is attached. Use the playback time of the video, in whole seconds, as the timestamp.',
      'There is no transcript text: listen to the audio and group what is said into chronological, readable paragraphs with the start and end time in seconds.'
    )}
    7. ON-SCREEN CONTENT: Text, code, slides, diagrams and terminal output shown on screen are part of the lesson. Capture them in \`keyConcepts\` and \`codeSnippets\` — do not rely only on what is spoken.
    ${duration}

    Your task is to analyze the attached video, using its title and description as context.

    Video Title: ${title}
    Video Description: ${description}
  `;
}
