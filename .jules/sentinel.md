## 2025-02-14 - Protocol-Relative Open Redirects
**Vulnerability:** Open redirect using protocol-relative URLs (`//example.com`) bypassing `startsWith('/')` checks.
**Learning:** `startsWith('/')` is insufficient to validate local/relative redirects because protocol-relative URLs like `//evil.com` or `/\evil.com` also start with `/` and can redirect users to an external site.
**Prevention:** Always verify that the URL path does not start with `//` or `/\` in addition to checking for `startsWith('/')`. Example: `next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')`.
