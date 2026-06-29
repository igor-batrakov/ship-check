# Domain `auth` — authentication robustness (BEHAVIORAL check)

Covers: *test the successful login and how login/signup/reset
behave under "wrong" actions* (brute force, someone else's email, double-click, retry).

---

## ⚠️ Why this domain is special — read this FIRST

This is a **behavioral** domain. It almost **cannot** be confirmed from the code — it's about how
the application **reacts live**.

1. **From the code — you can't.** You can see that a "check the password" call exists. You can't
   reliably tell from the code that a lockout kicks in after 5 wrong passwords, rather than "brute
   force to your heart's content." That's only visible in the browser.
2. **The agent can't click.** So the agent's job is to **hand the
   user a ready checklist** — "click through this by hand before launch" — and put the items in the
   🟡 "Couldn't verify — check by hand" block (see `report-format.md`).
3. **By default everything here = 🟡 "COULDN'T VERIFY."** Until the user has tested it by hand and
   reported back, the item's state is 🟡, not 🟢. Honesty invariant: 🟡 **never** collapses into 🟢
   "on its own."
4. **Don't invent `confidence`/`severity` where behavior hasn't been verified.** "I think there's
   probably a lockout here" → that's neither a finding nor "clean." That's an honest 🟡.
5. **Don't force items into the regular finding schema with fake confidence.** This domain's format
   is a **checklist**: "action → expected safe behavior → if it's otherwise, that's a finding." An
   item turns into a `report-format.md` finding **only after** the user has actually seen something
   (see conversion below).

> **Boundary with the `websec` domain.** Static analysis of auth code — how passwords are hashed
> (bcrypt/argon2, not md5/plain), how the JWT is signed, whether the JWT secret sits in the code,
> the `none` algorithm — that's **websec** (checked from the code there). Here, in `auth`, it's only
> the **behavior** of the live application. Don't duplicate.

---

## How the agent uses this file (two-layer scheme + state conversion)

**Layer 1 — the agent.** The agent doesn't test. It takes the checklist below, fills in the
project's real URLs (login/signup/reset pages), and **hands it to the user** as a single block in
the report. All items start in state **🟡**.

**Layer 2 — the user.** Clicks through the checklist by hand and reports what they saw.

**State conversion (when 🟡 changes and to what):**

| What happened | State | Where in `PROD-AUDIT.md` |
|---|---|---|
| The user did **not** test (default) | 🟡 | "🟡 Couldn't verify" block |
| The user tested and the behavior is **safe** | 🟢 | "✅ Checked — clean" block |
| The user tested and **saw a problem** | 🔴 | finding per the schema (see below) |

**If 🔴 — write it up per the `report-format.md` schema, but honestly for behavior:**
- `domain:` `auth`
- `file_line:` `—` (this is behavior, not a line of code)
- `evidence:` **verbatim what the user saw** ("entered a wrong password 20 times in a row — a plain
  error every time, no lockout, no delay, no captcha"). Without this — it's not 🔴.
- `severity:` **preliminary** — the orchestrator sets the final value. Don't inflate it (see the
  notes on enumeration below).
- `confidence:` `high`, only if the user unambiguously confirmed the observation.
- `fix:` as usual, in plain language; `state:` `🔴`.

---

## 🧰 Preparing for the check (tell the user this once)

- **Set up a separate TEST account** (on a throwaway email, e.g. via `+test` or a temporary mailbox).
  ⚠️ A brute-force test may **lock the account** — don't do it on your main one.
- **Open it in incognito mode** (Ctrl/Cmd+Shift+N) — a clean session, nothing cached.
- It helps to keep **two windows**: a normal one and an incognito one (for testing sessions/logout).
- Find the addresses in advance: the **login** page, **signup**, **"forgot password,"** and the
  **email confirmation** message (if signup sends one).

---

## ✅ Manual-check checklist (5 scenarios)

Each item's format: **🧪 steps in the browser → ✅ safe behavior → 🚩 sign of a problem → 🧩 note.**

---

### Scenario 1 — Wrong password 5+ times in a row (brute-force protection)

**🧪 Steps:**
1. Open the login page in incognito.
2. Enter an **existing** test email and a **deliberately wrong** password.
3. Click "Log in" — you'll get an error. That's normal.
4. Repeat steps 2–3 **5, then 10, then 20 times in a row** with different wrong passwords.

**✅ Safe behavior (expect at least one of these):**
- After several attempts a **delay** appears (the response is noticeably slower), or
- a **captcha** / "prove you're not a robot" kicks in, or
- the account/IP is **temporarily blocked** ("too many attempts, try again in N minutes").

**🚩 Sign of a problem → finding:**
- You can keep clicking "Log in" with a wrong password **endlessly**, with no delay, lockout, or
  captcha.
  → A bot will run through millions of passwords overnight and get into someone else's account.
  `evidence`: "20 wrong attempts in a row — zero reaction, brute force is possible." `severity` (prelim.): high.

**🧩 Note:** if protection exists but is "too harsh" (locks forever after 3 attempts with no
self-unlock) — that's about usability, not critical for the release, but mention it.

---

### Scenario 2 — Password reset for a NON-existent email (user enumeration)

**🧪 Steps:**
1. Open "Forgot password?"
2. Enter a deliberately **non-existent** email (e.g. `nu-tochno-net-takogo-12345@example.com`).
3. Submit. Note the **response text** and (roughly) the **time** until the response.
4. For comparison — repeat with a **real** test email. Compare the texts and the response speed.

**✅ Safe behavior:**
- The response is **identical and neutral** in both cases: *"If this email is registered, we've sent
  it a message."* From the response you **cannot tell** whether the user exists or not.

**🚩 Sign of a problem → finding:**
- For the non-existent one: *"User not found,"* and for the real one: *"Email sent."*
  → A stranger can **figure out by enumeration who's registered with you** (a ready-made list for
  brute force/phishing). `severity` (prelim.): medium.
