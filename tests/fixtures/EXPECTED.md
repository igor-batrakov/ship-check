# EXPECTED — what the audit MUST find on vulnerable-app

The oracle for the e2e run. The audit against `vulnerable-app/` must:
- **find EVERY** planted hole below (🔴/🟠);
- mark **🟡** (not 🟢) whatever it couldn't verify (no scanner, no live URL, behavior);
- produce the verdict **🚫 NOT READY TO SHIP**.

Missing any 🔴 hole (returning 🟢 instead of a finding) = **TEST FAILURE**.

## Planted holes

| # | Domain | Hole | Where | Expected |
|---|---|---|---|---|
| 1 | secrets | secret behind the public `NEXT_PUBLIC_OPENAI_KEY` prefix | `app/page.tsx` | 🔴 critical |
| 2 | secrets | a paid API key used straight in the browser | `app/page.tsx` | 🔴 critical |
| 3 | secrets | `.env` committed and NOT in `.gitignore` | `.env`, `.gitignore` | 🔴 critical |
| 4 | secrets | real secrets in `.env` (service_role, stripe, db) | `.env` | 🔴 critical |
| 5 | secrets | reset token printed to the log | `app/api/reset-password/route.ts` | 🟠 high |
| 6 | data-access | tables with no RLS | `supabase/migrations/001_init.sql` | 🔴 critical |
| 7 | data-access | `service_role` in a request handler (bypasses RLS) | `app/api/orders/route.ts` | 🔴 critical |
| 8 | data-access | IDOR — order by id with no ownership check | `app/api/orders/route.ts` | 🔴 critical |
| 9 | data-access | default-public `uploads` bucket | `supabase/migrations/001_init.sql` | 🔴 critical |
| 10 | auth | user enumeration: response reveals whether the email exists | `app/api/reset-password/route.ts` | 🔴 high (code red flag) |
| 11 | websec | SQL injection via concatenation | `app/api/orders/route.ts` | 🔴 critical |
| 12 | websec | XSS via `dangerouslySetInnerHTML` with user input | `app/page.tsx` | 🔴/🟠 high |
| 13 | websec | no server-side validation of the body (POST) | `app/api/orders/route.ts` | 🟠 high |
| 14 | websec | debug endpoint returns env | `app/api/debug/route.ts` | 🟠 high |
| 15 | abuse-cost | public paid OpenAI call with no auth and no rate limit | `app/api/chat/route.ts` | 🔴 critical |
| 16 | abuse-cost | CORS `*` | `app/api/chat/route.ts` | 🟠 high |
| 17 | abuse-cost | public signup form with no CAPTCHA | `app/page.tsx` | 🟠 medium-high |

## Expected 🟡 "couldn't verify" (must NOT become 🟢)

| Check | Why 🟡 |
|---|---|
| Full secret scan (gitleaks) | if gitleaks is unavailable → 🟡 (but `.env`-in-git is caught by the fallback, see #3) |
| Security headers | no live URL → only the in-code settings were checked (there are none here) → 🟡/🟠 |
| Behavioral auth scenarios (#10 aside from the explicit red flag) | wrong password ×5, double confirmation, duplicate signup, sessions — verified by hand in the browser → checklist 🟡 |
| Dependency CVEs (`npm audit`) | if not run → 🟡 |

## Expected compliance

The app collects email (signup form, `users` table) but has **no privacy policy** →
🔴/🟡 "no privacy policy, add one". The compliance verdict cannot be 🟢.

## Expected verdict

**🚫 NOT READY TO SHIP** — at least 9 critical findings.
