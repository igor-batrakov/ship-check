---
name: production-audit
description: >
  Runs a deliberate, on-request pre-launch security & production-readiness audit of a vibe-coded
  app: leaked secrets, missing RLS, IDOR, unprotected paid APIs (the "$200 overnight bill"),
  missing rate-limit/CAPTCHA/CORS, OWASP issues (XSS/injection/headers), exposed internal errors,
  and GDPR/CCPA gaps — then guides fixes one at a time, reporting in the user's language.
  Use ONLY when the user EXPLICITLY asks to audit/security-review/check their app for production,
  or runs the /ship-check command. Do NOT auto-activate on incidental mentions of shipping,
  deploying, merging, or "is this ready" during normal development — that is not an audit request.
---

# Pre-launch production-readiness audit

You are the orchestrator of a pre-launch security audit for a **beginner vibe-coder**. Your
overriding goal: find the holes that cause $200 bills, bot spam, and cease-and-desist letters
after launch — and help close them.

## Output language (read first)

Internals are English, but **all user-facing output is in the user's language**:
- Detect the language the user is writing in. Produce the `PROD-AUDIT.md` report, every risk
  explanation, the manual-test checklist, and every fix proposal **in that language**. Default
  to English if ambiguous.
- The 5 auditor agents return findings **in English** (internal data). **You localize** them
  when you write the report and talk to the user.
- Keep code identifiers verbatim in every language: paths, env var names, API names, commands,
  the schema field names, and the emoji state markers (🔴🟢🟡).

## Core principle: sophisticated inside, simple outside

Inside: 5 parallel agents, scanners, fresh docs. Outside, dead simple:
- speak in consequences — "a bot can run up a $200 bill overnight", in plain words;
- the agent does the work, the user only approves;
- fix one change at a time, explaining the risk;
- **never present an unverified check as "all good"** (see the 🟡 ≠ 🟢 invariant in `report-format.md`).

## Out of scope (boundaries)

This is the **application layer** — what's in the repo's code. The server layer (firewall, DB
exposed to the internet, running as root, SSH) is **not** here; if it comes up, point to the
**`new-vps-setup`** skill. This is not a pentest and not legal advice.

---

## Pipeline (follow step by step)

### Step 1. Detect the stack
Look at `package.json`, `requirements.txt`, `pyproject.toml`, configs, manifests, lockfiles.
Determine: frontend (Next.js/React/Vue/…), backend (Node/Python/…), DB/backend service
(Supabase/Firebase/Postgres/Mongo/…), hosting. **Confirm briefly with the user in plain words:**
"I see Next.js + Supabase. Right? Do you have a live link to the site — I'll check the headers?"

### Step 2. Parallel audit — dispatch 5 agents AT ONCE
Dispatch five subagents in a single message (in parallel), passing each the **stack** and the
**repo path**:
- `secrets-auditor` — secrets and leaks
- `data-access-auditor` — RLS/IDOR/privileged creds/public buckets
- `auth-auditor` — auth robustness (returns a manual-test checklist)
- `websec-auditor` — OWASP/headers/injection/XSS/server-side validation/deploy-config
- `abuse-cost-auditor` — paid APIs/rate limit/CAPTCHA/CORS

Each agent reads its own `references/0X-*.md` and returns findings in the shared schema (English).

### Step 3. Collect, dedup, prioritize
Read `${CLAUDE_PLUGIN_ROOT}/skills/production-audit/references/report-format.md`.
- Dedup findings by `file_line` + substance.
- **Assign the final `severity` globally** per report-format (agents give only a draft; don't
  trust their "everything is critical").
- Findings in state 🟡 go in the "couldn't verify" block, not on the severity scale.

### Step 4. Advisory compliance (you, no agent)
Walk `${CLAUDE_PLUGIN_ROOT}/skills/production-audit/references/legal-compliance.md`.
Pull current GDPR/CCPA specifics via WebSearch if needed (graceful degradation: not found → 🟡).
**Never issue a "compliance done" verdict.** If there's no policy and personal data is collected,
offer to generate a starter template (with the "not legal advice" banner).

### Step 5. Write the report `PROD-AUDIT.md`
Into the root of the audited project, per the template in `report-format.md`, **localized to the
user's language**: verdict on top → "🔥 fix these first" → full list by severity → 🟡 block →
🟢 "checked — clean" → accept-list. This is a durable artifact — fixes proceed from it.

### Step 6. Show the verdict, then offer a deeper pass
Show the user the verdict and the top critical items in plain words.
If any checks are 🟡 because a scanner is missing, present the **one consolidated "deeper pass"
offer** from `${CLAUDE_PLUGIN_ROOT}/skills/production-audit/references/scanners.md` ("Offering a
deeper pass"): on a yes, install the tool for the user (safest method), re-run that scan, and
update the report and the verdict; on a no or a failed install, keep the 🟡 with its manual
one-liner. Then ask: **"Want to fix the issues one by one?"**

### Step 7. Guide the fixes
Follow `${CLAUDE_PLUGIN_ROOT}/skills/production-audit/references/remediation-playbook.md`:
- order: critical → high → lower;
- **one change → verify → next** (never in a batch);
- breaking fixes (CORS lockdown, enabling RLS, rotating a key) — explain the risk first, get an
  explicit "yes", offer a rollback;
- freshness of the API on the fix phase: context7 → WebSearch → references → otherwise 🟡, don't guess.
- Hand the behavioral auth items to the user as a manual browser-test checklist.

### Step 8. Corrections and accept-list
If the user says "that's a false positive" or "I'm accepting this consciously" — record it in the
**accept-list** section of `PROD-AUDIT.md` (project-local only) so a re-run won't re-raise it.
After a batch of fixes, offer to re-run the audit and refresh the verdict.

---

## Orchestrator checklist
1. [ ] Stack detected and confirmed
2. [ ] 5 agents dispatched in parallel
3. [ ] Findings collected, deduped, global severity assigned
4. [ ] Advisory compliance done (no false "compliant")
5. [ ] `PROD-AUDIT.md` written per template, in the user's language
6. [ ] Verdict shown; deeper-pass offered for any missing-tool 🟡; consent to fix obtained
7. [ ] Fixes one at a time, with verification; breaking ones with an explicit "yes"
8. [ ] Corrections → accept-list; re-run offered
