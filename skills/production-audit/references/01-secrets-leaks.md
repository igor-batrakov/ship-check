# Domain: secrets — secrets and leaks

Reference for the audit agent. This domain covers items **7, 8, 11** of the original checklist +
the added **".env in git"** trap. The finding contract, the 🔴/🟢/🟡 states, and the report format
live in `report-format.md`. Which scanners to run and how is in `scanners.md`. This file extends
them with the specifics of secrets, **without duplicating** the regexes — it points to the source
of truth.

> Related domains (don't rewrite them here, just tag the finding with the correct `domain`):
> over-fetching → `data-access`; internal errors leaking out → `websec`. The
> finding schema allows any `domain`; dedup and final severity are done by the orchestrator.

---

## 1. What we check & why it matters

In plain terms: **a secret is the password to your money and your data.** An API key, a token, a
database connection string. If it leaks, a stranger gets exactly what you have.

Here's what specifically happens:

- **A paid API key leaks** (OpenAI, Stripe secret, an SMS gateway) → a stranger fires requests
  *on your dime*. A real scenario: a bot finds the key in a public repository within minutes, and
  by morning you have a bill for hundreds of dollars.
- **A database access key leaks** (Supabase `service_role`, a Postgres connection string) →
  someone reads and deletes every user's data, bypassing any checks.
- **A key is baked into the frontend** → it's *already* in the hands of every visitor to the site.
  Frontend code is downloaded in full into the browser — there are no "secrets" there, everything
  is visible through DevTools → Sources tab.
- **A secret is printed to the logs** → it leaks into Sentry/Logtail/Vercel logs/CloudWatch, which
  contractors and integrations have access to; logs live for years.
- **The API returns too much** (the whole `user` object with `password_hash`, `select *`) → the
  client sees fields it should never see.
- **A raw error leaks out** (SQL error text, a stack trace) → the attacker is shown table names,
  versions, query structure — a map for the next attack.
- **`.env` in git** → even after the file is deleted, the secrets **remain in the history** and
  require **rotation** (see §3). The single most common slip-up by vibe coders.

The key takeaway for a beginner reading the report: **"a secret that someone has seen must be
considered compromised — you don't 'hide it back', you ROTATE it"**.

---

## 2. Detection steps

Order: first the scanner (`gitleaks`), then manual grep heuristics for what the scanner
conceptually doesn't catch (frontend logic, logs, over-fetch, errors).

### 2.0 First — gitleaks (source of truth: `scanners.md` §1)

```bash
# detect
command -v gitleaks >/dev/null 2>&1 || npx --yes gitleaks version
# run (scans both the working tree and the commit history)
gitleaks detect --no-banner --redact        # or: npx --yes gitleaks detect --no-banner --redact
```

Any gitleaks finding → 🔴 critical. Pay special attention to secrets in the **history** (the file
has already been deleted, but the commit remains): that's still a leak and still requires rotation.

**If gitleaks didn't run** (no network, an error, no git repo) → use the fallback regexes from
`scanners.md` §1 *(I'm not rewriting them here — that's the single source of truth:* `sk-…`,
`AKIA[0-9A-Z]{16}`, `service_role`, `-----BEGIN … PRIVATE KEY-----`, `xox[baprs]-`,
`ghp_[0-9A-Za-z]…`*)* and **be sure** to mark the check 🟡 (see §5). A clean grep ≠ "clean".

```bash
# fallback scan of the working tree, excluding noise (regexes — from scanners.md)
# IMPORTANT: grep --include does NOT understand {a,b} (brace-glob matches 0 files on BSD/GNU) —
# so use one --include per extension.
grep -rnE 'sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|service_role|xox[baprs]-|ghp_[0-9A-Za-z]{36}|-----BEGIN [A-Z ]*PRIVATE KEY-----' \
  --include='*.js' --include='*.ts' --include='*.jsx' --include='*.tsx' --include='*.py' \
  --include='*.go' --include='*.rb' --include='*.php' --include='*.java' --include='*.env' \
  --include='*.json' --include='*.yml' --include='*.yaml' --include='*.sh' --include='*.vue' \
  --include='*.svelte' . 2>/dev/null | grep -vE 'node_modules|/\.git/|dist/|build/'
```

### 2.1 A secret behind a public env prefix (leak into the frontend bundle)

Variables with these prefixes are **deliberately embedded into the client bundle** by the
framework — they become public by definition. A secret behind such a prefix = a **guaranteed leak**:

| Prefix            | Stack               |
|-------------------|---------------------|
| `NEXT_PUBLIC_`    | Next.js             |
| `VITE_`           | Vite (Vue/React/…)  |
| `REACT_APP_`      | Create React App    |
| `PUBLIC_`         | SvelteKit / Astro   |
| `EXPO_PUBLIC_`    | Expo / React Native |

```bash
# Find all declarations and uses of public prefixes
grep -rnE '(NEXT_PUBLIC_|VITE_|REACT_APP_|PUBLIC_|EXPO_PUBLIC_)[A-Z0-9_]+' \
  --include='*.js' --include='*.ts' --include='*.jsx' --include='*.tsx' --include='*.vue' \
  --include='*.svelte' --include='*.env' --include='*.astro' . 2>/dev/null \
  | grep -vE 'node_modules|/\.git/|dist/|build/'
```

Now **look at the variable NAME** — flag only if a key that is **private by nature** sits behind a
public prefix. Triggers in the name (🔴): `SECRET`, `SERVICE_ROLE`, `PRIVATE`, `_KEY` for paid APIs
(`OPENAI`, `STRIPE_SECRET`, `SENDGRID`, `TWILIO`, `AWS_SECRET`), `PASSWORD`, `TOKEN`,
`DATABASE_URL`, `ADMIN`.

```bash
# Targeted: public prefix + a sign of a private secret in the name
grep -rnE '(NEXT_PUBLIC_|VITE_|REACT_APP_|PUBLIC_|EXPO_PUBLIC_)[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|_TOKEN|DATABASE_URL|ADMIN|OPENAI|STRIPE_SECRET|SENDGRID|TWILIO|AWS_SECRET)' \
  -- . 2>/dev/null | grep -vE 'node_modules|\.git/'
```

**Don't flag** keys that are public-by-design behind this same prefix (anon, `pk_`, Firebase
config) — see §4. The discriminator: what matters is **what the key grants**, not what its prefix is.

