# Plan: pre-launch audit plugin for vibe coders

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that, with a single `/ship-check` command, runs a multi-agent pre-launch security audit of a vibe-coded repository, produces an honest report (🔴/🟢/🟡), and walks you through the fixes.

**Architecture:** Plugin = a thin `/ship-check` command → orchestrator skill (detects the stack, dispatches 5 parallel named agents, deduplicates, prioritizes globally, writes `PROD-AUDIT.md`, walks through the fixes). The agents are thin; all detection logic and fix patterns live in `references/` (DRY), and each agent reads its own via `${CLAUDE_PLUGIN_ROOT}`. Knowledge freshness applies only at the fix phase, with graceful degradation. Tool verification = a fixture repo with deliberately planted holes.

**Tech Stack:** Claude Code plugin (`.claude-plugin/plugin.json`, `commands/`, `agents/`, `skills/`), Markdown with YAML frontmatter. Optional scanners via `npx`: gitleaks, semgrep, `npm audit`, `curl`. MCP: context7 (phase 2, optional), WebSearch.

> Historical plan record (v0.1). The "Content language: Russian" constraint below reflects the
> original build; v0.2 moved the plugin internals to English and localizes user-facing output to
> the user's language at runtime. The README describes the current state.

## Global Constraints

- **Content language:** Russian. **Triggers in the `description` of the agents/skill/command:** Russian + English (triggers better on English queries).
- **Principle "complex inside, simple outside":** outward — a single command, the language of consequences (money, not jargon); the agent does the work, the user only approves.
- **Three states, no false "ok":** 🔴 FOUND / 🟢 CLEAN / 🟡 COULDN'T CHECK. 🟡 NEVER collapses into 🟢.
- **Finding schema (verbatim, shared by all agents):** `{ domain, severity, file_line, evidence, fix, confidence }`. `severity` is set GLOBALLY by the ORCHESTRATOR after dedup; the agent supplies a preliminary one.
- **Beginner-safe remediation:** a breaking fix — only with an explanation of the risk and an explicit "yes"; one edit → check → next.
- **Boundary:** the application layer (what's in the repo's code). Server-side concerns (firewall, DB not exposed to the internet, non-root) are NOT here — point to the `new-vps-setup` skill.
- **No hard dependency on context7:** chain `context7 → WebSearch → evergreen references → 🟡`.
- **Path names in the plugin — via `${CLAUDE_PLUGIN_ROOT}`** (not relative/absolute).
- **v1 does NOT include:** LLM specifics, a global `learnings.md`, context7. They are marked "phase 2" in the spec.

**Convention for content tasks:** for shared contracts (manifest, schema, frontmatter, report skeleton) the code is given verbatim. For content references, the task specifies required-elements + one working example at the needed depth; the full prose is written during execution (it is the deliverable). The "test" of a content file is a structural checklist of the required elements; the "test" of the orchestrator and the e2e is a run against the fixture repo.

Spec: `docs/superpowers/specs/2026-06-29-prod-audit-plugin-design.md`.

---

## Order and dependencies

```
T1 scaffold+manifest+report contract ─┬─> T2 scanners ─┐
                                      ├─> T3..T7 domain references ─┐
                                      └─> T8 legal reference        │
T9 remediation-playbook <─────────────────────────────────────────┤
T10..T14 thin agents <── (need T3..T7 + the T1 contract) ─────────┤
T15 orchestrator SKILL.md <── (need agent names T10..T14, T1,T2,T8,T9)
T16 ship-check command <── (needs T15)
T17 fixture repo + EXPECTED manifest  (can run in parallel with T3..T14)
T18 e2e run against fixture <── (needs EVERYTHING)
T19 README
```

---

## Task 1: Plugin scaffold + manifest + report contract

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `skills/production-audit/references/report-format.md`

**Interfaces:**
- Produces: the finding schema `{ domain, severity, file_line, evidence, fix, confidence }`; the `severity` set (`critical|high|medium|low`); the three states; the `PROD-AUDIT.md` template. All of this is consumed by T10..T15.

- [ ] **Step 1: Plugin manifest**

Create `.claude-plugin/plugin.json`:
```json
{
  "name": "production-skill",
  "description": "Pre-launch security & production-readiness audit for vibe-coded apps. Finds leaked secrets, missing RLS, unprotected paid APIs, missing rate-limit/CAPTCHA/CORS, OWASP issues and compliance gaps before you ship. Pre-launch security audit for vibe coders.",
  "version": "0.1.0",
  "author": { "name": "igor" }
}
```

