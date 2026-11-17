# Sidebar navigation: one way to every screen, one address each

Date: 2026-11-16 · Due: Fri 2026-11-20 (PMS card "Make Home, My library and the
shared library easy to find, and fix links that don't match") · Owner: John

## Why

At the 13 Nov meeting several people could not find the home page or their
library, Meny said the app feels dated and is "missing a sidebar", and a link
shared on WhatsApp opened the wrong thing. Agreed action: make Home, My library
and the shared libraries easy to reach, and make links consistent so they can
be sent around. John's steer for the build: **convenient and user friendly**.

What causes it today (checked in the code, 16 Nov):

- There is no menu that stays on screen. `/` (`src/pages/Index.tsx`) opens
  whichever tab the person last used (saved in the browser as `pg_activeTab`),
  so "home" differs per person and per visit.
- The libraries open as tabs inside `/` without changing the address, so a
  library can't be linked to. Separate standalone versions also exist at
  `/library` and `/video-library` with a different look; `/video-library` has no
  way back at all.
- Shared libraries hide inside the "Showing: My library ▾" dropdown
  (`LibrarySourcePicker`) inside each library.
- Google sign-in always lands on `/` (`api/auth.ts` `back()`), so a link opened
  while signed out loses where it was pointing.
- An old copy of the app still runs at `prompt-generator-eight-umber.vercel.app`
  (old title, no sign-in, none of the recent features). It is on a different
  Vercel account than ours (`vercel domains inspect` → no access). Most likely
  the WhatsApp link — not yet confirmed with the team.

## Goals

1. A left sidebar on every signed-in screen, folding into a ☰ button on phones.
2. Home is a start page with shortcuts that looks the same for everyone.
3. Every screen has its own address; opening, refreshing or sending that
   address shows the same screen for anyone.
4. "Shared with me" is one click from anywhere and shows everything shared
   with you in one place.
5. Moving between screens never loses work in progress.

## Non-goals

- No change to how images and videos are made, saved, shared or charged.
- No restyle of the screens themselves (forms, libraries) beyond fitting them
  into the frame.
- The AI Assistant tester links (`/assistant/:token`) stay as they are, with no
  sidebar and no sign-in.
- Other meeting items (cost in money, video frame check, video editing) are
  separate cards.

## Anti-goals (a failure even if it "works")

- Someone loses a half-filled form, a finished prompt or a rendering video by
  clicking a menu item.
- Any existing link or bookmark stops working.
- The same screen reachable two ways with two different looks.
- The first screen gets noticeably slower.

## Constraints

- Friday deadline. One branch, one PR, reviewable in a sitting.
- No new packages. React 18, react-router-dom 6.30.1 (layout routes with
  `<Outlet/>` available). The ready-made sidebar part
  `src/components/ui/sidebar.tsx` (shadcn) is already in the project, styled in
  `tailwind.config.ts` / `src/index.css`, and unused — reuse it.
- Tests run in Vitest with `environment: 'node'` (no DOM, no Testing Library),
  so logic worth testing goes in pure helpers; screens are checked with
  Playwright (see `reference_qa_live_without_login` memory for the login fakes).
- Project rules: before/after screenshots for UI changes, no auto-commit or
  auto-deploy, PR to `Optinet-Solutions-AI/Prompt-Generator`.

## Approaches considered

- **A. One frame around every screen, each screen its own page — chosen by
  John.** A layout route holds the sidebar, the top bar and the work screens
  (kept loaded, see below); the other pages render in its `<Outlet/>`, so the
  frame and the work stay alive while the page changes. Biggest change (Index
  splits up) but fixes the cause and leaves room for the tools the merge with
  Jazz's work will add. That merge is only being planned (the coordination
  meeting hasn't happened, and no code for it is in this repo), so it doesn't
  collide with this week's work.
- B. Keep the single page, add the sidebar, put the tab in the address
  (`/?screen=library`). Lower risk this week, but ugly links, the second
  standalone library versions stay, and growth means bolting onto one page.
- C. Separate pages with no shared state — dropped: switching screens would
  wipe in-progress work.

## Decided by John

- Sidebar on the left (not a top bar).
- Home = start page with shortcuts (not "latest work", not the form).
- Approach A. Make it convenient and user friendly.

## The design

### Screens and addresses

| Sidebar item     | Address                    | Shows |
|------------------|----------------------------|-------|
| Home             | `/`                        | new start page |
| Custom prompt    | `/custom`                  | today's Custom Prompt tab (form → processing → result) |
| Sports banner    | `/sports`                  | today's Sports Banner wizard |
| Video            | `/video`                   | today's Video tab |
| My images        | `/library/images`          | Image Library |
| My videos        | `/library/videos`          | Video Library |
| Shared with me   | `/shared`                  | new page (below) |
| Email checker    | `/email-content-checker`   | unchanged page, now inside the frame |

*My call:* whose library is showing goes in the address, so a library view can
be sent as a link: no `from` = mine, `?from=items` = shared with me one by one,
`?from=archive` = team archive, `?from=<person id>` = that person's whole
library (also how admins open anyone's). Picking in the "Showing ▾" dropdown
updates the address.

*My call:* old addresses keep working and forward (replacing the history
entry, keeping any `?query`): `/library` → `/library/images`, `/video-library`
→ `/library/videos`. Unknown addresses show the not-found page inside the frame
with a "Go to Home" button.

### The frame (around every signed-in screen)

- **Sidebar** (left), top to bottom: app logo + "AI Prompt Generator" (goes
  Home) · Home · CREATE: Custom prompt, Sports banner, Video · LIBRARIES: My
  images, My videos, Shared with me · TOOLS: Email checker.
- The current screen is highlighted. *My call:* when a library is showing
  someone else's items (`from` set), "Shared with me" is highlighted, not "My
  images/videos".
- *My call, for convenience:* a small pulsing dot next to **Video** while a
  video is rendering, and next to **Custom prompt** while a prompt or an image
  is being made, so people can browse their library while they wait and see
  when it's done. (Image renders live inside `ResultDisplay`, so it needs to
  report "busy" up to the frame.)
- Desktop: a button collapses the sidebar to an icon strip (names show on
  hover), and the choice is remembered in the browser. Note: the ready-made
  part *writes* a cookie but never reads it back (it was made for a
  server-rendered framework), so the builder adds the read-back (or uses
  browser storage) — don't assume it works.
- Phones/tablets (under 768 px): sidebar hidden; a ☰ button at the top left
  opens it as a slide-over; tapping an item goes there and closes it.
- *My call:* the ready-made part's Ctrl+B / ⌘B shortcut is turned off — Ctrl+B
  means "bold" while typing and would collapse the menu by surprise.
- **Top bar** of the content area: ☰ / collapse button on the left; on the
  right, today's `UserBar` (who's online + avatar menu), unchanged. The
  "Connect Google Drive" bar stays under it when shown.

