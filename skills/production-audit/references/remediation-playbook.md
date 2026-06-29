# Remediation Playbook (Fix Guide)

This file is the agent's instruction set for the **"fix the findings"** phase: it kicks in
**after** the audit has written the `PROD-AUDIT.md` report to the project root. The finding
format, the states (🔴 🟢 🟡), and the accept-list block are defined in `report-format.md` —
that file is authoritative; this one stays consistent with it and only describes **how** to safely
carry findings through to a fix.

The audience is a **beginner with no coding background**. The guiding principle for the whole phase:

> Safely, one step at a time, in plain language. The agent does the work — the user just
> understands what's happening and says "yes."

---

## 1. Fix order — start with what's on fire

We fix things **strictly in descending order of release danger**. Even within "critical" there's
a queue — we start with what causes damage **instantly and on its own**, with no "ifs":

1. **Leaked secrets** (a key/token/password in the frontend, in git, in logs).
   Why first: it has already happened. A key sitting in public code can be grabbed
   **right now**, while we're fixing everything else. Often this requires **rotation** (see §3) —
   which renders the old key useless to an attacker.
2. **Data access** (an open database, no RLS, one user seeing another's data — IDOR, authz
   bypass, a public bucket with private files).
   Why second: even without a leaked key, anyone can pull or tamper with the data.
3. **Money / paid external APIs** (an unprotected call to a metered API — the risk of "a bot ran
   up a $200 bill overnight").
   Why third: the damage is real and financial, but it usually requires someone to deliberately
   hammer the endpoint — it doesn't "leak on its own."

After all the critical items, we move on to **high** (XSS/injections, no server-side validation,
CORS `*`, debug in production, no rate limiting), then **medium/low** (security headers, CAPTCHA,
hygiene).

The reason for this order, in plain language for the user: **"First we close off what could get
you robbed today. The cosmetic stuff can wait — it'll keep, a hole in your wallet won't."**

> The severity of each finding has already been set by the orchestrator in `PROD-AUDIT.md`
> (the "All findings by severity" section + "🔥 Fix first"). Don't re-evaluate it in this
> phase — just go top to bottom down the list.

---

## 2. Safety protocol (a hard rule, no exceptions)

> **One change → verify the result → only then the next. Never fix in a batch.**

After **every** change, make sure the app isn't broken: run it (or the relevant flow — login,
payment, page load, the specific request) and verify that what used to work still works.

Why this rule is hard and fast:

- If you change ten places at once and something breaks, it's **unclear what exactly** broke it.
  You'll have to roll everything back and start over.
- One change at a time = the exact cause of any breakage is always known = a one-step rollback.
- A beginner can't make sense of a "wall of changes." They can understand and approve **one**
  clear action.

The practical cycle for each finding:

1. Explain the problem and propose a fix (see the tone in §6).
2. Get a "yes."
3. Make **one** change.
4. Run / verify the relevant flow.
5. Tell the user briefly: "done, here's how I checked — it works."
6. Only now — the next finding.

If something broke after a change, **fix the breakage or roll back first**, and only then move
on. Don't accumulate a broken state.

---

## 3. Breaking fixes — a special mode

Some correct fixes can **take down a live application**. They must not be applied silently.
Typical "breaking" fixes:

- **Enabling RLS** on a table the client was hitting directly with the anon key → queries
  will start returning **nothing** (there are no policies yet — which means "everything is
  denied").
- **CORS lockdown** (narrowing the allowed origins) → you can accidentally **cut off a
  legitimate frontend or integration** that was calling the API.
- **Tightening server-side validation** → the new strict rules may **reject requests that
  currently go through** (old clients, the mobile app, webhooks).
- **Rotating a leaked key** → the old key **will stop working everywhere** it was used (other
  services, cron, the backend, config files). You need to set the new one in place at the same
  time.

For any such fix, there's a **mandatory protocol**:

1. **First, explain the risk in plain language.** What exactly can break and how it will look.
   Example: *"I'm going to turn on protection for the table. Right after that, the app may show
   empty lists — because we haven't yet described who's allowed to see what. That's expected;
   we'll fix it immediately with access rules."*
2. **Get an explicit "yes"** for this specific step — its own separate consent, given right here,
   beyond any blanket "yes to everything" from the start.
3. **Offer a rollback plan** in advance, before the change:
   - make a backup / snapshot (the database, the config file, a dump of the policies);
   - work in a separate **git branch**, so you can revert with a single command;
   - write down **exactly how to restore the previous state** (turn RLS back off, revert the old
     CORS, roll back the branch) — so the user knows there's a way back.
4. **Where possible, do it in stages with a test on a single spot.** First apply it to one table
   / one endpoint / in a test environment, verify that the legitimate flow is alive, and only
   then roll it out to the rest.

A special note on **key rotation** (it breaks quietly — external connections go down while the app itself keeps working):
before revoking the old key, you need to find **all the places** it's used and replace it with
the new one. Otherwise "fixed the leak" turns into "took down the integration." If you can't
find all the places in the code, say so honestly and mark it 🟡 rather than revoking blind.

---

## 4. Freshness in the fix phase (the current API, not memory)

When the agent writes a **concrete** fix for the project's stack (an RLS policy for Supabase, a
headers config for Next.js, validation middleware, CORS setup), it **does not rely on memory** —
libraries and their APIs change. The agent pulls the current docs via this chain:

1. **context7** (if available) — select the library matching the project's stack and request the
   current syntax for the fix you need.
