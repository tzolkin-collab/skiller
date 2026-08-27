/**
 * Os e-mails que o Skiller manda.
 *
 * Um esqueleto só, e cada template preenche miolo e assunto. Espalhar HTML por
 * vários arquivos faz a marca divergir e obriga a corrigir rodapé em seis
 * lugares — e o rodapé é justamente o que carrega obrigação legal.
 *
 * Tabela e estilo em atributo: cliente de e-mail não é navegador. Gmail corta
 * `<style>`, Outlook ignora flexbox.
 */
import { appUrl } from './email.js';

const MARCA = '#ff3333';
const TEXTO = '#1a1a1a';
const SUAVE = '#6b7280';

interface Corpo {
  titulo: string;
  /** Parágrafos. Cada string vira um `<p>`. */
  paragrafos: string[];
  botao?: { texto: string; url: string };
  /** Aviso ao pé, em cinza. Para "se não foi você, ignore". */
  rodape?: string;
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function montar(c: Corpo): { html: string; texto: string } {
  const paras = c.paragrafos
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${TEXTO}">${p}</p>`)
    .join('');

  const botao = c.botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0">
         <tr><td style="background:${MARCA};border-radius:6px">
           <a href="${escapar(c.botao.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#fff;text-decoration:none">${escapar(c.botao.texto)}</a>
         </td></tr>
       </table>
       <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${SUAVE}">
         Se o botão não funcionar, copie este endereço:<br>
         <span style="word-break:break-all">${escapar(c.botao.url)}</span>
       </p>`
    : '';

  const rodapePersonalizado = c.rodape
    ? `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:${SUAVE}">${c.rodape}</p>`
    : '';

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;border:1px solid #e5e7eb">
    <tr><td style="padding:28px 32px">
      <p style="margin:0 0 22px;font-size:17px;font-weight:700;letter-spacing:-0.02em;color:${TEXTO}">Skiller</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${TEXTO}">${escapar(c.titulo)}</h1>
      ${paras}
      ${botao}
      ${rodapePersonalizado}
      <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0 16px">
      <p style="margin:0;font-size:12px;line-height:1.5;color:${SUAVE}">
        Este e-mail foi enviado pelo Skiller porque existe uma conta com este endereço.<br>
        <a href="${appUrl()}/pt/legal/privacidade" style="color:${SUAVE}">Privacidade</a> ·
        <a href="${appUrl()}/pt/legal/termos" style="color:${SUAVE}">Termos</a>
      </p>
    </td></tr>
  </table>
</body></html>`;

  const texto = [
    c.titulo, '',
    ...c.paragrafos.map((p) => p.replace(/<[^>]+>/g, '')),
    ...(c.botao ? ['', c.botao.texto + ': ' + c.botao.url] : []),
    ...(c.rodape ? ['', c.rodape.replace(/<[^>]+>/g, '')] : []),
    '', '—', 'Skiller · ' + appUrl(),
  ].join('\n');

  return { html, texto };
}

export interface Template {
  assunto: string;
  html: string;
  texto: string;
}

// -------------------------------------------------------------- identidade

export function linkMagico(url: string): Template {
  const c = montar({
    titulo: 'Seu link de acesso',
    paragrafos: ['Clique para entrar na sua conta. O link vale por 15 minutos e só funciona uma vez.'],
    botao: { texto: 'Entrar no Skiller', url },
    rodape: 'Se você não pediu este link, ignore este e-mail — ninguém entra na sua conta sem ele.',
  });
  return { assunto: 'Seu link de acesso ao Skiller', ...c };
}

export function confirmarEmail(url: string): Template {
  const c = montar({
    titulo: 'Confirme seu e-mail',
    paragrafos: [
      'Falta confirmar este endereço para a conta ficar completa.',
      'Sem a confirmação, não conseguimos enviar recibos nem avisos de cobrança.',
    ],
    botao: { texto: 'Confirmar e-mail', url },
    rodape: 'O link vale por 24 horas.',
  });
  return { assunto: 'Confirme seu e-mail no Skiller', ...c };
}

export function redefinirSenha(url: string): Template {
  const c = montar({
    titulo: 'Redefinir sua senha',
    paragrafos: ['Use o botão abaixo para escolher uma nova senha. O link vale por 1 hora.'],
    botao: { texto: 'Escolher nova senha', url },
    rodape:
      'Se você não pediu isso, ignore este e-mail. Sua senha atual continua valendo — ' +
      'e vale conferir quem mais tem acesso a esta caixa de entrada.',
  });
  return { assunto: 'Redefinir sua senha do Skiller', ...c };
}

export function boasVindas(nome: string | null): Template {
  const c = montar({
    titulo: nome ? `Bem-vindo, ${escapar(nome)}` : 'Bem-vindo ao Skiller',
    paragrafos: [
      'Sua conta está pronta. Você começa no plano gratuito, com 100 créditos por mês.',
      'O primeiro passo é gerar uma skill a partir de um vídeo ou playlist — depois dá para testar, editar e plugar na sua IDE.',
    ],
    botao: { texto: 'Abrir o painel', url: `${appUrl()}/pt/dashboard` },
  });
  return { assunto: 'Sua conta no Skiller está pronta', ...c };
}

// ---------------------------------------------------------------- cobrança

export function assinaturaAtiva(plano: string, valor: string, renovaEm: string | null): Template {
  const c = montar({
    titulo: `Plano ${escapar(plano)} ativo`,
    paragrafos: [
      `O pagamento foi confirmado e o plano ${escapar(plano)} já está liberado na sua conta.`,
      `Valor: <strong>${escapar(valor)}</strong>${renovaEm ? ` · Renova em ${escapar(renovaEm)}` : ''}.`,
      'A cobrança é automática e você pode cancelar quando quiser, sem multa.',
    ],
    botao: { texto: 'Ver meu plano', url: `${appUrl()}/pt/dashboard/settings` },
  });
  return { assunto: `Plano ${plano} ativo no Skiller`, ...c };
}

/**
 * Início do teste. Separado de `assinaturaAtiva` de propósito: durante o teste
 * ninguém pagou nada, e mandar "o pagamento foi confirmado" para quem só
 * cadastrou o cartão é falso e gera chargeback.
 */
export function testeIniciado(
  plano: string,
  dias: number,
  creditos: number,
  valor: string,
  cobraEm: string | null
): Template {
  const c = montar({
    titulo: `Seu teste do ${escapar(plano)} começou`,
    paragrafos: [
      `Você tem <strong>${dias} dias</strong> e <strong>${creditos} créditos</strong> para experimentar o plano ${escapar(plano)}. Nenhuma cobrança foi feita.`,
      cobraEm
        ? `Se você não cancelar até <strong>${escapar(cobraEm)}</strong>, cobramos ${escapar(valor)} e o plano segue ativo.`
        : `Ao fim do teste, cobramos ${escapar(valor)} e o plano segue ativo.`,
      'Cancelar dentro do prazo não gera cobrança nenhuma, e leva dois cliques na página do plano.',
    ],
    botao: { texto: 'Ver meu plano', url: `${appUrl()}/pt/dashboard/settings` },
  });
  return { assunto: `Seu teste de ${dias} dias do Skiller começou`, ...c };
}

export function pagamentoFalhou(valor: string, urlPortal: string): Template {
  const c = montar({
    titulo: 'Não conseguimos cobrar sua assinatura',
    paragrafos: [
      `A cobrança de <strong>${escapar(valor)}</strong> foi recusada pelo banco.`,
      'Vamos tentar de novo automaticamente nos próximos dias. Seu acesso continua liberado nesse período.',
      'Se preferir resolver agora, atualize o cartão pelo link abaixo.',
    ],
    botao: { texto: 'Atualizar forma de pagamento', url: urlPortal },
  });
  return { assunto: 'Problema com o pagamento da sua assinatura', ...c };
}

export function assinaturaCancelada(plano: string, ate: string | null): Template {
  const c = montar({
    titulo: 'Assinatura cancelada',
    paragrafos: [
      `Sua assinatura do plano ${escapar(plano)} foi cancelada.`,
      ate
        ? `O acesso continua até <strong>${escapar(ate)}</strong>, o fim do período já pago.`
        : 'Sua conta voltou para o plano gratuito.',
      'O que você já gerou continua seu — nada é apagado por cancelamento.',
    ],
    botao: { texto: 'Assinar de novo', url: `${appUrl()}/pt/dashboard/settings` },
  });
  return { assunto: 'Sua assinatura do Skiller foi cancelada', ...c };
}

// ------------------------------------------------------------------- conta

export function exclusaoSolicitada(apagaEm: string): Template {
  const c = montar({
    titulo: 'Recebemos seu pedido de exclusão',
    paragrafos: [
      `Sua conta foi desativada e será apagada em <strong>${escapar(apagaEm)}</strong>.`,
      'Até lá dá para voltar atrás: basta entrar de novo. Depois dessa data, os dados são removidos e não há como recuperar.',
      'Registros fiscais de compras já feitas são mantidos pelo prazo que a lei exige, mesmo após a exclusão.',
    ],
    botao: { texto: 'Cancelar a exclusão', url: `${appUrl()}/pt/entrar` },
  });
  return { assunto: 'Sua conta do Skiller será apagada', ...c };
}
