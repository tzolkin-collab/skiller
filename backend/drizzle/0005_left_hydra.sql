ALTER TABLE "skills" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" text DEFAULT 'starter' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "credits_balance" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;