### 2.2 An API key right in the client/frontend code

A hardcoded key in code that ships to the browser (anything under `app/`, `pages/`,
`src/components/`, `*.client.*`, any component without a server marker):

```bash
# Hardcoded key values (not from env), typical formats
grep -rnE '(sk-[A-Za-z0-9]{20,}|sk_live_[0-9A-Za-z]{20,}|sk_test_[0-9A-Za-z]{20,}|AIza[0-9A-Za-z_\-]{35}|AKIA[0-9A-Z]{16}|Bearer [A-Za-z0-9._\-]{20,})' \
  --include='*.js' --include='*.ts' --include='*.jsx' --include='*.tsx' --include='*.vue' \
  --include='*.svelte' . 2>/dev/null \
  | grep -vE 'node_modules|/\.git/|\.test\.|\.spec\.'
```

Red flag in Next.js: importing a server secret (`process.env.STRIPE_SECRET_KEY` and the like) in a
file with `"use client"` or in a component without a server marker — the secret leaks into the
bundle.

```bash
# Use of process.env in client ("use client") files
grep -rln '"use client"' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' . \
  2>/dev/null | grep -vE 'node_modules' \
  | xargs grep -nE 'process\.env\.[A-Z0-9_]+' 2>/dev/null \
  | grep -vE 'NEXT_PUBLIC_'   # process.env without NEXT_PUBLIC_ in the client = suspected leak
```

### 2.3 Secrets in logs

A logger that prints a token/key/password/the whole user object. It ends up in cloud logs:

