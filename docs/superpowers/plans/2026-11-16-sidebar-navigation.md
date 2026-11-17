# Sidebar Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every signed-in screen gets a left sidebar, its own web address and a start page called Home, without anyone losing work in progress when they move around.

**Architecture:** A layout route (`AppFrame`) wraps every signed-in address. It holds the sidebar, the top bar and the always-mounted `WorkScreens` (today's `Index.tsx`). Custom prompt, Sports banner, Video and Email checker are shown or hidden by address and are never unmounted after their first visit. Home, Shared with me, the two libraries and not-found render in the frame's `<Outlet/>`. All address logic lives in pure helpers under `src/lib/nav/`, which are unit-tested; the screens are checked with Playwright.

**Tech Stack:** React 18, react-router-dom 6.30.1, the ready-made sidebar part `src/components/ui/sidebar.tsx` (shadcn, unused today), Tailwind, Vitest (node environment), Playwright (QA script, not in repo).

**Spec:** `docs/superpowers/specs/2026-11-16-sidebar-navigation-design.md`

## Global Constraints

- **Where to work:** `C:\Users\User\pg-nav` (git worktree, branch `feat/sidebar-navigation` from `origin/main` ecd282c; `node_modules` is a junction). Never edit `C:\Users\User\Prompt-Generator` itself: a project hook commits every edit there onto whatever branch is checked out.
- **No new packages.**
- **No commit, push or deploy without John's go-ahead.** Each task ends with a proposed commit message; the commits are made together once John approves (Task 6).
- **Addresses:**
  - `/` Home
  - `/custom`, `/sports`, `/video`
  - `/library/images`, `/library/videos`
  - `/shared`
  - `/email-content-checker`
  - Old addresses forward with replace, keeping the query: `/library` → `/library/images`, `/video-library` → `/library/videos`.
- **Whose library:** `?from=items` | `?from=archive` | `?from=<person uuid>`. No `from` means "mine".
- **Sidebar labels, exactly:** Home · CREATE: Custom prompt, Sports banner, Video · LIBRARIES: My images, My videos, Shared with me · TOOLS: Email checker.
- **Browser keys:** `pg_lastScreen` (last screen, for Continue), `pg_sidebarOpen` (collapse), `pg_returnTo` (sessionStorage, sign-in return).
- **Phone breakpoint:** 768 px (`useIsMobile`).
- **Commands** (PowerShell, from `C:\Users\User\pg-nav` with an uppercase drive letter; use `npx.cmd`/`npm.cmd`):
  - tests: `npx.cmd vitest run`
  - types: `npx.cmd tsc --noEmit -p tsconfig.app.json`
  - lint: `npm.cmd run lint`
  - build: `npm.cmd run build`
- **Comments:** plain English; the developer is a beginner.

## Review Focus

1. **Browser Back/Forward between screens keeps work.** Fill the Custom prompt form, open My images, press Back, and the form is still filled. Task 6 QA case `back-keeps-work`.
2. **Refreshing a deep address shows the same screen.** For example, `/library/videos?from=archive` reloads on Team archive videos, not on Home or mine. Task 6 QA case `refresh-deep`.
3. **A `?from=` library that isn't shared with you** shows "That library hasn't been shared with you." and a button back to your own, not an empty grid. Task 4 builds it; Task 6 QA case `not-shared`, with the fake listing returning 403.
4. **Phones: tapping a sidebar item** goes there and closes the slide-over. Task 6 QA case `phone-menu`.
5. **Pressing Ctrl+B while typing in a text box** (for example the Theme field) doesn't fold the sidebar. Task 2 removes the shortcut; Task 6 QA case `ctrl-b`.

---

### Task 1: Navigation rules (pure helpers)

**Files:**
- Create: `src/lib/nav/screens.ts`, `src/lib/nav/screens.test.ts`
- Create: `src/lib/nav/library-address.ts`, `src/lib/nav/library-address.test.ts`
- Create: `src/lib/nav/return-path.ts`, `src/lib/nav/return-path.test.ts`

**Interfaces (Produces):**
```ts
// screens.ts
export type ScreenId = 'home' | 'custom' | 'sports' | 'video' | 'images' | 'videos' | 'shared' | 'email';
export type WorkScreenId = 'custom' | 'sports' | 'video' | 'email';
export interface ScreenInfo { id: ScreenId; label: string; path: string; group: 'home' | 'create' | 'libraries' | 'tools'; blurb: string; activity: string }
export const SCREENS: readonly ScreenInfo[];                          // sidebar order
export const LEGACY_REDIRECTS: Readonly<Record<string, string>>;
export const LAST_SCREEN_KEY = 'pg_lastScreen';
export function workScreenForPath(pathname: string): WorkScreenId | null;
export function activeScreenForLocation(pathname: string, search: string): ScreenId | null;
export function continueTarget(saved: string | null): ScreenInfo | null;
export function greetingFor(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening';
// library-address.ts
export function sourceFromSearch(search: string): LibrarySource;      // shared → name ''
export function searchForSource(source: LibrarySource): string;       // '' | '?from=…'
export function libraryPath(kind: 'images' | 'videos', source: LibrarySource): string;
export function filterPeople<T extends { name: string | null; email: string | null }>(people: T[], query: string): T[];
// return-path.ts
export const RETURN_PATH_KEY = 'pg_returnTo';
export function safeReturnPath(raw: string | null | undefined): string | null;
export function rememberReturnPath(path: string): void;   // sessionStorage, try/catch
export function takeReturnPath(): string | null;          // read + remove, through safeReturnPath
```
`LibrarySource` is the existing type in `src/components/auth/LibrarySourcePicker.tsx` (`import type`).

**Values to copy into `SCREENS`:**

| id | label | path | group | activity | blurb |
|----|-------|------|-------|----------|-------|
| home | Home | `/` | home | Home | — |
| custom | Custom prompt | `/custom` | create | Custom Prompt | Make a brand image from a reference prompt |
| sports | Sports banner | `/sports` | create | Sports Banner | Build a sports promo banner step by step |
| video | Video | `/video` | create | Video | Make a short video for a brand |
| images | My images | `/library/images` | libraries | Image Library | Every image you've made |
| videos | My videos | `/library/videos` | libraries | Video Library | Every video you've made |
| shared | Shared with me | `/shared` | libraries | Shared with me | Images and videos colleagues shared with you |
| email | Email checker | `/email-content-checker` | tools | Email Checker | Build an email and check it for spam risk |

- [ ] **Step 1: Write the failing tests**

`screens.test.ts`:
- `workScreenForPath` returns:
  - `'/custom'` → `'custom'`, `'/sports'` → `'sports'`, `'/video'` → `'video'`, `'/video/'` → `'video'`
  - `'/email-content-checker'` → `'email'`
  - `'/'` → `null`, `'/library/videos'` → `null`, `'/videox'` → `null`
- `activeScreenForLocation`:
  - `('/','')` → `'home'`
  - `('/library/images','')` → `'images'`
  - `('/library/images','?from=items')` → `'shared'`
  - `('/library/videos','?from=archive')` → `'shared'`
  - `('/shared','')` → `'shared'`
  - `('/nope','')` → `null`
- `continueTarget`: `null`, `'home'` and `'bogus'` all → `null`; `'video'` → the entry with `path === '/video'`.
- `LEGACY_REDIRECTS` equals `{ '/library': '/library/images', '/video-library': '/library/videos' }`.
- `SCREENS.map(s => s.label)` equals the eight labels in table order, and all paths are unique.
- `greetingFor`: 5 → `'Good morning'`, 11 → `'Good morning'`, 12 → `'Good afternoon'`, 17 → `'Good afternoon'`, 18 → `'Good evening'`, 2 → `'Good evening'`.

`library-address.test.ts` (with `const U = '11111111-0000-4000-8000-000000000001'`):
- `sourceFromSearch`:
  - `''` → `{ kind: 'mine' }`, `'?from='` → `{ kind: 'mine' }`, `'?from=not-a-uuid'` → `{ kind: 'mine' }`
  - `'?from=items'` → `{ kind: 'items' }`, `'?from=archive'` → `{ kind: 'archive' }`
  - `` `?from=${U}` `` → `{ kind: 'shared', ownerId: U, name: '' }`
- `searchForSource(sourceFromSearch(x)) === x` for `''`, `'?from=items'`, `'?from=archive'` and `` `?from=${U}` ``.
- `libraryPath('videos', { kind: 'shared', ownerId: U, name: 'Meny' }) === `/library/videos?from=${U}``.
- `libraryPath('images', { kind: 'mine' }) === '/library/images'`.
- `filterPeople` with Meny Maman (meny@x.com) and Elena (elena@x.com):
  - `'MENY'` → [Meny]
  - `'elena@'` → [Elena]
  - `''` → both
  - `'zzz'` → []

`return-path.test.ts`, for `safeReturnPath`:
- These come back unchanged: `'/library/images?from=items'`, `'/custom'`.
- These all return `null`:
  - `'/'` (nothing to restore)
  - `'//evil.com'`, `'/\\evil.com'`, `'https://evil.com'`, `'javascript:alert(1)'`
  - `''`, `null`, `undefined`
  - `'/api/auth?action=me'`

- [ ] **Step 2: Run them and see them fail** (`npx.cmd vitest run src/lib/nav`). Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the three files.** `rememberReturnPath` and `takeReturnPath` wrap `sessionStorage` in try/catch, and `takeReturnPath` removes the key.

- [ ] **Step 4: Run** `npx.cmd vitest run src/lib/nav`. Expected: all pass.

- [ ] **Step 5: Proposed commit:** "Add the rules for the new addresses: which screen each address shows, whose library, and safe sign-in return"

---

### Task 2: The frame, the sidebar and the kept-alive work screens

**Files:**
- Modify `src/components/ui/sidebar.tsx`: delete the keyboard-shortcut effect and the `SIDEBAR_KEYBOARD_SHORTCUT` constant. Nothing else changes.
- Move `src/pages/Index.tsx` to `src/components/layout/WorkScreens.tsx` with `git mv`, then edit it.
- Create `src/components/layout/AppFrame.tsx` and `src/components/layout/AppSidebar.tsx`.
- Modify `src/components/ResultDisplay.tsx`: add an optional prop.
- Modify `src/components/auth/AuthGate.tsx`:
  - the approved branch renders `<>{children}</>` only;
  - `export function ConnectDriveBar`.
- Modify `src/App.tsx`: the routes.

**Interfaces:**
- Consumes: `SCREENS`, `workScreenForPath`, `activeScreenForLocation`, `LAST_SCREEN_KEY`, `LEGACY_REDIRECTS` from Task 1.
- Produces:
```ts
export interface BusyState { custom: boolean; video: boolean }            // WorkScreens.tsx
export function WorkScreens(props: { visible: WorkScreenId | null; onBusyChange: (b: BusyState) => void }): JSX.Element;
export function AppSidebar(props: { busy: BusyState }): JSX.Element;
export function AppFrame(): JSX.Element;                                  // renders <Outlet/>
// ResultDisplay: new optional prop
onImageBusyChange?: (busy: boolean) => void;   // true while generatingImage.chatgpt || generatingImage.gemini
```

- [ ] **Step 1: Routes in `App.tsx`.**
  - Keep `/assistant/:token` outside, unchanged.
  - Everything else goes under one layout route, `<Route element={<AuthGate><AppFrame/></AuthGate>}>`. Its children are:
    - `index` → `Home` (Task 3 creates it; until then a placeholder `<div/>`);
    - `custom`, `sports`, `video`, `email-content-checker` → `element={null}`, because `WorkScreens` draws them;
    - `library/images` → `ImageLibrary`, `library/videos` → `VideoLibrary` (no wrapper div), `shared` → placeholder until Task 4;
    - `library` and `video-library` → a small `LegacyRedirect`. It renders `<Navigate to={LEGACY_REDIRECTS[pathname] + search} replace/>`;
    - `*` → `NotFound`.

- [ ] **Step 2: `AppFrame`.**
  - `SidebarProvider` is controlled. `open` starts from `localStorage['pg_sidebarOpen'] !== 'false'`, and `onOpenChange` saves it. Wrap both in try/catch.
  - Layout: `AppSidebar`, then `SidebarInset` containing:
    - a top bar row: `SidebarTrigger` on the left, `<UserBar/>` on the right;
    - `ConnectDriveBar` when `user.has_google === false && !driveConnected`;
    - `<WorkScreens visible={workScreenForPath(pathname)} onBusyChange={setBusy}/>`;
    - `<Outlet/>`.
  - On every pathname change:
    - call `announceActivity(screen.activity)`;
    - store the screen id under `LAST_SCREEN_KEY`, unless it is `home` or null.

- [ ] **Step 3: `AppSidebar`.**
  - `collapsible="icon"`.
  - Header: the logo (`/logo.svg`) and "AI Prompt Generator", linking to `/`.
  - One `SidebarGroup` per group, in `SCREENS` order. Home has no group label.
  - Each item is a `SidebarMenuButton asChild isActive={activeScreenForLocation(...) === id} tooltip={label}` wrapping a react-router `Link`, with a lucide icon:
    - Home `House`, Custom `Sparkles`, Sports `Trophy`, Video `Video`;
    - My images `Images`, My videos `Clapperboard`, Shared `Share2`, Email `Mail`.
  - A pulsing dot (`span.w-2.h-2.rounded-full.bg-primary.animate-pulse`, `aria-label="working"`) shows next to Custom prompt when `busy.custom` and next to Video when `busy.video`.
  - On a phone, clicking an item calls `setOpenMobile(false)` from `useSidebar()`.

- [ ] **Step 4: `WorkScreens`, from Index.**
  - **Remove:**
    - the logo header block and its three buttons;
    - the mode tabs;
    - the library and video-library branches;
    - `activeTab`, `handleTabChange` and `pg_activeTab`;
    - the decorative blurred circles.
  - **Visited screens:** keep a `visited` set of `WorkScreenId`, adding `visible` whenever it changes. Render a screen only once it has been visited. Wrap each in `<div hidden={visible !== id}>`:
    - custom / sports / video: inside today's `container max-w-3xl` card;
    - email: `<EmailContentChecker/>` full width.
  - **Navigation:**
    - Sports `onSubmit` → `navigate('/custom')` and then submit, as today;
    - `handleEditWizard` → `navigate('/sports')`;
    - `VideoGenerator onOpenLibrary` → `navigate('/library/videos')`.
  - **The `?hf=` effect:** read it with `useSearchParams` on any address. Show the same toasts, call `refreshConnection()`, then `navigate('/video', { replace: true })`.
  - **Busy:** call `onBusyChange` in an effect. `custom = appState === 'PROCESSING' || imageBusy`, and `video = videoState.appState === 'RENDERING'`. `imageBusy` is local state fed by `ResultDisplay onImageBusyChange`.
  - `LikedImagesPanel` stays here.

- [ ] **Step 5: `ResultDisplay`.** Add an effect calling `onImageBusyChange?.(generatingImage.chatgpt || generatingImage.gemini)` whenever that changes, and calling it with `false` on unmount.

- [ ] **Step 6: Check.**
  - `npx.cmd tsc --noEmit -p tsconfig.app.json` and `npm.cmd run lint` show no new errors (compare against `main`).
  - `npx.cmd vitest run` passes.
  - `npm.cmd run build` succeeds.
  - Then run `npm.cmd run preview` and `nav_shots.mjs` (Task 6) on `/`, `/custom`, `/sports`, `/video` and `/library/images`. The sidebar shows, the right screen is visible and there are no page errors.

- [ ] **Step 7: Proposed commit:** "Put every screen in one frame with a left sidebar, and keep the work screens alive while you move around"

---

### Task 3: Home start page and not-found inside the frame

**Files:**
- Create `src/pages/Home.tsx`, then replace the Task 2 placeholder route with it.
- Modify `src/pages/NotFound.tsx`.

**Interfaces:**
- Consumes: `SCREENS`, `continueTarget`, `greetingFor`, `LAST_SCREEN_KEY` (Task 1); `useAuth().user`, `firstName` (`src/lib/auth-api.ts`).
- Produces: `export default function Home(): JSX.Element`.

- [ ] **Step 1: Home.**
  - Heading: `${greetingFor(new Date().getHours())}, ${firstName(user)}`.
  - **Continue card:** shown when `continueTarget(localStorage[LAST_SCREEN_KEY])` is not null. Text "Continue where you left off", the screen label, and a `Link` to its path. Read storage in try/catch.
  - **Tiles:** three sections, CREATE / LIBRARIES / TOOLS, with one tile per screen in that group (all of `SCREENS` except home). Each tile is a `Link` showing icon, label and blurb, in a grid of `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
  - Use the same icons as the sidebar: move the id→icon map into `src/components/layout/screen-icons.ts` and import it in both places.
  - No data loading.

- [ ] **Step 2: NotFound.** It renders inside the frame: "Page not found", the address that was asked for, and a `Button asChild` around a `Link to="/"` labelled "Go to Home". Keep the `console.error`.

- [ ] **Step 3: Check.** Types, lint and build pass. `nav_shots.mjs` on `/` and `/nope` at desktop and phone width shows the greeting, the tiles in one column on the phone, and the not-found page with the sidebar.

- [ ] **Step 4: Proposed commit:** "Add a start page that looks the same for everyone, with a Continue shortcut"

---

### Task 4: Libraries follow the address, plus the Shared with me page

**Files:**
- Modify `src/pages/ImageLibrary.tsx`, `src/pages/VideoLibrary.tsx` and `src/components/auth/LibrarySourcePicker.tsx`.
- Create `src/pages/SharedWithMe.tsx`, and route `shared` to it.
- Test: `src/components/auth/LibrarySourcePicker.test.ts`.

**Interfaces:**
- Consumes: `sourceFromSearch`, `libraryPath`, `filterPeople` (Task 1); `authApi.shares()` → `{ shared_with_me: Person[]; everyone?: Person[] }`.
- Produces: `export default function SharedWithMe(): JSX.Element`. `sourceLabel` returns `'Shared library'` when a shared source has an empty name.

- [ ] **Step 1: Failing test.** `sourceLabel({ kind: 'shared', ownerId: U, name: '' })` is `'Shared library'`, and with `name: 'Meny'` it is `"Meny's library"`. Run it and see it fail.

- [ ] **Step 2: `LibrarySourcePicker`.**
  - Add the `sourceLabel` fallback.
  - When `value.kind === 'shared' && !value.name`, show the name found by `ownerId` in the loaded `shared_with_me` or `everyone` list. Make the test pass.

- [ ] **Step 3: ImageLibrary.**
  - Remove the `embedded` and `onBack` props and both Back buttons.
  - `source = useMemo(() => sourceFromSearch(location.search), [location.search])`.
  - The picker's `onChange` → `navigate(libraryPath('images', s))`.
  - The empty-state "Generate images" button → `Link to="/custom"`.
  - **Not-shared message:** `syncFromDrive` becomes `syncFromDrive(owner = ''): Promise<{ added: number; accessError?: string }>`. On a 403 or 404 it returns the server's `error` text, which is "That library hasn't been shared with you." or "That library is no longer available.". The caller puts it in the existing error block and adds a button "Go to My images" → `/library/images`.

- [ ] **Step 4: VideoLibrary.**
  - Remove `onBack` and its button.
  - Source comes from the address, as in Step 3.
  - Changing the source resets the brand, model and favorites filters (an effect on `source`).
  - When there is an error and the source is not mine, add a "Go to My videos" button.

- [ ] **Step 5: SharedWithMe.**
  - Data: load `authApi.shares()`, with a loading spinner and a retry on error.
  - Each row has two links, **Images** and **Videos**, built with `libraryPath(kind, source)`.
  - Sections, in order:
    1. "Shared with you one by one" (`items`)
    2. "Whole libraries", one row per person in `shared_with_me` (avatar, name). When empty: "Nobody has shared their whole library with you yet. To share yours: avatar menu (top right) → Share my library…"
    3. "Team archive", for everything made before accounts (`archive`)
    4. "Everyone (admin)", only when `everyone?.length`, with a search `Input` going through `filterPeople`.

- [ ] **Step 6: Check.** `npx.cmd vitest run` passes; types, lint and build pass. `nav_shots.mjs` on `/shared` and `/library/images?from=<Meny's id>`, using the fake that returns two shared people, shows Meny's name in the picker and Shared with me highlighted.

- [ ] **Step 7: Proposed commit:** "Libraries and shared libraries get their own links, and Shared with me lists everything in one place"

---

### Task 5: Links in and out

**Files:**
- Modify `api/video.ts:630`: `Location` becomes `` `/video?hf=${encodeURIComponent(result)}` ``, and update the comment above it.
- Modify `src/lib/auth-api.ts`: `signIn` and `connectDrive` call `rememberReturnPath(location.pathname + location.search)` before redirecting.
- Modify `src/components/auth/AuthGate.tsx`: once `user?.status === 'approved'`, run `const p = takeReturnPath()`. If `p` differs from the current path and search, `navigate(p, { replace: true })`. Run this once per sign-in, in an effect keyed on `user?.id`.

- [ ] **Step 1: Make the three edits.** The return-path helpers are already tested (Task 1).
- [ ] **Step 2: Check.** Types, lint, tests and build pass. Task 6 QA cases `sign-in-return` and `hf-return` pass.
- [ ] **Step 3: Proposed commit:** "Sign-in and the video-service connection bring you back to the page you were on"

---

### Task 6: QA, before/after, release

**Files:**
- Create (scratchpad, not repo): `…\scratchpad\tools\nav_qa.mjs`. It reuses the `nav_shots.mjs` fakes, and these API paths must not touch the network:
  - `/api/auth?action=me`
  - `/api/auth?action=shares` (two people)
  - `/api/list-prompts` → `[]`
  - `/api/list-drive-images`: returns 403 `{ error: "That library hasn't been shared with you." }` for owner `…0099`, and `{ files: [] }` otherwise
  - `/api/video`: `{ files: [], connected: true }`
- "Before" screenshots already exist at `…\scratchpad\shots\nav_before\`.

- [ ] **Step 1: Write `nav_qa.mjs`.** Each case prints PASS or FAIL. Cases:
  - **every-item:** each sidebar item and each Home tile opens its address, and the matching heading is visible.
  - **refresh-deep:** reloading `/library/videos?from=archive` shows "Team archive" in the picker.
  - **legacy:** `/library?x=1` lands on `/library/images?x=1`, and `/video-library` on `/library/videos`.
  - **shared:** `/shared` lists Meny and Elena, and Meny's Images link opens `/library/images?from=<id>` with "Meny's library".
  - **not-shared:** `/library/images?from=…0099` shows the message and the "Go to My images" button.
  - **back-keeps-work:** pick a brand on `/custom` and type a Theme, go to My images, press browser Back, and both are still there. Repeat using the sidebar instead of Back.
  - **image-busy:** make `/api/generate-image` hang for 20 s. Click Generate, go to My images: the dot is visible next to Custom prompt. Go back: the spinner is still there. Abort the request.
  - **email-draft:** type into the first Email checker text field, go Home, come back, and the text is still there.
  - **ctrl-b:** focus the Theme field and press Control+B; the sidebar `data-state` is unchanged.
  - **collapse-remembered:** collapse, reload, and it is still collapsed.
  - **phone-menu:** at 390 px, ☰ opens the menu; tapping My videos navigates there and the menu closes.
  - **sign-in-return:** set `sessionStorage.pg_returnTo='/library/videos'`, load `/?auth=drive-connected`, and it ends on `/library/videos`.
  - **hf-return:** `/?hf=connected` ends on `/video` with the "Higgsfield connected" toast.
  - **fan-banner:** open an image from a faked library and the Fan Banner window opens.
  - Also capture "after" screenshots: desktop and phone, for every address in the Global Constraints.

- [ ] **Step 2: Run the checks.** In `C:\Users\User\pg-nav`, `npx.cmd vitest run`, `npx.cmd tsc --noEmit -p tsconfig.app.json`, `npm.cmd run lint` and `npm.cmd run build` all pass; lint and types show no errors that aren't also on `main`. Then `npm.cmd run preview` and `node nav_qa.mjs <out> http://localhost:4173 https://prompt-generator-virid-delta.vercel.app`. Expected: every case PASS and no page errors.

- [ ] **Step 3: Look at the screenshots** before and after, at desktop and phone width. Fix anything that looks wrong and re-run.

- [ ] **Step 4: Release, with John's go-ahead.**
  - Show John the after-screenshots and the proposed commits from Tasks 1–5, plus "Add sidebar navigation design and plan" for the two docs.
  - Once he approves:
    - make the commits;
    - check for foreign commits (`git log --format='%h %an %ad %s' origin/main..HEAD`);
    - push the branch;
    - open the PR with `gh pr create --repo Optinet-Solutions-AI/Prompt-Generator`.
  - The PR body carries the steps for the old-address owner: open the Vercel project that serves `prompt-generator-eight-umber.vercel.app`, then either delete it or add `{"redirects":[{"source":"/(.*)","destination":"https://prompt-generator-virid-delta.vercel.app/$1","permanent":true}]}` to its `vercel.json` and redeploy.

- [ ] **Step 5: After merge and deploy.**
  - Run `nav_qa.mjs` against the live address and check the production logs for new errors.
  - Add a PMS card through `scripts/pms-update.mjs`, written for non-technical readers and saying what was unit-tested and what was checked live.
  - Ask John before resetting local `main`'s five "auto: Claude edit" commits, which contain only the design doc, to `origin/main`.
  - Remove the worktree: run `rmdir` on the junction first, then `git worktree remove`.