### Home (start page)

- Same for everyone, no data loading, fast.
- Greeting with first name ("Good morning, John").
- *My call, for convenience:* a **Continue where you left off** card when the
  last screen used (remembered in the browser) isn't Home — e.g. "Continue:
  Custom prompt". This replaces what `pg_activeTab` used to do automatically,
  without making Home differ per person.
- Three groups of large tiles, each with an icon, name and one line of what it
  does: CREATE (Custom prompt, Sports banner, Video) · LIBRARIES (My images, My
  videos, Shared with me) · TOOLS (Email checker). Tiles wrap to two columns on
  tablets, one on phones.
- Today's big logo header and the Image Library / Video Library / Email
  Content Checker buttons go away — the sidebar and tiles replace them.

### Shared with me (`/shared`)

Everything someone shared with you, in one list, each with **Images** and
**Videos** buttons that open the right library with `?from=` set:

1. **Shared one by one** — single items colleagues sent you (`from=items`).
2. **Whole libraries** — one row per colleague who shared their library
   (avatar, name).
3. **Team archive** — everything made before accounts (`from=archive`).
4. **Everyone (admins only)** — any person's library, with a search box (the
   server already sends this list only to admins).

Data comes from `authApi.shares()` (same as `LibrarySourcePicker`). Loading and
error states; an empty "Whole libraries" section says nobody has shared theirs
yet and how to share yours ("Share my library" in the avatar menu).

