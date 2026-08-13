# backend/scripts

Ad-hoc development utilities. Not part of the build — `tsconfig.json` only
compiles `src/**`, so these stay plain `.js` and are run directly with Node.

Run them from the `backend/` directory so `../.env` resolves:

```bash
node scripts/create-db.js
```

| Script | Purpose |
|:---|:---|
| `create-db.js` | Creates the `skiller` database on a fresh server |
| `debug-db.js` | Dumps current rows for manual inspection |
| `force-retry.js` | Re-queues a hardcoded skill id via the retry endpoint |
| `test-api.js` | Smoke-tests `POST /api/skills` against a local server |
| `test-gemini.js` | Checks that `GEMINI_API_KEY` reaches the model |

None of them read secrets from source — everything comes from the root `.env`.