- *(Advanced note, optional)* even with identical text, the response for the real email arrives
  noticeably slower → a leak via timing. Note it as an observation, don't inflate it.

**🧩 Note:** don't turn this into critical. Disclosing a user's existence is a real but **not
instant** risk; the orchestrator sets the final severity.

---

### Scenario 3 — Opening the email confirmation link twice

**🧪 Steps:**
1. Register a test account, wait for the "Confirm your email" message.
2. Open the confirmation link the **first time** — it should confirm.
3. Open **the same link a second time** (refresh the page / click it from the email again).
4. While you're at it, check an old/stale link if you have several messages.

**✅ Safe behavior:**
- The second time — a calm message like *"Email already confirmed"* or a redirect to login.
  No 500s, no "magic" auto-login via the old link.

**🚩 Sign of a problem → finding:**
- The second opening gives a **500/application error** or a broken state (the account is "half
  confirmed"). → Users will get stuck, and a broken state = a breeding ground for bugs.
  `severity` (prelim.): medium.
- The link **logs you in** on reopening without a password / has no expiry.
  → A link from an old message = entry into the account. `severity` (prelim.): high.

**🧩 Note:** it makes sense to check the same for the **password reset link** — reuse and expiry.

---

### Scenario 4 — Signup with an ALREADY-registered email

**🧪 Steps:**
1. You have a test account on email `X`.
2. Open signup and try to register **again with the same `X`** (a different password).
3. See what happened, and **try logging in with the old password**.

**✅ Safe behavior:**
- Re-registration does **not** wipe the existing account and does **not** change its password;
  the old password keeps working.
- Ideally the response is neutral (often they send a message *"you already have an account, here's
  the login link"* instead of an explicit "this email is taken").

**🚩 Sign of a problem → finding (in descending order of importance):**
- **The main one:** re-registration **overwrote** the account / changed the password / let you log
  into the old data with a new password. → This is **account takeover**. `severity` (prelim.): high/critical.
- The form replies outright *"email already taken"* → easy enumeration (see Scenario 2),
  `severity` (prelim.): low/medium.

**🧩 Note:** many normal applications (and almost all auth libraries) **deliberately** show "email
already registered" for usability — this is a **known tradeoff**, don't panic and don't mark it
critical. Genuinely dangerous is only **overwrite/account takeover**.

---

### Scenario 5 — Sessions and tokens (logout, lifetime, token in the URL)

Here part is checked by hand (behavior), part is visible in the browser with your own eyes.

**5a. Logout actually ends the session.**
- 🧪 Log in. Open a protected page (the account dashboard). **Copy its URL.** Click "Log out."
  Now: (1) hit the browser's **"Back"** button and (2) **paste the copied URL** again.
- ✅ Safe: after logout the protected page **shows no data** — a redirect to login.
- 🚩 Finding: after "Log out," via "Back"/URL the **private data is still visible** → logout ends
  nothing. `severity` (prelim.): high.

**5b. No token in the URL.**
- 🧪 After login and in the links from emails (reset/confirmation), look at the **address bar**.
- ✅ Safe: the persistent page URL has **no** `?token=…` / `?access_token=…` / `#access_token=…`
  left hanging in the address.
- 🚩 Finding: a working token/session **in the URL** → it leaks into the browser history, server
  logs, and the Referer header to other sites. `severity` (prelim.): high. *(This is visible both
  by eye in the address bar and sometimes in the code — see the code section below.)*

**5c. The token doesn't live forever.**
- 🧪 Honestly: a beginner **won't** reliably check this in 5 minutes (you'd have to wait
  hours/days).
- ✅/🟡: leave the item at **🟡 by default** and ask them to check later: log in, don't log out,
  come back a day later — if you're still inside without re-logging in and it's not "remember me,"
  the session may be everlasting.
- 🚩 Finding (if it turns out so): the session never expires → a stolen token is good forever.
- 🧩 **Don't invent a quick test.** If you didn't wait it out — leave it 🟡, don't set 🟢.

**🧩 Boundary:** *how exactly* the token is signed/stored (algorithm, secret, httpOnly cookie vs.
localStorage) — that's static analysis and belongs to the `websec` domain. Here it's only the
observable behavior.

---

## 🔎 Where the agent CAN peek at the code — as a hint, not as proof

The code gives context and can **soften** expectations, but it does **not** replace the manual check.

- **Is there a ready-made auth library?** Look for dependencies/imports:
  `@supabase/auth`/Supabase Auth, `@clerk/*` (Clerk), `next-auth`/`@auth/*` (NextAuth/Auth.js),
  `auth0`/`@auth0/*` (Auth0), `firebase/auth`, `lucia`.
  → These come **out of the box** with: neutral reset responses, rate limiting/lockout on login,
  proper handling of repeated links, httpOnly sessions. This is a **mitigating factor** — note it.
  **But still** ask them to verify by behavior: settings can be weakened, and homegrown
  wrappers/custom forms on top of the library easily reintroduce holes.
- **Homegrown auth "from scratch"** (manual SQL/inserts on users, a custom `bcrypt.compare` without
  any attempt limit) → **elevated risk**, the manual check is mandatory, and expectations for the
  protections are lower.
- **Token in the URL — you can flag it from the code too:** look in routing/redirects/emails for
  link construction with `?token=`, `access_token`, `?session=`. Found one — still confirm by
  behavior (Scenario 5b).

> Even with a "grown-up" library present, the verdict on this domain does **not** automatically
> become 🟢. A library = a lower chance of a hole, not proof of its absence.

---

## 🧾 How to write up the output (for the agent)

Give the user **a single checklist with checkboxes**, all items defaulting to **🟡**, and an
**explicit instruction to click through it before launch.** The items go into the "🟡 Couldn't
verify — check by hand" block of the `PROD-AUDIT.md` report. As the user answers — convert the
states (🟡 → 🟢 if safe, 🟡 → 🔴 with `evidence` if there's a problem; see the table above).

```markdown
## 🟡 Authentication: click through this by hand BEFORE launch

You can't check this from the code — the behavior is only visible live. Do it on a TEST account
(not your own!), in an incognito window. Check off each item.

- [ ] 🟡 **Brute force.** Entered a wrong password 20 times in a row → did a delay/captcha/lockout
      appear? (if not — nothing will stop a bot)
- [ ] 🟡 **Reset for someone else's email.** Is the response for a non-existent email just as
      neutral as for a real one ("if the email exists — we sent a message")?
- [ ] 🟡 **Double confirmation link.** Opened the link from the email a second time → a calm
      "already confirmed," with no 500 error and no login via the old link?
- [ ] 🟡 **Re-registration.** Signup on an already-taken email did NOT wipe the account and did NOT
      change the password — does the old password still let you in?
- [ ] 🟡 **Logout.** After "Log out," do the "Back" button and pasting the dashboard URL NOT show
      private data (redirect to login)?
- [ ] 🟡 **Token in the URL.** Is there no `?token=`/`access_token=` left hanging in the address bar?
- [ ] 🟡 **Session lifetime.** (you'll check later) A day later, without "remember me," are you still
      inside without re-logging in? — if so, the session may be everlasting.

If even one item behaved otherwise — that's a finding, write down exactly what you saw.
```

**Write-up rules:**
- Each item defaults to **🟡**. Don't set 🟢/✅ on the user's behalf.
- Don't assign `confidence`/`severity` until there's a real observation.
- Turn it into a 🔴 finding (per the `report-format.md` schema, `file_line: —`) only with verbatim
  `evidence` from the user.
- Severity is preliminary; the orchestrator sets the final value. Don't inflate enumeration; what's
  genuinely sharp is brute force with no limit, account takeover, and a live token in the URL/after
  logout.
