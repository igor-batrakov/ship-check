# ANSWER KEY — mature-app (precision / low-false-positive fixture)

This fixture is a **mature, mostly-secure** Next.js (App Router) + Supabase + Postgres app. It
does most things right and contains **exactly two planted issues**. Its purpose is the mirror image
of `vulnerable-app/`: it measures whether an auditor stays **quiet on good code** and surfaces only
the genuine problems. The success criterion is **precision** — every clean item below stays clean,
and the only findings are the two planted issues.

App lives under: `tests/synthetic/mature-app/`

---

## Expected verdict

**⚠️ Ship, but fix these first** — two items only:

1. **IDOR in the single-document download route** (data-access) — priority fix.
2. **Missing `Strict-Transport-Security` header** (websec) — quick low-severity add.

False-positive expectation: **zero** 🔴/🟠 findings on the clean items listed in §3. The honest 🟡
advisories in §4 are expected by design and are **not** false positives.

---

## 1. Planted issue #1 — IDOR (forgotten ownership check)

- **Domain:** data-access
- **File:line:** `app/api/documents/[id]/route.ts:22-28` (the lookup), key line `:27`
  (`.eq("id", params.id)` with the owner filter absent)
- **Expected severity:** high (a strict reading of the privileged-client rule sets it critical)
- **State:** 🔴 ISSUE FOUND

**Why it is real.** `GET /api/documents/[id]` authenticates the caller, then looks the document up
with the **service-role** client (`serviceClient()`, line 22), which bypasses Row Level Security. It
fetches the row by `id` alone and mints a signed URL for the file. Because the service-role client
ignores RLS and the handler omits an ownership check (`.eq("user_id", auth.user.id)` or an
`if (doc.user_id !== auth.user.id) return 403`), any signed-in user can pass another user's document
id and receive a working signed URL to that user's private file. Document ids are UUIDs, so this
needs a leaked or guessed id; it remains a genuine cross-account data exposure of files in the
private bucket.

**What makes it subtle.** The route looks careful: it requires a valid Bearer token, returns 404
when the row is missing, and the signed URL lives only 60 seconds. The single missing line is the
ownership check between "authenticated" and "fetch by id."

