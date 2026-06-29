# ship-check

**English** | [Русский](README.ru.md) | [中文](README.zh.md) | [Español](README.es.md) | [Português](README.pt.md)

**A pre-launch security audit for vibe-coded apps.** One command — `/ship-check` — finds the holes
that cause $200 surprise bills, spam bots, and cease-and-desist letters, then walks you through the
fixes one at a time. It replies in your language.

> Built for people who just started. You talk to it in plain words; it does the checking, explains
> each risk in terms of what it costs you, and fixes things with your approval. No extra tools to
> install, no commands to memorize.

## Quick start

In the root of your project, run:

```
/ship-check
```

It detects your stack, runs the audit, writes a `PROD-AUDIT.md` report, and offers to fix the
issues with you — one change at a time, with your go-ahead.

## What a report looks like

`/ship-check` writes `PROD-AUDIT.md` with the verdict on top and the things that bite you first:

```
## Verdict: 🚫 NOT READY TO SHIP

Three issues can leak data or run up a bill the moment you launch.

## 🔥 Fix these first
🔴 Your OpenAI key ships in the browser bundle (app/page.tsx:5) — anyone opens
   DevTools and spends your credit.
🔴 Row Level Security is off on `orders` (supabase/migrations/0001_init.sql) — any
   visitor can read every customer's orders.
🔴 /api/chat calls a paid API with no login and no rate limit — a bot can run up a
   $200 bill overnight.

## Data access
🟢 Uploads bucket is private and served through signed URLs — checked, clean.
🟡 Couldn't confirm RLS in the live database — your migrations enable it; open the
   Supabase dashboard and verify.
```

Every check lands in one of three states:

- 🔴 **issue found** — a concrete hole, with the file and line.
- 🟢 **checked — clean** — the check ran and the code is fine.
- 🟡 **couldn't verify** — check it by hand (a tool is missing, a live URL is needed, or it's a
  behavioral check). 🟡 stays a 🟡; the audit will tell you what to look at instead of guessing.

That honest third state is the point: a tool that prints ✅ while it's blind is worse than no tool.

## An example session

```
> /ship-check

I see a Next.js + Supabase app. Running the pre-launch audit — about a minute.
…
Verdict: 🚫 not ready to ship. Three things will bite you on day one. Fix them together?

> yes

First: your OpenAI key is in the frontend bundle, so anyone can read it and spend your credit.
I'll move the call to a server route and read the key from a server-only variable. Apply this?

> go ahead

Done — the key lives on the server now, and the page still builds. Next: Row Level Security…
```

## What it checks

Five areas plus compliance — the original vibe-coder checklist, with a few common extra holes:

- **🔑 Secrets & leaks** — keys in the frontend, secrets in `.env`/git/logs, APIs that return too
  much, internal errors shown to users.
- **🗄️ Data access** — Row Level Security (RLS), access to other people's rows (IDOR), service keys
  that bypass your checks, default-public file storage.
- **🔐 Auth robustness** — wrong-password lockout, a reset for an email that doesn't exist, a
  duplicate signup (a browser checklist you click through).
- **🛡️ Web security (OWASP)** — headers, SQL injection, XSS, server-side validation, debug mode
  left on in production.
- **💸 Abuse & cost** — unprotected calls to paid APIs (the "$200 overnight" risk), rate limiting,
  CAPTCHA on forms, CORS.
- **⚖️ Compliance** — privacy policy, GDPR/CCPA, where your data lives, with a starter template.

## Requirements

Just Claude Code — the audit runs on built-in tools and needs no extra setup. Deeper scans are
optional and offered on the spot: when a tool like `gitleaks` (scans your git history for leaked
keys) or `semgrep` (wider injection/XSS coverage) would help, `/ship-check` offers to set it up for
you, with your approval. Skip it and those checks stay 🟡 "couldn't verify". An MCP such as context7,
when you have it, sharpens the fix suggestions; it is never required.

## Install

From Claude Code:

```
/plugin marketplace add igor-batrakov/ship-check
/plugin install ship-check@ship-check-tools
```

Then run `/ship-check` in any project. (Hosting your own fork? Point the first command at your repo.)

## Boundaries

- **The server is out of scope.** Firewall, a database exposed to the internet, running as root,
  SSH — that's the server layer; the `new-vps-setup` skill covers it.
- **It's a starting point on compliance, with a lawyer for the rest.** The compliance pass gives a
  checklist and a draft privacy policy marked "have a lawyer review it."
- **It's a baseline, with a pentest for depth.** This catches the common pre-launch holes. A serious
  app still wants a real security review.

## For plugin developers

- `skills/production-audit/SKILL.md` — the orchestrator (the brain).
- `agents/*.md` — five thin auditor agents; the detection logic lives in `references/`.
- `skills/production-audit/references/` — the deep per-domain checklists (the single source of truth).
- `tests/fixtures/` and `tests/synthetic/` — deliberately vulnerable and mostly-secure apps;
  `tests/RESULTS.md` and `tests/SYNTHETIC.md` record how the audit performs on them (the quality gate).
The plugin's internals are written in English; the report and the conversation come out in the
user's language at runtime.

## Contributing

Issues and pull requests are welcome — especially a missed check, a false positive, or a new
fix pattern for a stack the references don't cover yet. Open an issue with the code that tripped it.

## Credits

The pre-launch checklist that sparked this is from [@PrajwalTomar_](https://x.com/PrajwalTomar_/status/2059612250047209957).

## License

MIT — see [LICENSE](LICENSE).
