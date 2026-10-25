## 2023-10-25 - Open Redirect via Protocol-Relative URLs
**Vulnerability:** The application was vulnerable to Open Redirect attacks. Validation of return URLs (like `next` parameter) incorrectly assumed that any string starting with `/` was a safe internal path (e.g., `startsWith('/')`).
**Learning:** Checking if a path `startsWith('/')` is insufficient because an attacker can pass protocol-relative URLs like `//malicious.com` or `/\malicious.com` which evaluate to true but redirect the user to an external domain.
**Prevention:** When validating internal redirect paths, always enforce that they start with `/` AND do not start with `//` or `/\`.
