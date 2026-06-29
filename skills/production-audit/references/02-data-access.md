# Data access and databases (domain: `data-access`)

A deep checklist for the auditor agent. Covers: **RLS / access policies**, **IDOR**
(access to other users' rows), **privileged credentials that bypass authorization** (a trap, critical)
and **public-by-default object storage** (a trap).

Format findings **strictly** per the schema in `report-format.md`. States — 🔴 / 🟢 / 🟡, and the
honesty invariant is unbreakable: **🟡 never collapses into 🟢**. No `evidence` — no finding.

---

## 1. What we check & why it matters (in plain language)

Many vibe-coded apps talk to the database **straight from the browser** (the classic stacks being Supabase,
Firebase). That's perfectly fine under exactly one condition: the database side must enforce rules about who sees
what. If there are no rules, then the key sitting in the browser opens **the whole database to anyone**.

What this leads to, jargon-free:

- **No access rules (RLS).** Anyone opens DevTools (F12), sees which key
  your site uses to talk to the database, and with that same key reads **the entire table** — every order, every
  profile, every message of every user. You don't need to be a hacker; the "Network" tab is enough.
- **IDOR (access to other users' rows).** The link `/api/orders/123` returns order #123. The user
  changes it to `124`, `125`, `126` — and browses through **other people's orders**, because the server never checked that
  the order actually belongs to them.
- **A privileged key that bypasses the rules.** Even if access rules are enabled, the code may
  talk to the database under a "master key" (service_role / admin access) that **ignores all
  rules**. Then "RLS is enabled" means nothing — a single leaky endpoint hands over everything.
- **Public storage.** The uploads folder / bucket is readable by everyone. Whoever guesses or glimpses
  a file link downloads other people's passports, medical records, contracts. This is often enabled **by
  default** and then forgotten.

All four are **critical-level**: an instant data leak on release. Set the preliminary
`severity` in the finding to `critical`; the orchestrator will confirm the final one.

---

## 2. The through-line of the audit (read before Detection)

> **The key question for every database request: which client made it?** This determines whether
> the access rules work at all.

| What we use to reach the DB | Who protects the data | What must be present, otherwise 🔴 |
|---|---|---|
| **anon / user key** (Supabase anon, Firebase client SDK, a user session) | the database itself via RLS / security rules | RLS **enabled** + a policy restricting by owner |
| **service_role / Admin SDK / superuser** in the request handler | **nobody** — this key bypasses RLS | an ownership check in the code: `where owner = currentUser.id` |

Two rules follow from this table that keep the auditor from either missing a hole or flagging things needlessly:

1. **A bare `getById(id)` / `/api/x/:id` is not a finding by itself.** If the request runs under a
   **user key** and the table has an RLS policy by owner — the database itself cuts off other users' rows.
   That's safe. Don't flag every `getById`.
2. **The same `getById(id)` under service_role / Admin SDK — a hole.** Here RLS is off for this
   request, and if the code has no ownership filter — it's IDOR/leak. 🔴.

So the auditor's order of work is: **first figure out which client is in the request path**, then judge
RLS and IDOR. "RLS is enabled" means NOTHING if there's a request next to it running under a service key.

---

## 3. Detection steps

### 3.1. RLS / access policies

**Supabase / Postgres.** The goal is to find evidence that Row Level Security is **enabled** on
tables with user data and that a policy restricting by owner exists.

- Where to look for positive evidence (in the repository):
  - migrations / SQL files: `supabase/migrations/**/*.sql`, `**/*.sql`, `schema.sql`, `prisma/migrations/**`.
  - grep for: `enable row level security`, `ENABLE ROW LEVEL SECURITY`, `create policy`, `CREATE POLICY`.
  ```bash
  grep -rniE 'enable row level security|create policy|alter table .* enable row level' \
    --include='*.sql' .
  ```
- Signs of **direct client access to the DB without a server-side check** (meaning the only protection is
  RLS, and it must be confirmed):
  - grep for client-side Supabase calls: `.from('`, `.from("`, `supabase.from`, `createClient(` with
    an `anon`/`NEXT_PUBLIC_`/`VITE_` key.
  ```bash
  grep -rniE "supabase|createClient\(|\.from\(['\"]" \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' src app
  ```
  - If the client talks to the DB directly and the repository has **no** line `enable row level
    security` for this table — that's a strong signal for 🔴 (the database is open). But see the 🟡 caveat below:
    the schema may have been configured in the dashboard rather than in code.
- A sign that RLS is most likely **disabled deliberately**: explicit `DISABLE ROW LEVEL
  SECURITY`, policies `using (true)` / `with check (true)` not tied to `auth.uid()` (a policy that
  "exists but lets everyone in" — that's the same open database).

**Firebase Firestore / Realtime Database.** The RLS analog is **security rules**.

- Rules file: `firestore.rules`, `database.rules.json`, `storage.rules`, the `rules` section in
  `firebase.json`.
- Dangerous patterns (open to everyone):
  ```bash
  grep -rniE 'allow (read|write|read, write).*: *if *true|\.read.*: *.?true|\.write.*: *.?true' \
    firestore.rules database.rules.json firebase.json 2>/dev/null
  ```
  - `allow read, write: if true;` — the database is open to everyone. 🔴.
  - `allow read, write: if request.auth != null;` — lets **any logged-in user** into **all**
    documents (not just their own). It authorizes by login alone and ignores ownership — a potential IDOR at the rules
    level; flag it at minimum as `high`.
  - A safe reference point: `allow read, write: if request.auth.uid == resource.data.owner;`
- If there are no rules at all or the default test-mode is in place (`allow read, write: if request.time <
  timestamp.date(...)`) — that's a temporary open mode, in production 🔴.

**MongoDB / others.** There's no built-in RLS — access to other users' data is prevented **only in the
application code**. Here the RLS check turns into an IDOR check (see 3.2): every query to a
collection with user data must have the owner in the filter (`{ ownerId: req.user.id }`).
The absence of such a filter = a hole.

### 3.2. IDOR — access to other users' rows

We look for endpoints and functions that fetch an object **by identifier without checking the owner**.

- Endpoint and function markers:
  ```bash
  grep -rniE "/:id|/\[id\]|getById|findById|findOne\(|findUnique\(|\.eq\(['\"]id" \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.py' src app api routes
  ```
- For each point found, ask one question: **is there a restriction by the current user in the query?**
  Signs that a check is present (what makes the spot safe):
  - in the SQL/ORM filter: `where owner_id = ...`, `.eq('user_id', user.id)`, `userId: session.user.id`,
    `{ ownerId: req.user.id }`;
  - an explicit check after the query: `if (row.user_id !== currentUser.id) return 403`.
- Signs of a **hole** (🔴/`high`):
  - the object is fetched strictly by `id` from the URL/body, and `currentUser` / `auth` / `session` in this
    request isn't used at all;
  - the owner's identifier is taken from the **client's request** (`req.body.userId`,
    `req.query.userId`) rather than from a trusted server session — the client will substitute someone else's id.
- **Link to the client (critical, see §2):** if this point runs under **service_role / Admin
  SDK** — the absence of an ownership filter is almost always 🔴, because RLS won't cover it. If under a
  **user key** and the table has a proven RLS-by-owner policy — it's most likely a false alarm.

### 3.3. Privileged credentials that bypass authorization (A TRAP, critical)

The most common and most dangerous mistake: code **handling an ordinary user's request** talks
to the DB under admin/service access that **bypasses RLS**. Then any access rules in the DB
are useless for this path.

The agnostic formulation of the hole: **any admin-level data access in the path of a user request
that bypasses authorization checks.**

Concrete markers by stack:

- **Supabase `service_role`** in a route handler / API / server action that serves user requests:
  ```bash
  grep -rniE "service_role|SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY|supabaseAdmin|service-role" \
    --include='*.ts' --include='*.tsx' --include='*.js' .
  ```
  Pay special attention to: `createClient(url, SERVICE_ROLE_KEY)` inside `app/api/**`, `pages/api/**`,
  `route.ts`, server actions, edge functions serving public requests. service_role
  **fully bypasses RLS** — that's its purpose.
- **Firebase Admin SDK** in publicly reachable code:
  ```bash
  grep -rniE "firebase-admin|admin\.initializeApp|admin\.firestore\(\)|cert\(|getFirestore\(\).*admin" \
    --include='*.ts' --include='*.js' .
  ```
  The Admin SDK **ignores security rules** by definition. In a user-request handler
  without its own owner check — a hole.
- **A direct `db.query` / ORM under a superuser**: a connection to Postgres/MySQL under the DB
  owner role or with `BYPASSRLS`, direct `pool.query`, `client.query`, `knex.raw`, raw
  `prisma.$queryRaw` without a per-user filter in the request handler.

**What makes this a 🔴 finding:** a privileged client in the request path **AND** the absence of
its own ownership/authz check in this code. Record both parts in `evidence`: "route X
talks to the DB under service_role and does not check that the object belongs to `currentUser`".

> Worth spelling out in the report: **"RLS is enabled" means NOTHING if the request runs under a service
> key — it bypasses everything.** This is a typical beginner misconception ("but I did enable RLS").

### 3.4. Public-by-default storage / uploads (A TRAP)

Buckets and upload folders that are readable by everyone.

- **Supabase Storage** — a public bucket:
  ```bash
  grep -rniE "createBucket\(|public: *true|getPublicUrl|\.storage\.from" \
    --include='*.ts' --include='*.js' --include='*.sql' .
  ```
  - `createBucket('name', { public: true })` or a bucket marked public, + using
    `getPublicUrl(...)` for private content → files are accessible to everyone via a direct link.
  - A safe reference point — a private bucket + `createSignedUrl(...)` (a temporary link).
- **AWS S3 / compatible** — public-read:
  ```bash
  grep -rniE "ACL: *['\"]public-read|public-read|BlockPublicAcls: *false|PublicAccessBlock|s3:GetObject.*\\*" \
    --include='*.ts' --include='*.js' --include='*.json' --include='*.tf' .
  ```
  - `ACL: 'public-read'`, a bucket policy with `Principal: "*"` on `s3:GetObject`, a disabled
    `BlockPublicAcls`/`PublicAccessBlock` → the bucket is public.
  - A safe reference point — a private bucket + a **presigned URL** (`getSignedUrl`).
- **An open `/uploads` folder** (Express/Next, etc.): static serving that exposes the entire directory of user
  uploads:
  ```bash
  grep -rniE "express\.static\(.*uploads|app\.use\(.*static.*upload|/public/uploads" \
    --include='*.ts' --include='*.js' .
  ```
- **The common sign of a hole:** `public: true` / `public-read` and **no signed URLs**
  for private content. If something personal is put into storage (documents, photos, exports) and
  access is public — that's 🔴.

---

## 4. Fix patterns

The language of the fixes is for a beginner, framed by consequences. Below are all three patterns; the first is spelled out in full.

### 4.1. Enable RLS + a "the owner sees only their own" policy (Supabase / Postgres) — worked

**Problem:** the `orders` table with a `user_id` field is left open — the client talks to it directly with the
anon key, RLS is off. Anyone can read everyone's orders through DevTools.

**Fix (run in the Supabase SQL editor or add a migration):**

```sql
-- 1. Turn on row-level protection: without an explicit policy, NOBODY now sees anything.
alter table public.orders enable row level security;

-- 2. Read policy: the user sees ONLY their own rows.
--    auth.uid() — the id of the current logged-in user; user_id — the row's owner.
create policy "owner can read own orders"
  on public.orders
  for select
  using (auth.uid() = user_id);

-- 3. Write policy: you can only insert rows where the owner is you.
create policy "owner can insert own orders"
  on public.orders
  for insert
  with check (auth.uid() = user_id);

-- (similarly for update / for delete — using + with check on auth.uid() = user_id)
```

> Consequence framing for the user: "Right now your orders table is open — any visitor
> reads other people's orders through the browser console. After these commands, everyone sees only their own rows,
> and the database cuts off the rest by itself."
>
> Breaking-change warning (beginner-safe): enabling RLS on a **live** database instantly
> closes off access to everything that has no policy. First add the policies, then verify that the
> app still reads its own data. This changes production behavior — do it only with explicit consent.

**Firestore analog** of the same rule (file `firestore.rules`):

```js
match /orders/{orderId} {
  allow read, write: if request.auth != null
                     && request.auth.uid == resource.data.userId;
}
```

### 4.2. Ownership check in the API (before / after)

When the request runs under a privileged key (service_role / Admin SDK / superuser),
RLS won't save you — the code checks the owner.

**Before (a hole, IDOR):**

```ts
// /api/orders/[id] — returns the order by id from the URL, doesn't check the owner
const order = await supabaseAdmin       // service_role: bypasses RLS!
  .from('orders')
  .select('*')
  .eq('id', params.id)
  .single();
return Response.json(order);             // returns ANY order — change the id and read someone else's
```

**After (the fix — filter by the owner from the trusted session):**

```ts
const user = await getCurrentUser(req); // take the id from the SERVER session, not from the client's request
if (!user) return new Response('Unauthorized', { status: 401 });

const order = await supabaseAdmin
  .from('orders')
  .select('*')
  .eq('id', params.id)
  .eq('user_id', user.id)                // <-- the key line: only your own
  .single();

if (!order) return new Response('Not found', { status: 404 });
return Response.json(order);
```

> The main rule: **the owner's id is taken from the server session (`user.id`), not from the request
> body/parameters.** If you trust `req.body.userId`, the client will substitute someone else's id.

### 4.3. A private bucket + signed URLs instead of public access

**Problem:** the uploads bucket is public, links are handed out via `getPublicUrl` — whoever sees a link
downloads someone else's file forever.

**Fix (Supabase Storage):**

```ts
// 1. Make the bucket private (uncheck "Public" in the Storage dashboard, or at creation time):
//    createBucket('documents', { public: false })

// 2. Instead of a permanent public link, hand out a TEMPORARY signed one (lives 60 seconds):
const { data, error } = await supabase
  .storage
  .from('documents')
  .createSignedUrl(filePath, 60);   // the link expires in 60 sec

// hand data.signedUrl to the user — only to the one who passed the access check in your code.
```

**S3 analog:** a private bucket (Block Public Access enabled) + a presigned URL via `getSignedUrl`
with a short `expiresIn`.

> Consequence framing: "Right now anyone with a file link downloads it, even someone else's. After the fix the link is
> temporary and is given only to whom you allow — a minute later it's dead."

---

## 5. Known false-positives (do NOT flag)

- **Intentionally public data.** A public blog, a marketing page, an open product
  catalog, public prices — tables/buckets that **should** be readable by everyone. Open reading
  of a catalog is not a hole. Signal: the data is non-personal and meant for everyone. (Writing must still
  be protected.)
- **service_role in protected server tasks.** A service key used **only** in
  background tasks not directly reachable by users: cron, migrations, a webhook with signature
  verification, server scripts with their own authorization. If the key is **not** in the path of a
  user request and the task has its own check — it's not a finding (but verify that the key
  doesn't leak into the client — that's already the `secrets` domain).
- **The Supabase anon key.** It is **not** a secret: it's designed for the browser and works in tandem with RLS.
  Its presence in client code is normal **if** RLS is enabled. Don't confuse the anon key with service_role.
  (The danger is not in the anon key itself but in disabled RLS.)
- **Firestore `allow read: if true` on a deliberately public collection** (for example, public blog
  posts) — acceptable for reading. Flag it only if personal data is opened this way, or if **writing** is
  opened this way.
- **Short-lived signed public URLs** — `createSignedUrl`/presigned with a small TTL is exactly
  the right pattern, not a finding.

---

## 6. 3-state mapping

Apply this after actually running the check. Invariant: the absence of evidence is 🟡, not
🟢. 🟢 requires **positive evidence in the repository**.

- 🔴 **ISSUE FOUND** — there is concrete `evidence`:
  - the client talks to the DB directly, and the repository has no RLS for this table / has `disable row
    level security` / a `using (true)` policy;
  - Firestore `allow read, write: if true` (or test-mode) on data;
  - an endpoint by `id` without an ownership filter under a privileged client;
  - service_role / Admin SDK / superuser in the path of a user request without its own
    authz check;
  - a public bucket / `public-read` / an open `/uploads` with private content.
- 🟢 **CHECKED — CLEAN** — there is positive evidence in the code:
  - the migrations contain `enable row level security` + `create policy ... using (auth.uid() = ...)`
    for tables with user data, AND there is no service_role in the request path;
  - every `getById`/`/:id` has an ownership filter (or runs under a user key with proven RLS);
  - buckets are private, signed/presigned URLs are issued.
  (🟢 goes into a separate "checked-clean" list, not into findings.)
- 🟡 **COULDN'T VERIFY** — the check can't be carried to completion from the code:
  - **the repository has no migrations / SQL** (the schema and policies are configured in the Supabase dashboard) →
    the RLS status is unknown from code → 🟡 "**I don't see policies in code — open the Supabase panel →
    Authentication/Table editor → verify that RLS is enabled on the tables and there are owner-based
    policies**". This is a typical case: don't issue 🟢 when there's no evidence in code.
  - the Firestore/Storage rules live outside the repository (only in the Firebase console) → 🟡 "verify
    the rules in the Firebase Console manually".
  - it's impossible to determine which key the request actually runs under (the key is in env, the config is unavailable) → 🟡.
  - the bucket's publicity is set in the dashboard, not in code → 🟡 "verify the bucket setting in the panel".

---

## 7. What to return to the orchestrator

Each finding — **strictly** per the `report-format.md` schema:

```
- domain:     data-access
- severity:   critical            (preliminary; the orchestrator sets the final one)
- file_line:  path:line           (or "—", if the finding is about config outside the code)
- evidence:   the concrete fact — which client, which table/bucket, what's missing
- fix:        in plain language with consequence framing (see §4)
- confidence: high | medium | low
- state:      🔴 | 🟡             (🟢 — into the separate "checked-clean" list)
```

A brief summary for the orchestrator:

- **4 vectors** were checked: RLS/policies, IDOR, privileged credentials that bypass RLS, public
  storage. All four, when confirmed, are **critical** (an instant data leak).
- The through-line technique: **trace the client of each request** (anon/user vs service_role/Admin) — it
  determines whether RLS works at all. "RLS is enabled" is useless under a service key.
- Where the evidence of policies/settings is **not in the code** (configured in the dashboard) — that's a **🟡** with an explicit
  instruction to verify in the panel manually, **never 🟢**.
- False alarms NOT to raise: a public catalog/blog, service_role in a protected
  cron/webhook, the Supabase anon key with RLS enabled, short-lived signed URLs.
