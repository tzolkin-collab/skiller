/**
 * E-mail transacional.
 *
 * Sem `RESEND_API_KEY` o envio cai numa implementação que só escreve no log —
 * com o link inteiro, para dar para clicar em desenvolvimento. Assim o cadastro
 * e o link mágico funcionam antes de existir domínio verificado, e nenhum
 * ambiente fica refém de credencial de produção.
 *
 * Todo envio passa por `emailLog`, com chave de deduplicação. O Stripe
 * reentrega eventos, e sem isso o cliente receberia o mesmo recibo três vezes.
 */
import { Resend } from 'resend';
import { eq } from 'drizzle-orm';
import { db } from '../db/db.js';
import { emailLog } from '../db/schema.js';

let cliente: Resend | null = null;

export function emailConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function resend(): Resend {
  if (!cliente) cliente = new Resend(process.env.RESEND_API_KEY);
  return cliente;
}

/** Remetente. Precisa ser de um domínio verificado no Resend. */
function remetente(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (from && !from.includes('skiller.local')) return from;
  return 'Skiller <onboarding@resend.dev>';
}

export function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

export interface Envio {
  para: string;
  assunto: string;
  html: string;
  texto: string;
  /** Template, para o log dizer o que foi enviado sem guardar o corpo. */
  template: string;
  userId?: string | null;
  /**
   * Impede o mesmo e-mail de sair duas vezes. Use algo derivado do evento —
   * `recibo:in_1234`, e não a data — senão a reentrega gera envio novo.
   */
  dedupeKey?: string;
}

export interface Resultado {
  enviado: boolean;
  motivo?: 'duplicado' | 'falhou' | 'sem_provedor';
  id?: string;
}

export async function enviarEmail(e: Envio): Promise<Resultado> {
  // Trava de duplicidade ANTES de falar com o provedor: o insert é o cadeado.
  if (e.dedupeKey) {
    const reservado = await db
      .insert(emailLog)
      .values({
        userId: e.userId ?? null, to: e.para, template: e.template,
        subject: e.assunto, status: 'pendente', dedupeKey: e.dedupeKey,
      })
      .onConflictDoNothing()
      .returning({ id: emailLog.id });

    if (reservado.length === 0) {
      return { enviado: false, motivo: 'duplicado' };
    }
    return await despachar(e, reservado[0].id);
  }

  const [linha] = await db
    .insert(emailLog)
    .values({
      userId: e.userId ?? null, to: e.para, template: e.template,
      subject: e.assunto, status: 'pendente',
    })
    .returning({ id: emailLog.id });

  return await despachar(e, linha.id);
}

async function despachar(e: Envio, logId: string): Promise<Resultado> {
  if (!emailConfigurado()) {
    // Em desenvolvimento o "envio" é o log. Imprime o corpo em texto para os
    // links de confirmação e de acesso serem clicáveis no terminal.
    console.log(
      `\n──── e-mail (${e.template}) ────\npara: ${e.para}\nassunto: ${e.assunto}\n\n${e.texto}\n────────────────────────────\n`
    );
    await db.update(emailLog).set({ status: 'log' }).where(eq(emailLog.id, logId));
    return { enviado: false, motivo: 'sem_provedor' };
  }

  try {
    const r = await resend().emails.send({
      from: remetente(), to: e.para, subject: e.assunto, html: e.html, text: e.texto,
    });

    if (r.error) throw new Error(r.error.message);

    await db.update(emailLog).set({ status: 'enviado', providerId: r.data?.id ?? null }).where(eq(emailLog.id, logId));
    return { enviado: true, id: r.data?.id };
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    // Falha de e-mail nunca derruba a operação que o originou: ninguém deve
    // perder um pagamento porque o recibo não saiu.
    console.error(`[email] falha em ${e.template} para ${e.para}: ${msg}`);
    console.log(
      `\n──── e-mail (fallback console: ${e.template}) ────\npara: ${e.para}\nassunto: ${e.assunto}\n\n${e.texto}\n─────────────────────────────────────────────\n`
    );
    await db.update(emailLog).set({ status: 'falhou', error: msg.slice(0, 500) }).where(eq(emailLog.id, logId));
    return { enviado: false, motivo: 'falhou' };
  }
}
