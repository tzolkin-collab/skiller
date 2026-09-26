## 2024-05-18 - [Dashboard Memoization]
**Learning:** Found an expensive deduplication operation happening on every render in DashboardClient that was taking ~80ms with 10k items. Since `useSWRInfinite` can trigger multiple re-renders when data updates, this was a significant bottleneck.
**Action:** Always verify if data manipulation involving `Array.from` and `new Map()` happens directly on render. If they do, wrap them in `useMemo` specifically for list aggregations like infinite scrolling.
