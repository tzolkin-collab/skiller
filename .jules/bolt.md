## 2024-10-27 - [Performance] Missing Foreign Key Indexes
**Learning:** Drizzle ORM does not automatically create database indexes for foreign key constraints in Postgres. This was resulting in multiple foreign keys (like `mcpDevices.userId`, `skills.userId`) lacking indexes which could cause slow sequential scans on cascading deletes and joins.
**Action:** Always verify that an `index('idx_name').on(table.column)` is explicitly defined in `(table) => [...]` blocks for all foreign keys.
