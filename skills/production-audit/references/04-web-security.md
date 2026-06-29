# Web Security / OWASP (`websec` domain)

A deep checklist for the `websec-auditor` audit agent. Covers items **4, 5, 6** of the
original + the added **deploy-config**. Return all findings strictly per the schema in
`report-format.md`. Scanners (semgrep, curl) — follow the rules in `scanners.md`.

**Domain boundary.** This is about **static code analysis**: headers, injections, XSS, CSRF,
server-side validation, deploy-config, and **static flaws in auth code** (how passwords are
hashed, how JWTs are verified, session fixation). **Behavioral** auth scenarios (lockout
after 5 wrong passwords, password reset for a non-existent email, reopening a confirmation
link) belong to the **auth** domain (`03-auth-robustness.md`). Overlaps are
resolved by the orchestrator's dedup on `file_line`.

---

## 1. What we check & why it matters (in plain terms)

| What | Why it's dangerous for a beginner |
|---|---|
| **Security headers** | Without them, the browser doesn't protect your users: another site can embed yours in an `<iframe>` and trick the user into clicking on their behalf (clickjacking), and nothing holds back an injected script. |
| **SQL/NoSQL injection** | Instead of a name, the user types a chunk of a query into a field — and reads/deletes **your entire database**. One input string → leak of all data. |
| **XSS** | An attacker leaves a "comment" with a `<script>` that runs in **other** users' browsers: stealing their sessions, money, accounts. |
| **CSRF** | Another site, acting as a logged-in user, calls your API (change email, transfer money) — the browser attaches the cookies automatically. |
| **No server-side validation** | An attacker **disables JS** and sends a request straight to your API, bypassing all the form's checks. For them, every "check" in the browser doesn't exist. |
| **Debug mode in production** | A verbose error reveals file paths, a chunk of SQL, environment variables, sometimes secrets. An exposed debug panel = a remote control for your server, available to anyone. |
| **Weak auth code** | Passwords hashed with `md5`/stored in plaintext → if the database leaks, they're cracked instantly. A JWT without signature verification → anyone can forge a token and log in as anybody. |

The key takeaway for a beginner: **anything in the browser is under the attacker's control.**
Checks, secrets, and trust must live on the **server**.

---

## 2. Detection steps

The baseline approach is `semgrep` (see `scanners.md`, §2): `semgrep --config auto`. If it
ran — map its injection/XSS rules onto findings. If it did **not** run — use the manual
grep patterns below + mark 🟡 for the part semgrep should have covered. You can run the
patterns below with the Grep tool or `grep -rEn '<pattern>' <repo>` (excluding
`node_modules`, `.next`, `dist`, `vendor`).

### 2.1. Security headers

We check for five: `Content-Security-Policy` (CSP), `Strict-Transport-Security`
(HSTS), `X-Content-Type-Options: nosniff`, `X-Frame-Options` **or** the CSP directive
`frame-ancestors`, `Referrer-Policy`.

