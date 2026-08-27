CREATE UNIQUE INDEX "skill_video_unique" ON "skill_videos" USING btree ("skill_id","video_id");--> statement-breakpoint
CREATE INDEX "skill_videos_skill_id_idx" ON "skill_videos" USING btree ("skill_id");--> statement-breakpoint
ALTER TABLE "mcp_devices" ADD CONSTRAINT "mcp_devices_status_check" CHECK ("mcp_devices"."status" IN ('pending', 'authorized', 'expired'));--> statement-breakpoint
ALTER TABLE "skill_videos" ADD CONSTRAINT "skill_videos_status_check" CHECK ("skill_videos"."processing_status" IN ('pending', 'processing', 'completed', 'failed', 'skipped'));--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_status_check" CHECK ("skills"."status" IN ('queued', 'processing', 'extracting', 'synthesizing', 'completed', 'failed'));