CREATE INDEX "mcp_devices_user_idx" ON "mcp_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_session_events_session_idx" ON "mcp_session_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "mcp_sessions_user_idx" ON "mcp_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pipeline_logs_skill_id_idx" ON "pipeline_logs" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skills_user_idx" ON "skills" USING btree ("user_id");