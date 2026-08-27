import { YoutubeTranscript } from 'youtube-transcript';

export interface TranscriptResult {
  /** Linhas no formato `[123s] texto`, base do seek clicável na UI. */
  text: string;
  /** Código do idioma efetivamente usado, para gravar em `transcriptLanguage`. */
  language: string;
  source: 'youtube-transcript';
}

/**
 * Ordem de preferência. Sem isto a lib pega a primeira track que o YouTube
 * devolve, que em vídeos com legendas traduzidas automaticamente costuma ser
 * um idioma arbitrário — foi assim que transcrições em árabe entraram no
 * pipeline de vídeos falados em português.
 */
const PREFERRED_LANGUAGES = ['pt', 'pt-BR', 'en', 'en-US', 'es'];

/** Código impossível: força o erro que enumera as tracks realmente existentes. */
const PROBE_LANGUAGE = '__probe__';

const MAX_RETRIES = 3;

/**
 * A lib não expõe a lista de idiomas, mas a mensagem de erro de idioma
 * inválido traz "Available languages: pt, en, ar". É a única via de descoberta
 * sem uma segunda dependência.
 */
function parseAvailableLanguages(message: string): string[] {
  const match = /Available languages:\s*(.+)$/i.exec(message);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((lang) => lang.trim())
    .filter(Boolean);
}

function matchesPreference(lang: string): boolean {
  const base = lang.split('-')[0].toLowerCase();
  return PREFERRED_LANGUAGES.some((preferred) => preferred.split('-')[0].toLowerCase() === base);
}

function pickLanguage(available: string[]): string | null {
  if (available.length === 0) return null;

  // O YouTube lista a track original/padrao primeiro. Se ela ja for um idioma
  // que sabemos processar, usa-la evita cair numa traducao automatica: num video
  // falado em ingles, preferir pt-BR entregaria texto traduzido por maquina ao
  // LLM, com perda de fidelidade nos termos tecnicos.
  if (matchesPreference(available[0])) return available[0];

  // A original nao serve - foi o caso do arabe. Agora sim, ordem de preferencia.
  for (const preferred of PREFERRED_LANGUAGES) {
    const exact = available.find((lang) => lang.toLowerCase() === preferred.toLowerCase());
    if (exact) return exact;
  }
  for (const preferred of PREFERRED_LANGUAGES) {
    const base = preferred.split('-')[0].toLowerCase();
    const partial = available.find((lang) => lang.toLowerCase().startsWith(base));
    if (partial) return partial;
  }

  // Nenhuma preferida existe. Fica com a original, mas o idioma vai gravado no
  // banco para que a skill fora do idioma esperado seja rastreavel.
  return available[0];
}

async function discoverLanguage(videoId: string): Promise<string | null> {
  try {
    await YoutubeTranscript.fetchTranscript(videoId, { lang: PROBE_LANGUAGE });
    return null; // não deveria acontecer; se acontecer, seguimos sem preferência
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return pickLanguage(parseAvailableLanguages(message));
  }
}

export async function getVideoTranscript(videoId: string): Promise<TranscriptResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const language = await discoverLanguage(videoId);

      const segments = language
        ? await YoutubeTranscript.fetchTranscript(videoId, { lang: language })
        : await YoutubeTranscript.fetchTranscript(videoId);

      if (segments.length === 0) {
        throw new Error('Transcript returned zero segments');
      }

      const text = segments
        .map((segment) => {
          const seconds = Math.floor(segment.offset / 1000);
          return `[${seconds}s] ${segment.text.replace(/\n/g, ' ')}`;
        })
        .join('\n');

      console.log(
        `[Transcript] ${videoId}: ${segments.length} segmentos em "${language ?? 'default'}"`
      );

      return { text, language: language ?? 'unknown', source: 'youtube-transcript' };
    } catch (error) {
      lastError = error;
      console.warn(`[Transcript] tentativa ${attempt}/${MAX_RETRIES} falhou para ${videoId}:`, error);

      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 2 ** (attempt - 1) * 1000));
      }
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Transcript fetch failed after ${MAX_RETRIES} attempts: ${reason}`);
}
