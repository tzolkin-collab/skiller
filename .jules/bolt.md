## 2026-10-25 - Missing Database Indices on Foreign Keys
**Learning:** Drizzle ORM does not automatically create database indices for foreign key constraints in Postgres. Without them, queries joining on or filtering by foreign keys (e.g. `where(eq(table.userId, ...))`) will fall back to costly sequential scans, which scales poorly as the table grows.
**Action:** Always verify that foreign key relationships are paired with an explicit `index('idx_name').on(table.column)` in schema definitions to ensure optimal performance.
