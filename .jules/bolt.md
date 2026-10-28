## 2024-05-14 - Missing database indexes for foreign key constraints

**Learning:** Drizzle ORM does not automatically create database indexes for foreign key constraints in Postgres. This codebase had multiple frequently queried foreign keys (`user_id`, `session_id`, `skill_id`) across several tables (`mcp_devices`, `mcp_sessions`, `mcp_session_events`, `oauth_connections`, `skills`, `pipeline_logs`) that lacked indexes, which can lead to inefficient sequential scans.

**Action:** When adding new foreign key relationships in `backend/src/db/schema.ts`, always ensure you explicitly define an index using `index('idx_name').on(table.column)` within the `pgTable`'s third argument callback.