- [ ] **Step 2: Report contract — `report-format.md`**

Create `skills/production-audit/references/report-format.md` with the following REQUIRED blocks (lock the schema and template down verbatim):

1. **Three states** — definitions of 🔴/🟢/🟡 and the invariant "🟡 ≠ 🟢".
2. **Finding schema (verbatim):**
   ```
   - domain:     secrets | data-access | auth | websec | abuse-cost | compliance
   - severity:   critical | high | medium | low   (preliminary, from the agent; the FINAL one is set by the orchestrator)
   - file_line:  path:line  (or "—" if not code)
   - evidence:   the concrete fact/snippet, why this is a problem
   - fix:        what to do, in plain language
   - confidence: high | medium | low
   ```
3. **Global prioritization rules** (orchestrator): what makes a finding `critical` (a leaked secret/key, an open DB / RLS bypass, an unprotected paid API, a public bucket with private data), what makes it `high`/`medium`/`low`. Dedup by `file_line` + substance.
4. **`PROD-AUDIT.md` template (verbatim):**
   ```markdown
   # Production-Readiness Audit

   > Run on: <date>. Stack: <stack>. This is not a pentest and not a guarantee — the baseline pre-launch minimum.

   ## Verdict: 🚫 not ready to ship yet | ⚠️ shippable, but fix this | ✅ basics covered

   ## 🔥 Fix first (top critical)
   1. <plain language: what it is, what it threatens, how to fix it>

   ## All findings by severity
   ### 🔴 Critical
   ### 🟠 High
   ### 🟡 Medium
   ### ⚪ Low

   ## 🟡 Couldn't check — review by hand
   - <exactly what and why it couldn't be checked; what to do manually>

   ## ✅ Checked — clean
   - <a short list of what's OK>

   ## Accepted risks (accept-list)
   - <finding> — knowingly accepted <date>. A re-audit will not raise it again.
   ```
5. **Ergonomics:** the verdict and "fix first" — always at the top; the 🟡 block — separate and prominent.

- [ ] **Step 3: Verification (structural test)**

