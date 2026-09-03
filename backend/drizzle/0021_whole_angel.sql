ALTER TABLE "skills" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_share_token_unique" UNIQUE("share_token");