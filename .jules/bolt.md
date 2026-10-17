## 2024-05-18 - Missing Foreign Key Indexes in Drizzle ORM
**Learning:** Drizzle ORM does not automatically create database indexes for foreign key constraints in Postgres. This causes full table scans on relational queries.
**Action:** When adding foreign key columns (`.references(...)`), always explicitly define the database index in the schema using `index('idx_name').on(table.column)` to ensure performance is not degraded.
