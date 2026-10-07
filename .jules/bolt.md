## 2024-05-18 - Missing Drizzle ORM Foreign Key Indexes
**Learning:** Drizzle ORM does not automatically create database indexes for foreign key constraints in Postgres. Without explicit indexes (`index('idx_name').on(table.column)`), this results in sequential scans during cascading deletes and join/lookup queries, severely impacting database query performance.
**Action:** When adding new tables or foreign key references in `backend/src/db/schema.ts`, always ensure explicit index declarations are added in the Drizzle schema definition.
