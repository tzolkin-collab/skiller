## 2024-10-29 - Missing Indexes on Foreign Keys in Drizzle ORM
**Learning:** Drizzle ORM does not automatically create database indexes for foreign key constraints in Postgres. This can lead to sequential scans and significant performance bottlenecks, especially when performing cascading deletes or joining tables.
**Action:** When defining foreign key columns in `schema.ts`, always explicitly add an index using `index('idx_name').on(table.column)` in the `pgTable` callback.