Run: `python3 -c "import json;json.load(open('.claude-plugin/plugin.json'))" && echo OK`
Expected: `OK` (the JSON is valid).
Eyeball check: `report-format.md` contains all 5 blocks, the finding schema verbatim, and the `PROD-AUDIT.md` template.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json skills/production-audit/references/report-format.md
git commit -m "feat: scaffold plugin manifest + report/finding contract"
```

---

## Task 2: Scanners reference (hybrid tooling)

**Files:**
- Create: `skills/production-audit/references/scanners.md`

**Interfaces:**
- Produces: for each scanner — commands for "check presence / run via npx / interpret / fallback→🟡". Consumed by T3..T7 and the orchestrator.

- [ ] **Step 1: Write `scanners.md`**

Required scanners, each with a `detect / run / interpret / fallback` block:
- **gitleaks** — secrets in code / git history. `detect`: `command -v gitleaks || npx gitleaks version`. `run`: `gitleaks detect --no-banner`. `fallback`: grep heuristics (`sk-`, `AKIA`, `-----BEGIN ... KEY`, `service_role`) + 🟡 if it didn't run.
- **semgrep** — OWASP/injections/XSS. `run`: `npx semgrep --config auto`. `fallback`: manual patterns from the websec reference + 🟡.
- **npm audit** (and its equivalents: `pip-audit`, `osv-scanner`) — vulnerable dependencies / CVEs. `fallback`: 🟡.
- **curl** — security headers of a live URL (if deployed): check for the presence of `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`. `fallback`: check the config in code + 🟡 "no live URL provided".

Each block ends with an **honesty rule:** if a scanner didn't run, the corresponding checks are marked 🟡, NOT 🟢. Installation — automatic via `npx` only; never ask the user to install anything by hand.

- [ ] **Step 2: Verification**

By eye: each of the 4 scanners has `detect/run/interpret/fallback` and the 🟡 rule. It states that installation is via `npx`, with no manual fuss for the user.

- [ ] **Step 3: Commit**

```bash
git add skills/production-audit/references/scanners.md
git commit -m "feat: hybrid scanner reference with graceful 🟡 fallback"
```

---

## Tasks 3–7: Domain references (deep content)

Shared template for each `references/0X-*.md` (required-elements):
1. **What we check and what it threatens** — in plain language, the frame of consequences.
2. **Detection steps** — exactly what to grep/look for; which scanner from `scanners.md` to apply.
3. **Fix patterns** — at least **one working worked example** for a popular stack (Next.js/Node, Supabase/Postgres, Python/FastAPI or Django — whichever is relevant to the domain).
4. **Known false-positives** — what NOT to flag.
5. **3-state mapping** — when 🔴, when 🟢, when 🟡.
6. All findings follow the schema from `report-format.md`.

Depth — on par with `new-vps-setup` (specifics, not "think about…").

### Task 3: `references/01-secrets-leaks.md`
**Covers:** items 7, 8, 11 + [+] `.env` in git.
- [ ] **Step 1:** Write. Detection: env variables leaking into the client bundle (e.g. `NEXT_PUBLIC_`/`VITE_` prefixes on secrets); API keys in client-side code; secrets in logs (`console.log` / a logger with a token); over-fetching (`select *`, returning the entire user object); internal errors exposed to the outside. **`.env`-in-git:** `git ls-files | grep -E '(^|/)\.env'` and whether `.env` is in `.gitignore`. Fix examples: move the key to the server/proxy; `.gitignore` + `git rm --cached .env` + rotation; neutralize errors ("User not found" instead of SQL). Worked example ≥1 (Next.js: `NEXT_PUBLIC_` key → server route).
- [ ] **Step 2:** Verification: all 6 required-elements + `.env`-in-git + ≥1 worked example.
- [ ] **Step 3:** `git commit -m "feat: secrets & leaks audit reference"`

### Task 4: `references/02-data-access.md`
**Covers:** item 2 + [+] service-key bypassing RLS + [+] public bucket.
- [ ] **Step 1:** Write. Detection: whether RLS is enabled / whether policies exist; IDOR (access by id without an owner check); **privileged access in the request path** (an admin/service key in a handler that bypasses authorization); **storage/uploads public by default**. Fix examples: enable RLS + an "owner = auth.uid()" policy (Supabase/Postgres); an owner check in the API; a private bucket + signed URLs. Worked example ≥1.
- [ ] **Step 2:** Verification: required-elements + the 2 traps + worked example.
- [ ] **Step 3:** `git commit -m "feat: data-access (RLS/IDOR/privileged-creds/buckets) reference"`

### Task 5: `references/03-auth-robustness.md`  (BEHAVIORAL)
**Covers:** item 3.
- [ ] **Step 1:** Write it as a **manual-check checklist** (not a code scan): wrong password ×5 (is there a lockout/throttling), reset for a non-existent email (any "user exists / doesn't exist" leak), opening the confirmation link twice, signup with an existing email, session/token handling. For each item: "do this in the browser → the expected safe behavior → if it's otherwise, that's a finding". State that most items = 🟡 "not checked until you actually test it". Explicitly: do NOT invent `confidence`.
- [ ] **Step 2:** Verification: "manual checklist" format, 5 scenarios, default 🟡.
- [ ] **Step 3:** `git commit -m "feat: behavioral auth-robustness manual checklist reference"`

### Task 6: `references/04-web-security.md`
**Covers:** items 4, 5, 6 + [+] deploy-config.
- [ ] **Step 1:** Write. Detection: security headers (via `curl`/config); SQL/NoSQL injection (string concatenation in queries vs parameterization), XSS (`dangerouslySetInnerHTML`, unescaped output), CSRF; **server-side validation** — find the client-side checks (zod/required) and confirm the server repeats them; **deploy-config**: `DEBUG`/`NODE_ENV=production`, debug routes/dashboards exposed to the outside. Boundary with auth: here, the static side of auth code (password hashing, JWT validation, session fixation). Fix examples per stack. Worked example ≥1.
- [ ] **Step 2:** Verification: required-elements + server-side validation + deploy-config + worked example.
- [ ] **Step 3:** `git commit -m "feat: web-security/OWASP audit reference"`

### Task 7: `references/05-abuse-cost.md`
**Covers:** items 9, 10 + [+] the "$200" angle.
- [ ] **Step 1:** Write. Detection (TOP ROI first): **find calls to paid/metered external APIs** (OpenAI, Anthropic, Supabase, SendGrid, Resend, Stripe, Twilio…) and confirm each one sits behind a rate limit + auth. Then: rate limiting on endpoints; CAPTCHA on public forms (Cloudflare Turnstile); CORS restricted to your own domain (look for `*`/`allowAll`). Fix examples: rate-limit middleware; Turnstile integration; an explicit CORS allowlist. Worked example ≥1.
- [ ] **Step 2:** Verification: "metered APIs" come as the first item; rate-limit/CAPTCHA/CORS; worked example.
- [ ] **Step 3:** `git commit -m "feat: abuse & cost-control audit reference"`

---

## Task 8: Legal/compliance reference + privacy policy template

**Files:**
- Create: `skills/production-audit/references/legal-compliance.md`

- [ ] **Step 1: Write.** Advisory checklist (not a code scan): whether a privacy policy exists; inventory of the data collected; consent; where the data is physically stored; the right to deletion; a cookie banner. Pull live specifics (current GDPR/CCPA for the data type) via WebSearch with graceful degradation. Include a **starter privacy policy template** with a REQUIRED disclaimer:
  > ⚠️ This is not legal advice and not finished compliance. A starter draft — show it to a lawyer before publishing.

  Explicitly forbid a "compliance done" verdict.
- [ ] **Step 2: Verification:** the 6 checklist items + the template + the "not legal advice" disclaimer + the ban on "compliance done".
- [ ] **Step 3:** `git commit -m "feat: compliance advisory + non-authoritative privacy template"`

---

## Task 9: Remediation playbook

**Files:**
- Create: `skills/production-audit/references/remediation-playbook.md`

- [ ] **Step 1: Write.** Required-elements:
  - **Fix order:** critical first (leaks/access/money), then high and below.
  - **Safety protocol (verbatim rule):** one edit → verify the result → next. Never in a batch.
  - **Breaking fixes** (CORS lockdown, enabling RLS on a live DB, tightening validation): first explain the risk in plain language, get an explicit "yes", and offer a rollback where possible.
  - **Accept-list:** how to record a knowingly accepted risk in `PROD-AUDIT.md` so a re-audit won't raise it again. Invariant: suppressions are project-scoped ONLY.
  - **Freshness at the fix phase:** when writing a fix, pull the current API (context7→WebSearch→references→🟡); don't guess.
- [ ] **Step 2: Verification:** order + safety rule + handling of breaking fixes + accept-list + freshness.
- [ ] **Step 3:** `git commit -m "feat: beginner-safe remediation playbook"`

---

## Tasks 10–14: Thin named agents

Shared template for each `agents/<domain>-auditor.md`:
```markdown
---
name: <domain>-auditor
description: <English triggers> | <Russian triggers>  — when the orchestrator should call this auditor
model: sonnet
tools: Read, Grep, Glob, Bash
---

