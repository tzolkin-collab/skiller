## 2024-10-27 - Protocol-Relative Open Redirects
**Vulnerability:** A generic `startsWith('/')` check is insufficient for path verification. It permits URLs starting with `//` or `/\`, acting as protocol-relative URLs that can redirect a user away from the application to a potentially malicious site while still passing the validation step.
**Learning:** `startsWith('/')` alone does not prevent open redirects when using browser redirects (e.g. `NextResponse.redirect` or hono `c.redirect`), since browser parses protocol-relative URLs.
**Prevention:** In addition to `startsWith('/')`, explicitly block URLs that start with `//` or `/\` by using `&& !url.startsWith('//') && !url.startsWith('/\\')`.
