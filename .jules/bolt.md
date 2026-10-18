
## 2024-10-18 - Missing Foreign Key Indexes with Drizzle ORM
**Learning:** Drizzle ORM does not automatically create database indexes for foreign key constraints in Postgres. This leads to missing indexes on relational queries, causing O(N) sequential scans instead of efficient lookups.
**Action:** When creating new schemas with foreign keys in Drizzle ORM, explicitly define them using `index('idx_name').on(table.column)` to prevent sequential scans. Always audit foreign keys for missing indexes.
