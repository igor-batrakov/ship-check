# Domain: abuse-cost — abuse and cost

> This is the in-depth reference for the `abuse-cost-auditor` agent. It covers items **9 (rate
> limiting)** and **10 (CAPTCHA + CORS)**, plus the added **main focus — the "$200 overnight
> bill" pain**. Finding schema, states, and severity strictly follow `report-format.md` (it
> takes precedence in any conflict). Scanners/detection follow `scanners.md`.

This is the **most money-critical domain**. The other domains answer the question "will something
leak." This one answers **"how much money gets charged to your card while you sleep."** The whole
plugin is built around it (the original pain for vibe coders — a $200 overnight Supabase bill and
forms flooded with bots on day one).

---

## 1. What we check & why it matters (in plain language)

Three short stories this domain prevents:

- **"The $200 overnight bill."** The code has an endpoint that, on every request, calls a
  **paid** service (OpenAI generates text, Replicate spins up a GPU, Twilio sends an SMS, Supabase
  serves data from the database). It has **no rate limit**. One script (or just a stray bot)
  sends it 100,000 requests overnight. Every request is a charge from the provider. In the
  morning your bill is $20 → $200 → $2000. Nobody "hacked" anything — nobody just put a counter
  in place.
- **"Bots flooded every form on day one."** A signup / contact / subscription form with no bot
  protection. On the very first day spam bots find it and fill the database with junk, and if the
  form also sends an email on every submit — you pay for thousands of emails and land on spam
  blocklists (after which your real emails stop being delivered).
- **"Someone else's site calls your API as if it were theirs."** CORS is open to everyone (`*`).
  Any other site embeds your paid API into itself and runs it at your expense.

**The essence of the domain in one sentence:** find every place where a user request costs you
money, and make sure it has **both a lock (authentication) and a counter (rate limit)**.

---

## 2. Detection steps

The order is deliberate: **item 2.1 is the main ROI of this domain** — always start there.

### 2.1. Find calls to paid / metered external APIs (THE MAIN ONE)

Detection logic: go through the repository, find **every** call to a paid service, and for
**each one** check **two independent locks**:

1. **Authentication** — can this code be triggered **without logging into an account**? (is the
   endpoint public?)
2. **Rate limit** — is there a rate limit on this path?

Combinations:

| Authentication | Rate limit | State / severity |
|---|---|---|
| none (public) | none | 🔴 **critical** — "$200 overnight bill" in its purest form |
| none (public) | yes | 🟠 high — there is a limit, but any anonymous user still burns your budget |
| yes | none | 🟠 high — an authenticated user (or a stolen token) spams with no ceiling |
| yes | yes | 🟢 clean (if the limit is reasonable) |

> Important: check both locks **separately**. "There's a rate limiter here" does not yet mean "all
> good" if the endpoint is public. And vice versa.

**Grep markers (what to look for).** Any match is a candidate for a "paid call"; next, check
whether it sits behind a lock:

```
# LLM / AI generation (metered by tokens / GPU time — the most expensive abuse)
api.openai.com   openai   OPENAI_API_KEY   chat.completions   gpt-4   gpt-3.5
anthropic   api.anthropic.com   ANTHROPIC_API_KEY   claude-   messages.create
replicate   api.replicate.com          # GPU inference, billed per second — very expensive
elevenlabs   api.elevenlabs.io          # speech synthesis, billed per character
stability   dalle   image generation     # image generation

# Email (abuse = money + landing on spam blocklists)
sendgrid   @sendgrid/mail   api.sendgrid.com
resend   api.resend.com   RESEND_API_KEY
@aws-sdk/client-ses   SendEmailCommand   ses          # AWS SES
mailgun   postmark

# SMS / telephony (THE most dangerous money-wise — "SMS pumping" / toll fraud)
twilio   api.twilio.com   messages.create   verify

# Database/storage/infra (metered by traffic and calls)
supabase   createClient   .supabase.co        # see separately below — this is the "$200" anchor
firebase   firestore
stripe   api.stripe.com                        # the risk here is more fraud / test charges

# Universal: any fetch/axios/SDK to an external api.* domain with a key from env
fetch(   axios   process.env.*_API_KEY   process.env.*_SECRET
```

**Especially dangerous spots (they raise the severity):**
- a paid call in a **public** (no auth) endpoint — this is the classic 🔴;
- a paid call in an endpoint **with no rate limit**;
- **SMS** (Twilio and the like) — a distinct "SMS pumping" threat: bots push verification codes
  to premium-rate numbers, and you pay for every send. Any public SMS endpoint with no limit is
  an immediate 🔴.

