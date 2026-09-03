import { pgTable, text, timestamp, integer, jsonb, uuid, uniqueIndex, index, check, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').unique().notNull(),
  name: text('name'),
  // Nasce no plano gratuito. Antes o default era `starter`: todo cadastro novo
  // ganhava conector, edição de skill e 1000 créditos sem pagar — ou seja, a
  // cobrança vendia exatamente o que já era dado de graça.
  plan: text('plan').default('free').notNull(),
  creditsBalance: integer('credits_balance').default(100).notNull(),
  preferences: jsonb('preferences').$type<{ locationTrackingEnabled?: boolean }>().default({}),

  // --- faturamento ---
  /** Cliente no Stripe. Criado no primeiro checkout e reusado depois, para o
   *  histórico de cobrança da pessoa não se espalhar por vários clientes. */
  stripeCustomerId: text('stripe_customer_id').unique(),
  /** ISO-3166 alpha-2, como o cliente confirmou no checkout — não o palpite por
   *  IP. É o que define a moeda na próxima compra e o imposto na nota. */
  billingCountry: text('billing_country'),
  /** CPF/CNPJ no Brasil, VAT na Europa. Guardado para emitir a fatura. */
  taxId: text('tax_id'),
  taxIdType: text('tax_id_type'),
  /**
   * Ate quando este plano vale, com folga sobre o fim do periodo pago.
   *
   * Rede de seguranca contra webhook perdido: hoje `users.plan` so muda quando
   * o Stripe avisa, entao um aviso que nunca chega deixaria a pessoa no Pro de
   * graca para sempre. Passada esta data sem renovacao, o portao trata como
   * gratuito mesmo que a coluna `plan` ainda diga outra coisa.
   *
   * `null` = sem validade (plano gratuito, ou concedido a mao).
   */
  planValidUntil: timestamp('plan_valid_until'),

  // --- perfil e identidade ---
  /** Foto vinda do provedor OAuth, ou enviada pela pessoa. */
  avatarUrl: text('avatar_url'),
  /**
   * Hash da senha. `null` em quem só entra por Google/GitHub/link mágico — a
   * ausência é o normal, não uma falha. Formato: `scrypt$N$r$p$salt$hash`.
   */
  passwordHash: text('password_hash'),
  /**
   * Quando o e-mail foi comprovado. Sem isto, qualquer um cadastra com o
   * endereço de outra pessoa e passa a receber os e-mails dela.
   */
  emailVerifiedAt: timestamp('email_verified_at'),
  /** Aceite dos Termos e da Política de Privacidade, com a versão vigente. */
  acceptedTermsAt: timestamp('accepted_terms_at'),
  acceptedTermsVersion: text('accepted_terms_version'),
  lastLoginAt: timestamp('last_login_at'),
  /**
   * Pedido de exclusão (LGPD art. 18). A conta é desativada na hora e apagada
   * depois do prazo — apagar no clique impediria desfazer um arrependimento e
   * atrapalharia obrigações fiscais sobre as compras já feitas.
   */
  deletionRequestedAt: timestamp('deletion_requested_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Como cada pessoa entra: Google, GitHub, senha, link mágico.
 *
 * Tabela separada de `users` porque uma pessoa é UMA conta com VÁRIAS formas de
 * entrar. Guardar o provedor dentro de `users` obrigaria a criar uma conta nova
 * quando alguém que entrou pelo Google resolvesse usar o GitHub — e o e-mail
 * seria o mesmo, então viraria conflito de chave única ou conta duplicada.
 */
export const identities = pgTable('identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  /** `google`, `github`, `password`, `email` (link mágico). */
  provider: text('provider').notNull(),
  /** O `sub` do provedor. Para `password`/`email`, o próprio e-mail. */
  providerAccountId: text('provider_account_id').notNull(),
  /** E-mail informado pelo provedor no momento do vínculo, para auditoria. */
  email: text('email'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at'),
}, (table) => [
  // O mesmo `sub` do mesmo provedor não pode apontar para duas contas.
  uniqueIndex('identities_provider_account_unq').on(table.provider, table.providerAccountId),
  index('identities_user_idx').on(table.userId),
]);

/**
 * Sessões do navegador.
 *
 * O que vai no cookie é um token aleatório; aqui guarda-se apenas o HASH dele.
 * Assim um vazamento do banco não entrega sessão ativa de ninguém — a mesma
 * razão pela qual senha não se guarda em claro.
 */
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  /** SHA-256 do token que está no cookie. */
  tokenHash: text('token_hash').unique().notNull(),
  /** Para a pessoa reconhecer e encerrar sessões em "Meus dispositivos". */
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
}, (table) => [
  index('sessions_user_idx').on(table.userId),
  index('sessions_expires_idx').on(table.expiresAt),
]);

