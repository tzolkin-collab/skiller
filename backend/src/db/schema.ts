import { pgTable, text, timestamp, integer, jsonb, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').unique().notNull(),
  name: text('name'),
  plan: text('plan').default('starter').notNull(),
  creditsBalance: integer('credits_balance').default(1000).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
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
});

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
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  playlistUrl: text('playlist_url').notNull(),
  playlistTitle: text('playlist_title'),
  channelName: text('channel_name'),
  channelId: text('channel_id'),
  name: text('name'),
  description: text('description'),
  skillMdContent: text('skill_md_content'),
  humanMdContent: text('human_md_content'),
  skillPackage: jsonb('skill_package'),
  skillJsonOutput: jsonb('skill_json_output'),
  targetFormat: text('target_format').default('generic'),
  language: text('language').default('en'),
  version: integer('version').default(1),
  status: text('status').default('queued'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

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
  processingStatus: text('processing_status').default('pending'),
  error: text('error'),
  retryCount: integer('retry_count').default(0),
  processedAt: timestamp('processed_at')
});

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