**The "$200 overnight bill" anchor — Supabase (covered separately).** In vibe-coded apps the
client often talks to Supabase **directly from the browser** (`createClient` with the anon key).
Almost everything is metered: database traffic (egress), storage, **edge function calls**, and
**authentication emails** (signup/reset send emails). A public form or page wired directly to
Supabase with no rate limit is the **flagship case** of the whole plugin: a bot runs it all night
→ a Supabase bill in the morning. If you see direct Supabase access from the client on a public
path with no limit — that's a finding, and phrase it concretely as a "$200 overnight bill."

**Example finding (following the `report-format.md` schema):**

```
- domain:     abuse-cost
- severity:   critical            # DRAFT (orchestrator sets the FINAL one)
- file_line:  app/api/generate/route.ts:14
- evidence:   POST /api/generate calls openai.chat.completions.create; the endpoint is
              public (no session check) and has no rate limit. Anyone can send requests
              in batches — each one costs money at OpenAI.
- fix:        Lock the endpoint behind auth AND add a rate limit (e.g. Upstash) per IP/user.
              Additionally — set a usage limit in OpenAI billing as a safety net.
- confidence: high
- state:      🔴
```

### 2.2. Rate limiting on endpoints

Check for a rate limit, **first and foremost** on: public endpoints; those that call paid APIs
(see 2.1); those that send emails/SMS; login/signup forms (which also face brute force).

**Presence markers (what to look for — if present, a limit is probably in place):**
```
@upstash/ratelimit   Ratelimit   ratelimit.limit       # Upstash (popular in Next.js/serverless)
express-rate-limit   rateLimit(   windowMs              # Express
@fastify/rate-limit   fastify-rate-limit               # Fastify
slowapi   Limiter   @limiter.limit                     # Python / FastAPI
django-ratelimit   throttle   DEFAULT_THROTTLE         # Django / DRF
limiter   p-limit   bottleneck                         # in-process limiters
```

**No markers on a public/paid endpoint = a finding** (🟠 high, see §5). Severity rises to 🔴 if
that same endpoint is also paid and public (already covered in 2.1 — dedup will collapse it into
a single finding).

> Edge case (important for honesty): a rate limit often lives **at the edge**, not in the code —
> in Vercel/Cloudflare settings, in an API gateway, in a WAF. If you can't confirm its
> presence/absence from the code — that's a **🟡 "verify by hand"**, not a made-up 🔴 and not a
> 🟢. See §5.

### 2.3. CAPTCHA on public forms

Look for forms accessible to anonymous users: signup, login, contact, newsletter subscription,
password reset, "submit a request." Check whether bot protection is present.

**Protection presence markers (if present — the form is probably covered):**
```
turnstile   cf-turnstile   challenges.cloudflare.com    # Cloudflare Turnstile (free)
hcaptcha   h-captcha   hcaptcha.com
grecaptcha   recaptcha   google.com/recaptcha           # Google reCAPTCHA
```

**A public form without any of these markers = a finding** (🟡 medium severity, see §5 — don't
inflate to high). **The fix recommendation is always the same — free Cloudflare Turnstile**
(simpler and more private than reCAPTCHA, and costs nothing).

### 2.4. CORS — is it restricted to your own domain

Open CORS = any third-party site can call your API from the user's browser.

**Problem markers (what to look for):**
```
Access-Control-Allow-Origin: *      "Access-Control-Allow-Origin", "*"
cors()                              # calling cors() with NO options = origin: *
origin: true                        # also allows any origin
origin: "*"                         allowAll   allowedOrigins: ["*"]
app.use(cors())                     # Express with no configuration
```

**Open CORS on an endpoint that costs something or serves private data = a finding** (🟠 high).
The false-positive nuance — see §4 (`*` can be appropriate on a public read-only API with no
secrets).

---

## 3. Fix patterns (working examples)

All examples are "before/after." Real APIs, nothing made up. During the fix phase you can confirm
the current syntax version via context7 (graceful degradation — see the design).

### 3.1. Rate limit — Upstash Ratelimit (Next.js App Router, route handler)

**Before** (a paid call with no counter):
```ts
// app/api/generate/route.ts
import OpenAI from "openai";
const openai = new OpenAI();

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const out = await openai.chat.completions.create({   // ← paid, no limit
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });
  return Response.json(out.choices[0].message);
}
```