/**
 * Tokens de uso único enviados por e-mail.
 *
 * Cobre link mágico, confirmação de endereço e redefinição de senha. Guardado
 * como hash e com prazo curto: quem lê o banco não consegue entrar na conta de
 * ninguém, e um link vazado numa caixa de entrada antiga não vale mais nada.
 */
export const emailTokens = pgTable('email_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  /** `magic_link`, `verify_email`, `password_reset`. */
  purpose: text('purpose').notNull(),
  tokenHash: text('token_hash').unique().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  /** Uso único: preenchido no primeiro consumo e conferido antes do segundo. */
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('email_tokens_user_purpose_idx').on(table.userId, table.purpose),
]);

/**
 * Registro do que foi enviado por e-mail.
 *
 * Serve para não mandar o mesmo aviso duas vezes quando o Stripe reentrega um
 * evento, e para responder "o recibo saiu?" sem depender do painel do provedor.
 */
export const emailLog = pgTable('email_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  to: text('to').notNull(),
  template: text('template').notNull(),
  subject: text('subject').notNull(),
  /** Id do provedor, para rastrear entrega. `null` quando só foi para o log. */
  providerId: text('provider_id'),
  status: text('status').notNull(),
  error: text('error'),
  /** Chave de idempotência: mesmo evento não gera dois envios. */
  dedupeKey: text('dedupe_key').unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('email_log_user_idx').on(table.userId),
]);

/**
 * Tentativas por chave, para travar força bruta.
 *
 * Sem isto, `/auth/login` aceita quantas senhas por segundo a rede aguentar, e
 * `/auth/magic-link` vira ferramenta de spam contra o e-mail de terceiros.
 */
export const rateLimits = pgTable('rate_limits', {
  /** `login:email@x`, `magic:1.2.3.4`, … */
  key: text('key').primaryKey(),
  count: integer('count').default(0).notNull(),
  /** Início da janela corrente. */
  windowStart: timestamp('window_start').defaultNow().notNull(),
  /** Bloqueio explícito depois de estourar o limite. */
  blockedUntil: timestamp('blocked_until'),
});

export const mcpDevices = pgTable('mcp_devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  deviceCode: text('device_code').unique().notNull(),
  userCode: text('user_code').unique().notNull(),
  status: text('status').default('pending').notNull(), // 'pending', 'authorized', 'expired'
  accessToken: text('access_token'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  check('mcp_devices_status_check', sql`${table.status} IN ('pending', 'authorized', 'expired')`),
]);

/**
 * Clientes OAuth 2.1 registrados (RFC 7591 Dynamic Client Registration).
 */
export const oauthClients = pgTable('oauth_clients', {
  id: text('id').primaryKey(), // client_id
  clientSecret: text('client_secret'),
  clientName: text('client_name').notNull(),
  redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
  grantTypes: jsonb('grant_types').$type<string[]>().default(['authorization_code', 'refresh_token']).notNull(),
  responseTypes: jsonb('response_types').$type<string[]>().default(['code']).notNull(),
  tokenEndpointAuthMethod: text('token_endpoint_auth_method').default('none').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Códigos de autorização temporários (PKCE / RFC 7636).
 */
export const oauthCodes = pgTable('oauth_codes', {
  code: text('code').primaryKey(), // hash do code emitido
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  clientId: text('client_id').references(() => oauthClients.id, { onDelete: 'cascade' }).notNull(),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  codeChallengeMethod: text('code_challenge_method').default('S256').notNull(),
  scope: text('scope'),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('oauth_codes_client_idx').on(table.clientId),
  index('oauth_codes_user_idx').on(table.userId),
]);

/**
 * Tokens de acesso e renovação emitidos para clientes OAuth 2.1.
 */
export const oauthTokens = pgTable('oauth_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  clientId: text('client_id').references(() => oauthClients.id, { onDelete: 'cascade' }).notNull(),
  accessToken: text('access_token').unique().notNull(),
  refreshToken: text('refresh_token').unique(),
  scope: text('scope'),
  accessTokenExpiresAt: timestamp('access_token_expires_at').notNull(),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('oauth_tokens_user_idx').on(table.userId),
  index('oauth_tokens_access_idx').on(table.accessToken),
  index('oauth_tokens_refresh_idx').on(table.refreshToken),
]);

/**
 * Sessão espelho: o que o agente conectado está fazendo, para o humano assistir.
 *
 * Existe porque criar skill pelo MCP é um laço de agente — várias chamadas ao
 * longo de minutos — e sem isto a pessoa fica no escuro enquanto o modelo
 * trabalha. Era a única vantagem real que o caminho do app tinha sobre o
 * conector.
 *
 * O id é a URL: `/dashboard/sessions/{id}`. Ponteiro, não credencial — quem
 * abrir precisa de sessão no navegador e ser dono. Isso importa porque o link
 * é devolvido a um LLM e vai parar no histórico de conversa dele.
 */
export const mcpSessions = pgTable('mcp_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: text('title'),
  status: text('status').default('open').notNull(),
  /**
   * O que a sessão espera do humano agora. `null` = nada, o agente segue
   * sozinho. É isto que transforma o espelho em mão dupla: o agente para,
   * pede, e o resultado volta por `handoff`.
   */
  awaiting: text('awaiting'),
  /** O que o humano devolveu. Lido pelo agente na chamada seguinte. */
  handoff: jsonb('handoff'),
  /** Cliente que abriu, como ele se declarou. Procedência, não autenticação. */
  client: text('client'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  check('mcp_sessions_status_check', sql`${table.status} IN ('open', 'done', 'error')`),
  check('mcp_sessions_awaiting_check', sql`${table.awaiting} IS NULL OR ${table.awaiting} IN ('sources')`),
]);

/** Uma linha do tempo por sessão. Append-only: evento não se edita. */
export const mcpSessionEvents = pgTable('mcp_session_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').references(() => mcpSessions.id, { onDelete: 'cascade' }).notNull(),
  /** Ordem estável. `created_at` empata quando dois eventos caem no mesmo ms. */
  seq: integer('seq').notNull(),
  kind: text('kind').notNull(),
  message: text('message').notNull(),
  detail: jsonb('detail'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  check('mcp_session_events_kind_check', sql`${table.kind} IN ('info', 'ok', 'warn', 'error')`),
]);

