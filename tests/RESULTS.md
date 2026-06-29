# RESULTS — e2e audit run against the fixture

**Date:** 2026-06-29
**Method:** 5 auditor agents run independently, each with its own `references/<domain>.md`,
**with no access to `EXPECTED.md`**. The run was done **twice**, on two fixture variants:

1. **labeled** — `vulnerable-app/`: each hole has a hint comment `// PLANTED VULN (domain): …`.
2. **stripped** — `vulnerable-app-clean/`: the same holes, but **all hints removed** (domain
   tags, giveaway comments, and the "intentionally vulnerable" README).

Two runs are needed to remove a confound: on the labeled variant, high coverage could come from
**reading the answers in the comments** rather than from the references' detection steps. The
labeled-vs-stripped comparison shows what actually drives detection.

## Test verdict: ✅ PASSED (on both variants)

| | labeled | stripped |
|---|---|---|
| Planted holes found | **17 / 17** | **17 / 17** |
| False 🟢 (false-clears) | 0 | 0 |
| Verdict on the fixture | 🚫 not ready to ship | 🚫 not ready to ship |

**Key conclusion:** coverage on stripped = coverage on labeled. So detection is driven by the
**references and their detection steps**, not by the hint comments. Confound removed.

## Planted-hole check (identical on both variants)

| # | Domain | Hole | Expected | Found |
|---|---|---|---|---|
| 1 | secrets | secret behind `NEXT_PUBLIC_` | 🔴 | ✅ 🔴 |
| 2 | secrets | paid key in the browser | 🔴 | ✅ 🔴 |
| 3 | secrets | `.env` in git, not in `.gitignore` | 🔴 | ✅ 🔴 (verified via `git check-ignore`/`git show HEAD`) |
| 4 | secrets | real secrets in `.env` | 🔴 | ✅ 🔴 |
| 5 | secrets | token in `console.log` | 🟠 | ✅ 🔴 |
| 6 | data-access | tables with no RLS (`users`+`orders`) | 🔴 | ✅ 🔴 |
| 7 | data-access | service_role bypassing RLS | 🔴 | ✅ 🔴 |
| 8 | data-access | IDOR by `id` | 🔴 | ✅ 🔴 |
| 9 | data-access | public bucket | 🔴 | ✅ 🔴 |
| 10 | auth | user enumeration | 🔴 | ✅ 🔴 medium |
| 11 | websec | SQL injection | 🔴 | ✅ 🔴 |
| 12 | websec | XSS `dangerouslySetInnerHTML` | 🔴/🟠 | ✅ 🔴 |
| 13 | websec | no server-side validation | 🟠 | ✅ 🔴 |
| 14 | websec | debug endpoint returns env | 🟠 | ✅ 🔴 |
| 15 | abuse-cost | public OpenAI with no gates | 🔴 | ✅ 🔴 |
| 16 | abuse-cost | CORS `*` | 🟠 | ✅ 🔴 |
| 17 | abuse-cost | form with no CAPTCHA | 🟠 | ✅ 🔴 |

## Honesty invariant (🟡 ≠ 🟢) — holds on both variants

Hint comments don't say "gitleaks will fail", so the 🟡 behavior is **strong evidence** (it's
identical on labeled and stripped):

| Blinded by | State | Marked by |
|---|---|---|
| gitleaks didn't run (Go binary, not installable via npx) | 🟡 "full secret scan not performed" | secrets |
| semgrep unavailable | 🟡 on what's not covered | websec |
| No live URL → security headers | 🟡 **always** | websec |
| Behavioral auth scenarios | 🟡 manual-test checklist | auth |
| Dependency CVE audit (no lockfile) | 🟡 | websec |
| Contents of the public bucket | 🟡 | data-access |

## Behavior quality (beyond coverage)

- **Self-correction:** data-access demoted an unprovable anon-key claim instead of inflating it.
- **Severity restraint:** auth did not inflate user enumeration to critical (medium, per the
  reference) — on both variants.
- **Boundary discipline:** each agent refused to claim other domains, passing them as context
  (dedup is the orchestrator's job).
- **Precision over hallucination:** abuse-cost filtered out a false grep match ("ses" inside
  `useState`); websec nuanced the XSS as self-XSS-now / stored-XSS-when-loaded-from-DB.
- **Consequence-first language:** evidence written for a beginner ("a bot runs up a bill
  overnight", "anyone can read other users' orders via DevTools").

## Independent confirmation

A third-party background security review (the `security-guidance` plugin) independently found the
same holes in the **stripped** copy — external confirmation that they're detectable without hints.

## What is actually proven (precise wording)

Proven: **the references, when read by an auditor agent, produce correct findings on the fixture
even without hint comments, and honestly mark 🟡 what they couldn't verify.** That's stronger than
"17/17 on a labeled fixture", and removes the confound.

## Known limitations (do NOT round up)

1. The e2e was run as an **orchestrator simulation**: agents were launched as plain subagents with
   their references referenced by absolute path (the plugin isn't installed in the Claude Code
   agent registry yet). NOT auto-tested: `subagent_type` name resolution for the plugin agents,
   `${CLAUDE_PLUGIN_ROOT}` substitution, and the orchestrator writing `PROD-AUDIT.md` / the
   remediation phase.
2. The run was performed before the v0.2 internationalization pass. The translation to English
   **preserved the detection steps verbatim** (grep patterns, code, regex were kept unchanged), so
   the result carries over. A re-run on the English references is the clean re-confirmation.

**Manual acceptance step:** install the plugin and actually run `/ship-check` on one of the
fixtures — confirm the orchestrator dispatches the named agents, writes `PROD-AUDIT.md` (in the
user's language), and guides the fixes. Until then, the accurate phrasing is "the references'
detection logic is validated", not "the whole plugin is validated".