```bash
grep -rnE '(console\.(log|error|warn|info|debug)|logger\.(info|debug|error|warn)|print|println|fmt\.Print)\(' \
  --include='*.js' --include='*.ts' --include='*.jsx' --include='*.tsx' --include='*.py' \
  --include='*.go' . 2>/dev/null | grep -vE 'node_modules|/\.git/' \
  | grep -iE 'password|passwd|token|secret|api[_-]?key|authorization|cookie|session|\bjwt\b|process\.env|req\.headers|req\.body|user\b'
```

Especially dangerous: `console.log(req.headers)`, `console.log(user)`, `console.log(process.env)`,
`console.log(\`token=${token}\`)`.

### 2.4 Over-fetching (finding domain → `data-access`)

An API/query returns the whole object instead of the needed fields: `select *`, Prisma
`findMany`/`findUnique` without `select`, returning the entire `res.json(user)` with
`password_hash`/`reset_token`.

```bash
# SELECT * and returning whole objects
grep -rniE 'select[[:space:]]+\*' --include='*.js' --include='*.ts' --include='*.py' \
  --include='*.go' --include='*.sql' . 2>/dev/null | grep -vE 'node_modules'
# Prisma without field selection — candidates for manual review
grep -rnE '\.(findMany|findFirst|findUnique|findUniqueOrThrow)\(' --include='*.ts' --include='*.js' . \
  2>/dev/null | grep -vE 'node_modules' | grep -vE 'select|omit'
# Sensitive fields leaking into the response
grep -rniE 'password_hash|password|reset_token|verification_token|stripe_customer|ssn|secret' \
  --include='*.ts' --include='*.js' . 2>/dev/null | grep -viE 'node_modules' \
  | grep -iE 'res\.(json|send)|return .*user|NextResponse\.json'
```

Severity depends on the fields: without sensitive fields it's `medium` (see §3 in report-format.md);
with `password_hash`/tokens/other people's data — higher.

### 2.5 Internal errors leaking out (finding domain → `websec`)

The user is handed exception text / a stack trace / an SQL error instead of a neutral message:

```bash
# Returning error text in the response to the client (.message/.stack near sending the response)
grep -rnE '(json|send|NextResponse\.json|return).*(err|error|e)\.(message|stack)' \
  --include='*.ts' --include='*.js' . 2>/dev/null | grep -vE 'node_modules'
grep -rnE 'res\.(json|send)\(.*(err|error)\b' --include='*.ts' --include='*.js' . 2>/dev/null \
  | grep -vE 'node_modules'
```

This is a behavioral finding → set `file_line` if you found the line; if the output is confirmed
only at runtime on a live URL — `confidence: low`/🟡.

### 2.6 `.env` in git (CRITICAL — the added trap)

Two independent facts, both must be checked:

**(a) Is a file with secrets committed?** `.gitignore` does NOT prove the file never got into git
*earlier* (it could have been committed before it was added to `.gitignore`). We check the **fact
against the git index**, excluding safe templates (`.env.example/.sample/.template/.dist` — those
*should* be in the repository):

```bash
# .env files actually tracked by git (without templates)
git ls-files | grep -E '(^|/)\.env' | grep -vE '\.(example|sample|template|dist)$'

# Was .env ever in the history (even if deleted now) — requires rotation
git log --all --oneline --name-only --diff-filter=A 2>/dev/null \
  | grep -E '(^|/)\.env($|\.)' | grep -vE '\.(example|sample|template|dist)$'
```

Any real `.env` (not a template) in `git ls-files` or in the history → 🔴 critical.

**(b) Is `.env` in `.gitignore`?** If not — the very next commit will drag the secrets in:

```bash
# exact rule: a bare ".env" is ignored if the line is exactly .env / .env* / .env<spaces>
# (having only ".env.local" does NOT count as covering a bare .env)
test -f .gitignore && grep -qE '^[[:space:]]*\.env([[:space:]]*$|\*)' .gitignore \
  && echo "OK: .env in .gitignore" || echo "🔴 bare .env NOT covered by .gitignore"
```

