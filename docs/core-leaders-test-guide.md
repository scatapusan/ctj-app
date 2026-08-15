# Retreat Registration — Core Leaders Test Run

**Goal:** core leaders register themselves FIRST (these are real registrations —
there is no un-register path, so only ask leaders who are definitely coming) and
catch anything broken before the QR goes out to everyone.

## Before you send this

- [ ] Generate the link from **Admin → Events → QR**, pre-registration mode, and
      paste the real URL into the message below. Don't hand-type the domain —
      the QR modal builds it from the site you're actually on.
- [ ] Open that link yourself once. You should see the retreat event banner, not
      "Hmm, that link doesn't look right."
- [ ] Check the core flags are right *before* anyone registers. `attendance.is_core`
      is snapshotted at registration and does not update later — see
      "Why the flags matter first" below.
- [ ] Make sure every leader who will mark attendance on Aug 30 already has a
      core-role login: **Admin → Members → Invite**. New logins start with PIN
      **1234** — have them change it.

## Paste-ready message for the leaders

Adapt "here" to whatever channel you actually use, and swap the greeting/sign-off
if that isn't how you normally address the group.

> Hi mga ka-core! 🎉 The retreat sign-up is live. Please register yourselves
> first so we can test it before it goes out to everyone:
>
> 👉 «PASTE THE QR LINK FROM ADMIN → EVENTS»
>
> While registering, please check:
> 1. Use the SAME email you use when you check in at fellowship — it should
>    greet you by name ("Hi, <your name>!") and only ask the retreat questions
>    (birthday, category). If it makes you fill in a whole new form, your email
>    doesn't match your member record — tell me which one you used.
> 2. If you're 23 or older the form should preselect **YA / Singles**, which
>    requires a baby/childhood photo. Try the upload on mobile data, not just
>    WiFi. Photos must be under 5MB; if it fails you should see "Your photo
>    couldn't be uploaded."
> 3. Does everything look right on YOUR phone? Screenshot anything weird.
> 4. After submitting you should see **"You're pre-registered!"** — if you see
>    an error instead, screenshot it and send it here.
> 5. Try registering twice — the second time should say you're already
>    registered, not error out.
>
> Report anything weird here. Salamat! 🙏

## Why the flags matter first

Core leaders see a **"You're registered as Core"** line on the retreat form, so
this test run doubles as a check on the core flags: if a leader tells you they
*didn't* see it, their `is_youth_ya_core` flag is wrong.

Fix it before they register if you can. `attendance.is_core` is a snapshot taken
at insert time, so correcting a member's flag afterwards does **not** update a
registration that already exists — that needs a follow-up UPDATE against the
attendance row.

## What the leaders' registrations verify

| Leader action | What it proves |
|---|---|
| Known email → short form | Existing-member path, no duplicate errors |
| Leader picks YA / Singles (auto-selected for 23+) | Required upload works on real phones/networks |
| Registering twice | Friendly already-registered screen |
| Various phones | New UI on real devices, weak-signal upload behavior |
| Core leader sees the "Core" line | `is_youth_ya_core` is set correctly for them |

## For you (admin) during the test

- Watch registrations arrive: **Admin → Check-in → Youth & YA Retreat 2026**
  (they'll appear under "Pre-registered") or **Admin → Attendance** (badge shows
  "Pre-registered").
- Leaders under 18: check your roster rather than assuming there are none. If a
  leader is a minor the form will require a parent/guardian name and contact —
  that's expected behaviour, not a bug.
- The under-18 path is covered by automated API and database tests
  (`tests/api/retreat-register.test.ts`, `tests/db/retreat-preregistration.test.ts`)
  and by captured browser runs in `docs/redesign-barkada/`. Don't create fake
  minors in production.
- If a leader reports a bug, a screenshot plus the email they used is usually
  enough to reproduce.

## Day-of quick reference (Aug 30)

1. Leaders log in on their phones → **Admin → Check-in** → select the retreat.
2. As people arrive: search their name → **Mark attended** (one tap).
3. Someone not on the list? Use the **Walk-in registration** button inside the
   admin check-in screen and hand them the phone. That path records them
   directly as *attended*.

   ⚠️ The posted retreat QR does **not** do this. Someone who scans it at the
   desk is recorded as *pre-registered* only — you still have to tap **Mark
   attended** afterwards. Only the admin walk-in button marks attendance in one
   step.
4. Marking is one-way — there is no unmark button, so a mis-tap needs a database
   fix. Tap carefully.