**Method A — live URL (preferred, see `scanners.md` §4).** Only if the user provided a
working link:
```bash
curl -sI https://<url> | grep -iE 'content-security-policy|strict-transport-security|x-content-type-options|x-frame-options|referrer-policy'
```
(if the site doesn't respond to `HEAD`, use `curl -s -D - -o /dev/null https://<url>`.)
Whatever isn't in the output isn't in production → a finding.

**Method B — config in code (fallback, if there's no live URL).** Look for where headers
are set at all:
- **Next.js:** `next.config.js`/`next.config.mjs` → the `async headers()` function; or
  `middleware.ts` with `response.headers.set(...)`. Grep: `headers\(\)`, `Content-Security-Policy`,
  `Strict-Transport-Security`.
- **Express:** whether `helmet` is wired in. Grep: `require\(['"]helmet`, `from ['"]helmet`,
  `app\.use\(helmet`.
- **nginx:** `add_header Content-Security-Policy`, `add_header Strict-Transport-Security` in
  `*.conf`.

> ⚠️ **Important for honesty (see §5):** config in code does NOT prove the header is actually
> served in production (it could be added by a CDN/proxy — Vercel, Cloudflare, nginx — that
> isn't in the repo; and conversely, a "correct" config could be overridden). **No live URL →
> headers are always 🟡**, even if everything looks right in the code. See §5.

### 2.2. SQL / NoSQL injections

The hallmark of a hole is **user input concatenated into the query text** instead of a placeholder parameter.

**SQL — concatenation and template strings:**
```
\.(query|execute|raw)\(\s*[`'"].*(\+|\$\{)        # string concatenation or ${...} in JS/TS
(execute|cursor\.execute)\(\s*f["']                # python f-string in SQL: f"SELECT ... {x}"
\.(query|execute)\([^)]*%\s*\(                      # python old-style: "... %s" % (...)
\$queryRawUnsafe|\$executeRawUnsafe                 # Prisma UNsafe variants
sequelize\.query\([^)]*\+                            # Sequelize raw + concatenation
```
Where `req.query`, `req.body`, `req.params`, `searchParams`, or a function argument lands
directly in the query string — that's 🔴.

**NoSQL (MongoDB) — an object from input straight into the filter:**
```
\.(find|findOne|findOneAndUpdate|updateOne|deleteOne)\(\s*\{[^}]*req\.(body|query|params)
```
The danger: if `req.body.username` arrives as an object `{"$ne": null}` or `{"$gt": ""}`,
it becomes a MongoDB operator and bypasses the check (the classic login bypass). Also grep
for `$where`, `mapReduce` with a user-supplied string.

### 2.3. XSS (cross-site scripting)

Look for places where user content is rendered as **HTML** rather than text:
```
dangerouslySetInnerHTML            # React
v-html                              # Vue
\.innerHTML\s*=                     # vanilla
\.outerHTML\s*=
insertAdjacentHTML
document\.write\(
\[innerHTML\]|bypassSecurityTrust   # Angular
\beval\(                            # executing a string as code
new Function\(
```
🔴 if something from the user/from the DB lands in these spots **without sanitization**.
`eval(` and `new Function(` over any external input — almost always 🔴.

**Server-side templating engines — escaping turned off** (Flask/Django/Express views):
```
\|\s*safe                            # Jinja2/Django: {{ user_input | safe }} — escaping disabled
mark_safe\(|Markup\(                 # Python: marks the string as "safe HTML"
autoescape\s+off|autoescape=False    # Jinja2/Django: escaping globally disabled
\{\{\{                               # Handlebars: triple braces = no escaping
<%-                                  # EJS: unescaped output
```
By default these engines escape on their own — the danger is precisely **turning off**
escaping over user content.

### 2.4. CSRF

The dangerous cases are **mutations** (POST/PUT/PATCH/DELETE) when authentication goes
through a **cookie session** and there's no protection.
- Sign of a cookie session: `express-session`, `cookie-session`, `iron-session`, NextAuth
  with cookies. Grep: `express-session`, `cookie-session`, `req\.session`.
- Protection is present if found: a CSRF token (`csurf`, `csrf`, double-submit cookie), or
  the cookie has `sameSite: 'lax'`/`'strict'`. Grep for the attribute: `sameSite`.
  **Red flag:** `sameSite:\s*['"]none['"]` without other measures.
- No CSRF token and no `SameSite` on the session cookie when mutations exist → 🔴/🟠.

> Boundary (see §4): if the API is protected by the `Authorization: Bearer <token>` header
> (not cookies) — CSRF **does not apply**, don't flag it.

### 2.5. Server-side validation (item 6 — important)

**The gist for a beginner:** checks on the form (zod/yup, `required`, `maxlength`, `pattern`)
are just a convenience for an honest user. An attacker **disables JS** or fires `curl`
straight at your API — and all the client-side checks evaporate. That's why **the server
must repeat every check itself.**

Algorithm:
1. Find the **client-side** checks: validation schemas in components/forms
   (`z.object(`, `yup.object(`, `useForm`/`zodResolver`, `react-hook-form`), HTML attributes
   `required`, `maxlength`, `pattern`, `min`, `max`.
2. Find the **server-side** handlers for the same action: `app/api/**/route.ts`,
   `pages/api/**`, Express routes (`app.post(`, `router.post(`), FastAPI/Flask endpoints.
3. Check that the handler **validates the body** before using it. Red flag — input goes into
   the DB/logic directly:
```
await req\.json\(\)[\s\S]{0,200}(create|insert|update|query)   # took the body and went straight to the DB
req\.body\.[A-Za-z]+                                            # without any preceding validation
```
If validation exists on the client but not in the API handler → 🔴 (or 🟠) "no server-side
validation".

> FastAPI with a Pydantic model in the endpoint signature validates automatically (that's 🟢).
> Flask with bare `request.form[...]`/`request.json` and no checks — red flag.

### 2.6. Deploy-config in code

Debug/development settings leaked into production:
```
DEBUG\s*=\s*True                    # Django settings.py
\bdebug\s*=\s*True                  # Flask: app.run(debug=True)
app\.run\([^)]*debug\s*=\s*True
FLASK_DEBUG\s*=\s*1
```
- **Node:** `NODE_ENV=production` is never set anywhere (Express in the default `env` =
  development → verbose stack traces). Trace leaking out:
  `res\.(send|json)\([^)]*err\.stack`, `res\.(send|json)\([^)]*\.stack`, returning `traceback`.
- **Debug routes/panels/profilers exposed:** `/__debug`, `/_debug`, `django-debug-toolbar`,
  a GraphQL playground/`introspection` in production, FastAPI's Swagger/`docs_url` without an
  env guard (`FastAPI(docs_url=` left open), `app\.use\(['"]/debug`, open `/metrics`,
  `/admin` without authentication.
- **Verbose stack traces in production** (the error page shows paths, SQL, variables) → 🔴:
  it's both a leak of internals and an invitation to attack.

### 2.7. Static analysis of auth code (boundary with the auth domain)

**Code** only:
- **Password hashing.** Good: `bcrypt`, `argon2`, `scrypt`. Bad (🔴):
```
createHash\(\s*['"](md5|sha1)['"]                  # md5/sha1 for passwords
\bmd5\(                                              # hand-rolled md5
password\s*===\s*                                   # comparing a password in plaintext
```
- **JWT validation.** 🔴 signs:
```
jwt\.decode\(                                        # decode does NOT verify the signature — can't be used for authorization
algorithm[s]?\s*:\s*\[?\s*['"]none['"]               # alg:none = signature disabled
```
Using `jwt.decode(...)` to decide "who this is" instead of `jwt.verify(...)` → anyone can
forge a token. `verify` without an explicit `algorithms` list — risk of alg-confusion (mark
as 🟠).
- **Session fixation.** After a successful login, the session id must be **regenerated**
  (`req.session.regenerate(...)`). If there's no regeneration — mark it as a finding (often
  confirmable only by reading the code → `confidence: medium`).

---

## 3. Fix patterns (working before/after examples)

### 3.1. Parameterized query instead of concatenation

The placeholder depends on the driver: **node-postgres (`pg`)** — `$1, $2`; **mysql2 / sqlite3** —
`?`. ORMs (Prisma, Drizzle, Sequelize models) parameterize on their own.

```js
// ❌ BEFORE — input concatenated into the query text: you can inject ' OR 1=1 --
const { rows } = await pool.query(
  `SELECT * FROM users WHERE email = '${req.query.email}'`
);

// ✅ AFTER — pg: the value is passed as a separate parameter, as data, not as code
const { rows } = await pool.query(
  'SELECT * FROM users WHERE email = $1',
  [req.query.email]
);
// mysql2 / sqlite: 'SELECT * FROM users WHERE email = ?', [req.query.email]
```

NoSQL (Mongo): don't let an object from input into the filter — coerce it to a string and/or validate it:
```js
// ❌ BEFORE — req.body.username may arrive as { "$ne": null } and bypass the check
const user = await User.findOne({ username: req.body.username });
// ✅ AFTER — guarantee it's a string (or validate with a zod schema, see 3.4)
const user = await User.findOne({ username: String(req.body.username) });
```

### 3.2. Safe rendering instead of `dangerouslySetInnerHTML`

```jsx
// ❌ BEFORE — a comment with <script> will run for other users
<div dangerouslySetInnerHTML={{ __html: comment.body }} />

// ✅ AFTER (option 1) — just as text: React escapes it, the script won't run
<div>{comment.body}</div>

// ✅ AFTER (option 2) — if HTML is genuinely needed (rich-text), sanitize it
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.body) }} />
```
For Vue — similarly: `{{ comment.body }}` instead of `v-html`, or `v-html` only over
`DOMPurify.sanitize(...)`.

### 3.3. Security headers

**Next.js** — `next.config.js`:
```js
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "default-src 'self'; frame-ancestors 'none'; base-uri 'self'" },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

module.exports = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
```
(Tune the CSP to the project — if third-party scripts/styles break, add their sources to
`script-src`/`style-src` rather than disabling the CSP entirely.)

**Express** — `helmet` in a single line:
```js
import helmet from 'helmet';
app.use(helmet()); // by default sets ~13 headers, including CSP,
                   // Strict-Transport-Security (max-age 1 year, includeSubDomains),
                   // X-Content-Type-Options: nosniff, X-Frame-Options
```
helmet's default CSP is strict — run the app and, if needed, fine-tune the directives
(`helmet({ contentSecurityPolicy: { directives: {...} } })`), but **don't turn it off**.

### 3.4. Server-side validation (zod) in an API route

```ts
// ❌ BEFORE — app/api/signup/route.ts: the body goes into the DB without server-side checks
export async function POST(req: Request) {
  const body = await req.json();
  await db.user.create({ data: { email: body.email, age: body.age } });
  return Response.json({ ok: true });
}

// ✅ AFTER — the server validates on its own, even if the client disabled JS
import { z } from 'zod';

const SignupSchema = z.object({
  email: z.string().email(),
  age: z.number().int().min(13).max(120),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid data' }, { status: 400 });
  }
  await db.user.create({ data: parsed.data }); // parsed.data is already validated and typed
  return Response.json({ ok: true });
}
```
`safeParse` returns a discriminated object: `{ success: true, data }` or
`{ success: false, error }` — so no `try/catch` needed. Bonus: import the **same**
`SignupSchema` schema into both the form and the route — declare it once, enforced in both
places.

---

## 4. Known false-positives (do NOT flag)

- **`dangerouslySetInnerHTML` is already sanitized.** If `__html` is the result of
  `DOMPurify.sanitize(...)` or server-side `sanitize-html`, the render is safe. Flag only
  if the sanitizer is configured too permissively (allows `<script>`/`onerror`).
- **Parameterized queries that look like concatenation.** `pool.query('... $1', [x])`
  and **tagged templates** in ORMs are safe: Prisma `` $queryRaw`SELECT ... ${id}` ``,
  Drizzle `` sql`... ${id}` `` parameterize via the tag. Only `$queryRawUnsafe(`/
  `$executeRawUnsafe(` and manual string concatenation **before** passing into raw are dangerous.
- **Debug in a local dev config.** `DEBUG=True` in `.env.development`, a debug route behind
  the guard `if (process.env.NODE_ENV !== 'production')`, vite/webpack dev-server settings —
  these are for development only. Flag only if debug **reaches production** (in the default
  config, without an env guard, in a committed production `.env`).
- **CSRF with token authentication.** Endpoints using `Authorization: Bearer <token>` (not
  cookies) are **not** vulnerable to CSRF — the browser won't attach this header from another
  site. Don't flag a token-auth API for "missing CSRF".
- **Headers added by the host/CDN.** Their absence in the code doesn't yet mean they're
  absent in production. This isn't 🔴 from code alone — it's 🟡 (see §5).

---

## 5. 3-state mapping (when 🔴 / 🟢 / 🟡)

| State | When to assign |
|---|---|
| 🔴 **ISSUE FOUND** | There's a concrete `file:line` with evidence: input concatenated into a SQL/Mongo filter; `dangerouslySetInnerHTML`/`v-html`/`innerHTML=` over unsanitized user content; an API route without server-side validation (while the client has it); `DEBUG=True`/a stack trace leaking out in production; passwords on `md5`/in plaintext; `jwt.decode` for authorization or `alg:none`. **Live URL** + `curl` showed the header is absent → 🔴. |
| 🟢 **CHECKED — CLEAN** (doesn't go into findings; into the "checked-clean" list) | You actually carried the check through to the end and there's no hole: **live URL** + `curl` showed all 5 headers; all queries are parameterized/via an ORM; all user output is escaped; every API handler validates the body (zod/Pydantic). |
| 🟡 **COULDN'T VERIFY** (a separate block, **never collapses into 🟢**) | **No live URL → headers are always 🟡** (config in code ≠ what's actually in production: a CDN could add it, a proxy could override it). `semgrep` didn't run → 🟡 for the injections/XSS it should have covered (plus manual grep findings as 🔴). You can't tell from code which environment a debug setting applies to. Session fixation can't be confirmed by reading → `confidence: low`/🟡. |

Invariant (`report-format.md`): **🟡 never collapses into 🟢.** Better "couldn't verify the
headers — give me a live link" than a fake "the headers are fine".

---

## 6. Finding format (per the `report-format.md` schema)

Each finding strictly follows the schema; `domain` is always `websec`; `severity` is
**preliminary** (the orchestrator sets the final value); `state` is only 🔴 or 🟡 (🟢 goes
into the "checked-clean" list).

Examples (what the agent's output looks like):

```
- domain:     websec
- severity:   high                      # draft; the orchestrator may raise/lower it
- file_line:  app/api/users/route.ts:14
- evidence:   req.query.email concatenated into SQL: `SELECT * FROM users WHERE email='${req.query.email}'` — a classic SQL injection; through this field you can read the entire users table
- fix:        parameterize: pool.query('SELECT * FROM users WHERE email = $1', [req.query.email])
- confidence: high
- state:      🔴
```

```
- domain:     websec
- severity:   high
- file_line:  app/api/signup/route.ts:6
- evidence:   the form has a zod schema, but the POST handler takes await req.json() and writes straight to the DB — the server doesn't repeat the checks; an attacker sends the request bypassing the form
- fix:        validate the body on the server with the same zod schema via safeParse, return 400 on error (see §3.4)
- confidence: high
- state:      🔴
```

```
- domain:     websec
- severity:   medium
- file_line:  —
- evidence:   no live URL given; next.config.js has no async headers() and helmet isn't wired in — but the real headers in production could be set by a CDN/proxy, which can't be confirmed from code
- fix:        provide a working link for a curl check; or add the headers to next.config.js (CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy — see §3.3)
- confidence: medium
- state:      🟡
```

---

## What to return to the orchestrator

- A list of findings **strictly per the schema** above (`domain: websec`, `state` ∈ {🔴, 🟡},
  `severity` — preliminary).
- What was actually checked and is clean — as a separate 🟢 list (only what you carried
  through to the end).
- **Headers without a live URL — always 🟡** (not 🟢), with a request to provide a link for `curl`.
- If `semgrep` didn't run — mark 🟡 for the injections/XSS it should have covered;
  the manual grep findings still go as 🔴.
- Don't reach into other domains: CORS, secrets-in-code, RLS/IDOR — those are `05`/`01`/`02`.
  Here — headers, injections, XSS, CSRF, server-side validation, deploy-config, and static
  analysis of auth code.
- Don't fix anything — audit and findings only.
