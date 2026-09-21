/**
 * Do vídeo ao card: transcrição primeiro, leitura direta do vídeo como reserva.
 *
 * Separado do worker porque a decisão "o que fazer quando a transcrição falha"
 * é a parte que mais mudou de mão e a mais difícil de conferir dentro de um
 * job de fila (Redis, banco, BullMQ). Aqui as dependências entram por
 * parâmetro, e o teste roda sem rede.
 *
 * A ordem é de custo: transcrição em texto custa ~3–4 tokens por segundo de
 * vídeo; ler o vídeo custa ~100. Só se paga a leitura quando a transcrição
 * realmente não veio.
 */
import type { ExtractedCard, LlmResult, LlmUsage } from '../services/gemini.js';
import type { TranscriptResult } from '../services/transcript.js';
import { getErrorMessage } from './errors.js';
import { PermanentJobError, isTransientError } from './llm-errors.js';

export interface VideoParaCard {
  videoId: string;
  title: string;
  description: string;
}

export interface DependenciasDoCard {
  buscarTranscricao(videoId: string): Promise<TranscriptResult>;
  extrairDoTexto(transcricao: string, titulo: string, descricao: string): Promise<LlmResult<ExtractedCard>>;
  extrairDoVideo(
    videoId: string,
    titulo: string,
    descricao: string,
    duracaoEmSegundos: number | null
  ): Promise<LlmResult<ExtractedCard>>;
  duracaoEmSegundos(videoId: string): Promise<number | null>;
  /** Acima disto o plano B não é tentado: custaria mais do que a skill vale. */
  limiteDoPlanoBEmSegundos: number;
  /**
   * Chamado assim que a transcrição chega, ANTES do LLM. Quem chama grava o
   * texto: se a extração falhar depois, a transcrição fica guardada para
   * diagnóstico em vez de se perder junto com o erro.
   */
  aoTerTranscricao?(transcricao: TranscriptResult): Promise<void>;
}

export interface CardDoVideo {
  card: ExtractedCard;
  usage: LlmUsage;
  /** Por qual caminho o card saiu. Vai para o log do pipeline. */
  via: 'transcript' | 'video-url';
  /** Presente só quando houve transcrição em texto. */
  transcricao: TranscriptResult | null;
  /** Por que a transcrição falhou, quando o plano B foi usado. */
  motivoDoPlanoB?: string;
  /** Itens (parágrafos + conceitos) descartados por estarem além do fim do vídeo. */
  descartadosAlemDoFim?: number;
}

/**
 * Descarta o que o modelo situou DEPOIS do fim do vídeo.
 *
 * Medido no plano B real: num vídeo de 412 s, 7 de 24 parágrafos e 4 de 20
 * conceitos vieram com tempo até 652 s — conteúdo inventado para um trecho que
 * não existe, com link de "pular para" que aponta para o nada. O prompt já
 * informa a duração; isto é a rede de segurança para quando o modelo ignora.
 *
 * Só se aplica ao plano B: na transcrição, os tempos vêm do próprio texto.
 */
export function limitarAoVideo(
  card: ExtractedCard,
  duracao: number,
  toleranciaSegundos = 3
): { card: ExtractedCard; descartados: number } {
  const limite = duracao + toleranciaSegundos;

  const paragrafos = card.transcriptParagraphs
    .filter((p) => p.startTime <= limite)
    .map((p) => (p.endTime > duracao ? { ...p, endTime: duracao } : p));

  const conceitos = card.keyConcepts.filter((k) => {
    const m = /^\[(\d+)s\]/.exec(k);
    return !m || Number(m[1]) <= limite;
  });

  const descartados =
    card.transcriptParagraphs.length - paragrafos.length + (card.keyConcepts.length - conceitos.length);

  return { card: { ...card, transcriptParagraphs: paragrafos, keyConcepts: conceitos }, descartados };
}

export async function cardDoVideo(video: VideoParaCard, deps: DependenciasDoCard): Promise<CardDoVideo> {
  let transcricao: TranscriptResult;

  try {
    transcricao = await deps.buscarTranscricao(video.videoId);
  } catch (erroDaTranscricao: unknown) {
    const motivo = getErrorMessage(erroDaTranscricao, 'transcrição indisponível');
    return planoB(video, deps, motivo);
  }

  await deps.aoTerTranscricao?.(transcricao);

  // Extração com a transcrição em mãos. Falha aqui NÃO cai no plano B: o
  // problema não é falta de texto, e ler o vídeo inteiro custaria ~30× mais
  // para tentar de novo o que provavelmente é sobrecarga do mesmo modelo.
  const r = await deps.extrairDoTexto(transcricao.text, video.title, video.description);
  return { card: r.data, usage: r.usage, via: 'transcript', transcricao };
}

async function planoB(video: VideoParaCard, deps: DependenciasDoCard, motivo: string): Promise<CardDoVideo> {
  // Se a duração não puder ser lida, tenta assim mesmo: bloquear o plano B por
  // uma falha da API de metadados seria trocar uma falha por outra.
  const duracao = await deps.duracaoEmSegundos(video.videoId).catch(() => null);

  if (duracao !== null && duracao > deps.limiteDoPlanoBEmSegundos) {
    throw new PermanentJobError(
      `Sem transcrição (${motivo}) e o vídeo tem ${Math.round(duracao / 60)} min, acima do limite de ` +
        `${Math.round(deps.limiteDoPlanoBEmSegundos / 60)} min para leitura direta.`
    );
  }

  try {
    const r = await deps.extrairDoVideo(video.videoId, video.title, video.description, duracao);

    let card = r.data;
    let descartadosAlemDoFim = 0;
    if (duracao !== null) {
      const limitado = limitarAoVideo(card, duracao);
      card = limitado.card;
      descartadosAlemDoFim = limitado.descartados;
      if (descartadosAlemDoFim > 0) {
        console.warn(
          `[video-card] ${video.videoId}: ${descartadosAlemDoFim} item(ns) além do fim do vídeo (${duracao}s) descartado(s).`
        );
      }
    }

    return {
      card,
      usage: r.usage,
      via: 'video-url',
      transcricao: null,
      motivoDoPlanoB: motivo,
      ...(descartadosAlemDoFim > 0 ? { descartadosAlemDoFim } : {})
    };
  } catch (erroDoPlanoB: unknown) {
    // Sobrecarga do modelo passa sozinha: sobe como veio, para a fila repetir.
    if (isTransientError(erroDoPlanoB)) throw erroDoPlanoB;

    // O resto (vídeo privado, política, entrada inválida) não melhora com nova
    // tentativa — e a mensagem precisa dizer as DUAS falhas, senão o log
    // mostra só a última e esconde por que a transcrição não serviu.
    throw new PermanentJobError(
      `Transcrição indisponível (${motivo}) e a leitura direta do vídeo também falhou: ${getErrorMessage(erroDoPlanoB)}`,
      { cause: erroDoPlanoB }
    );
  }
}
