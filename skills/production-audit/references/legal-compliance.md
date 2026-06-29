# Legal and compliance (the `compliance` domain)

This domain covers the rule "protect your app and **yourself** too." Technically
everything might be clean — keys hidden, RLS enabled — but if you collect people's data and
never set it up legally, what shows up next is a fine and a "cease and
desist" letter.

---

## 🔒 The cardinal rule of this domain (NEVER BREAK IT)

> **The `compliance` domain NEVER returns a verdict of "compliance done / fully legal" (🟢).**
> Anything produced here (a policy template, etc.) is **non-authoritative**. It's a starting
> draft that you **must** show to a real lawyer before publishing.

Why so strict: the entire point of this tool is to remove **false confidence**. If we print
"compliance ready ✅", we repeat exactly the mistake we're fighting — we send a beginner off
feeling protected when they aren't. Whether the text and processes are legally sufficient
**cannot be judged by an automated agent** — that's a lawyer's job, for a specific
jurisdiction.

This leads directly to the following for states (see `report-format.md`):

- The agent **can** mechanically record a fact: "a policy file exists and is linked," "Google
  Analytics is visible in the code," "the Supabase region is eu-central-1." Those are facts.
- The agent **cannot** turn a fact into the conclusion "therefore everything is legally fine."
  So even when a policy is in place, the check's state stays **🟡 "present, but verify with a
  lawyer"**, not 🟢. This is an honest special case of the invariant "not sure I checked → 🟡."
- 🟢 "compliance clean" in this domain **does not exist**. Only 🔴 and 🟡.

---

## 1. Why a beginner needs this (in plain language)

The moment your app collects **any data about people at all** — an email at signup, a name in
the profile, an IP in the logs, behavior via analytics, cookies — you automatically fall under
personal-data laws. The two big ones that catch nearly everyone:

- **GDPR** — the European Union. If even one person from the EU visits you (and a site on the
  internet means they do), the rules apply to you no matter where the server is. Fines go up to
  tens of millions of euros (for small projects, in practice it's "stop, or we'll fine you").
- **CCPA / CPRA** — California, USA. A similar story for California residents.

What actually threatens a beginner: a **user
complaint**, a **regulator's "cease processing" letter**, getting cut off by your payment
provider (Stripe requires a policy), or having your app pulled from the store — long before any
million-dollar fine. It's cheap to
fix if you do it ahead of time, and expensive/painful if you ignore it until a complaint lands.

The baseline minimum that covers 90% of a beginner's problems: **you have a privacy policy**,
**you honestly list what data you collect**, **you ask for consent where required**, and **you
give people a way to contact you and delete their data**.

---

## 2. Advisory checklist

This isn't a code scan — there's nothing to scan here. The orchestrator works through the items
itself: some are checked against the repository (is there a policy file/page, which trackers are
wired in, the hosting region), and some by asking the user a question in plain language. For each
item: **how to check** and **what to do / which state to assign**.

### 2.1. Privacy Policy: present and reachable from the pages
- **How to check:** look for a policy page/file in the project — a `/privacy` or
  `privacy-policy` route, a `privacy.{md,html,tsx,vue}` file, a "Privacy Policy" link in the
  footer/at signup. A rough search for the word `privacy` / "confidential".
- **What to do:** no policy at all but data is collected → 🔴 (see §5). A policy exists but isn't
  linked (it sits as a file with no link to it) → 🟡 "add a link in the footer and on the signup
  screen". Present and linked → still 🟡 "mechanically in place, show it to a lawyer" (not 🟢).

### 2.2. Inventory: which personal data is collected
- **How to check:** go through the project and build a list. Look at forms (email, name, phone,
  address fields), DB models/tables, logs (IP and user-agent are often written), payments
  (Stripe, YooKassa), analytics and cookies. A typical set: **email, name, IP address, payment
  data, behavioral analytics, cookies**.
- **What to do:** build an explicit "what we collect" list. It's needed both for the policy and
  to figure out which requirements even apply. If **sensitive** categories are collected (health,
  biometrics, children, geolocation) — add a separate 🟡 flag "special regime, mandatory lawyer
  review". The item's state is 🟡 (an inventory ≠ a legal assessment).

### 2.3. Where the data physically lives (region)
- **How to check:** find the hosting/DB region. Supabase — in `supabase/config.toml` or the
  project settings (`project-ref`, region). Vercel/Render/Fly — the deploy region. Also look at
  where analytics goes and where the payment provider runs.
- **What to do:** the region matters for GDPR (transferring data outside the EU is a separate
  topic). Don't draw the conclusion yourself — record the fact "data is stored in region X" and
  assign 🟡 "verify with a lawyer whether the storage region is acceptable and whether a
  cross-border transfer mechanism is needed".

### 2.4. Consent before collection
- **How to check:** whether consent is collected **before** the data/trackers start working.
  Especially for cookies, trackers, and marketing emails. Warning signs: analytics/pixel load
  immediately on visit; the consent checkbox is pre-ticked; emails go out without an explicit
  opt-in.
- **What to do:** trackers start before consent → 🟡 (for the EU this is a violation, but a
  lawyer/WebSearch confirms the exact bar — see §3). A pre-ticked checkbox → 🟡 "consent must be
  an active action". No consent mechanism where one is needed → 🟡.

### 2.5. Cookie banner when trackers/analytics are present
- **How to check:** is there analytics or trackers in the code — `gtag`, `google-analytics`,
  `googletagmanager`, `fbq` / Meta Pixel, Yandex.Metrica, Hotjar, and so on. If there is, look
  for a cookie banner/CMP (consent management).
- **What to do:** trackers present, no banner → 🟡 "a cookie banner with an opt-out option is
  needed". A banner exists → 🟡 "present, but verify with a lawyer that it's correct (rejecting
  actually disables the trackers) and that the wording is right". No trackers at all — note that
  as a fact, but do **not** assign 🟢 for the domain (that doesn't lift the other requirements).

### 2.6. Right to delete and export data
- **How to check:** is there a way to delete an account/data (a "delete account" button, an
  endpoint, or at least a contact to send the request to) and to export your own data (the right
  to access/portability). Search for `delete account`, `/gdpr`, `export data`, or any mention of
  deletion in the UI or the policy.
- **What to do:** no mechanism and not even a contact for requests → 🟡 "you must add a way to
  delete/export, or at least an email for such requests". A contact exists but no automation —
  that's an acceptable minimum for a small project, still 🟡 "confirm with a lawyer".

### 2.7. A contact for data requests
- **How to check:** does the policy/site list a concrete channel where a person can write about
  their data — an email or a form. An anonymous site without a single contact is a classic gap
  for vibe coders.
- **What to do:** no contact → 🟡 "add an email/form for personal-data requests".

### 2.8. Third-party processors mentioned in the policy
- **How to check:** match the list of actual third-party services (Supabase — storage,
  Stripe/YooKassa — payments, Google Analytics/Meta — analytics, email services, hosting) against
  what the policy lists. Everyone who receives user data must be mentioned.
- **What to do:** a service is used but not mentioned in the policy → 🟡 "add the processor to
  the policy". This is a common mismatch: the code knows about Stripe, but the policy text
  doesn't.

---

## 3. Live specifics via WebSearch (not from memory)

The precise **current** GDPR/CCPA requirements for a specific data type and jurisdiction are
**pulled in via WebSearch** by the agent — laws and thresholds change,
and the model's memory goes stale.

When to call WebSearch: to pin down a threshold/rule for the project's specifics — e.g. "GDPR
consent requirements cookies 2026", "CCPA do not sell opt-out requirements", "GDPR data transfer
EU to US 2026", "is a DPA with Supabase required under GDPR". Before the query — a short
plain-language heads-up to the user ("I'll check the current cookie requirements in the EU").

**Graceful degradation (mandatory):**

- WebSearch found nothing / no network / contradictory results → **don't guess from memory**.
  Assign 🟡 "couldn't confirm the current requirement — check with a lawyer" and describe what
  exactly is left unverified.
- WebSearch found something → use it as a guide for wording the finding, but still hold the
  domain's frame: even a confirmed requirement doesn't turn the item into 🟢. At most, a more
  precise 🟡 recommendation "per current data you need X, confirm it finally with a lawyer".

WebSearch refines the **wording and priority** of a finding, but **does not issue a legal
verdict** in a lawyer's place.

---

## 4. Starter Privacy Policy template

If a project has no policy at all, the orchestrator generates a draft like the one below for the
project, filling in real data from the inventory (§2.2) and the list of services (§2.8). The
banner at the top is **mandatory and must not be removed**.

```markdown
> ⚠️ This is NOT legal advice and NOT finished compliance. It's a starting draft —
> have a lawyer review it before publishing.

# Privacy Policy

**Service:** [PROJECT NAME]
**Contact for data questions:** [EMAIL OR LINK TO A FORM]
**Last updated:** [DATE]

## What data we collect
We collect and process the following personal data:
- [e.g.: email — for registration and login]
- [e.g.: name — for display in the profile]
- [e.g.: IP address and technical data — for security and logs]
- [e.g.: payment data — processed via [Stripe/YooKassa], we don't store it]
- [e.g.: analytics data and cookies — see the section below]
[LIST EVERYTHING YOU ACTUALLY COLLECT — see the inventory]

## Why we collect it
[Briefly and honestly: for each category — why. No "just in case".]

## Where the data is stored
The data is stored with [HOSTING/Supabase] in the [REGION] region.

## Third-party services (processors)
We share some data with the following services:
- [Supabase — data storage]
- [Stripe / YooKassa — payment processing]
- [Google Analytics / Meta Pixel — analytics]
- [email service — sending emails]
[LIST EVERYONE who actually receives user data]

## Cookies and trackers
[If you use analytics/trackers — describe which ones and how to opt out.
If you don't — say that you don't.]

## Your rights
You can:
- request what data we hold about you (access);
- get a copy of your data (export);
- demand deletion of your data (the right to be forgotten);
- withdraw consent to processing.
To exercise your rights — write to [EMAIL/FORM]. We'll respond within a reasonable time.

## Policy changes
We may update this policy. The current version is always available on this page; the update date
is shown at the top.
```

After generating the draft — always tell the user in plain language: "this is a **draft**, not a
finished document; before publishing, show it to a lawyer, especially if you collect sensitive
data or have users from the EU."

---

## 5. Mapping to the three states

Compliance findings live **mostly in 🟡**. The breakdown:

- **🔴 ISSUE FOUND** — only for the clear and indisputable: **personal data is collected and
  there is no privacy policy at all**. Here there's concrete proof (forms/the DB collect email,
  but there's no policy file/page in the project) — that's a full-fledged finding.
- **🟡 COULDN'T VERIFY / CHECK-AND-IMPROVE** — almost everything else: a policy exists but needs
  a lawyer's review; consent/cookie banner is in question; the storage region is recorded but a
  lawyer must assess it; WebSearch didn't confirm a requirement; a contact/deletion mechanism
  should be added. This is the domain's workhorse.
- **🟢 CHECKED — CLEAN** — **never used in this domain.** An automated agent doesn't declare
  "everything is legal." The mechanical fact "a policy is in place" doesn't equal legal
  sufficiency → it stays 🟡.

`severity` (a draft for the orchestrator): a missing policy while data is being collected is
**high** (a direct outward-facing legal violation, even if nothing leaks instantly). The other
compliance items are usually **medium/low**. The orchestrator sets the final severity.

---

## How to format the output for the report

Findings are returned strictly per the schema in `report-format.md`:

```
- domain:     compliance
- severity:   high | medium | low   (a draft; the orchestrator sets the final value)
- file_line:  usually "—"  (this is a behavioral/legal finding, not a line of code;
              give a path only if one really exists — e.g. a policy file with no link)
- evidence:   a concrete fact — e.g. "the forms collect email and name, there is no privacy
              policy page/file in the project"
- fix:        in plain language — e.g. "add a privacy policy (a draft exists), link it in the
              footer and on the signup screen, show it to a lawyer"
- confidence: high — for mechanical facts (no policy);
              low/medium — where a legal assessment is needed
- state:      🔴 (data exists, no policy at all) | 🟡 (everything else). 🟢 — never.
```

All 🟡 items go into the report's **"🟡 Couldn't verify — check by hand"** block with an explicit
note "a lawyer is needed". No compliance check **goes into** the "✅ Checked — clean" block: by
definition this domain never returns "clean".