**After** (a counter per IP, 10 requests per 10 seconds):
```ts
// app/api/generate/route.ts
import OpenAI from "openai";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const openai = new OpenAI();
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),                          // reads UPSTASH_* from env
  limiter: Ratelimit.slidingWindow(10, "10 s"),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return new Response("Too many requests, please try again later", { status: 429 });
  }
  // (even better — check the user's session here and limit by user-id)
  const { prompt } = await req.json();
  const out = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });
  return Response.json(out.choices[0].message);
}
```

### 3.2. Rate limit — express-rate-limit (Node/Express)

**Before:**
```js
app.post("/api/send-email", async (req, res) => {
  await sendgrid.send({ to: req.body.to, from, subject, text });  // ← paid, no limit
  res.json({ ok: true });
});
```

**After:**
```js
import rateLimit from "express-rate-limit";

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15-minute window
  max: 5,                     // no more than 5 requests from one IP per window
  // (in express-rate-limit v7 the field is called `limit`; `max` is kept as an alias — both work)
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many emails from this address, please try again later",
});

app.post("/api/send-email", emailLimiter, async (req, res) => {
  await sendgrid.send({ to: req.body.to, from, subject, text });
  res.json({ ok: true });
});
```

### 3.3. CAPTCHA — Cloudflare Turnstile (client + server-side verification)

Free, no card required. Two steps: a widget on the form + token verification on the server.

**Client (HTML/JSX form):**
```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

<form action="/api/subscribe" method="POST">
  <input type="email" name="email" required />
  <!-- Turnstile will inject a hidden "cf-turnstile-response" field with the token -->
  <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>
  <button type="submit">Subscribe</button>
</form>
```

**Server (Next.js route handler — verify the token BEFORE any paid action):**
```ts
// app/api/subscribe/route.ts
export async function POST(req: Request) {
  const form = await req.formData();
  const token = form.get("cf-turnstile-response");
  const ip = req.headers.get("CF-Connecting-IP") ?? undefined;

  const verify = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY!,   // secret — server-side only, from env
        response: String(token ?? ""),
        ...(ip ? { remoteip: ip } : {}),
      }),
    },
  );
  const data = await verify.json();
  if (!data.success) {
    return new Response("Failed the bot check", { status: 403 });
  }

  // only now — save the email / send the message
  return Response.json({ ok: true });
}
```

> The site key is public (it can go in the code/frontend). **The secret key is server-side only,
> from env**, never in the frontend bundle (otherwise it's already a finding for the `secrets`
> domain).

### 3.4. CORS — an explicit allowlist instead of `*`

**Before (Express):**
```js
import cors from "cors";
app.use(cors());            // = Access-Control-Allow-Origin: * — lets any site in
```

**After (only your own domains):**
```js
import cors from "cors";

const allowed = ["https://myapp.com", "https://www.myapp.com"];
app.use(cors({
  origin: allowed,          // array of allowed origins
  credentials: true,        // if you send cookies/auth
}));
```

**Before (Next.js route handler — manual header):**
```ts
return new Response(JSON.stringify(data), {
  headers: { "Access-Control-Allow-Origin": "*" },   // ← any site
});
```

**After:**
```ts
return new Response(JSON.stringify(data), {
  headers: { "Access-Control-Allow-Origin": "https://myapp.com" },
});
```

### 3.5. A safety net on the provider side (a mandatory tip in the fix)

A rate limit in the code is the first line of defense. **The second line is a hard limit/budget
alert at the paid provider itself.** It's a "fuse": even if a hole was left in the code, the bill
hits a ceiling. Always add this to the fix as a safety net:

- **OpenAI** — Billing → usage limits: set a **hard limit** (a strict ceiling on monthly spend)
  and a soft limit (a threshold for an alert email).
- **Anthropic Console** — spend limits / usage alerts on spend.
- **Supabase** — enable the **spend cap** (an overspend limit), and watch the
  egress/storage/edge-function metrics.
- **Twilio / SendGrid / Resend** — billing alerts; for SMS — geo restrictions and Verify fraud
  protection.
- **AWS** — **AWS Budgets** with an alert on amount (SES and everything else).

> In the report, phrase it for a beginner: "set a $20/month ceiling in your OpenAI dashboard —
> even if something goes wrong, they won't charge you more than that."

---

## 4. Known false-positives (do NOT flag)

So as not to scare a beginner with false 🔴s:

