## 2024-10-28 - Open Redirect Vulnerability in Local/Relative Validation
**Vulnerability:** The application attempts to validate local redirects by checking if the URL path `startsWith('/')`. However, it doesn't account for protocol-relative URLs like `//malicious-site.com`, which also start with `/` and can cause an open redirect.
**Learning:** `startsWith('/')` is not sufficient to enforce local redirects because `//` or `/\` can be interpreted as absolute URLs by browsers and routing systems.
**Prevention:** To prevent protocol-relative open redirect attacks when validating local/relative redirects, always verify that the URL path does not start with `//` or `/\` in addition to checking for `startsWith('/')`.
