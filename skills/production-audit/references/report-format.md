# Finding & report contract

This file is the **single source of truth** for the finding schema, the three states, and the
`PROD-AUDIT.md` report. Every agent and the orchestrator must follow it. If anything elsewhere
disagrees with this file, this file wins.

---

## 0. Output language (international)

The plugin's internals (this file, agents, references) are written in **English**. The
**user-facing output is localized at runtime**:

- **Agents return findings in English** (internal data: `evidence`, `fix`, etc.).
- **The orchestrator localizes everything the user sees** — the `PROD-AUDIT.md` report, risk
  explanations, the manual-test checklist, fix proposals — into **the language the user is
  writing in** (detect it from their messages; default to English if ambiguous).
- **Code identifiers stay verbatim** in every language: file paths, env var names
  (`NEXT_PUBLIC_`, `service_role`), API names, commands, the schema field names below, and the
  emoji state markers.

So: the brain is English, the report speaks the user's language.

---

## 1. The three states (per check)

Every check ends in exactly one of three states:

- 🔴 **ISSUE FOUND** — there is concrete evidence of a hole (`evidence` is present).
- 🟢 **CHECKED — CLEAN** — the check actually ran and found nothing wrong.
- 🟡 **COULDN'T VERIFY** — the check could not be completed (scanner unavailable, no live URL,
  behavior not provable from code, access closed).

### Honesty invariant (NON-NEGOTIABLE)

> 🟡 **never** collapses into 🟢.

The worst failure of an auditor is to print ✅ and let the user ship with an exposed key — that
is **worse** than having no tool. If you are not sure you actually checked something, it is 🟡,
not 🟢. Better an honest "couldn't verify X, check it manually" than a fake "all good".

---

## 2. Finding schema (verbatim, identical for every agent)

Every agent returns findings **strictly** in this shape:

```
- domain:     secrets | data-access | auth | websec | abuse-cost | compliance
- severity:   critical | high | medium | low      (DRAFT from the agent; FINAL is set by the orchestrator)
- file_line:  path:line   (or "—" if not code — e.g. a behavioral or compliance finding)
- evidence:   the concrete fact/snippet — why this is a problem (no evidence → no finding)
- fix:        what to do, in plain language
- confidence: high | medium | low
- state:      🔴 | 🟡        (🟢 does not become a finding — it goes in the separate "checked — clean" list)
```

Rules:
- **The agent's `severity` is a draft.** Each agent thinks its own domain is critical. The
  ORCHESTRATOR assigns the final severity globally (see §3).
- **No `evidence` → no finding.** A guess without evidence is 🟡, not 🔴.
- **`confidence: low` or `state: 🟡`** when a check is incomplete. Never fabricate certainty.

---

## 3. Global prioritization (the ORCHESTRATOR does this, after dedup)

First **dedup**: findings with the same `file_line` + substance collapse into one (merging
evidence). Then the orchestrator assigns the final `severity`:

- **critical** — immediate damage on launch:
  - a leaked secret/API key (in the frontend, in git, in logs);
  - an open DB / missing RLS / access to other users' data (IDOR, service-key bypassing authz);
  - an unprotected call to a **paid** external API (the "$200 overnight bill" risk);
  - a default-public bucket holding private data.
- **high** — a serious hole, but not an instant dump:
  - XSS / injection; no server-side validation; internal errors leaked to users;
  - no rate limiting on public endpoints; CORS `*`; debug mode in production.
- **medium** — a real risk under the right conditions:
  - weak/missing security headers; no CAPTCHA on a public form;
  - over-fetching without sensitive fields.
- **low** — hygiene and good practice.

If a finding is in state 🟡 it goes in the "couldn't verify" block, not on the severity scale.

---

## 4. `PROD-AUDIT.md` template (structure)

The orchestrator writes the report into the root of the audited project. Ergonomics for a
beginner: **the verdict and "fix these first" always go on top**, the wall of findings below,
the 🟡 block separate and visible.

The strings below are shown in English; **render the actual report in the user's language**,
keeping code identifiers and the emoji markers verbatim.

```markdown
# Production readiness audit

> Run: <date>. Stack: <detected stack>.
> This is not a pentest or a security guarantee — a baseline pre-launch minimum.
> The server layer (firewall, DB exposure, non-root) is separate — see the new-vps-setup skill.

## Verdict

**🚫 NOT READY TO SHIP** | **⚠️ SHIP, BUT FIX THESE FIRST** | **✅ BASELINE COVERED**

<one line, plain language: why this verdict>

## 🔥 Fix these first (top critical)

1. **<what>** — <what it risks, plain language, e.g. "anyone can read your whole database">.
   How to fix: <short>.
2. ...

## All findings by severity

### 🔴 Critical
- `[domain]` <evidence> → <fix>  (`file:line`)

### 🟠 High
### 🟡 Medium
### ⚪ Low

## 🟡 Couldn't verify — check manually

- **<what>** — why it couldn't be checked (e.g. "no gitleaks" / "needs a live URL" /
  "tested in the browser"). What to do by hand: <steps>.

## ✅ Checked — clean

- <short list of what was actually checked and is OK>

## Accepted risks (accept-list)

- <finding> — consciously accepted <date>. A re-run will not re-raise it.
```

---

## 5. Report language & tone

- **Speak in consequences.** Phrase a risk as what it costs the user: "a bot can run up a
  $200 bill overnight".
- Every critical finding answers "and what happens to me?" in plain words.
- Explain severity by its damage: "a stranger can see other users' data" lands where "P0 IDOR"
  passes a beginner by.
- All of the above is produced **in the user's language** (see §0).
