ALTER TABLE "skills" DROP CONSTRAINT "skills_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan_valid_until" timestamp;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;