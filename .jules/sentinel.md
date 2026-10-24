## 2024-05-15 - Open Redirect via Protocol-Relative URLs
**Vulnerability:** Open redirect bypasses were possible because `startsWith('/')` allows protocol-relative URLs like `//attacker.com` or `/\attacker.com` which browsers resolve as absolute URLs.
**Learning:** `startsWith('/')` is an insufficient check for ensuring a URL is local/relative.
**Prevention:** Always check `startsWith('/') && !startsWith('//') && !startsWith('/\\')` when validating local redirect paths.
