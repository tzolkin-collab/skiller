## 2023-11-20 - [HIGH] Open Redirect via Protocol-Relative URLs
**Vulnerability:** Open redirect where user input for redirect queries (`next`) is checked only with `startsWith('/')`, allowing bypasses via protocol-relative URLs (e.g., `//evil.com`).
**Learning:** In frontend (Next.js server paths) and backend (Hono server routes), simply verifying that a URL starts with a slash does not prevent redirection to another domain, as `//` forms a valid URL protocol relative path.
**Prevention:** Ensure that redirect paths do not just start with `/` but also avoid starting with `//` by explicitly checking `path.startsWith('/') && !path.startsWith('//')` before accepting them as local redirects.