You are <the domain persona> (e.g. "a hunter of leaked secrets").

You have been handed the project's STACK: <will be in the prompt from the orchestrator>.

Method:
1. Read your checklist: ${CLAUDE_PLUGIN_ROOT}/skills/production-audit/references/0X-<domain>.md
   (and ${CLAUDE_PLUGIN_ROOT}/skills/production-audit/references/scanners.md if needed).
2. Focus on the section for the given stack and dig deeper there.
3. Run the scanners per the rules in scanners.md; if they didn't run — mark 🟡, NOT 🟢.
4. Return findings STRICTLY per the schema (domain, severity, file_line, evidence, fix, confidence).
   severity is preliminary; the orchestrator sets the final one.
5. Honesty over completeness: unsure → confidence:low or 🟡.

Do NOT fix anything. Audit and findings only.
```

### Task 10: `agents/secrets-auditor.md` → ref `01`
- [ ] **Step 1:** Create from the template, domain `secrets`, persona "leak hunter", ref `01-secrets-leaks.md`. Description with English + Russian triggers (secrets, leaked keys, env, leaks, keys).
- [ ] **Step 2:** Verification: frontmatter is valid, references its ref via `${CLAUDE_PLUGIN_ROOT}`, requires the finding schema.
- [ ] **Step 3:** `git commit -m "feat: secrets-auditor agent"`

### Task 11: `agents/data-access-auditor.md` → ref `02`
- [ ] **Step 1:** Create, domain `data-access`, persona "data-access specialist". Triggers: RLS, IDOR, database access, data access.
- [ ] **Step 2:** Verification as above.
- [ ] **Step 3:** `git commit -m "feat: data-access-auditor agent"`

### Task 12: `agents/auth-auditor.md` → ref `03`  (behavioral)
- [ ] **Step 1:** Create, domain `auth`. **Difference:** it outputs a manual in-browser check checklist, most items 🟡; do NOT force it into the schema with a fake confidence (as in ref `03`). Triggers: auth, login, password reset, authentication.
- [ ] **Step 2:** Verification: the behavioral output and the default 🟡 are explicitly spelled out.
- [ ] **Step 3:** `git commit -m "feat: behavioral auth-auditor agent"`

### Task 13: `agents/websec-auditor.md` → ref `04`
- [ ] **Step 1:** Create, domain `websec`, persona "web-security/OWASP specialist". Triggers: OWASP, XSS, SQL injection, headers, server validation, headers, injections, validation.
- [ ] **Step 2:** Verification as above.
- [ ] **Step 3:** `git commit -m "feat: websec-auditor agent"`

### Task 14: `agents/abuse-cost-auditor.md` → ref `05`
- [ ] **Step 1:** Create, domain `abuse-cost`, persona "abuse-and-cost analyst". Triggers: rate limit, CAPTCHA, CORS, abuse, paid API cost, limits, bots, costs.
- [ ] **Step 2:** Verification as above.
- [ ] **Step 3:** `git commit -m "feat: abuse-cost-auditor agent"`

---

## Task 15: Orchestrator `SKILL.md`

**Files:**
- Create: `skills/production-audit/SKILL.md`

**Interfaces:**
- Consumes: the names of the 5 agents (T10..T14), `report-format.md`, `scanners.md`, `legal-compliance.md`, `remediation-playbook.md`.

- [ ] **Step 1: Write the frontmatter + body.**

Frontmatter:
```markdown
---
name: production-audit
description: >
  Pre-launch production & security audit for vibe-coded apps. Use before shipping/deploying to
  find leaked secrets, missing RLS, unprotected paid APIs, missing rate-limit/CAPTCHA/CORS, OWASP
  issues, exposed errors and compliance gaps. Pre-launch security and production-readiness audit:
  leaked secrets, RLS, unprotected paid APIs, rate limiting, CAPTCHA, CORS, OWASP, GDPR.
  Triggers: ship, go live, launch, production checklist, is it production-ready, check before launch.