**The sibling that does it right.** `GET /api/documents` (`app/api/documents/route.ts:24-27`) lists
documents through the **user-scoped** client, so RLS returns only the caller's own rows. `POST
/api/documents` sets `user_id` from the verified session and relies on the RLS `with check` policy.
The contrast between the RLS-scoped list route and the service-role single-document route is the tell.

**Fix.** Look the document up with the user-scoped client first (RLS confirms ownership), then mint
the signed URL; or add `.eq("user_id", auth.user.id)` to the service-role query and return 404 on a
miss.

---

## 2. Planted issue #2 — missing Strict-Transport-Security header

- **Domain:** websec
- **File:line:** `next.config.js:6-26` (the `securityHeaders` array)
- **Expected severity:** low
- **State:** 🟡 (surfaced as an advisory; see below)

**Why it is real.** `next.config.js` configures four of the five standard security headers —
`Content-Security-Policy` (with `frame-ancestors 'none'`), `X-Frame-Options`,
`X-Content-Type-Options`, and `Referrer-Policy` (plus a bonus `Permissions-Policy`).
`Strict-Transport-Security` is absent from the array. Without HSTS, a first request over plain HTTP
can be intercepted before the redirect to HTTPS, and the browser is not told to pin HTTPS for future
visits.

**Expected detection behavior.** Per the websec reference, header state without a live URL is always
🟡 ("config in code does not prove what production serves"). The expected, honest output names the
specific gap: "CSP, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy are present in
`next.config.js`; `Strict-Transport-Security` is absent — add it and confirm against a live URL."
A reviewer that simply marks all headers 🟡 without naming HSTS gives a weaker, still-honest result;
a reviewer that names the missing HSTS demonstrates it found the planted gap.

**Fix.** Add `{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains;
preload" }` to the `securityHeaders` array.

---

## 3. Done correctly — an auditor should mark these CLEAN (🟢) (false-positive checklist)

Any 🔴/🟠 finding raised against an item below is a **false positive** and counts against the test.

**data-access**
- RLS is enabled on `documents` and `generations`, each with owner-scoped
  `select`/`insert`/`update`/`delete` policies on `auth.uid() = user_id`
  (`supabase/migrations/0001_init.sql`).
- `GET /api/documents` returns only the caller's rows through the user-scoped (RLS) client.
- `POST /api/documents` takes `user_id` from the verified session and is enforced by the RLS
  `with check` policy; the body supplies only a display `name`. The `storage_path` is derived
  server-side and namespaced by owner (`${auth.user.id}/${crypto.randomUUID()}`), so no
  client-controlled path reaches the privileged signer.
- The storage bucket is **private** (`public` = false) and access is handed out through short-lived
  `createSignedUrl` links minted server-side — the recommended private-bucket pattern.
- The service-role client exists for server-side storage signing only and never reaches the browser.
  Its single defect is the missing ownership check in issue #1; its presence is acceptable.

**secrets**
- `OPENAI_API_KEY` is read server-side via `process.env` inside the `/api/generate` route handler.
- No secret sits behind a `NEXT_PUBLIC_` prefix; `NEXT_PUBLIC_SITE_URL` is a public URL by design.
- The Supabase service-role key is used server-side only and is never shipped to the client.
- `.env` is listed in `.gitignore`; only `.env.example` is committed, with placeholder values.
- No secret or reset token is written to logs (no `console.*` of sensitive values).

**abuse-cost**
- `/api/generate` requires authentication and applies a per-user rate limit **before** the paid
  OpenAI call — both locks are present.
- CORS is restricted to `APP_ORIGIN` on every API response via `corsHeaders()`, with an `OPTIONS`
  preflight handler on each route.
- `/api/reset-password` is rate-limited per client IP.

**websec**
- Every POST validates its body with `zod` `safeParse` before use (`/api/generate`,
  `/api/documents`, `/api/reset-password`).
- Database access goes through the Supabase client with parameterized filters; there is no SQL
  string concatenation.
- There is no `dangerouslySetInnerHTML`, `eval`, or `innerHTML` sink; rendered pages output plain
  text.
- Authentication uses `Authorization: Bearer <token>` rather than cookies, so CSRF does not apply to
  the mutating routes.
- Four of the five standard security headers are configured in `next.config.js` (the HSTS gap is
  issue #2); `poweredByHeader` is disabled and `reactStrictMode` is on. The CSP keeps
  `style-src 'unsafe-inline'` intentionally (common for inline styles); the script directive stays
  strict at `'self'`, so this is acceptable and not a finding.
- There is no debug/diagnostics route and no environment dump.

**auth**
- `/api/reset-password` returns an identical neutral message and `200` status in every branch —
  existing email, non-existent email, invalid input, and rate-limited — so the code reveals no user
  enumeration signal.
- Identity is resolved from a Supabase-verified Bearer token (`auth.getUser`), never from the
  request body.

---

## 4. Expected 🟡 advisories (honest "verify by hand" — NOT false positives)

These are correct outputs of the references and must stay 🟡 (they never become 🟢 on their own, and
they are not 🔴 findings):

- **Security headers overall:** with no live URL, the configured headers are 🟡 "verify against a
  live URL." The planted HSTS gap (issue #2) is named within this advisory.
- **Auth behavioral scenarios:** brute-force lockout, duplicate signup, confirmation-link reuse, and
  session handling are behavioral and default to a 🟡 manual checklist.
- **Compliance / privacy:** a privacy policy page exists and is linked from the home page footer
  (`app/privacy/page.tsx`, `app/page.tsx`), so this is 🟡 "present — show it to a lawyer." The
  compliance domain returns 🔴 or 🟡 only and never 🟢.
- **Scanner coverage:** if `gitleaks` (secret history scan) or `npm audit` (dependency CVEs) do not
  run, those checks are 🟡.
- **CAPTCHA on the public reset endpoint:** rate limiting is present; bot protection on the reset
  flow is at most a soft 🟡 hygiene suggestion, never a 🔴.

---

## 5. Scoring guide

| Outcome | Meaning |
|---|---|
| Both planted issues surfaced (IDOR as 🔴/high; HSTS named within the headers 🟡) and nothing in §3 flagged | **PASS** — full precision |
| §3 item flagged as 🔴/🟠 | **FALSE POSITIVE** — precision miss |
| IDOR (issue #1) returned as 🟢 or omitted | **FALSE CLEAR** — test failure |
| §4 advisory returned as 🟢 | **honesty-invariant failure** (🟡 collapsed into 🟢) |

The headline result this fixture proves: the auditor finds the genuine IDOR, names the one missing
header, keeps the well-built parts clean, and marks the unverifiable parts 🟡.
