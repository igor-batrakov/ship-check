# ANSWER KEY — beginner-fastapi synthetic fixture

Hidden oracle for the cross-stack audit run. The fixture under `beginner-fastapi/` is a
beginner, vibe-coded **Python + FastAPI + raw Postgres (psycopg) + OpenAI** app. It exists to
prove the auditor is stack-agnostic: the same classes of holes it catches in the Next.js/Supabase
fixture must also surface here, in idiomatic FastAPI/psycopg code.

The audit against `beginner-fastapi/` must:
- **find EVERY** planted hole below (🔴 / 🟠);
- mark **🟡** (not 🟢) whatever it could not verify (no scanner ran, no live URL, behavior);
- produce the verdict **🚫 not ready to ship**.

Returning 🟢 in place of any 🔴 finding is a **TEST FAILURE**. The auditor must map each hole to a
domain on its own terms — psycopg f-strings are still SQL injection, `CORSMiddleware(allow_origins=["*"])`
is still wide-open CORS, a committed `.env` is still a leaked secret.

## Planted holes

| # | Domain | Hole | Where | Expected |
|---|---|---|---|---|
| 1 | secrets | `.env` is committed and `.gitignore` does NOT list it — every secret lands in git | `.env`, `.gitignore` | 🔴 critical |
| 2 | secrets | live-shaped secrets sit in `.env`: `OPENAI_API_KEY` and a `DATABASE_URL` with an inline DB password | `.env:1`, `.env:2` | 🔴 critical |
| 3 | secrets | a hardcoded OpenAI key is baked into the source as the `os.getenv` fallback default | `main.py:24` | 🔴 critical |
| 4 | secrets | `SECRET_KEY` committed in `.env` | `.env:3` | 🟠 high |
| 5 | websec | SQL injection: the path param is interpolated into the query with an f-string and run via psycopg | `main.py:44` | 🔴 critical |
| 6 | data-access | IDOR: `GET /orders/{order_id}` returns any order by id with no authentication and no owner check (`user_id` is ignored) | `main.py:40`–`48` | 🔴 critical |
| 7 | abuse-cost | public `POST /ask` calls the paid OpenAI API with no auth and no rate limiting — a bot can loop it and run up the bill | `main.py:66`–`74` (call at `main.py:70`) | 🔴 critical |
| 8 | abuse-cost | CORS is wide open: `CORSMiddleware` with `allow_origins=["*"]` plus `allow_credentials=True` | `main.py:18` | 🟠 high |
| 9 | websec | debug mode is on in production: `FastAPI(debug=True)` | `main.py:14` | 🟠 high |
| 10 | websec | debug route `GET /debug` returns `dict(os.environ)`, dumping every env var (including the secrets) to any caller | `main.py:77`–`79` | 🟠 high |
| 11 | websec | no server-side validation on `POST /orders`: the raw JSON body is read with no Pydantic model and inserted as-is (no required fields, no types, caller-supplied `user_id`) | `main.py:51`–`63` | 🟠 high |
| 12 | websec | insecure run config: `uvicorn.run(..., host="0.0.0.0", port=8000, reload=True)` (auto-reload / dev server bound to all interfaces) | `main.py:85` | 🟠 medium-high |

Notes:
- Holes #5 (SQLi, websec) and #6 (IDOR, data-access) live in the same handler but are two distinct
  findings in two domains; list both.
- The path param is deliberately typed `order_id: str`. That is what keeps the f-string injection
  exploitable — FastAPI does not coerce or validate it before the handler runs.
- Hole #10 also leaks secrets; the secrets auditor may co-report it. Either domain counts as a hit.

## Expected 🟡 "couldn't verify" (must NOT become 🟢)

| Check | Why 🟡 |
|---|---|
| Full secret scan (gitleaks) | if gitleaks did not run → 🟡; the committed-`.env` hole is still caught by the fallback (see #1) |
| Security headers | no live URL → only the in-code config was checked (none is set here) → 🟡 / 🟠 |
| Dependency CVEs (`pip-audit` / `safety`) | if not run → 🟡 |
| Behavioral auth scenarios | the app has no auth at all, so there are no login/reset flows to test; note the **absence** of auth as a finding, and keep behavioral checks 🟡 |

## Expected compliance

The app stores customer data in the `orders` table and ships no privacy policy → the compliance
verdict is at best 🟡 "add a privacy policy", and it cannot be 🟢.

## Expected verdict

**🚫 not ready to ship** — at least 5 critical findings (committed secrets, hardcoded key,
SQL injection, IDOR, unprotected paid OpenAI call).
