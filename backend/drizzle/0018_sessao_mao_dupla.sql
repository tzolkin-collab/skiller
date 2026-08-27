ALTER TABLE "mcp_sessions" ADD COLUMN IF NOT EXISTS "awaiting" text;--> statement-breakpoint
ALTER TABLE "mcp_sessions" ADD COLUMN IF NOT EXISTS "handoff" jsonb;--> statement-breakpoint
ALTER TABLE "mcp_sessions" DROP CONSTRAINT IF EXISTS "mcp_sessions_awaiting_check";--> statement-breakpoint
ALTER TABLE "mcp_sessions" ADD CONSTRAINT "mcp_sessions_awaiting_check" CHECK ("mcp_sessions"."awaiting" IS NULL OR "mcp_sessions"."awaiting" IN ('sources'));
