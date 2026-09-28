## 2024-05-19 - [Added missing user_id index to skills table]
**Learning:** The `skills` table lacked a database index on the `userId` field, despite being frequently queried by user id across several API routes (e.g., `skills.ts`, `kb.ts`, `account.ts`). This is a common performance bottleneck where foreign keys used for filtering cause sequential scans instead of O(log N) index lookups.
**Action:** Always check frequently filtered foreign key columns in Drizzle schema definitions for missing indexes.
