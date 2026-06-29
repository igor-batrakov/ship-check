---
description: Pre-launch security & production-readiness audit (one command)
argument-hint: '[path to the project, defaults to current directory]'
disable-model-invocation: true
---

Run a full pre-launch production-readiness audit of a vibe-coded app.

Use the `production-audit` skill (the orchestrator) and follow its pipeline:
1. Detect the project's stack and confirm it briefly with the user in plain words.
2. Dispatch the five auditor agents in parallel (secrets / data-access / auth / websec / abuse-cost).
3. Collect findings, dedup, assign global severity, run the advisory compliance pass.
4. Write `PROD-AUDIT.md`: verdict + "🔥 fix these first" + full list + 🟡 "check manually".
5. Show the verdict and guide the user through the fixes — **one change at a time, plain
   language, with approval**; breaking fixes only with an explicit "yes".

Report in the user's language (mirror the language they write in; keep code identifiers verbatim).
Speak in consequences, in plain words. Never present an unverified check as "all good".
This is an application-layer audit (the repo's code); the server layer is separate (the
`new-vps-setup` skill); it is not a pentest or legal advice.

Target project (defaults to the current directory): `$ARGUMENTS`
