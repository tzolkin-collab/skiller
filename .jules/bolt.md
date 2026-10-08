## 2024-10-08 - Explicit Indexes on Foreign Keys
**Learning:** Drizzle ORM does not automatically create database indexes for foreign key constraints in Postgres.
**Action:** Always explicitly define indexes using `index('idx_name').on(table.column)` in schema definitions to prevent sequential scans.
