CREATE TABLE IF NOT EXISTS "mcp_session_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_session_events_kind_check" CHECK ("mcp_session_events"."kind" IN ('info', 'ok', 'warn', 'error'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"status" text DEFAULT 'open' NOT NULL,
	"awaiting" text,
	"handoff" jsonb,
	"client" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_sessions_status_check" CHECK ("mcp_sessions"."status" IN ('open', 'done', 'error')),
	CONSTRAINT "mcp_sessions_awaiting_check" CHECK ("mcp_sessions"."awaiting" IS NULL OR "mcp_sessions"."awaiting" IN ('sources'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" jsonb DEFAULT '{}'::jsonb;