- **An internal endpoint behind auth with reasonable load.** If the path is accessible only to a
  logged-in user/admin and traffic is low — the absence of a rate limit here is not critical (you
  can gently mention it as low-priority hygiene, but don't inflate it).
- **CORS `*` on a PUBLIC read-only API with no secrets.** If the endpoint is intentionally public,
  only reads non-private data, and calls nothing paid/secret (for example, open JSON for
  embedding) — `*` is appropriate here, this is **not** a finding.
- **A paid API call in a protected server-side cron / background job.** If the paid call happens
  in a cron/scheduled function that **a user cannot trigger** (the frequency is set by the
  schedule, not by an incoming request) — there's nothing to spam, no limit needed. Don't flag.
- **A "paid" marker that is actually free/self-hosted.** A grep match (e.g. a local Ollama instead
  of cloud OpenAI, or a self-hosted service) — check whether it's really a metered cloud call
  before assigning a 🔴.

> If there's doubt about whether a path is really public/paid, and you can't confirm it from the
> code — that's a **🟡 "verify by hand"**, not a 🔴 "just in case." A false 🔴 undermines trust in
> the report just as much as a missed hole.

---

## 5. 3-state mapping (when 🔴 / 🟢 / 🟡)

States strictly follow `report-format.md`. A reminder of the honesty invariant: **🟡 never
collapses into 🟢.** The severity below is a **DRAFT** (agent); the orchestrator sets the FINAL one
globally after dedup.

**🔴 ISSUE FOUND** (there is concrete evidence — a spot in the code):
- an unprotected call to a **paid** API in a **public** endpoint with no limit →
  **critical** ("$200 overnight bill");
- a public SMS endpoint with no limit → **critical** (SMS pumping);
- a public form/page wired directly to Supabase with no limit → **critical**;
- no rate limit on a public endpoint (but not a paid one) → **high**;
- an authenticated endpoint that calls a paid API, with no limit → **high**;
- open CORS (`*` / `origin: true` / `cors()`) on an endpoint with paid calls or
  private data → **high**;
- a public form without CAPTCHA → **medium** (don't inflate to high).

**🟢 CHECKED — CLEAN** (the check was actually performed, no problems; **does not go into
findings**, but into the report's separate "checked-clean" list):
- every paid call found is confirmed to be behind authentication **and** a reasonable rate limit;
- public forms are covered by Turnstile/hCaptcha/reCAPTCHA;
- CORS is restricted by an explicit allowlist of your own domains.

**🟡 COULDN'T VERIFY** (the check can't be completed from the code; **loudly into a separate
"verify by hand" block**):
- the protection/limit may live **at the edge** (Vercel/Cloudflare/API gateway/WAF/infra), not in
  the repository — it can't be confirmed from the code → 🟡, **not** a false 🔴 and **not** a 🟢;
- you can't tell whether the endpoint is actually public (auth in an external layer/proxy that
  isn't in the code);
- grep found a marker for a paid service, but it's unclear whether it's a cloud call or
  local/self-hosted, and it can't be confirmed.

> The domain's main rule: if you're not sure a path is public/paid and unprotected — write 🟡
> "look at this spot by hand: <exactly how to check>," not a made-up 🟢 "clean."

---

## 6. What to return to the orchestrator (summary)

The `abuse-cost-auditor` agent returns:

1. **A list of findings** strictly following the 7-field `report-format.md` schema
   (`domain: abuse-cost` / `severity` (DRAFT) / `file_line` / `evidence` /
   `fix` / `confidence` / `state: 🔴|🟡`). Each finding has a concrete `file:line` and
   evidence; without proof, it's a 🟡, not a 🔴.
2. **Top priority — item 2.1:** every unprotected paid call in a public endpoint is marked
   `🔴 critical` and phrased in the language of money ("overnight a bot will rack up a $X bill"),
   especially the Supabase/SMS/LLM/GPU cases.
3. **A 🟢 "checked-clean" list** — what was actually checked and is fine (separate from findings).
4. **A 🟡 "couldn't verify" list** — with an explicit note on exactly what to check by hand
   (especially: edge protection — Vercel/Cloudflare/gateway — that isn't visible in the code).
5. In every `fix` — both a code change (rate limit / CAPTCHA / CORS allowlist) and a
   **provider-side safety net** (usage limit / spend cap / budget alert).

The orchestrator does the final severity and dedup — the agent provides a draft severity and raw
material.
