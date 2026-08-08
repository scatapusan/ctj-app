# Retreat Registration — Core Leaders Test Run

**Goal:** core leaders register themselves FIRST (real registrations — you're
attending anyway!) and catch anything broken before the QR goes out on Aug 9.

## Paste-ready message for the leaders' group chat

> Hi mga ka-core! 🎉 The retreat sign-up is live. Please register yourselves
> first so we can test it before it goes out to everyone:
>
> 👉 https://ctj-marikina.vercel.app/retreat?event=b8e614c0-954b-46d5-aa4e-a3620d359c66
>
> While registering, please check:
> 1. Use the SAME email you use for Friday check-ins — it should greet you by
>    name and only ask the retreat questions (birthday, category, etc.).
> 2. 23+? It should require a baby/childhood photo. Try it on mobile data,
>    not just WiFi.
> 3. Does everything look right on YOUR phone? Screenshot anything weird.
> 4. After submitting you should see "You're pre-registered!" — if you see an
>    error instead, screenshot it and send it here.
> 5. Try registering twice — the second time should say you're already on the
>    list, not error out.
>
> Report anything weird here. Salamat! 🙏

## What the leaders' registrations verify

| Leader action | What it proves |
|---|---|
| Known email → short form | Existing-member path, no duplicate errors |
| 23+ leader uploads baby photo | Required YA upload works on real phones/networks |
| Registering twice | Friendly already-registered screen |
| Various phones | Barkada UI on real devices, weak-signal upload behavior |

## For you (admin) during the test

- Watch registrations arrive: **Admin → Check-in → Youth & YA Retreat 2026**
  (they'll appear under "Pre-registered") or **Admin → Attendance** (badge
  shows "Pre-registered").
- Leaders under 18: none presumably, so ask ONE leader to fake-test the minor
  path is NOT needed — the browser tests covered it. Don't create fake minors
  in production.
- If a leader reports a bug, screenshot + the email they used is enough to
  reproduce.

## Day-of quick reference (Aug 30)

1. Leaders log in on their phones → **Admin → Check-in** → select the retreat.
2. As people arrive: search their name → **Mark attended** (one tap).
3. Someone not on the list? **Walk-in registration** button → hand them the
   phone (or let them scan at the desk) → they fill the same form and land
   directly as attended.
4. Marking is one-way — a mis-tap needs a database fix, so tap carefully.
