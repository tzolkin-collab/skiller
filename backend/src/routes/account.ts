/**
 * O que a conta pode fazer, para o painel não adivinhar.
 *
 * Antes, a tela de Configurações mostrava "Starter" escrito no HTML — o mesmo
 * badge para todo mundo. O front precisa da mesma fonte de verdade que o
 * backend usa para barrar, senão a interface oferece o que a API recusa.
 */
import { Hono } from 'hono';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { db } from '../db/db.js';
import { users, mcpDevices, identities, sessions, skills, kbPages, subscriptions } from '../db/schema.js';
import { PLAN_SPEC, PLANS, normalizePlan } from '../lib/plans.js';
import { planoVigente } from '../lib/entitlements.js';
import { getErrorMessage } from '../lib/errors.js';
import { usuarioAtual, naoAutenticado } from '../lib/current-user.js';
import { revogarTodasSessoes } from '../lib/auth.js';
import { enviarEmail } from '../lib/email.js';
import * as tpl from '../lib/email-templates.js';
import { stripe, isStripeConfigured } from '../lib/stripe.js';
import { tentarSincronizarStripe } from '../lib/stripe-sync.js';

export const accountRouter = new Hono();

/** Catálogo dos planos. Estático — serve a página de preços sem duplicar valores. */
accountRouter.get('/plans', (c) =>
  c.json(
    PLANS.map((p) => ({
      id: p,
      label: PLAN_SPEC[p].label,
      priceCents: PLAN_SPEC[p].priceCents,
      capabilities: PLAN_SPEC[p].capabilities,
      monthlyCredits: PLAN_SPEC[p].monthlyCredits,
      members: PLAN_SPEC[p].members,
    }))
  )
);

