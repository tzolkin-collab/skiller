import { EMPRESA, VIGENCIA, VERSAO, Dado, AvisoPendencias } from '../dados-da-empresa';
import styles from '../legal.module.css';

export const metadata = { title: 'Cancelamento e Reembolso · Skiller' };

export default function ReembolsoPage() {
  return (
    <>
      <AvisoPendencias />

      <h1>Cancelamento e Reembolso</h1>
      <p className={styles.meta}>Versão {VERSAO} · Em vigor desde {VIGENCIA}</p>

      <p>
        Esta página existe porque ninguém deve precisar advinhar como sair de uma assinatura.
        Ela também é exigida pelo processador de pagamento antes de a cobrança entrar em
        produção.
      </p>

      <h2>1. Arrependimento em 7 dias</h2>
      <p>
        O artigo 49 do Código de Defesa do Consumidor garante a você{' '}
        <strong>7 dias corridos</strong> para desistir de uma compra feita pela internet,
        contados da contratação.
      </p>
      <p>
        Dentro desse prazo devolvemos <strong>o valor integral</strong>, sem perguntar o motivo
        e sem desconto proporcional ao que já foi usado. Basta pedir.
      </p>

      <h2>2. Cancelamento a qualquer momento</h2>
      <ul>
        <li>Cancele pelo painel, em Configurações → Plano, sem falar com ninguém.</li>
        <li>Não há multa, fidelidade nem taxa de cancelamento.</li>
        <li>
          O acesso continua até o fim do período já pago. Você não perde o que contratou por
          ter cancelado no meio do ciclo.
        </li>
        <li>Passada essa data, a conta volta ao plano gratuito.</li>
      </ul>
      <p>
        <strong>Nada é apagado por cancelamento.</strong> As skills que você gerou continuam
        suas e disponíveis para baixar. O que muda é o acesso aos recursos do plano pago.
      </p>

      <h2>3. Depois dos 7 dias</h2>
      <p>
        Fora do prazo de arrependimento, a assinatura já em curso não é reembolsada — o serviço
        foi prestado no período. Cancelar impede a próxima cobrança.
      </p>
      <p>Abrimos exceção e devolvemos proporcionalmente quando:</p>
      <ul>
        <li>
          houve <strong>cobrança em duplicidade</strong> ou valor diferente do contratado;
        </li>
        <li>
          o serviço ficou <strong>indisponível por falha nossa</strong> em parte relevante do
          período pago;
        </li>
        <li>
          a cobrança foi feita <strong>depois de um cancelamento</strong> registrado.
        </li>
      </ul>
      <p>
        Nesses casos não é preciso argumentar: identificado o problema, devolvemos.
      </p>

      <h2>4. Créditos</h2>
      <p>
        Créditos são a franquia mensal do plano, recarregada a cada ciclo. Não são moeda, não
        são comprados avulsos e não são reembolsáveis em dinheiro. Crédito não usado no ciclo
        não acumula para o mês seguinte.
      </p>

      <h2>5. Plano anual</h2>
      <p>
        No plano anual o prazo de arrependimento é o mesmo: 7 dias com devolução integral.
        Depois disso, o cancelamento encerra a renovação e o acesso segue até o fim dos 12
        meses contratados.
      </p>

      <h2>6. Como pedir</h2>
      <p>
        Escreva para <Dado valor={EMPRESA.emailContato} rotulo="e-mail de contato" /> com o
        e-mail da conta e o motivo. Respondemos em até 5 dias úteis.
      </p>
      <p>
        A devolução é feita pelo mesmo meio do pagamento. O prazo de crédito na fatura depende
        do banco emissor — normalmente uma ou duas faturas para cartão.
      </p>

      <h2>7. Cobrança que você não reconhece</h2>
      <p>
        Antes de abrir contestação junto ao banco, fale conosco. Cobrança indevida nós
        devolvemos direto, e é mais rápido que o processo de <em>chargeback</em>.
      </p>
      <p className={styles.meta}>
        Nada nesta página restringe direitos que a legislação consumerista garante a você.
      </p>
    </>
  );
}
