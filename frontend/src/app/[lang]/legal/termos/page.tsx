import { EMPRESA, VIGENCIA, VERSAO, Dado, AvisoPendencias } from '../dados-da-empresa';
import styles from '../legal.module.css';

export const metadata = { title: 'Termos de Uso · Skiller' };

export default function TermosPage() {
  return (
    <>
      <AvisoPendencias />

      <h1>Termos de Uso</h1>
      <p className={styles.meta}>Versão {VERSAO} · Em vigor desde {VIGENCIA}</p>

      <p>
        Estes Termos regem o uso do Skiller, serviço operado por{' '}
        <strong><Dado valor={EMPRESA.razaoSocial} rotulo="razão social" /></strong>, inscrita no
        CNPJ sob o nº <Dado valor={EMPRESA.cnpj} rotulo="CNPJ" />, com sede em{' '}
        <Dado valor={EMPRESA.endereco} rotulo="endereço" /> (&ldquo;nós&rdquo;).
      </p>
      <p>
        Ao criar uma conta você concorda com estes Termos. Se não concordar, não use o serviço.
      </p>

      <h2>1. O que o Skiller faz</h2>
      <p>
        O Skiller transforma conteúdo em material estruturado para agentes de inteligência
        artificial — as chamadas <em>skills</em> — e permite conectá-las a clientes de IA
        através do protocolo MCP. Você fornece as fontes; nós processamos e devolvemos o
        artefato.
      </p>
      <p>
        O serviço depende de terceiros para funcionar (provedores de modelo de linguagem,
        APIs de conteúdo, processador de pagamento). Indisponibilidade desses terceiros
        afeta o Skiller, e nem sempre está sob nosso controle.
      </p>

      <h2>2. Sua conta</h2>
      <p>
        Você precisa ter 18 anos ou mais, ou autorização de responsável legal. As informações
        do cadastro devem ser verdadeiras e atualizadas.
      </p>
      <p>
        Você é responsável pelo que acontece na sua conta. Guarde suas credenciais e avise-nos
        em caso de acesso não autorizado. Nós nunca pedimos sua senha por e-mail, telefone ou
        mensagem.
      </p>

      <h2>3. Planos, cobrança e créditos</h2>
      <ul>
        <li>
          O plano gratuito não exige cartão. Os planos pagos são cobrados de forma recorrente,
          mensal ou anual, conforme a escolha no momento da contratação.
        </li>
        <li>
          Cada plano inclui uma franquia mensal de créditos, consumidos ao gerar skills. A
          franquia é <strong>recarregada</strong> a cada ciclo pago, não acumulada.
        </li>
        <li>
          A renovação é automática. Você pode cancelar a qualquer momento, sem multa, e o
          acesso continua até o fim do período já pago.
        </li>
        <li>
          Preços podem mudar. Alteração de preço não afeta o ciclo já pago, e avisamos por
          e-mail com pelo menos 30 dias de antecedência.
        </li>
        <li>
          Se a cobrança falhar, tentamos novamente por alguns dias antes de rebaixar a conta
          para o plano gratuito. Avisamos por e-mail antes disso.
        </li>
      </ul>
      <p>
        O pagamento é processado pela Stripe. Não recebemos nem armazenamos o número do seu
        cartão — ele fica com o processador.
      </p>

      <h2>4. Conteúdo e propriedade</h2>
      <p>
        <strong>O que você envia continua seu.</strong> Você nos concede apenas a licença
        necessária para processar aquele material e entregar o resultado a você.
      </p>
      <p>
        <strong>O que é gerado é seu.</strong> As skills produzidas a partir das suas fontes
        pertencem a você, e você pode usá-las comercialmente. Não reivindicamos propriedade
        sobre elas.
      </p>
      <p>
        Você declara ter o direito de usar as fontes que enviar. Enviar conteúdo de terceiros
        sem autorização é responsabilidade sua, e pode levar à suspensão da conta.
      </p>
      <p>
        A marca, o código e a interface do Skiller são nossos e não são licenciados por estes
        Termos.
      </p>

      <h2>5. Uso aceitável</h2>
      <p>Você não pode usar o Skiller para:</p>
      <ul>
        <li>violar lei brasileira ou direito de terceiro, incluindo direito autoral;</li>
        <li>gerar material que promova ódio, violência, exploração de menores ou fraude;</li>
        <li>tentar contornar limites de plano, cota ou cobrança;</li>
        <li>
          acessar contas, dados ou sistemas que não sejam seus, ou sondar a infraestrutura em
          busca de falhas sem autorização prévia por escrito;
        </li>
        <li>revender o acesso ao serviço como se fosse seu, sem contrato específico conosco.</li>
      </ul>
      <p>
        Podemos suspender uma conta que descumpra estas regras. Quando não houver risco
        imediato, avisamos antes e damos prazo para correção.
      </p>

      <h2>6. Resultados gerados por inteligência artificial</h2>
      <p>
        O Skiller usa modelos de linguagem. Eles erram, inventam e podem produzir material
        impreciso ou inadequado ao seu caso. <strong>Confira o resultado antes de usar</strong>,
        especialmente em contexto profissional, jurídico, médico ou financeiro.
      </p>
      <p>
        Não garantimos que o material gerado seja correto, completo, original ou adequado a
        qualquer finalidade específica.
      </p>

      <h2>7. Limitação de responsabilidade</h2>
      <p>
        O serviço é fornecido no estado em que se encontra. Na medida permitida pela lei, nossa
        responsabilidade total por qualquer reclamação relacionada ao Skiller fica limitada ao
        valor que você pagou nos 12 meses anteriores ao fato.
      </p>
      <p>
        Nada aqui afasta direitos que a legislação consumerista brasileira garante a você como
        consumidor.
      </p>

      <h2>8. Encerramento</h2>
      <p>
        Você pode encerrar a conta quando quiser, pelo painel. A exclusão é agendada para 30
        dias depois do pedido — nesse período dá para voltar atrás entrando de novo. Registros
        fiscais de compras já realizadas são mantidos pelo prazo que a lei exige.
      </p>
      <p>
        Podemos encerrar a prestação do serviço avisando com antecedência razoável e devolvendo
        proporcionalmente o valor de período já pago e não usufruído.
      </p>

      <h2>9. Mudanças nestes Termos</h2>
      <p>
        Podemos alterar estes Termos. Mudanças relevantes são comunicadas por e-mail e pelo
        painel, com pelo menos 30 dias de antecedência. Continuar usando o serviço depois da
        vigência significa aceitar a nova versão.
      </p>

      <h2>10. Lei aplicável e foro</h2>
      <p>
        Estes Termos são regidos pela lei brasileira. Fica eleito o foro do domicílio do
        consumidor para dirimir controvérsias, conforme o Código de Defesa do Consumidor.
      </p>

      <h2>11. Contato</h2>
      <p>
        Dúvidas sobre estes Termos: <Dado valor={EMPRESA.emailContato} rotulo="e-mail de contato" />
      </p>
    </>
  );
}
