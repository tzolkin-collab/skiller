## 2024-10-26 - Missing Foreign Key Indexes in Drizzle ORM
**Learning:** Drizzle ORM does not automatically create database indexes for foreign key constraints in Postgres. This can lead to slow queries and full table scans on cascading deletions or simple foreign key lookups, a common codebase-specific anti-pattern.
**Action:** Always explicitly define them using `index('idx_name').on(table.column)` in schema definitions when adding new tables with foreign keys.
