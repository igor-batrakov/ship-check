# Design: a pre-release audit plugin for vibe coders

**Date:** 2026-06-29
**Status:** in review
**Working name:** `production-skill` (plugin), command `/ship-check`, artifact `PROD-AUDIT.md`

> Historical design record (v0.1). The shipped plugin moved its internals to English and localizes
> output to the user's language in v0.2, and `/ship-check` is the explicit entry point. The README
> describes the current state.

---

## 1. Goal and problem

Vibe coders (Lovable, Bolt, v0, Cursor, Claude Code) ship apps straight to real users —
often without basic protection. The fallout from the original thread
[@PrajwalTomar_](https://x.com/PrajwalTomar_/status/2059612250047209957): overnight Supabase
bills of $200, bots flooding forms on day one, cease-and-desist letters (GDPR/CCPA), and
databases left exposed to the internet.

**What the plugin is for:** give a newcomer **one simple command** that finds these holes
before release, explains them in plain language, and helps fix them — one edit at a time, with
no programmer fuss.

**Core principle:** *complex inside, simple outside.* Inside — a multi-agent audit, scanners,
fresh docs. Outside — `/ship-check`, a readable report, and fixes applied on approval.

**Target user:** someone who just started out, not a sysadmin and not a professional developer.
They should never install tools by hand, run scanners, or wrestle with terms like "IDOR".

---

## 2. Principles (mandatory at every stage)

1. **One command.** `/ship-check` is the single entry point. There is nothing else for the
   user to run. (An auto-trigger via the description is a fallback path.)
2. **Speak in consequences, not jargon.** "A bot could run up a $200 bill on you overnight,"
   rather than "unbounded request rate on metered endpoint." Severity lives in money and
   consequences.
3. **The agent does the work, the user only approves.** Scanners run themselves; if a tool is
   missing, the agent either installs it via `npx` or honestly falls back to code analysis and
   flags it 🟡. A newcomer never installs tools manually.
4. **Three honest states, no false "all clear."** The worst failure for an auditor is to print
   ✅ and send the user off with an exposed key. That is worse than having no tool at all.
5. **Beginner-safe remediation.** A breaking fix happens only with the risk explained in plain
   language and an explicit "yes." One edit → verify → next.
6. **Honesty over completeness.** Better to say "couldn't verify this, check it by hand" than
   to pretend it was checked.

---

## 3. Boundaries (what this plugin does NOT do)

- **The server layer is NOT here.** OS hardening, the firewall (UFW), "the DB isn't exposed to
  the internet," "don't run as root," SSH keys, backups — that is the domain of the
  **`new-vps-setup`** skill. Our plugin works with **what's in the repository code** (the
  application). Where it fits, we point to `new-vps-setup`, but we do not duplicate it or
  confuse the newcomer with server topics.
- **Not legal advice.** The compliance domain provides a checklist and starter templates with
  an explicit "show this to a lawyer" banner, but it does not replace a lawyer.
- **Not a pentest and not a guarantee.** The plugin covers the basic pre-release minimum; it
  does not replace a professional security audit.

---

## 4. Architecture

```
/ship-check  (or a trigger phrase in Russian/English)
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│  SKILL ORCHESTRATOR  (skills/production-audit/SKILL.md)    │
│                                                            │
│  1. Detect the repository stack (what kind of project)     │
│  2. Dispatch 5 NAMED agents IN PARALLEL,                   │ ──► each reads its own
│     passing them the stack                                 │     references/<domain>.md
│  3. Collect findings under one schema                      │     + (phase-2) learnings.md
│  4. Dedupe + GLOBAL severity prioritization                │
│  5. Run advisory compliance (itself, no agent)             │
│  6. Write the PROD-AUDIT.md report (verdict + "fix first") │
│  7. Guide through fixes: 1 edit → verify → next            │
│  8. On user correction — record the lesson                 │
└────────────────────────────────────────────────────────────┘
```

**Why parallel agents are justified (not cargo-cult):** the domains are independent, each with
an isolated context — which matters for scanning a large repo, and it's faster and cheaper.