---
```

Body — the orchestrator's step-by-step pipeline:
1. **Detect the stack** (package.json/requirements/manifests/configs), briefly confirm with the user in plain words.
2. **Dispatch the 5 agents IN PARALLEL** (`secrets-auditor`, `data-access-auditor`, `auth-auditor`, `websec-auditor`, `abuse-cost-auditor`), passing the stack and the repo path in the prompt.
3. **Collect the findings**, dedup by `file_line` + substance, **set the global severity** per the rules in `report-format.md`.
4. **Advisory compliance** — done yourself per `legal-compliance.md` (no agent), WebSearch if needed.
5. **Write `PROD-AUDIT.md`** from the template: verdict + "fix first" + the full list + the 🟡 block + 🟢 + accept-list.
6. **Show the verdict**, ask "fix them one by one?".
7. **Fix guidance** per `remediation-playbook.md`: one edit → check; breaking ones — with an explicit "yes"; API freshness at the fix phase.
8. **User corrections** → accept-list in `PROD-AUDIT.md` (project-scoped).
9. Everywhere — the language of consequences, simplicity on the outside.

- [ ] **Step 2: Verification (structural test).** Frontmatter with English + Russian triggers; the body contains all 9 steps; the names of the 5 agents match the files in `agents/`; links to the 4 references.

- [ ] **Step 3:** `git commit -m "feat: production-audit orchestrator skill"`

---

## Task 16: `/ship-check` command

**Files:**
- Create: `commands/ship-check.md`

- [ ] **Step 1: Write.**
```markdown
---
description: Pre-launch security and production-readiness audit (in one command)
argument-hint: '[path to the project, current by default]'
---

Run a full pre-launch production-readiness audit.

Use the `production-audit` skill (orchestrator): detect the stack, run the parallel
auditor agents, assemble `PROD-AUDIT.md` with a verdict and priorities, then walk the user
through the fixes — one edit at a time, in plain language, with approval.