export const oauthConnections = pgTable('oauth_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  provider: text('provider').notNull(), // 'slack', 'notion', 'github', etc.
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const skills = pgTable('skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  sourceType: text('source_type').default('youtube').notNull(),
  sourceQuery: text('source_query'),
  playlistUrl: text('playlist_url'), // Made optional for retro-compatibility
  sourceUrls: jsonb('source_urls'),
  playlistTitle: text('playlist_title'),
  channelName: text('channel_name'),
  channelId: text('channel_id'),
  name: text('name'),
  description: text('description'),
  channelImageUrl: text('channel_image_url'),
  skillMdContent: text('skill_md_content'),
  humanMdContent: text('human_md_content'),
  skillPackage: jsonb('skill_package'),
  skillJsonOutput: jsonb('skill_json_output'),
  skillDocument: jsonb('skill_document'),
  targetFormat: text('target_format').default('generic'),
  language: text('language').default('en'),
  version: integer('version').default(1),
  status: text('status').default('queued'),
  /**
   * Segredo do link de instalação do plugin.
   *
   * `GET /:id/plugin` é buscado pela IDE do usuário, que não tem cookie de
   * sessão — então essa rota não pode exigir uma. Enquanto isso significou
   * "rota aberta", o id da skill VIRAVA a credencial: ele aparece na URL do
   * painel, e quem o visse baixava o pacote de qualquer conta.
   *
   * O token separa as duas coisas. O id continua público, o acesso passa a
   * depender de um segredo que só o dono enxerga, e trocar o segredo não troca
   * a skill. Nulo até a primeira vez que o dono abre a skill — não há como
   * preencher o passado numa migration de schema sem inventar valor por linha.
   */
  shareToken: text('share_token').unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => [
  check('skills_status_check', sql`${table.status} IN ('queued', 'processing', 'extracting', 'synthesizing', 'completed', 'failed')`),
]);

export const skillVideos = pgTable('skill_videos', {
  id: uuid('id').defaultRandom().primaryKey(),
  skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'cascade' }).notNull(),
  videoId: text('video_id').notNull(),
  url: text('url').notNull(),
  title: text('title'),
  description: text('description'),
  pinnedComment: text('pinned_comment'),
  durationSeconds: integer('duration_seconds'),
  categoryId: text('category_id'),
  tags: jsonb('tags'),
  thumbnailUrl: text('thumbnail_url'),
  publishedAt: timestamp('published_at'),
  transcriptSource: text('transcript_source'),
  transcriptLanguage: text('transcript_language'),
  transcriptContent: text('transcript_content'),
  extractedCard: jsonb('extracted_card'),
  spritesheetUrl: text('spritesheet_url'),
  spritesheetMetadata: jsonb('spritesheet_metadata'),
  processingStatus: text('processing_status').default('pending'),
  error: text('error'),
  retryCount: integer('retry_count').default(0),
  processedAt: timestamp('processed_at')
}, (table) => [
  uniqueIndex('skill_video_unique').on(table.skillId, table.videoId),
  index('skill_videos_skill_id_idx').on(table.skillId),
  check('skill_videos_status_check', sql`${table.processingStatus} IN ('pending', 'processing', 'completed', 'failed', 'skipped')`),
]);