**(c) The inverse check:** a committed `.env.example` with **real** values is also 🔴 (a template
should contain placeholders, not an actual key):

```bash
# -l = only the names of files containing a real secret; --null|xargs -0 — safe for paths with spaces
git ls-files -z | grep -zE '\.env\.(example|sample|template)$' \
  | xargs -0 grep -lE 'sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_\-]{35}|AKIA[0-9A-Z]{16}|service_role|postgres(ql)?://[^ ]*:[^ @]+@' 2>/dev/null
```

---

## 3. Fix patterns (worked examples)

### A. Next.js — a secret behind `NEXT_PUBLIC_*` → move it to the server

**BEFORE (leak): the OpenAI key in client code, ships to the browser**

```tsx
// app/chat/page.tsx  — "use client" component
"use client";
const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY; // 🔴 in the bundle of every visitor
async function ask(q: string) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },     // the key leaves the browser
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: q }] }),
  });
  return r.json();
}
```

**AFTER: the key is server-side (without `NEXT_PUBLIC_`), the call goes through a server route. The client never sees the key**

```ts
// app/api/ask/route.ts  — runs ONLY on the server
import { NextResponse } from "next/server";
export async function POST(req: Request) {
  const { q } = await req.json();
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, // ← without NEXT_PUBLIC_
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: q }] }),
  });
  if (!r.ok) return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  return NextResponse.json(await r.json());
}
```

```tsx
// app/chat/page.tsx  — the client now calls ITS OWN server, which holds no key
"use client";
async function ask(q: string) {
  const r = await fetch("/api/ask", { method: "POST", body: JSON.stringify({ q }) });
  return r.json();
}
```

Then: rename the variable in `.env` (`NEXT_PUBLIC_OPENAI_API_KEY` → `OPENAI_API_KEY`) and
**rotate the key** — the old one has already shipped into bundles and caches. The same applies to
Server Actions (`"use server"`): the secret is read there and is not passed to the client.

### B. `.env` in git → `.gitignore` + `git rm --cached` + **ROTATION** (mandatory)

```bash
# 1) Stop tracking .env (the file stays on disk, it's removed from the index)
git rm --cached .env
# 2) Add it to .gitignore so it doesn't come back
printf '\n.env\n.env.local\n.env*.local\n' >> .gitignore
# 3) Commit exactly the fact of removing it from tracking
git add .gitignore && git commit -m "chore: stop tracking .env, ignore env files"
```

> ⚠️ **This does NOT remove the secrets from the history.** `git rm --cached` stops only *future*
> tracking. Every past commit still contains your key — anyone who has a copy of the repository or
> access to it (including forks/mirrors/CI logs) can retrieve it with `git log -p`.
>
> **The only real fix is ROTATION:** go into the dashboard of every service whose key was in
> `.env`, and **issue a new key, revoking the old one**. Consider all of them compromised:
> Supabase `service_role`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, the `DATABASE_URL` password,
> the JWT secret, etc. You can additionally rewrite history (`git filter-repo`/BFG), but that does
> **not replace** rotation: copies of the history may have already spread.

A way to phrase it for the report (for a beginner): *"Your password to <service> is sitting in
the git history. Deleting the file doesn't help — it's visible in old commits. You need to go into
<service> and generate a new key, and disable the old one. Otherwise anyone who saw the repository
can use it."*

### C. Neutralizing errors leaking out (log in detail on your side, neutral message to the user)

**Next.js route handler:**

```ts
// app/api/users/[id]/route.ts
import { NextResponse } from "next/server";
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await db.user.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, avatarUrl: true }, // ← only the needed fields (see §2.4)
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json(user);
  } catch (err) {
    console.error("[GET /users/:id]", err);                 // ← in detail, on the server, into the logs
    return NextResponse.json({ error: "Internal error" }, { status: 500 }); // ← neutral to the user
  }
}
```

