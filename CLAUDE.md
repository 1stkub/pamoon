# Pramoon Live — Project Context

Thai live-commerce/auction marketplace: sellers list items, run live video
broadcasts (WebRTC), and buyers bid in real time. Currently a demo/MVP —
no payment integration, no real authentication yet (see "Identity" below).

This file is project memory, not a tutorial. It exists so any session
(human or Claude) starts from "what this system actually is and what
already went wrong once," instead of re-deriving it from scratch or
re-introducing a bug the code comments already explain.

## Stack & architecture

Vanilla HTML/CSS/JS. No build step, no bundler, no framework, no
`package.json`. `index.html` is the shell: it loads CSS modules, then
fetches HTML fragments and JS modules at runtime and boots the app into
`<div id="app">`.

- **Must be served over HTTP** (`npx serve`, `python -m http.server`, etc.)
  — opening `index.html` via `file://` breaks the `fetch()` calls that load
  `html/` fragments, per the comment in `index.html`.
- **Load order is significant.** Both `css/modules/NN-*.css` and
  `javascript/modules/NN-*.js` are numbered and loaded strictly in that
  order — CSS because later files override earlier ones at equal
  specificity (cascade), JS because later modules call functions/read
  globals defined by earlier ones (no imports/exports — everything is a
  global script). When adding a module, pick a number that reflects where
  it needs to sit, and check `index.html` for the load list.
- Backend is Firebase: **Firestore** for data, no server code at all —
  every "backend rule" (bans, edit windows, fees) is enforced client-side
  in JS. Treat that as informational, not a security boundary — do not
  design a feature assuming the client is trustworthy.
- Live video is a **WebRTC mesh signaled through Firestore** (see
  `javascript/modules/08-live.js`), not a media server: one
  `RTCPeerConnection` per viewer on the seller's device. Known limit,
  already documented in-file — don't "fix" this by trying to add a
  proper SFU/media server unless that's the actual ask.

## Directory map

```
index.html                    shell: CSS links, boot script, load order
css/modules/01…16-*.css       one theme/area per file, cascade-ordered
html/
  shell-top.html, shell-bottom.html   persistent chrome
  overlays.html, auth-gate.html       modals / login gate
  pages/*.html                        one fragment per screen
javascript/
  firebase-config.js           Firebase web app config (public, not a secret)
  modules/01…16-*.js           one concern per file, load-order-dependent
```

Both CSS and JS are numbered in parallel by concern (e.g. `12-live.css` /
`08-live.js` are the live-streaming screen) but the numbers aren't kept
in sync 1:1 across the two — check the actual filename, don't assume.

## Domain model (Firestore, inferred from code — no schema file exists)

Collections in use: `items`, `shops`, `shops/{name}/reviews`, `users`,
`bannedUsers`, `admins`, `reports`, `feedback`, and per-item subcollections
like `items/{id}/liveSignals/{viewerName}` for WebRTC signaling.

- **Usernames are Firestore document IDs** (`shops/{myName}`,
  `items/{id}/liveSignals/{myName}`, etc.) — see "Identity" below, this is
  why sanitization exists and must stay.
- Items carry `startPrice`/`price`, `bidCount`, `isLive`, category `fee`
  (commission %, not actually charged yet — no payment system).
- Sellers can edit/delete a listing only within a 30-min window **and**
  only while `bidCount` is 0 (`EDIT_WINDOW_MS` in
  `javascript/modules/06-sell.js`) — re-check this against the live doc
  right before mutating, don't trust a value read earlier in the render.

## Identity — read before touching login/auth

`javascript/modules/02-identity.js` documents an explicit decision: real
Firebase Auth (email+password+verification) was built and then rolled
back. Identity is currently device-local (`localStorage`) with phone
number as the uniqueness key, "1 account per phone," any password
accepted. This is intentional — the founder wants real identity
verification deferred to the last step of the project. **Don't
reintroduce Firebase Auth or treat this as a bug to fix** unless
explicitly asked to build that phase.

## The one security pattern you must not skip

A lot of rendering in this codebase builds HTML strings with inline
`onclick="fn('${name}')"` handlers (shop directory, feed chips, admin
panel, recommended shops). Any free-typed string that ends up inside one
of those attributes — not just displayed as text — is a stored-XSS vector:
an unescaped `'`/`"`/`<`/`>` breaks out of the attribute and runs
arbitrary JS in every viewer's browser.

Two existing helpers handle the two contexts; reuse them, don't
reinvent them:

- `esc()` — escapes for safe **text content** (does not protect
  attribute/onclick strings — HTML-decodes back to the literal char before
  the attribute's own JS is parsed).
- `sanitizeUsername()` / `sanitizeFreeTag()` (`javascript/modules/02-identity.js`)
  — strip characters unsafe in Firestore doc IDs **and** in an inline
  `onclick` string, applied at the point a name/tag is captured, not at
  render time.

If you add a new field that's free-typed by a user and ever gets
interpolated into an `onclick="...('${value}')"` string anywhere, it
needs the same treatment before it's stored — check for this specifically
in review, it's the codebase's actual recurring risk, not a hypothetical.

## Conventions

- User-facing strings and business data (categories, labels, alerts) are
  in Thai. Dev-facing comments are mixed Thai/English — write new ones in
  whichever the surrounding block already uses.
- `localStorage` keys are prefixed `pramoon_*`.
- No linter, formatter, test framework, or CI currently exists. Don't
  invent config for tools that aren't set up (no assumed ESLint/Prettier
  config, no test runner) — if the user wants one added, that's a
  decision to make explicitly, not infer.

## Working agreement

Requirement → Planning → Coding → Testing → Review → Documentation,
adapted to what this repo actually has:

1. **Requirement** — before coding, find how the closest existing feature
   already solves this (feed/detail/sell/live modules cover most
   patterns) and match it rather than introducing a second convention.
2. **Planning** — for anything touching the Firestore schema, the
   edit/delete window logic, or free text that reaches an `onclick`
   string, say the plan out loud first (data shape, who can mutate it,
   where it's sanitized) — these are exactly the spots this codebase has
   already been bitten by once.
3. **Coding** — respect load order (numbering), keep Thai/English comment
   style consistent with the file you're editing, reuse `esc()` /
   `sanitizeUsername()` / `sanitizeFreeTag()` instead of writing new
   escaping.
4. **Testing** — there is no automated test suite. Verify by serving the
   site over HTTP and exercising the actual flow in a browser (the `run`
   skill can launch it). For anything touching identity, bidding, or
   rendering of user-supplied strings, specifically try an adversarial
   input (`"`, `'`, `<script>`, a `/` in a username) before calling it done.
5. **Review** — self-check every new free-typed field for the
   onclick-injection pattern above; it's the single most likely place to
   reintroduce a real vulnerability.
6. **Documentation** — when architecture, data model, or a load-order
   dependency changes, update this file in the same change. Stale context
   here is worse than no context.
