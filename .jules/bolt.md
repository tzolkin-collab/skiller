## 2024-06-25 - Missing Indexes on Foreign Keys
**Learning:** Drizzle ORM does not automatically create database indexes for foreign key constraints in Postgres. You must explicitly define them using `index('idx_name').on(table.column)` in schema definitions to prevent sequential scans when querying by those foreign keys.
**Action:** Always add `index` definitions alongside `references` definitions for foreign keys in Drizzle schema files, and check existing schemas for missing indexes.