Arguments: `$ARGUMENTS`
```
- [ ] **Step 2: Verification:** the command is thin, delegates to the `production-audit` skill, and doesn't duplicate logic.
- [ ] **Step 3:** `git commit -m "feat: /ship-check command entrypoint"`

---

## Task 17: Fixture repo + EXPECTED manifest (this is the "test")

**Files:**
- Create: `tests/fixtures/vulnerable-app/` (a minimal app with planted holes)
- Create: `tests/fixtures/EXPECTED.md` (the expectations manifest)

- [ ] **Step 1: Build the vulnerable fixture.** A minimal repo (e.g. Next.js + Supabase style) with DELIBERATELY planted holes across the 5 domains, 1–2 per domain:
  - secrets: `NEXT_PUBLIC_OPENAI_KEY` in client-side code; a committed `.env` with `service_role`; `console.log(token)`.
  - data-access: a table without RLS; an API route with a service key and no owner check; a public bucket.
  - auth: (behavioral — document it as expected-🟡, checked manually).
  - websec: SQL concatenation; `dangerouslySetInnerHTML` with user input; no server-side validation; `NODE_ENV` not set.
  - abuse-cost: a paid API call with no rate limit; CORS `*`; a form without CAPTCHA.
- [ ] **Step 2: The `EXPECTED.md` manifest.** A table: `domain | planted hole | file_line | expected state (🔴/🟡)`. For every "blinding" case (no scanner) — expect 🟡, NOT 🟢.
- [ ] **Step 3:** `git commit -m "test: deliberately-vulnerable fixture + EXPECTED manifest"`

---

## Task 18: E2E run against the fixture (tool verification)

**Files:**
- Create: `tests/RESULTS.md` (the run log)

- [ ] **Step 1: Run the orchestrator** against `tests/fixtures/vulnerable-app/` (as if the user invoked `/ship-check` on this repo).
- [ ] **Step 2: Compare against `EXPECTED.md`.** Assertions:
  - (a) EVERY planted hole is found (present in `PROD-AUDIT.md` with the correct domain/location);
  - (b) where the tool is "blinded" (a scanner is unavailable) — state 🟡, NOT 🟢;
  - (c) verdict = "🚫 not ready to ship yet".
- [ ] **Step 3: Write `RESULTS.md`** — what was found, what's 🟡, the discrepancies with EXPECTED. If there are misses (false-🟢) — that's a **failure**; go back and strengthen the corresponding reference/agent, then re-run.
- [ ] **Step 4:** `git commit -m "test: e2e audit run against fixture + results"`

---

## Task 19: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write** it for a human: what it is (a pre-launch audit for vibe coders), what it covers (the 11+2 items in plain language), plugin installation, usage (`/ship-check`), what it does NOT do (the boundary with `new-vps-setup`, not legal advice, not a pentest), how to read `PROD-AUDIT.md` and the 3 states.
- [ ] **Step 2: Verification:** installation, usage, boundaries, and an explanation of the 3 states are present.
- [ ] **Step 3:** `git commit -m "docs: README"`

---

## Self-Review (done while writing the plan)

**1. Spec coverage:**
- 11 original items → T3–T8 + the domains in §5 of the spec ✅
- 2 traps (service-key bypass, public bucket) → T4 ✅
- 5 goal-fit items ($200 angle, `.env`-git, deploy-config, report ergonomics, auth/websec boundary) → T7, T3, T6, T1(report), T6/T5 ✅
- 3 states + schema + global severity → T1 ✅
- Layered freshness + graceful degradation → T2, T9 (fix phase), T8 (WebSearch) ✅; context7/global learnings — NOT in v1 (Global Constraints) ✅
- v1 self-improvement = project-scoped accept-list → T1(template), T9 ✅
- Fixture testing → T17, T18 ✅
- Boundaries/`new-vps-setup` → T19, Global Constraints ✅

**2. Placeholder scan:** content tasks specify required-elements + a worked example (a deliberate convention for prompt files, stated at the top), not "TODO". Contracts (manifest, schema, frontmatter, templates) are given verbatim. OK.

**3. Type/name consistency:** the finding schema `{domain, severity, file_line, evidence, fix, confidence}` is identical in T1, the agents (T10–14), and the orchestrator (T15). The `*-auditor` agent names match across T10–14 and T15. The `0X-*.md` reference paths match across T3–7 and the agents. OK.

---

## Execution Handoff

First `git init` (the repo isn't under git yet — needed for the per-task commits). Then execute the tasks in dependency order. The recommended mode is subagent-driven (a fresh subagent per task) for the content files, BUT the shared contracts (T1) and the orchestrator (T15) are better kept consistent — review between tasks is mandatory.
