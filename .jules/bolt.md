## 2026-09-30 - Missing DB Indexes on User Filtered Tables
**Learning:** Tables heavily queried by `userId` (like `skills`) may lack corresponding indexes despite having foreign keys to the `users` table. This leads to sequential scans instead of index scans, which is a performance pattern to watch out for.
**Action:** When working with DB queries filtered by foreign keys (e.g., `userId`), always verify that an index exists on that foreign key column.
