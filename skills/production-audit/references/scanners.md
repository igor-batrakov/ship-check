# Scanners (hybrid tooling)

The audit is **hybrid**: the baseline is the agent's own code analysis (always works), plus
real scanners when they help. The user never types install commands themselves. A scanner runs
one of three ways: it is already present; the agent pulls it via `npx`; or — when a missing
scanner would materially deepen the audit — the orchestrator **offers a deeper pass** and, on a
yes, installs it for the user (see "Offering a deeper pass" below). Whatever stays unrun is marked
🟡, with that offer attached.

## Golden honesty rule

> If a scanner did not run (tool missing, no network, error), the checks it covers are marked
> 🟡 **COULDN'T VERIFY**, not 🟢. Never report "clean" where the check did not actually run.
> See the invariant in `report-format.md`.

Before running anything in the shell, give the user a short plain-language heads-up ("I'll run a
quick secret scan now"), without technical detail.

---

## 1. gitleaks — secrets in code and git history

- **detect:** `command -v gitleaks >/dev/null 2>&1 || npx --yes gitleaks version`
- **run:** `gitleaks detect --no-banner --redact` (or `npx --yes gitleaks detect --no-banner --redact`)
- **interpret:** any hit → 🔴 critical (leaked secret). Pay special attention to secrets in
  **history** (even if the file was deleted): they stay in git and require key rotation.
- **fallback (if it didn't run):** grep heuristics over the repo —
  `sk-[A-Za-z0-9]`, `AKIA[0-9A-Z]{16}`, `service_role`, `-----BEGIN .* PRIVATE KEY-----`,
  `xox[baprs]-`, `ghp_[0-9A-Za-z]`. Whatever turns up is 🔴; and mark 🟡 "full secret scan not
  performed, run gitleaks manually".

> Note: gitleaks is a Go binary and is **not** reliably installable via `npx` (which runs npm
> packages). If `npx --yes gitleaks` fails with "could not determine executable to run", treat
> the scanner as unavailable, use the grep fallback, and mark 🟡.

## 2. semgrep — OWASP, injections, XSS

- **detect:** `command -v semgrep >/dev/null 2>&1 || npx --yes semgrep --version`
- **run:** `semgrep --config auto --error --quiet` (or via `npx --yes semgrep ...`)
- **interpret:** map rules to the `websec` domain; high-severity injection/XSS rules → 🔴/🟠.
- **fallback:** the manual patterns from `04-web-security.md` (string concatenation in SQL,
  `dangerouslySetInnerHTML`, unescaped output) + mark 🟡 on what's not covered.

> Note: semgrep is a Python tool and is usually not installable via `npx` either. If it can't
> run, use the manual patterns and mark 🟡.

## 3. npm audit / equivalents — vulnerable dependencies (CVEs)

- **detect by ecosystem:** Node → `npm audit --json` (or `pnpm audit` / `yarn audit`);
  Python → `npx --yes pip-audit` or `osv-scanner`; universal → `npx --yes osv-scanner -r .`
- **run:** the matching dependency audit.
- **interpret:** critical/high CVEs in direct dependencies → 🟠 high (domain websec/secrets by
  meaning). This is the dependency scanner's job, **not** context7's.
- **fallback:** 🟡 "dependency audit not performed, run `npm audit` manually". If there's no
  lockfile / `node_modules`, there's nothing to audit yet → 🟡.

## 4. curl — security headers of a live URL

Only if the project has a **deployed URL** (ask the user in plain language: "do you have a live
link to the site? I'll check the headers").

- **run:** `curl -sI https://<url>` and check for the presence of:
  `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options` (or CSP `frame-ancestors`), `Referrer-Policy`.
- **interpret:** missing CSP/HSTS → 🟠/🟡 medium-high; map to `websec`.
- **fallback (no URL):** check the header configuration in code (middleware, `next.config.js`,
  server config) + mark 🟡 "no live URL given, only the in-code settings were checked".

---

## Offering a deeper pass (the ORCHESTRATOR does this)

The auditor agents run in parallel and never install anything — they try `npx`, fall back, and
tag each unrun check with the tool that would deepen it. After the agents return, the
**orchestrator** turns those tags into one offer.

**Offer only when the tool materially changes the result.** The two worth offering:

| Tool | What it adds over the baseline | Install ladder (pick the first that exists) |
|---|---|---|
| **gitleaks** | scans the **git history** for leaked keys — invisible to grep on the working tree | `brew install gitleaks` → `go install github.com/gitleaks/gitleaks/v8@latest` → download the release binary |
| **semgrep** | broader injection/XSS coverage than the manual patterns | `pipx install semgrep` → `pip install semgrep` → `brew install semgrep` |

(`npm audit` / `osv-scanner` are attempted via `npx` already; if that fails, fold them into the
same offer. `context7` is an MCP, set up at the fix phase — see `remediation-playbook.md`, not here.)

**The mechanic (beginner-safe):**

1. Present **one consolidated offer** in plain language, framed by what it catches — for example:
   > 🔎 I can check deeper. Let me set up **gitleaks** (scans your git history for leaked keys —
   > I can only see the current files without it) and **semgrep** (wider injection/XSS coverage)?
   Do not nag per finding; one offer covers them all.
2. **On a "yes":** detect the safest available installer (`command -v brew` / `pipx` / `pip` / `go`),
   tell the user the one line you are about to run, install, then **re-run that scanner** and lift
   the affected 🟡 to 🟢 or 🔴 from the real result.
3. **On a "no", or if the install fails:** keep the check at 🟡 and leave the manual one-liner in
   the report. A failed install never leaves a half-state — fall straight back to 🟡.
4. **Never** run a `sudo`/system install without naming it and getting a yes. Never install silently.

The honesty invariant holds throughout: 🟢 only after the scanner actually ran.

---

## Summary rule for agents

1. Try detect → run the relevant scanner.
2. It worked → use the result, map into findings per the schema.
3. It didn't → fallback heuristics + **always** 🟡 on the part the scanner was meant to cover,
   and tag that 🟡 with the tool that would deepen it (so the orchestrator can offer it).
4. Never mark 🟢 a check that a scanner was supposed to do but didn't.
5. Do not install anything yourself — the orchestrator owns the deeper-pass offer.
