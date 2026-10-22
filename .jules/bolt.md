## 2024-05-14 - Drizzle ORM Foreign Key Indexes
**Learning:** Drizzle ORM does not automatically create database indexes for foreign key constraints in Postgres. This can lead to sequential scans and performance bottlenecks on relational queries.
**Action:** When defining tables in Drizzle schema with foreign keys, always explicitly add an index in the table configuration block using `index('idx_name').on(table.column)`.
