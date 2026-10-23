## 2025-02-18 - [Timing Attack in Authentication]
**Vulnerability:** A timing attack vulnerability existed in `conferirSenha` which returned immediately if the user email wasn't found (no `passwordHash` stored). An attacker could enumerate registered emails based on the response time.
**Learning:** Checking credentials must take a constant time regardless of whether the user exists or not, to prevent information leakage.
**Prevention:** Use a dummy hash (such as one derived from scrypt) when evaluating credentials for non-existent users so that the execution time stays consistent with existent users.