### Libraries

- One look each — the "embedded" and "standalone" versions of the Image
  Library become one; the in-page **Back** buttons go (the sidebar and the
  browser's Back replace them). Empty-state "Generate images" goes to
  `/custom`; the Video tab's "open library" goes to `/library/videos`.
- The "Showing ▾" dropdown stays, and now writes `?from=` to the address.
- Opening `?from=<person id>` shows that person's name once the share list
  loads. If that library isn't shared with you, show a plain message ("This
  library isn't shared with you") and a button to My images/videos instead of
  an empty grid.

### Work that must survive moving between screens

*My call (after the builder check):* **the work screens stay loaded while you
are elsewhere.** Custom prompt, Sports banner and Video live in the frame and
are only hidden, never closed, when another screen is showing; the Email
checker joins them the first time it is opened (so it doesn't slow down the
first screen). The address decides which one is visible. So everything inside
them survives, not just what `Index.tsx` holds today: the form, chosen
reference, generated prompt, result images, a prompt being generated, **image
renders in progress (spinner, timer, errors, prompt edits in the result box —
these live inside `ResultDisplay`)**, variations, the Sports wizard, Video
settings and a render in progress, and the **Email checker draft** (memory
only today). This avoids lifting the state of two ~1,100-line screens and
means no one comes back to a reset screen and pays for a second render.

Home, Shared with me, the libraries and not-found are ordinary pages in the
frame's `<Outlet/>` (the libraries already reload from Drive on each open).
Submitting the Sports wizard goes to `/custom` to show the result, as today.
Same as today: a full page reload still clears in-memory work, and windows
open inside a library (e.g. Fan Banner) close when you leave it.

### Links in and out

- *My call:* **sign-in returns you to where you were going.** Before sending
  someone to Google, remember the address they were on (in the browser); after
  they come back, take them there. Only accept same-site paths (one leading
  `/`, never `//…` or `https://…`) so it can't be used to send people to
  another site. Password sign-in already happens in place.
- The video-service sign-in (`api/video.ts`) returns to `/video?hf=…` instead
  of `/?hf=…`; Home also forwards a stray `?hf=` to `/video` for anyone
  mid-sign-in during the release.
- "Who's online" activity labels follow the screen (Home, Custom Prompt,
  Sports Banner, Video, Image Library, Video Library, Shared with me, Email
  Checker).

### The old address (not code in this repo)

`prompt-generator-eight-umber.vercel.app` needs its account owner to either
delete that Vercel project or make every path redirect to
`https://prompt-generator-virid-delta.vercel.app` (same path kept). The PR
description will carry the exact steps; the team is told to use only the live
address.

## How we'll know it's done

- Unit tests (pure helpers): address ↔ library source both ways; old-address
  forwarding; the sign-in return-path check (accepts `/library/images?from=x`,
  rejects `//evil.com`, `https://…`, empty); which screen the Continue card
  offers; which sidebar item is highlighted for an address.
- Playwright on the production build (`vite preview` + login fakes), desktop
  and phone width, with before/after screenshots: every sidebar item and tile
  opens the right screen at the right address; refreshing each address shows
  the same screen; old addresses forward; Shared with me lists the faked
  shares and its buttons open the right library view; fill the custom form →
  go to a library → come back → fields still there; start a (faked, slow)
  image render → go to My images → the Custom prompt dot pulses → come back →
  the spinner is still running; type in the Email checker → leave → come back
  → the draft is still there; ☰ opens and closes on a
  phone; the email checker and Fan Banner still work inside the frame.
- After deploy: the same smoke check on the live address, and no new errors in
  the production logs.

## Left to the builder

File layout and names; context provider vs. layout component for the lifted
state; icons and exact tile wording; collapsed sidebar width; what the
Continue card says beyond the screen name; page titles in the top bar.
