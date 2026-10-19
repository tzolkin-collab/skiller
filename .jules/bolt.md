## 2024-10-19 - Missing Foreign Key Indexes with Drizzle ORM
**Learning:** Drizzle ORM does not automatically create database indexes for foreign key constraints in Postgres. This can cause severe performance bottlenecks due to sequential scans during JOINs and cascading deletes.
**Action:** When defining foreign key relationships in `drizzle-orm` schemas (e.g., using `.references()`), always manually specify an index using `index('idx_name').on(table.column)` within the table's configuration block.
