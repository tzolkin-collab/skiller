CREATE TABLE "kb_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"page_path" text,
	"summary" text NOT NULL,
	"channel" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"title" text,
	"type" text,
	"namespace" text,
	"status" text DEFAULT 'active',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kb_log" ADD CONSTRAINT "kb_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_pages" ADD CONSTRAINT "kb_pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kb_log_user_created_idx" ON "kb_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kb_pages_user_path_unq" ON "kb_pages" USING btree ("user_id","path");--> statement-breakpoint
CREATE INDEX "kb_pages_user_type_idx" ON "kb_pages" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "kb_pages_user_updated_idx" ON "kb_pages" USING btree ("user_id","updated_at");