/** A conta atual. `?userId=` é o mock de sessão que o resto do app já usa. */
accountRouter.get('/', async (c) => {
  // Sessão primeiro; `?userId=` só sobrevive sob ALLOW_QUERY_USER, para os
  // scripts de auditoria. Não é autenticação e nunca vale em produção.
  const userId = await usuarioAtual(c);
  if (!userId) return c.json({ error: 'userId required' }, 400);

  const rows = await db
    .select({
      id: users.id, name: users.name, email: users.email,
      plan: users.plan, credits: users.creditsBalance, validUntil: users.planValidUntil,
      preferences: users.preferences, stripeCustomerId: users.stripeCustomerId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  let u = rows[0];
  if (!u) return c.json({ error: 'not_found' }, 404);

  // Fallback Stripe: webhook pode ter falhado (secret ausente, deploy novo,
  // entrega atrasada). Tenta sincronizar antes de responder com plano free.
  if (normalizePlan(u.plan) === 'free') {
    const sincronizou = await tentarSincronizarStripe({
      userId: u.id,
      stripeCustomerId: u.stripeCustomerId,
    });
    if (sincronizou) {
      const atualizado = await db
        .select({
          id: users.id, name: users.name, email: users.email,
          plan: users.plan, credits: users.creditsBalance, validUntil: users.planValidUntil,
          preferences: users.preferences, stripeCustomerId: users.stripeCustomerId,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (atualizado[0]) u = atualizado[0];
    }
  }

  // O plano VIGENTE, não o que a coluna diz. Uma assinatura vencida sem
  // renovação deixa `users.plan` desatualizado até o webhook chegar (ou até a
  // reconciliação rodar); reportar a coluna crua faria a tela anunciar Pro
  // enquanto toda chamada de API é recusada.
  const plan = planoVigente(u.plan, u.validUntil);
  const spec = PLAN_SPEC[plan];

  // Quem está no teste tem franquia própria, menor. Sem isto a tela dizia
  // "80 de 1000 créditos" para alguém que recebeu 100 — anunciando um saldo
  // que a pessoa não tem e que o worker vai recusar.
  const [assinatura] = await db
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);
  const emTeste = assinatura?.status === 'trialing' && spec.trialCredits !== undefined;
  const franquia = emTeste ? spec.trialCredits! : spec.monthlyCredits;

  c.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  return c.json({
    id: u.id,
    name: u.name,
    email: u.email,
    credits: u.credits,
    plan: {
      id: plan, label: spec.label, priceCents: spec.priceCents, monthlyCredits: spec.monthlyCredits,
      /** `true` enquanto o teste corre — ainda não houve cobrança. */
      trialing: emTeste,
      /** Contra o que o saldo deve ser lido: franquia do teste ou a mensal. */
      allowance: franquia,
      /** Quando vence. `null` = sem prazo (gratuito, ou concedido a mão). */
      validUntil: u.validUntil?.toISOString() ?? null,
      /** `true` quando a coluna e o vigente divergem — assinatura caducou. */
      lapsed: normalizePlan(u.plan) !== plan,
    },
    // Lista achatada: o front checa com `includes`, sem reimplementar `can()`.
    capabilities: spec.capabilities,
    preferences: u.preferences,
  });
});

/**
 * Dispositivos MCP autorizados do usuário.
 *
 * Retorna a lista de registros em `mcp_devices` com status 'authorized',
 * com o token mascarado (só os primeiros 8 chars + '…') para o usuário
 * identificar qual cliente cada entrada representa sem expor o token.
 */
accountRouter.get('/devices', async (c) => {
  // Sessão primeiro; `?userId=` só sobrevive sob ALLOW_QUERY_USER, para os
  // scripts de auditoria. Não é autenticação e nunca vale em produção.
  const userId = await usuarioAtual(c);
  if (!userId) return c.json({ error: 'userId required' }, 400);

  try {
    const devices = await db
      .select({
        id: mcpDevices.id,
        userCode: mcpDevices.userCode,
        status: mcpDevices.status,
        accessToken: mcpDevices.accessToken,
        expiresAt: mcpDevices.expiresAt,
        createdAt: mcpDevices.createdAt,
      })
      .from(mcpDevices)
      .where(eq(mcpDevices.userId, userId))
      .orderBy(desc(mcpDevices.createdAt));

    return c.json(
      devices.map((d) => ({
        id: d.id,
        userCode: d.userCode,
        status: d.status,
        // Mascara o token: expõe os primeiros 8 chars para identificar o cliente.
        tokenPreview: d.accessToken ? d.accessToken.slice(0, 8) + '…' : null,
        isExpired: d.expiresAt < new Date(),
        createdAt: d.createdAt.toISOString(),
        expiresAt: d.expiresAt.toISOString(),
      }))
    );
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

/**
 * Revoga um dispositivo MCP.
 *
 * Muda o status para 'expired', o que faz `mcp-context.ts` rejeitar o token
 * imediatamente sem precisar deletar o registro (o histórico de auditoria fica).
 */
accountRouter.delete('/devices/:id', async (c) => {
  // Sessão primeiro; `?userId=` só sobrevive sob ALLOW_QUERY_USER, para os
  // scripts de auditoria. Não é autenticação e nunca vale em produção.
  const userId = await usuarioAtual(c);
  const deviceId = c.req.param('id');
  if (!userId) return c.json({ error: 'userId required' }, 400);

  try {
    const rows = await db
      .select({ id: mcpDevices.id, userId: mcpDevices.userId })
      .from(mcpDevices)
      .where(eq(mcpDevices.id, deviceId))
      .limit(1);

    const device = rows[0];
    if (!device) return c.json({ error: 'Device not found' }, 404);
    if (device.userId !== userId) return c.json({ error: 'Forbidden' }, 403);

    await db
      .update(mcpDevices)
      .set({ status: 'expired' })
      .where(eq(mcpDevices.id, deviceId));

    return c.json({ ok: true });
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

/**
 * Contas disponíveis para escolher — só fora de produção.
 *
 * Enquanto não há login, todo o painel depende de `?userId=` digitado na URL.
 * Isso torna impossível testar: a página de Plano manda o usuário editar o
 * endereço, e o fluxo de conector nem sabe quem está autorizando. Este endpoint
 * alimenta o seletor de conta do painel.
 *
 * O guard é deliberado. Em produção, listar contas é vazamento — e o seletor
 * inteiro deixa de existir quando houver sessão de verdade.
 */
accountRouter.get('/list', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'not_available' }, 404);
  }

  const linhas = await db
    .select({
      id: users.id, email: users.email, name: users.name,
      plan: users.plan, credits: users.creditsBalance, validUntil: users.planValidUntil,
    })
    .from(users)
    .orderBy(users.createdAt);

  return c.json(
    linhas.map((u) => {
      const plan = planoVigente(u.plan, u.validUntil);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        plan: { id: plan, label: PLAN_SPEC[plan].label },
        credits: u.credits,
        /** Conta de demonstração criada pelo seed. */
        demo: u.email.endsWith('@demo.skiller.local'),
      };
    })
  );
});

// ------------------------------------------------------------------ perfil

/** Nome e foto. O e-mail não muda por aqui: trocar e-mail é mudar identidade. */
accountRouter.patch('/profile', async (c) => {
  const userId = await usuarioAtual(c);
  if (!userId) return c.json(naoAutenticado(), 401);

  const b = (await c.req.json().catch(() => ({}))) as { name?: string; avatarUrl?: string; preferences?: Record<string, unknown> };
  const remendo: Record<string, unknown> = {};

  if (typeof b.name === 'string') {
    const nome = b.name.trim();
    if (nome.length > 80) return c.json({ error: 'name_too_long', message: 'Nome longo demais.' }, 400);
    remendo.name = nome || null;
  }

  if (typeof b.avatarUrl === 'string') {
    const url = b.avatarUrl.trim();
    if (url && !/^https:\/\//i.test(url)) {
      return c.json({ error: 'avatar_invalid', message: 'A foto precisa ser um endereço https.' }, 400);
    }
    remendo.avatarUrl = url || null;
  }

  if (b.preferences && typeof b.preferences === 'object') {
    const [u] = await db.select({ pref: users.preferences }).from(users).where(eq(users.id, userId)).limit(1);
    remendo.preferences = { ...(u?.pref as Record<string, unknown> || {}), ...b.preferences };
  }

  if (Object.keys(remendo).length === 0) return c.json({ ok: true });

  await db.update(users).set(remendo).where(eq(users.id, userId));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- vínculos

/** Formas de entrar nesta conta, e desde quando. */
accountRouter.get('/identities', async (c) => {
  const userId = await usuarioAtual(c);
  if (!userId) return c.json(naoAutenticado(), 401);

  const linhas = await db
    .select({
      id: identities.id, provider: identities.provider,
      email: identities.email, createdAt: identities.createdAt, lastUsedAt: identities.lastUsedAt,
    })
    .from(identities)
    .where(eq(identities.userId, userId));

  return c.json(linhas);
});

/**
 * Desvincula um provedor.
 *
 * Recusa quando é o último caminho de entrada: sem senha e sem provedor, a
 * pessoa ficaria trancada para fora da própria conta.
 */
accountRouter.delete('/identities/:id', async (c) => {
  const userId = await usuarioAtual(c);
  if (!userId) return c.json(naoAutenticado(), 401);

  const todas = await db.select().from(identities).where(eq(identities.userId, userId));
  const alvo = todas.find((i) => i.id === c.req.param('id'));
  if (!alvo) return c.json({ error: 'not_found' }, 404);

  const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  const restantes = todas.filter((i) => i.id !== alvo.id).length;

  if (restantes === 0 && !u?.hash) {
    return c.json(
      {
        error: 'last_identity',
        message: 'Este é o único jeito de entrar nesta conta. Defina uma senha antes de desvincular.',
      },
      409
    );
  }

  await db.delete(identities).where(eq(identities.id, alvo.id));
  return c.json({ ok: true });
});

// ------------------------------------------------------------- dispositivos

/** Sessões de navegador abertas, para a pessoa reconhecer e encerrar. */
accountRouter.get('/sessions', async (c) => {
  const atual = await usuarioAtual(c);
  if (!atual) return c.json(naoAutenticado(), 401);

  const linhas = await db
    .select({
      id: sessions.id, userAgent: sessions.userAgent, ipAddress: sessions.ipAddress,
      createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, atual), isNull(sessions.revokedAt)))
    .orderBy(desc(sessions.lastSeenAt));

  return c.json(linhas);
});

accountRouter.delete('/sessions/:id', async (c) => {
  const userId = await usuarioAtual(c);
  if (!userId) return c.json(naoAutenticado(), 401);

  // O filtro por `userId` é o que impede encerrar a sessão de outra pessoa
  // chutando ids.
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, c.req.param('id')), eq(sessions.userId, userId)));

  return c.json({ ok: true });
});

// -------------------------------------------------- exclusão de conta (LGPD)

/**
 * Prazo entre o pedido e o apagamento definitivo.
 *
 * Apagar no clique impede desfazer um arrependimento e atrapalha obrigação
 * fiscal sobre compras já feitas. A conta é desativada na hora — todas as
 * sessões caem — e os dados somem depois deste prazo.
 */
const DIAS_ATE_APAGAR = 30;

accountRouter.post('/delete', async (c) => {
  const userId = await usuarioAtual(c);
  if (!userId) return c.json(naoAutenticado(), 401);

  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return c.json({ error: 'not_found' }, 404);

  const apagaEm = new Date(Date.now() + DIAS_ATE_APAGAR * 86400_000);
  await db.update(users).set({ deletionRequestedAt: new Date() }).where(eq(users.id, userId));

  // Derruba tudo. Continuar logado depois de pedir exclusão seria contraditório.
  await revogarTodasSessoes(userId);

  const t = tpl.exclusaoSolicitada(apagaEm.toLocaleDateString('pt-BR'));
  void enviarEmail({
    para: u.email, template: 'exclusao_solicitada', userId,
    assunto: t.assunto, html: t.html, texto: t.texto,
  });

  return c.json({
    ok: true,
    scheduledFor: apagaEm.toISOString(),
    message: `Sua conta foi desativada e será apagada em ${apagaEm.toLocaleDateString('pt-BR')}. Entrar de novo antes disso cancela a exclusão.`,
  });
});

/**
 * Exportação dos dados (LGPD art. 18, V).
 *
 * O que o Skiller guarda sobre a pessoa, em JSON. Sem o hash da senha nem os
 * tokens: entregá-los num arquivo que vai para a caixa de entrada seria criar
 * uma cópia insegura do que existe justamente para não vazar.
 */
accountRouter.get('/export', async (c) => {
  const userId = await usuarioAtual(c);
  if (!userId) return c.json(naoAutenticado(), 401);

  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return c.json({ error: 'not_found' }, 404);

  const [vinculos, dispositivos, minhasSkills, paginas] = await Promise.all([
    db.select({ provider: identities.provider, email: identities.email, createdAt: identities.createdAt })
      .from(identities).where(eq(identities.userId, userId)),
    db.select({ userAgent: sessions.userAgent, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt })
      .from(sessions).where(eq(sessions.userId, userId)),
    db.select({ id: skills.id, name: skills.name, createdAt: skills.createdAt })
      .from(skills).where(eq(skills.userId, userId)),
    db.select({ path: kbPages.path, title: kbPages.title, updatedAt: kbPages.updatedAt })
      .from(kbPages).where(eq(kbPages.userId, userId)),
  ]);

  c.header('Content-Disposition', `attachment; filename="skiller-${u.id}.json"`);
  return c.json({
    exportadoEm: new Date().toISOString(),
    conta: {
      id: u.id, email: u.email, nome: u.name, avatarUrl: u.avatarUrl,
      plano: u.plan, creditos: u.creditsBalance,
      emailConfirmadoEm: u.emailVerifiedAt, termosAceitosEm: u.acceptedTermsAt,
      paisDeCobranca: u.billingCountry, documentoFiscal: u.taxId,
      criadaEm: u.createdAt, ultimoAcesso: u.lastLoginAt,
    },
    formasDeEntrar: vinculos,
    dispositivos,
    skills: minhasSkills,
    baseDaIa: paginas,
    observacao:
      'Senha e tokens de sessão não constam: são guardados apenas como hash, ' +
      'e não podem — nem devem — ser recuperados.',
  });
});

// ------------------------------------------------------------ meios de pagamento

/**
 * Cartões guardados no Stripe.
 *
 * O cartão nunca passa por aqui: o que existe do nosso lado é o id do cliente
 * no Stripe. Por isso "salvar para a próxima compra" já funciona sozinho — o
 * Checkout reusa o cliente e oferece o cartão. Esta rota só deixa a pessoa VER
 * o que está guardado, que é o que faltava.
 */
accountRouter.get('/payment-methods', async (c) => {
  const userId = await usuarioAtual(c);
  if (!userId) return c.json(naoAutenticado(), 401);

  const [u] = await db.select({ cust: users.stripeCustomerId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.cust) return c.json({ methods: [], defaultId: null });
  if (!isStripeConfigured()) return c.json({ methods: [], defaultId: null, unavailable: true });

  try {
    const cliente = await stripe().customers.retrieve(u.cust);
    const padrao = typeof cliente !== 'string' && !cliente.deleted
      ? (cliente.invoice_settings?.default_payment_method as string | null) ?? null
      : null;

    const lista = await stripe().paymentMethods.list({ customer: u.cust, type: 'card', limit: 10 });

    return c.json({
      defaultId: padrao,
      methods: lista.data.map((m) => ({
        id: m.id,
        brand: m.card?.brand ?? 'card',
        last4: m.card?.last4 ?? '····',
        expMonth: m.card?.exp_month ?? null,
        expYear: m.card?.exp_year ?? null,
        isDefault: m.id === padrao,
      })),
    });
  } catch (e) {
    console.error('[account] falha ao listar cartões:', e instanceof Error ? e.message : e);
    return c.json({ methods: [], defaultId: null, unavailable: true });
  }
});
