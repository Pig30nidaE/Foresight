# Production security checklist

## CORS

- Set `FORESIGHT_CORS_ORIGINS` on the API to an explicit comma-separated list of allowed browser origins (no wildcards in production).
- Include every deployed frontend URL (production, preview/staging if used) and omit trailing slashes.
- Do not rely on the default localhost / legacy Vercel entries in production.

## JWT / bridge (NextAuth → FastAPI)

- `JWT_SECRET` (backend) must match the secret used to sign bridge tokens from the Next.js app. By default the Next route uses `AUTH_SECRET`; keep `JWT_SECRET` and `AUTH_SECRET` aligned unless you use a dedicated bridge secret.
- Optional `BRIDGE_JWT_SECRET`: if set in **both** `frontend` (e.g. Vercel) and `backend`, tokens from `GET /api/backend-jwt` are verified with this value instead of `JWT_SECRET`.
- `JWT_ISSUER` must match on issuer checks (default `foresight.local`); the Next route uses `process.env.JWT_ISSUER ?? "foresight.local"`.
- Bridge token lifetime: align `JWT_EXPIRE_MINUTES` (backend) with `BRIDGE_JWT_EXPIRE_SECONDS` or `JWT_EXPIRE_MINUTES` on the frontend (see `frontend/src/lib/bridgeJwt.ts`). NextAuth session `maxAge` / `updateAge` are separate from API JWT lifetime.

## Sessions vs API tokens

- Long-lived session cookies do not extend backend JWT automatically; the client refreshes the bridge JWT via `/api/backend-jwt` (with cache invalidation on 401).

## Dependency scanning

- Run `pip-audit` in `backend/` and `npm audit` (or CI workflow `security-audit.yml`) regularly and patch reported issues.

## Further hardening (optional)

- Tighten `Content-Security-Policy` beyond report-only once script/style/connect sources are fully enumerated (Next.js often needs `'unsafe-inline'` / `'unsafe-eval'` during migration).
- Run [OWASP ZAP](https://www.zaproxy.org/) baseline against a staging URL in CI if you have a stable environment.
- CAPTCHA (e.g. mCaptcha, ALTCHA) on signup or high-volume write endpoints if bots become an issue.
