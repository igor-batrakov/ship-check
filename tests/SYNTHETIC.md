# SYNTHETIC — audit behavior across different sites

Two synthetic runs that test the plugin beyond the all-holes fixture: a beginner app on a
different stack (recall + stack-agnosticism), and a mature, mostly-secure app (precision — does
the audit stay quiet on good code and surface only real issues?).

Method matches the real plugin: auditor agents run blind, with no access to the answer key, each
reading its domain reference and the contract. Findings are then compared to a hidden oracle.

---

## Run 1 — beginner app, Python + FastAPI (stack-agnosticism)

Fixture: `tests/synthetic/beginner-fastapi/` — a beginner FastAPI + raw Postgres (psycopg) +
OpenAI app. Oracle: `tests/synthetic/beginner-fastapi-ANSWER.md`. The references use Next.js and
Supabase examples, so this run measures whether the same vulnerability classes are caught on a
Python stack.

**Result: every planted hole found, verdict 🚫 NOT READY TO SHIP.**

| Planted hole | Stack form | Found |
|---|---|---|
| Secret in committed `.env`, not gitignored | `.env` + `.gitignore` | ✅ 🔴 |
| SQL injection | psycopg f-string `f"... WHERE id = {order_id}"` | ✅ 🔴 |
| Paid OpenAI call, no auth, no rate limit | public `POST /ask` | ✅ 🔴 |
| Secrets dumped to the web | `GET /debug` returns `os.environ` | ✅ 🔴 |
| IDOR | `GET /orders/{id}`, no owner check | ✅ 🔴 |
| Wide-open CORS | `allow_origins=["*"]` + credentials | ✅ 🔴 |
| Debug mode on | `FastAPI(debug=True)`, `uvicorn reload=True` | ✅ 🔴 |
| No server-side validation | raw JSON into INSERT, no Pydantic | ✅ 🔴 |
| Hardcoded key fallback | `os.getenv(..., "sk-...FAKE")` | ✅ ⚪ low (placeholder) |

Honesty held: all four scanners were unavailable, so every scanner-backed check came back 🟡. The
auditor went further and kept the class-level conclusion "no injection anywhere" at 🟡 even after
confirming the parameterized INSERT and `textContent` rendering as specific 🟢 facts, because the
semgrep sweep had not run. The auth checklist was marked not-applicable with a reason (the app has
no authentication system), and the consequence (every endpoint is open) surfaced under data-access
and abuse-cost.

The references generalize across stacks: detection rests on the vulnerability class, and the agent
translates the Next.js/Supabase examples to the FastAPI/psycopg equivalents.

---

## Run 2 — mature, mostly-secure app, Next.js + Supabase (precision)

Fixture: `tests/synthetic/mature-app/` — an app that does most things right, with exactly two
subtle issues planted. Oracle: `tests/synthetic/mature-app-ANSWER.md`. This run measures the
false-positive rate: a security tool that screams on good code trains its user to ignore it.

The five domain auditors ran in parallel, blind.

**Result: both planted issues found, zero critical/high false positives, verdict ⚠️ SHIP, BUT FIX
THESE FIRST.**

### Planted issues — both caught

| Planted issue | Severity | Caught by | State |
|---|---|---|---|
| IDOR: `documents/[id]` reads by id under `service_role` with no owner filter (sibling route does it right) | high | data-access (secrets and websec also spotted it and deferred to data-access) | 🔴 |
| `Strict-Transport-Security` header missing (4 of 5 headers present) | low | websec | 🟡 (no live URL → headers stay 🟡 by the reference's rule) |

### Good code recognized as clean (the precision win)

The auditors marked these 🟢 with positive evidence and raised no finding:

- RLS enabled with `auth.uid() = user_id` policies on both tables; the user-scoped client used for normal data.
- Private storage bucket (`public: false`) served through 60-second signed URLs.
- CORS locked to the app origin (`Access-Control-Allow-Origin: ${APP_ORIGIN}`, `Vary: Origin`).
- The paid OpenAI call gated by both auth and a per-user rate limit applied before the call.
- zod `safeParse` on every mutating route; `user_id` taken from the verified session.
- Neutral password-reset response (identical message + status across all branches).
- No `NEXT_PUBLIC_` secret, no secrets in logs, no over-fetching, no `dangerouslySetInnerHTML`.
- CSRF marked not-applicable, with the reason: Bearer-token auth and `persistSession: false`, so no ambient cookie for a cross-site form to abuse.

### Calibration notes

- **One defensible extra finding (medium):** the abuse-cost auditor flagged the public
  reset-password endpoint for missing CAPTCHA. The endpoint carries a per-IP rate limit and a
  neutral response, which the auditor acknowledged and used to hold the severity at medium; its
  argument is that a many-IP botnet drives reset emails past a per-IP limit. This reads as a
  reasonable hardening recommendation rather than noise, and the auditor declined to inflate it.
- **Honest 🟡s, used correctly:** gitleaks and semgrep unavailable; security headers without a
  live URL; the in-memory rate limiter's effectiveness depends on deploy topology; behavioral auth
  scenarios. Each came with a concrete manual next step.
- **Boundary discipline:** three separate domains saw the IDOR and routed it to data-access rather
  than each filing its own copy.

---

## What these runs establish

- **Recall across stacks:** on a Python/FastAPI app the audit caught every planted hole, so the
  detection logic travels beyond the Next.js/Supabase examples in the references.
- **Precision on good code:** on a mostly-secure app the audit found both subtle planted issues and
  produced zero critical or high false positives, with one defensible medium hardening note. The
  good parts were recognized as clean with evidence.
- **Honest blind spots:** every check a scanner or a live URL or a manual test would own came back
  🟡 with a next step, in both runs.

Combined with `RESULTS.md` (the all-holes fixture, 17/17 with no false-clears), the audit holds
across the range it will meet in the wild: a beginner shipping holes, and a careful build with a
subtle gap.
