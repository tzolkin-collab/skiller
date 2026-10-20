
## 2024-05-18 - Missing DB Indexes on Drizzle Foreign Keys
**Learning:** Drizzle ORM does not automatically create database indexes for foreign key constraints in Postgres in this codebase, unlike some other ORMs or SQL engines. This can cause severe performance bottlenecks during query joins due to sequential scans.
**Action:** When creating tables with foreign keys via `references()`, always include explicit index definitions inside the extra parameters arrow function of `pgTable`, e.g., `index('idx_name').on(table.column)`.
