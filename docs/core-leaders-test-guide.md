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
- [ ] Core is now **self-selected** on the form (Youth / YA / Core). The
      member's `is_youth_ya_core` flag only pre-selects Core for recognised
      leaders — registrants can change it, and what they pick is what's stored.
      Wrong picks are fixed in **Admin → Attendance** (Category dropdown per
      row), so the stale roster no longer blocks anyone — see "How Core works
      now" below.
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
> 2. Pick **Core** as your category (it may already be pre-selected for you).
>    Please also upload a baby/childhood photo — it's optional for Core, but
>    you're in the game too, and it tests the upload. Try it on mobile data,
>    not just WiFi. Photos must be under 5MB; if it fails you should see "Your
>    photo couldn't be uploaded." (You can't change your own registration
>    afterwards — tell me what you picked and I'll correct it if needed.)
> 3. Does everything look right on YOUR phone? Screenshot anything weird.
> 4. After submitting you should see **"You're pre-registered!"** — if you see
>    an error instead, screenshot it and send it here.
> 5. Try registering twice — the second time should say you're already
>    registered, not error out.
>
> Report anything weird here. Salamat! 🙏

## How Core works now

Core is one of the three category options on the form (Youth / YA / Core), and
the registrant's own pick is what gets stored on their registration. A leader
whose `is_youth_ya_core` flag is set sees Core **pre-selected** with a "We've
pre-selected Core for you" line — that's just a prefill, not a lock.

This is a registration label, not an account role: picking Core does **not**
give anyone a login, admin access, or the member-record core flag. If someone
picks the wrong category, fix it in **Admin → Attendance** — every row has a
Category dropdown (Youth / YA / Core). Picking Core there keeps their age
bracket; picking Youth or YA clears the Core label.

## What the leaders' registrations verify

| Leader action | What it proves |
|---|---|
| Known email → short form | Existing-member path, no duplicate errors |
| Leader picks Core | Self-selection stores Core on the registration |
| Flagged leader sees Core pre-selected | `is_youth_ya_core` prefill works |
| Core leader uploads a baby photo | Optional-for-Core upload works and is kept |
| Leader picks YA / Singles | Required upload works on real phones/networks |
| Registering twice | Friendly already-registered screen |
| Various phones | New UI on real devices, weak-signal upload behavior |
| You change a category in Admin → Attendance | The correction path works |

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
