CREATE TABLE IF NOT EXISTS "mcp_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"status" text DEFAULT 'open' NOT NULL,
	"client" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_sessions_status_check" CHECK ("mcp_sessions"."status" IN ('open', 'done', 'error'))
);
--> statement-breakpoint
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
ALTER TABLE "mcp_sessions" ADD CONSTRAINT "mcp_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_session_events" ADD CONSTRAINT "mcp_session_events_session_id_mcp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."mcp_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_sessions_user_idx" ON "mcp_sessions" ("user_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_session_events_seq_idx" ON "mcp_session_events" ("session_id","seq");
