import styles from './legal.module.css';

/**
 * Dados da controladora, num lugar só.
 *
 * Os três documentos precisam da mesma razão social, CNPJ e endereço. Repetir
 * em cada arquivo garante que um dia divirjam — e num documento legal isso não
 * é inconsistência de texto, é ambiguidade sobre quem responde.
 *
 * O que ainda falta aparece marcado NA TELA, de propósito. Um `{{CNPJ}}`
 * discreto num rodapé vira produção sem ninguém notar; um marcador vermelho no
 * meio da frase, não.
 */
export const EMPRESA = {
  nomeFantasia: 'Skiller',
  razaoSocial: null as string | null,
  cnpj: null as string | null,
  endereco: null as string | null,
  emailContato: null as string | null,
  emailPrivacidade: null as string | null,
} as const;

export const VERSAO = '2026-08-22';
export const VIGENCIA = '22 de agosto de 2026';

/** Mostra o valor, ou um marcador impossível de ignorar quando ele não existe. */
export function Dado({ valor, rotulo }: { valor: string | null; rotulo: string }) {
  if (valor) return <>{valor}</>;
  return <mark className={styles.pendente}>[PREENCHER: {rotulo}]</mark>;
}

/** Avisa que o documento ainda não pode ser publicado. */
export function AvisoPendencias() {
  const faltam = Object.entries(EMPRESA).filter(([, v]) => v === null).length;
  if (faltam === 0) return null;

  return (
    <div className={styles.aviso}>
      <strong>Este documento ainda não está pronto para publicação.</strong>
      <span>
        Faltam {faltam} dado{faltam > 1 ? 's' : ''} da empresa — razão social, CNPJ, endereço e
        e-mails de contato. Os campos marcados em vermelho ao longo do texto precisam ser
        preenchidos em <code>legal/dados-da-empresa.tsx</code> antes de o site ir ao ar.
      </span>
      <span>
        O conteúdo jurídico abaixo foi redigido para o modelo de negócio do Skiller, mas
        <strong> não substitui revisão por advogado</strong> — principalmente nas cláusulas de
        limitação de responsabilidade e de propriedade sobre o conteúdo gerado.
      </span>
    </div>
  );
}
