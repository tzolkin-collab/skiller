import React, { useState } from 'react';
import { useCart } from '@/components/providers/CartProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/session';
import styles from './FloatingCart.module.css';
import { Button } from '@/components/ui/Button/Button';
import { BASE_URL } from '@/lib/api-base';

export function FloatingCart({ language = 'en', editSkillId }: { language?: string, editSkillId?: string }) {
  const { selectedUrls, clearCart } = useCart();
  const [loading, setLoading] = useState(false);
  /**
   * A geração não pergunta mais o formato.
   *
   * Renderizar é função pura sobre o documento estruturado que a síntese grava —
   * sem rede, sem LLM, sem custo. Escolher antes amarrava uma saída só a uma
   * decisão tomada cedo demais, e mudar de ideia exigia gerar tudo de novo.
   * Agora sai em AGENTS.md, o formato que qualquer agente lê, e a troca para
   * Cursor, Claude, Copilot, Gemini ou MCP acontece no download.
   */
  const targetFormat = 'generic';
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Conta vinda da sessao do painel, nao so da query string.
  const { userId } = useSession();

  // Sessão do agente, quando a tela foi aberta pelo link que ele mandou. Muda
  // o destino do botão: em vez de gerar aqui, devolve a seleção para o agente,
  // que é quem vai decidir o que fazer com ela.
  const sessaoAgente = searchParams.get('sessao');

  if (selectedUrls.length === 0) return null;

  const handleEnviarParaAgente = async (sessao: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/sessions/${sessao}/sources`, {
        method: 'POST',
        // Cookie: a rota exige sessão no navegador e confere posse.
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: selectedUrls }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? 'Não foi possível enviar a seleção.');
      }
      clearCart();
      // Leva para a linha do tempo: é lá que a pessoa acompanha o agente
      // retomando o trabalho com as fontes que ela acabou de escolher.
      router.push(`/${language}/dashboard/sessions/${sessao}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao enviar a seleção.');
    } finally {
      setLoading(false);
    }
  };


  const handleGenerate = async () => {
    setLoading(true);
    setErro(null);
    try {
      const apiUrl = BASE_URL;
      const endpoint = `${apiUrl}/api/skills`;
      
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: selectedUrls,
          targetFormat: targetFormat,
          language: language,
          editSkillId: editSkillId
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to submit job');
      }

      const data = await res.json();
      clearCart();
      
      const querySuffix = '';
      
      if (editSkillId) {
        router.push(`/${language}/dashboard/skills/${editSkillId}${querySuffix}`);
      } else if (data && data.id) {
        router.push(`/${language}/dashboard/skills/${data.id}${querySuffix}`);
      } else {
        router.push(`/${language}/dashboard${querySuffix}`);
      }
    } catch (err: unknown) {
      console.error(err);
      setErro(err instanceof Error ? err.message : 'Falha ao processar skill.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.cartContainer}>
      <div className={styles.cartContent}>
        {erro ? <div className={styles.erro}>{erro}</div> : null}

        <div className={styles.info}>
          <span className={styles.count}>{selectedUrls.length}</span>
          <span className={styles.label}>Items Selected</span>
        </div>
        
        <div className={styles.actions}>
          <Button variant="secondary" onClick={clearCart}>
            Clear
          </Button>

          <Button
            variant="primary"
            onClick={() => (sessaoAgente ? handleEnviarParaAgente(sessaoAgente) : handleGenerate())}
            disabled={loading}
          >
            {loading
              ? 'Processing...'
              : sessaoAgente
                ? 'Enviar ao agente'
                : editSkillId
                  ? 'Adicionar fontes à Skill'
                  : 'Generate Skill'}
          </Button>
        </div>
      </div>
    </div>
  );
}