**Named agents, but thin (resolving the DRY tension).** Each domain is its own agent file in
`agents/` with its own persona, but **thin**: persona + method + the instruction "read your
deep checklist `${CLAUDE_PLUGIN_ROOT}/.../references/<domain>.md` and dig into the detected
stack, return findings per the schema." All the heavy detection logic and fix patterns live in
`references/` — **a single source of truth, with no duplication across agents.**

**Stack adaptivity.** The orchestrator detects the stack once and passes it to the agents. An
agent loads the section of its reference for that stack and digs deeper there. If a domain
grows large, we split the reference into per-stack sub-files; in v1 it's subsections within a
single file (YAGNI).

---

## 5. Audit domains

5 parallel agents + 1 advisory domain on the orchestrator. A mapping of the original's 11
items + 2 added traps + 3 goal-fit refinements.

### 5.1. `secrets-auditor` — secrets and leaks
Original items: 7, 8, 11.
- env values leaking to the frontend;
- API keys in the client bundle (if a key is in the browser, it's compromised);
- secrets in logs;
- an API returning more data than needed (over-fetching);
- internal errors surfaced to the outside ("SELECT * FROM users failed" → a neutral "User not
  found").
- **[+ goal-fit] `.env` in git:** whether `.env` is committed, and whether it's in
  `.gitignore`. A classic vibe-coder hole and a direct item in the user's CLAUDE.md — **we
  cover more than the original 11.**

### 5.2. `data-access-auditor` — data access / DB
Original item: 2 (RLS).
- whether RLS is enabled / whether authorization policies exist; whether IDOR is possible
  (access to other users' rows);
- **[+ trap] privileged credentials bypassing RLS:** request-handling code that uses
  admin/service-level DB access and skips the checks (Supabase `service_role` — phrased
  agnostically: any admin access in the request path that bypasses authorization). More
  dangerous and more common than "is RLS enabled."
- **[+ trap] object storage / uploads that are public by default.** A classic leak.

### 5.3. `auth-auditor` — authentication robustness (BEHAVIORAL)
Original item: 3.
- a wrong password 5 times in a row; password reset for a non-existent email; opening the
  confirmation link twice; signing up with an already-existing email; session/token handling.
- **What's distinctive:** this is behavior, mostly unconfirmable from the code. So the agent
  produces a **step-by-step manual-check checklist** in plain language ("do this in the
  browser"). Most items are 🟡 "not verified until you test it," with no fake confidence.
  It does NOT get forced into the common findings schema with a made-up `confidence`.

### 5.4. `websec-auditor` — web security / OWASP
Original items: 4, 5, 6.
- security headers and the baseline;
- injections (SQL/NoSQL), XSS, CSRF;
- **server-side** validation: find the client-side checks and confirm that the server/API
  repeats them (JS can be disabled and the API hit directly);
- static vulnerabilities in auth code (password hashing, JWT validation, session fixation) —
  the boundary with `auth-auditor`: that one is about behavior, this one about code. Overlaps
  are resolved by the dedupe.
- **[+ goal-fit] deploy config in code:** `DEBUG=False` / `NODE_ENV=production`, no debug
  routes/dashboards exposed to the outside (original item 4 + CLAUDE.md).

### 5.5. `abuse-cost-auditor` — abuse and cost
Original items: 9, 10.
- **[+ goal-fit, the main ROI] aimed squarely at the "$200 overnight" pain:** find calls to
  paid/metered external APIs (OpenAI, Supabase, SendGrid, Resend, Stripe, etc.) and confirm
  that **every one** sits behind a rate limit + auth. This is check #1 for the stated pain,
  rather than an abstract "limit your endpoints."
- rate limiting on every endpoint that hits a paid API;
- CAPTCHA on public forms (e.g. the free Cloudflare Turnstile);
- CORS restricted to your own domain.

### 5.6. Compliance (advisory, on the orchestrator — NO agent)
Original item: 1. There's nothing to scan in the code here — it's a checklist + templates.
- whether a privacy policy exists; an inventory of the data collected; consent; where the data
  physically lives; the right to deletion; a cookie banner.
- live specifics (the current GDPR/CCPA requirements for the data type) are pulled via
  WebSearch.
- **Useful artifact:** if there is no privacy policy, we generate a **starter template** for
  the project with an explicit *"this is not legal advice, show it to a lawyer"* banner. Never
  "compliance is done" — otherwise we'd repeat the exact mistake the whole original thread
  warns against.

---

## 6. Finding and report format

### 6.1. Three states (per check)
- 🔴 **PROBLEM FOUND**
- 🟢 **VERIFIED — CLEAN**
- 🟡 **COULDN'T VERIFY** — never collapses into 🟢. In the summary, loud and clear: "didn't
  confirm X, check it by hand." Example: a scanner is unavailable → 🟡, not 🟢.

### 6.2. Finding schema (unified, for dedupe and merge)
```
{ domain, severity, file:line, evidence, fix, confidence }
```
**Severity is set by the orchestrator GLOBALLY after the dedupe**, not by the agents (each
agent thinks its own domain is critical). `evidence` is the concrete location/fact, `fix` is
what to do.

### 6.3. The `PROD-AUDIT.md` report — ergonomics for a newcomer
So that 40 findings as a wall don't trigger panic and avoidance:
1. **Verdict at the top:** "🚫 not ready to ship yet" / "⚠️ shippable, but fix these" / "✅ the
   basics are covered."
2. **"Fix these N first"** — the top critical items, big and bold.
3. The full list, grouped by severity.
4. A 🟡 "check by hand" block — set apart and conspicuous.
5. **Accept-list** — the project's accepted risks (see §8), so a repeat audit doesn't flag the
   same things again.

`PROD-AUDIT.md` is a durable artifact: remediation runs off of it in later sessions, without
re-running the whole audit.

---

## 7. Layered knowledge strategy (so the plugin doesn't go stale)

We separate the "evergreen" from the "perishable." **Freshness is needed at the FIX phase and
for compliance, not in the parallel detection** — trap detection is evergreen + scanners, and
it doesn't need fresh docs (faster, cheaper, more reliable).

| Layer | Source | What we take | v1? |
|---|---|---|---|
| 0. Evergreen | `references/` in the plugin | methodology: what/why to check, detection, fix skeletons | ✅ v1 |
| 1. Stack live | **context7 MCP** | up-to-date framework docs for the detected stack — when writing a fix | phase-2 |
| 2. Threats/compliance live | **WebSearch** | current GDPR/CCPA wording, up-to-date recommendations | partially v1 (compliance) |
| 3. Compounding | `learnings.md` | lessons from the user | phase-2 |

**Graceful degradation (mandatory).** There is NO hard dependency on context7 — whoever
installs the plugin may not have it. The fallback chain when fresh knowledge is needed:
`context7 → WebSearch → evergreen references → flag 🟡`. Never guess.
**CVEs are the job of `npm audit` (a scanner), not context7.**

---

## 8. Self-improvement (phased)

Mapped onto the thread [@ataiiam](https://x.com/ataiiam/status/2069797329809395978): Model /
Harness / Context + "learn from the user."

- **Model** — not our lever; we deliberately leave it to the labs.
- **Harness** — the main lever and the essence of the plugin: a deterministic pipeline,
  scanners, verify gates, 3 states. This we control directly.
- **Context** — `references/` (evergreen) + `learnings.md` (compounds over time).
- **Learn from the user** — on a correction, we record the lesson.

**Phasing (important for simplicity and reliability):**
- **v1:** only the **per-project accept-list** in `PROD-AUDIT.md` — the user marks "the contact
  form has no CAPTCHA, accepted deliberately," and a repeat audit respects that. Capture is
  **implicit**, with no separate command. One command for the whole plugin.
- **Phase-2:** a global, cross-project `learnings.md`.

**Loop-safety rule (invariant):** suppressions (false positives) are **per-project only**
(the accept-list). A global `learnings.md` may only **add** coverage, never **suppress** a
class of findings. Someone else's "the key is fine" must not leak to everyone.

---

## 9. Workflow (UX)

```
1. User: /ship-check
2. Orchestrator: detects the stack, briefly confirms with the user
   ("I see Next.js + Supabase, right?") — in plain words.
3. Parallel audit: 5 agents scan their domains (evergreen + scanners).
4. Orchestrator: dedupe, global prioritization, advisory compliance.
5. Writes PROD-AUDIT.md: verdict + "fix first" + full list + 🟡 block.
6. Shows the verdict and asks: "fix them one by one?"
7. Fix guide: one edit → risk explained in plain words → approval → verify →
   next. At the fix phase — fresh docs (context7/WebSearch) with graceful degradation.
8. Behavioral auth items: it hands over a manual-check checklist for the browser.
9. User corrections → accept-list / (phase-2) learnings.md.
```

---

## 10. Testing (the tool's key check)

A security auditor that prints ✅ while blind is **worse than nothing**. So:

- **A fixture repository with intentionally planted vulnerabilities** across all 5 domains (a
  secret in the frontend, a committed `.env`, no RLS, a service key bypassing RLS, a public
  bucket, no server-side validation, an unprotected paid-API call, no CORS/CAPTCHA, etc.).
- **Asserts:** the audit (a) finds **every** planted hole; (b) where it's "blinded" (no
  scanner), it emits 🟡 "couldn't verify," and **not** 🟢 "clean."
- Invisible to the user → it doesn't break simplicity, but without it we can't claim the tool
  works.

---

## 11. File structure

```
production-skill/                     ← plugin root
├─ .claude-plugin/plugin.json         ← manifest (name, description, version, author)
├─ commands/
│  └─ ship-check.md                   ← /ship-check → launches the orchestrator
├─ agents/                            ← 5 thin named agents
│  ├─ secrets-auditor.md
│  ├─ data-access-auditor.md
│  ├─ auth-auditor.md
│  ├─ websec-auditor.md
│  └─ abuse-cost-auditor.md
├─ skills/production-audit/
│  ├─ SKILL.md                        ← orchestrator (the brain)
│  └─ references/
│     ├─ 01-secrets-leaks.md          ← deep content, detection + fixes per stack
│     ├─ 02-data-access.md
│     ├─ 03-auth-robustness.md
│     ├─ 04-web-security.md
│     ├─ 05-abuse-cost.md
│     ├─ legal-compliance.md          ← advisory checklist + privacy policy template
│     ├─ scanners.md                  ← hybrid: gitleaks/semgrep/npm audit/curl — how to
│     │                                 check presence, install via npx, or 🟡
│     ├─ report-format.md             ← PROD-AUDIT.md template + 3 states + finding schema
│     └─ remediation-playbook.md      ← fix order + safety (1 edit → verify)
├─ tests/
│  └─ fixtures/                       ← intentionally vulnerable repo + asserts (§10)
└─ README.md                          ← for humans: what it is, how to install, how to run
```

`learnings.md` — to be added in phase-2.

---

## 12. v1 scope vs deferred

| | v1 core (locked in) | Deferred (layers on top) |
|---|---|---|
| Detection | 11 items + 2 traps + 3 goal-fit refinements | LLM specifics (prompt injection, an LLM-spend cap, the model key) |
| Freshness | evergreen references + WebSearch for compliance | context7 for live fix docs; CVE sweeps |
| Memory | per-project accept-list | global learnings.md |
| Report | 3 states, verdict, "fix first" | — |
| Fixes | one at a time, beginner-safe, user approves | — |
| Tests | fixture repo with asserts | — |

---

## 13. Open questions / risks

1. **Token cost.** 5 parallel agents on a large repo is a noticeable expense. Mitigation:
   detection is evergreen without live docs; freshness only at the fix phase.
2. **The auth/websec boundary.** Overlap on auth vulnerabilities; we rely on the orchestrator's
   dedupe by `file:line`. Verify it on the fixture repo.
3. **Scanner availability for a newcomer.** The `npx` install may not work (no Node, offline).
   The behavior is defined: fall back to code analysis + 🟡, don't block.
4. **Marketplace / distribution.** Whether a public marketplace entry is needed — decide
   separately; it doesn't affect the v1 structure.

---

## 14. Next steps

After this spec is reviewed → move on to the `writing-plans` skill for a detailed
implementation plan (order: the references core and report-format first → orchestrator →
agents → command/manifest → fixture tests → README).