**Express error middleware (one for the whole app):**

```js
// the last app.use(...) after all routes
app.use((err, req, res, next) => {
  console.error(err);                                  // full stack trace — into the server logs
  res.status(err.status || 500).json({ error: "Something went wrong" }); // outward — neutral
});
```

The principle: inward — everything (for debugging), outward — nothing about the system's structure.
No `err.message`/`err.stack`/SQL text in the response to the client.

---

## 4. Known false-positives (do NOT flag)

The discriminator is always the same: **look at what the key GRANTS, not at the prefix/location.**
These values are **public by design** — their visibility in the browser is normal, and their protection
comes from access rules on the server (RLS / Security Rules / scoping).

| Value | Why it's NOT a leak | How it differs from a secret |
|---|---|---|
| **Supabase anon key** (`anon`, the `anon` role in the JWT) | Meant for the browser; access is restricted by **RLS** on the tables | 🔴 `service_role` — bypasses RLS, it's a backend key, must NOT be in the frontend |
| **Stripe publishable** `pk_live_…` / `pk_test_…` | Only creates payment tokens on the client | 🔴 `sk_live_…`/`sk_test_…` (secret) and `rk_…` (restricted) — full access to the money |
| **Firebase web config** (`apiKey: "AIza…"`, `authDomain`, `projectId`) | `apiKey` here is a **project identifier**, not a password; protection is **Firebase Security Rules** | 🔴 the `serviceAccount.json` file / `private_key` / `FIREBASE_ADMIN_*` — that's the admin SDK, full access |
| **PostHog / analytics public key** (`phc_…`) | Only sends events from the browser | 🔴 a PostHog personal/project API key (`phx_…`) — read/manage via the API |
| **Sentry DSN** (public) | Accepts error reports; write-only | 🔴 a Sentry **auth token** (`sntrys_…`) — access to projects/sources |
| **VAPID public key** (web push) | Public per the spec | 🔴 the VAPID **private key** |

Also, specifically **do not flag**:

- **`.env.example` / `.env.sample` / `.env.template`** with placeholders
  (`OPENAI_API_KEY=your-key-here`, `DATABASE_URL=postgres://user:pass@localhost:5432/db`) —
  that's *documentation*, it SHOULD be in git. *(But if there's a real value inside — that's 🔴,
  see §2.6c.)*
- Stripe test/demo keys from the docs (`pk_test_TYooMQ…`, `sk_test_4eC39H…` — public examples from
  the documentation). Confirm the context before raising a panic.
- Hashes/UUIDs/commits that look like keys by shape but aren't.

> An important asymmetry: a public key behind `NEXT_PUBLIC_` is fine; a **private** key behind
> `NEXT_PUBLIC_` is 🔴 (especially `service_role`/`sk_`/`PRIVATE`/`ADMIN`). The prefix makes
> a secret **visible to everyone**.

---

## 5. 3-state mapping (for this domain)

Apply the honesty invariant from `report-format.md`: **🟡 never collapses into 🟢.**

🔴 **ISSUE FOUND** — there is concrete proof (`evidence`):

- gitleaks/grep found a secret in the code or the git history;
- a real `.env` (not a template) in `git ls-files` or in the commit history;
- `.env` is missing from `.gitignore` while there are secrets in the project;
- a private key behind a public env prefix or hardcoded in client code;
- a secret/token/the whole `user`/`req.headers` goes into `console.log`/a logger;
- the API response contains `password_hash`/tokens/other people's fields (over-fetch with sensitive data);
- `err.message`/`err.stack`/SQL text is handed outward.

🟢 **CHECKED — CLEAN** — *only* if the check was actually carried through to the end:

- **gitleaks actually ran** (`gitleaks detect` completed) and there are no findings, **AND** a
  manual review of public env prefixes/client code/logs was performed and is clean;
- `.gitignore` contains `.env`, and `git ls-files`/the history confirm there are no secrets in
  tracking;
- public keys are recognized as public-by-design (see §4).

