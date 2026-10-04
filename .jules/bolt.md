## 2024-10-04 - Missing database indexes on foreign keys
**Learning:** Drizzle ORM does not automatically create database indexes for foreign key constraints in Postgres. Missing indexes on frequently queried fields like `userId` cause sequential scans.
**Action:** When creating new schemas with foreign keys in Drizzle, explicitly add indexes using `index('idx_name').on(table.column)` to avoid performance bottlenecks.
