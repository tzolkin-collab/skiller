import { EMPRESA, VIGENCIA, VERSAO, Dado, AvisoPendencias } from '../dados-da-empresa';
import styles from '../legal.module.css';

export const metadata = { title: 'Política de Privacidade · Skiller' };

export default function PrivacidadePage() {
  return (
    <>
      <AvisoPendencias />

      <h1>Política de Privacidade</h1>
      <p className={styles.meta}>Versão {VERSAO} · Em vigor desde {VIGENCIA}</p>

      <p>
        Esta Política explica quais dados pessoais o Skiller trata, por quê, com quem
        compartilha e o que você pode exigir. Foi escrita para a Lei Geral de Proteção de Dados
        (Lei 13.709/2018).
      </p>
      <p>
        <strong>Controladora:</strong>{' '}
        <Dado valor={EMPRESA.razaoSocial} rotulo="razão social" />, CNPJ{' '}
        <Dado valor={EMPRESA.cnpj} rotulo="CNPJ" />,{' '}
        <Dado valor={EMPRESA.endereco} rotulo="endereço" />.
      </p>

      <h2>1. Que dados tratamos</h2>

      <h3>Que você nos dá</h3>
      <ul>
        <li><strong>Cadastro:</strong> e-mail, nome e foto (quando entra por Google ou GitHub).</li>
        <li>
          <strong>Cobrança:</strong> endereço e documento fiscal (CPF ou CNPJ), informados no
          checkout. O número do cartão <em>não</em> passa por nós — vai direto para a Stripe.
        </li>
        <li>
          <strong>Conteúdo:</strong> as fontes que você envia para gerar skills, e o que os seus
          agentes registram na Base da IA.
        </li>
      </ul>

      <h3>Que o uso gera</h3>
      <ul>
        <li>Endereço IP e identificação do navegador, guardados junto de cada sessão aberta.</li>
        <li>Data de acesso, para você reconhecer e encerrar sessões que não sejam suas.</li>
        <li>Registro dos e-mails que enviamos, para não repetir aviso e para responder se saiu.</li>
        <li>Consumo de créditos e histórico de geração.</li>
      </ul>
      <p>
        Não usamos cookies de publicidade nem rastreamento de terceiros. O único cookie
        essencial é o da sua sessão.
      </p>

      <h2>2. Por que tratamos (bases legais)</h2>
      <table className={styles.tabela}>
        <thead>
          <tr><th>Finalidade</th><th>Base legal (LGPD art. 7º)</th></tr>
        </thead>
        <tbody>
          <tr><td>Criar e manter sua conta; entregar o serviço</td><td>Execução de contrato (V)</td></tr>
          <tr><td>Cobrar a assinatura e emitir documento fiscal</td><td>Obrigação legal (II) e contrato (V)</td></tr>
          <tr><td>Enviar aviso de cobrança, recibo e confirmação</td><td>Execução de contrato (V)</td></tr>
          <tr><td>Impedir fraude, abuso e força bruta</td><td>Legítimo interesse (IX)</td></tr>
          <tr><td>Melhorar o produto com dados agregados</td><td>Legítimo interesse (IX)</td></tr>
        </tbody>
      </table>
      <p>
        Não vendemos dados pessoais, e não usamos o conteúdo que você envia para treinar
        modelos próprios.
      </p>

      <h2>3. Com quem compartilhamos</h2>
      <p>Apenas com quem é necessário para o serviço funcionar:</p>
      <table className={styles.tabela}>
        <thead>
          <tr><th>Quem</th><th>Para quê</th><th>Onde</th></tr>
        </thead>
        <tbody>
          <tr><td>Stripe</td><td>Processar pagamento e guardar o cartão</td><td>EUA</td></tr>
          <tr><td>Google (Gemini)</td><td>Processar o conteúdo e gerar a skill</td><td>EUA</td></tr>
          <tr><td>Google / GitHub</td><td>Entrada na conta, quando você escolhe esse caminho</td><td>EUA</td></tr>
          <tr><td>Resend</td><td>Entregar os e-mails transacionais</td><td>EUA</td></tr>
        </tbody>
      </table>
      <p>
        Há transferência internacional de dados. Ela se apoia nas cláusulas contratuais e nas
        garantias oferecidas por esses operadores, conforme os artigos 33 e 34 da LGPD.
      </p>

      <h2>4. Por quanto tempo guardamos</h2>
      <ul>
        <li><strong>Conta e conteúdo:</strong> enquanto a conta existir.</li>
        <li>
          <strong>Depois do pedido de exclusão:</strong> 30 dias de carência — para dar chance de
          voltar atrás — e então os dados são removidos.
        </li>
        <li>
          <strong>Registros fiscais de compras:</strong> pelo prazo que a legislação tributária
          exige, mesmo após a exclusão da conta. Não é escolha nossa.
        </li>
        <li><strong>Sessões vencidas:</strong> removidas periodicamente.</li>
      </ul>

      <h2>5. Seus direitos</h2>
      <p>A LGPD (art. 18) garante a você:</p>
      <ul>
        <li>confirmar que tratamos seus dados e acessá-los;</li>
        <li>corrigir dado incompleto, inexato ou desatualizado;</li>
        <li>pedir anonimização, bloqueio ou eliminação de dado desnecessário ou excessivo;</li>
        <li>receber seus dados em formato legível e transferi-los;</li>
        <li>saber com quem compartilhamos;</li>
        <li>revogar consentimento, quando essa for a base do tratamento.</li>
      </ul>
      <p>
        Dois desses estão no próprio painel, em Configurações: <strong>baixar seus dados</strong>{' '}
        em JSON e <strong>excluir a conta</strong>. Para os demais, escreva para{' '}
        <Dado valor={EMPRESA.emailPrivacidade} rotulo="e-mail de privacidade" />. Respondemos em
        até 15 dias.
      </p>

      <h2>6. Segurança</h2>
      <ul>
        <li>Senha guardada apenas como hash derivado (scrypt), nunca em texto legível.</li>
        <li>
          Token de sessão guardado apenas como hash: um vazamento do banco não entrega acesso a
          conta nenhuma.
        </li>
        <li>Tráfego cifrado em trânsito.</li>
        <li>Limite de tentativas de login, contra ataque de força bruta.</li>
        <li>Acesso à infraestrutura restrito a quem precisa operá-la.</li>
      </ul>
      <p>
        Nenhum sistema é imune. Se ocorrer incidente que traga risco relevante a você,
        comunicamos você e a ANPD, como exige o artigo 48.
      </p>

      <h2>7. Menores de idade</h2>
      <p>
        O Skiller não é destinado a menores de 18 anos. Se soubermos que criamos conta para um
        menor sem autorização do responsável, ela é removida.
      </p>

      <h2>8. Mudanças nesta Política</h2>
      <p>
        Alterações relevantes são comunicadas por e-mail e pelo painel antes de entrarem em
        vigor.
      </p>

      <h2>9. Encarregado (DPO)</h2>
      <p>
        Contato para assuntos de proteção de dados:{' '}
        <Dado valor={EMPRESA.emailPrivacidade} rotulo="e-mail do encarregado" />
      </p>
      <p>
        Você também pode reclamar à Autoridade Nacional de Proteção de Dados —{' '}
        <a href="https://www.gov.br/anpd" target="_blank" rel="noreferrer">gov.br/anpd</a>.
      </p>
    </>
  );
}