export const pipelineLogs = pgTable('pipeline_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'cascade' }).notNull(),
  runId: text('run_id').notNull(),
  videoLogs: jsonb('video_logs'),
  synthesisLog: jsonb('synthesis_log'),
  totalInputTokens: integer('total_input_tokens'),
  totalOutputTokens: integer('total_output_tokens'),
  // Micro-dólares (1 USD = 1_000_000). Inteiro de propósito: dinheiro em float
  // acumula erro, e este campo soma dezenas de chamadas por execução.
  estimatedCostMicroUsd: integer('estimated_cost_micro_usd'),
  totalDurationMs: integer('total_duration_ms'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});


// ============================================================================
// Base da IA — a wiki do usuario, online.
//
// Modelo do Karpathy LLM-Wiki / Obsidian: um arquivo e uma linha. O `content`
// e a fonte da verdade e carrega o frontmatter YAML; as colunas ao lado sao
// DERIVADAS dele na escrita, so para indexar e filtrar. A estrutura continua
// morando no markdown, como no cofre local.
//
// Apenas a `wiki/` sobe. O `raw/` (fontes originais, binarios) permanece fora:
// o campo `sources` do frontmatter aponta para ele por referencia.
// ============================================================================

export const kbPages = pgTable('kb_pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

  /** Caminho no cofre: `wiki/features/x.md`, `wiki/index.md`, `wiki/tracking.canvas`. */
  path: text('path').notNull(),
  /** Markdown com frontmatter, ou JSON no caso do canvas. Fonte da verdade. */
  content: text('content').notNull(),

  // --- derivados do frontmatter, mantidos em sincronia na escrita ---
  title: text('title'),
  /** architecture | feature | decision | integration | security | workflow | migration | output | stakeholder | canvas | meta */
  type: text('type'),
  /** Sub-produto, quando o projeto e multi-produto. Nulo na maioria dos casos. */
  namespace: text('namespace'),
  status: text('status').default('active'),
  tags: jsonb('tags').$type<string[]>().default([]),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  // Um caminho e unico dentro do cofre de cada usuario.
  uniqueIndex('kb_pages_user_path_unq').on(table.userId, table.path),
  index('kb_pages_user_type_idx').on(table.userId, table.type),
  index('kb_pages_user_updated_idx').on(table.userId, table.updatedAt),
]);

/**
 * Espelho do `log.md`: append-only por contrato (regra 6 do schema Karpathy).
 * Nunca sofre UPDATE nem DELETE — corrigir e adicionar uma linha nova.
 *
 * Alimenta duas coisas ao mesmo tempo: a auditoria e a timeline do canvas,
 * que sao o mesmo dado visto de dois angulos.
 */
export const kbLog = pgTable('kb_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

  /** ingest | query | lint | consolidate | commit | write | remove-request | remove-approved */
  action: text('action').notNull(),
  /** Caminho afetado, quando a operacao mexe numa pagina. */
  pagePath: text('page_path'),
  summary: text('summary').notNull(),

  /**
   * Qual agente escreveu. A base e multi-canal: o mesmo cofre e alcancado do
   * Claude, do Cursor, do ChatGPT. Quando duas entradas se contradizem, saber
   * a origem e o que permite ao humano decidir.
   */
  channel: text('channel'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('kb_log_user_created_idx').on(table.userId, table.createdAt),
]);


/**
 * A assinatura, espelhada do Stripe.
 *
 * O Stripe é a fonte da verdade do estado de pagamento; esta tabela existe para
 * o app não precisar de uma chamada de rede a cada request para saber se a
 * pessoa está em dia. `users.plan` continua sendo o que os portões leem — aqui
 * fica o porquê dele estar assim.
 */
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').unique().notNull(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  /** Plano que esta assinatura concede. */
  plan: text('plan').notNull(),
  /** `active`, `trialing`, `past_due`, `canceled`... vem do Stripe sem tradução. */
  status: text('status').notNull(),
  priceId: text('price_id'),
  currency: text('currency'),
  interval: text('interval'),
  /** Até quando está pago. Depois disto, sem renovação, o plano cai. */
  currentPeriodEnd: timestamp('current_period_end'),
  /** Cancelou mas segue valendo até o fim do período já pago. */
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('subscriptions_user_idx').on(table.userId),
]);

/**
 * Eventos já processados do webhook.
 *
 * O Stripe reentrega um evento até receber 2xx, e reentrega também quando a
 * resposta demora. Sem esta tabela, uma reentrega de `invoice.paid` recarregaria
 * os créditos do mês de novo. A chave primária é o id do evento — inserir duas
 * vezes viola a PK, e é assim que a duplicata é detectada.
 */
export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
});
