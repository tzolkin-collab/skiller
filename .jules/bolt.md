## 2024-05-18 - Missing Foreign Key Indexes
**Learning:** Drizzle ORM does not automatically create database indexes for foreign key constraints in Postgres. This can lead to slow sequential scans on tables when filtering or joining by these keys (e.g. `userId`, `skillId`).
**Action:** Always explicitly define indexes using `index("idx_name").on(table.column)` in Drizzle schema definitions for columns used in foreign keys, especially those that are frequently queried.
