CREATE TABLE "pipeline_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"run_id" text NOT NULL,
	"video_logs" jsonb,
	"synthesis_log" jsonb,
	"total_input_tokens" integer,
	"total_output_tokens" integer,
	"estimated_cost_usd" integer,
	"total_duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"video_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"description" text,
	"pinned_comment" text,
	"duration_seconds" integer,
	"category_id" text,
	"tags" jsonb,
	"thumbnail_url" text,
	"published_at" timestamp,
	"transcript_source" text,
	"transcript_language" text,
	"transcript_content" text,
	"extracted_card" jsonb,
	"processing_status" text DEFAULT 'pending',
	"error" text,
	"retry_count" integer DEFAULT 0,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playlist_url" text NOT NULL,
	"playlist_title" text,
	"channel_name" text,
	"channel_id" text,
	"name" text,
	"description" text,
	"skill_md_content" text,
	"skill_json_output" jsonb,
	"version" integer DEFAULT 1,
	"status" text DEFAULT 'queued',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_logs" ADD CONSTRAINT "pipeline_logs_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_videos" ADD CONSTRAINT "skill_videos_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;