🟡 **COULDN'T VERIFY** — the check was not carried through to the end (does NOT turn into 🟢):

- **gitleaks didn't install/didn't run** (no network, `npx` failed, no git repository) — even if
  the manual grep heuristics are clean: this is 🟡 "a full secrets scan was not performed, run
  `gitleaks detect` manually". A clean grep ≠ proven cleanliness of the history;
- the project is not a git repository → there's nothing to check the history with → 🟡 on
  `.env`-in-history;
- a secret leak into the bundle/an error leaking out can only be confirmed in the browser/on a live
  URL that doesn't exist → 🟡 "check in DevTools → Network/Sources" or `confidence: low`;
- access to the code is partial (part of the repository is unavailable).

---

## 6. Finding format (strictly per report-format.md)

All 7 fields are mandatory; `state` is only 🔴/🟡 (🟢 does NOT go into findings — clean items go in a
separate "checked-clean" list). `severity` is the agent's **draft**, the orchestrator sets the
final one. `evidence` and `fix` — in plain language, with the consequences framed. `file_line: —`
for behavioral findings without a concrete line.

**Example 1 — a secret behind a public prefix:**
```
- domain:     secrets
- severity:   critical
- file_line:  app/chat/page.tsx:3
- evidence:   The OpenAI key is in NEXT_PUBLIC_OPENAI_API_KEY and ends up in code that
              every visitor's browser downloads. Anyone can pull the key via DevTools and
              fire requests on your dime.
- fix:        Remove the NEXT_PUBLIC_ prefix, move the OpenAI call into a server route
              (app/api/ask/route.ts), and BE SURE to issue a new key — the old one has already leaked.
- confidence: high
- state:      🔴
```

**Example 2 — .env in the git history (with rotation):**
```
- domain:     secrets
- severity:   critical
- file_line:  —
- evidence:   A .env file with live keys is committed (git ls-files shows .env). The secrets
              remain in the history even after the file is deleted — they're visible in old commits.
- fix:        git rm --cached .env, add .env to .gitignore — and most importantly: go into Supabase/
              Stripe/OpenAI and issue new keys, disable the old ones. Otherwise whoever saw the repository
              is using your keys.
- confidence: high
- state:      🔴
```

**Example 3 — over-fetching (data-access domain):**
```
- domain:     data-access
- severity:   medium
- file_line:  app/api/users/[id]/route.ts:8
- evidence:   The endpoint returns the whole res.json(user), including password_hash and reset_token.
              The client gets fields it should not see.
- fix:        Return only the needed fields: Prisma select { id, name, avatarUrl }. Never
              return password_hash/tokens.
- confidence: high
- state:      🔴
```

**Example 4 — gitleaks unavailable (🟡):**
```
- domain:     secrets
- severity:   high
- file_line:  —
- evidence:   gitleaks didn't install (npx without network), a full scan of secrets and the git history was
              not performed. The manual grep heuristics are clean, but that doesn't prove there's no leak.
- fix:        Run it manually: npx --yes gitleaks detect --no-banner --redact. Review the
              history for the presence of .env and keys.
- confidence: low
- state:      🟡
```

---

## What to return to the orchestrator

- **Findings** (🔴/🟡) strictly per the schema in §2 of report-format.md, with the correct `domain`
  (`secrets`; over-fetch → `data-access`; errors-leaking-out → `websec`).
- **Explicit gitleaks status:** did it run. Didn't run → the secrets check = 🟡 "a full scan was
  not performed" (even with clean greps) — this is critical for the report's honesty.
- **Rotation flag:** for any secret found in git/the history/the bundle, the `fix` must include
  ROTATION — it's the only real fix; deleting the file doesn't help.
- **The "checked-clean" list** only for checks that were actually carried through to the end
  (gitleaks ran + manual review) — otherwise 🟡.
- **Don't raise a panic** over the public-by-design keys from §4 (anon, `pk_`, Firebase config,
  PostHog public, Sentry DSN) and over `.env.example` with placeholders.