2. **WebSearch** — if context7 isn't available or didn't cover it, look up the current API
   version in the official documentation.
3. **Evergreen knowledge from `references/`** — stable principles that don't depend on the
   version (that RLS is needed, that a secret must not go in the frontend, that validation must
   be on the server).
4. **Nothing confirmed it → mark it 🟡 and do NOT guess.** Tell the user: *"I know server-side
   validation needs to be enabled, but I couldn't confirm the exact current syntax for your
   version — check the official docs right here so I don't write outdated code."*

> Optional, surfaced once: when context7 is absent and a fix needs version-exact syntax, you may
> mention that adding the **context7 MCP** is a one-time setup that lets the agent pull syntax
> straight from a library's own docs. Keep it a suggestion — the chain above already works without it.

Why this way:

> A fix with an outdated API is **worse** than an honest "check the current docs." Outdated code
> can silently fail to work (the hole is still there, but the user thinks it's closed) or break
> the build. An honest 🟡 keeps the user informed and safe.

This is the same honesty logic as in the audit: **not sure means 🟡, not "done"** (see the
invariant in `report-format.md`). Freshness here is about **how to write** the fix; vulnerable
dependencies (CVEs) are still handled by the scanner from `scanners.md`, not by context7.

---

## 5. Accept-list — consciously accepted risks

The user has the right to **consciously not fix** a finding (for example: "this form is internal,
no CAPTCHA needed," "this endpoint is behind a VPN anyway"). So that a re-run of the audit
doesn't raise it again, this decision is recorded.

How to record it:

1. Ask the user explicitly: do they understand **what they're risking** by not fixing it (in one
   line, in plain language). Accepting the risk is a conscious choice, not "too lazy to deal
   with it."
2. Record the finding in the **"Accepted risks (accept-list)"** section of `PROD-AUDIT.md` — the
   format is already defined in `report-format.md`:
   ```
   - <finding> — consciously accepted <date>. The re-run audit won't raise it again.
   ```
3. Note the **date** (today) and, where possible, a short reason — so that six months from now
   it's clear why this was decided.

On the next audit run, the agent checks against this section and **does not raise**
already-accepted findings (but may remind the user about them with a separate, gentle line if
the risk has grown).

### Invariant (no exceptions)

> Suppressing a finding is **only at the level of this project** (project-local): an entry in
> this specific project's `PROD-AUDIT.md`. **No global suppression of a class of findings.**

That is, you can't "disable the secrets check altogether" or "never flag CORS again across all
projects." A risk being accepted means it's accepted **here, for this specific finding, on this
date**. In another project, the same problem will surface again and be addressed from scratch.

---

## 6. Tone when talking to a beginner

Every fix is presented using the same simple three-part template — **no jargon**:

1. **Here's the problem — and what it risks.** The consequence in human terms, not an acronym.
   - ✅ "Anyone on the internet can read your entire user database."
   - ❌ "Missing RLS policy, violation of the principle of least privilege."
2. **Here's what I propose to do.** One clear action.
   - "I'll turn on protection for the table and set a rule: each person sees only their own
     records."
3. **Ok?** — a short question for consent. We wait for a "yes" before the change.

After the fix, a short confirmation, also without technical details:

> "Done. Here's how I checked: I opened the page under a different account — other people's data
> is no longer visible. It works."

Tone rules:

- Explain the **damage in plain words** (see §5 "Report language" in `report-format.md`): not
  "P0 IDOR," but "a stranger will see other users' data."
- Don't dump code and stack traces unless the user asks for them. They approve the **intent**,
  not the diff.
- One fix, one message: "problem → proposal → ok?" Don't pile five problems into a single wall
  of text.
- If the fix is a breaking one (§3), the tone is the same, but with an explicit risk warning and
  a rollback plan.

---

## 7. Re-running the audit

After a batch of fixes, you can't leave the user with the **old** verdict — it's already out of
date.

When the main findings are closed (or consciously accepted into the accept-list), the agent
**offers to re-run the audit**:

> "I've fixed the critical stuff. Let me run the check once more — I'll update the verdict and
> make sure we didn't miss anything or break anything along the way?"

The re-run:

- runs the checks again and **updates the verdict** at the top of `PROD-AUDIT.md`
  (🚫 → ⚠️ → ✅ as things get closed);
- **checks against the accept-list** and doesn't raise consciously accepted findings;
- may find **something new** (a fix could expose a neighboring problem — that's normal, we fix
  it the same way, one at a time);
- confirms that what was fixed is genuinely closed, not just "seemed to be."

The goal is for the final report to reflect the **real current** state, not what the project
looked like before the fixes.

---

## Remediation phase checklist

- [ ] Going through findings **top to bottom by severity**: secrets → data-access → money →
      high → medium/low.
- [ ] **One change at a time** → verified the flow → only then the next. Not in a batch.
- [ ] After each change, verified the app/flow **isn't broken**.
- [ ] For **breaking** fixes (RLS, CORS, validation, key rotation): explained the risk → got an
      explicit "yes" → have a rollback plan → staged where possible, with a test on a single spot.
- [ ] The concrete fix syntax is taken from **current** docs (context7 → WebSearch → evergreen);
      not confirmed → **🟡, didn't guess**.
- [ ] Consciously not fixing → recorded in the **accept-list** in `PROD-AUDIT.md` with a date;
      suppression is **project-local**, not global.
- [ ] Tone: "problem (what it risks) → proposal → ok?", no jargon; after the fix, a short
      "done, here's how I checked."
- [ ] At the end, **offered to re-run the audit** and update the verdict.
