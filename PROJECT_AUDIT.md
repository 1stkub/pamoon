# PROJECT AUDIT — NAKHON PATHOM DISCOVERY

Audit date: 2026-09-27
Audited by: Claude Code (handoff "BUILD #055 → Production Development")
Branch: `claude/nakhon-pathom-audit-suox86`

> **Headline finding:** the NAKHON PATHOM DISCOVERY codebase (BUILD #055
> prototype) **is not in any repository this session can reach.** The target
> repository `1stkub/pamoon` contains a different, unrelated product
> (**Pramoon Live**, a Thai live-auction marketplace). The only other
> repository on the account, `1stkub/Game`, is **empty** (no commits).
>
> Per the handoff rules ("do not assume the repository is empty", "do not
> build a new system over the existing one", "propose a migration plan before
> changing architecture"), **no implementation was started.** A decision is
> needed on where the product lives and whether the BUILD #055 prototype can
> be supplied. See [NEXT IMPLEMENTATION ORDER](#next-implementation-order).

---

## Scope of what was checked

| Location | Contents | Relevant to Discovery? |
|---|---|---|
| `1stkub/pamoon` @ `main` (`09d8038`, 1 commit, 2026-09-09) | Pramoon Live — 16 JS modules, 16 CSS modules, 19 HTML fragments, ~8.5k lines | No |
| `1stkub/pamoon` @ `claude/claude-team-member-lyaf85` (`796f9ec`) | `main` + a `CLAUDE.md` describing Pramoon Live | No |
| `1stkub/pamoon` @ `claude/nakhon-pathom-audit-suox86` | Same as `main` | No |
| `1stkub/Game` (all branches) | Empty repository, no commits | No |

Search for any trace of the product across all of the above
(`nakhon`, `นครปฐม`, `discover`, `longdo`, `lost image`, `ประโทน`,
`BUILD #0…`, museum/chedi terms): **0 matches.**

---

## CURRENT STATE

### What `1stkub/pamoon` actually is

**Pramoon Live** (`<title>Pramoon Live</title>`): a Thai live-commerce /
auction marketplace. Sellers list items across categories (trading cards,
watches, amulets, phones, vehicles, real estate…), run live video
broadcasts, buyers bid in real time, chat, review shops.

- **Stack:** vanilla HTML/CSS/JS, no build step, no `package.json`, no
  framework, no TypeScript. `index.html` fetches HTML fragments and
  `<script>`-loads numbered global JS modules at runtime.
- **Backend:** Firebase Firestore directly from the client (`items`, `shops`,
  `users`, `bannedUsers`, `admins`, `reports`, `feedback`…). No server code;
  all business rules enforced client-side.
- **Live video:** WebRTC mesh signaled through Firestore.
- **Font/UI:** Kanit, mobile phone-frame shell, bottom navbar.

### Checklist from the handoff (§0)

| # | Item | Finding |
|---|---|---|
| 1 | Repository | Different product (Pramoon Live) |
| 2 | Source code | Marketplace code only; no discovery code |
| 3 | package.json / deps | **None exists.** Firebase compat SDK via CDN |
| 4 | Architecture | Client-only SPA + Firestore; no API layer |
| 5 | Routes | Hidden/shown `<section>`s via `goTo()`; no URL routing |
| 6 | Components | Marketplace pages (feed, sell, detail, live, chat, shop…) |
| 7 | State management | Module-level globals |
| 8 | API | None (direct Firestore) |
| 9 | Seed data | Hard-coded category list in `01-data.js`; no world data |
| 10 | Tests | **None** |
| 11 | README | **None** (only a `CLAUDE.md` on a side branch) |
| 12 | Prototype | **BUILD #055 not found** |
| 13–15 | Done / partial / not done | See below — relative to the Discovery spec, everything is "not done" |
| 16 | Technical debt | See below |
| 17 | Conflicts with spec | The whole repo is a different domain |

---

## COMPLETED

Relative to the NAKHON PATHOM DISCOVERY specification: **nothing.**

No home screen, discovery engine, world graph, memory model, adventure
state machine, map abstraction, golden dataset, or Golden Discovery #001
exists in any reachable repository.

## PARTIALLY COMPLETED

**Nothing.** The only things that could loosely be reused from Pramoon Live:

- Thai typography setup (Kanit via Google Fonts) and a mobile-first shell —
  cosmetic, and the Discovery spec calls for a different, cinematic style.
- Firebase project wiring — but the spec requires a server-side API that
  validates state transitions, which a client-only Firestore app does not
  provide.

Neither is worth coupling the two products for.

## MISSING

Everything in the handoff, specifically:

- **Prototype:** BUILD #055 source (HOME → LOCATION → … → DISCOVER AGAIN flow,
  time budget, debug state).
- **Frontend:** Home, Loading, Curiosity Reveal, Adventure Ready, Navigation,
  Arrival, Search, Progressive Hint, Found, Object Reveal, Second Reveal,
  Origin Question, Connection, Aha, World Expansion, Discover Again,
  Feedback, Debug panel.
- **Backend:** `POST /api/discover`, `GET /api/discover/:id`,
  `/api/adventure/start|:id/event|:id`, `/api/location/context`,
  `/api/map/*`, `/api/world/*`, `/api/me/world`, error contract.
- **Engines:** Discovery pipeline (candidates → hard filter → ranking via
  `ranking_configs` → diversification → serendipity), Chain Engine,
  Experience Engine (time-budget shortening that preserves invariants),
  Personalization.
- **Domain:** Adventure state machine with server-validated transitions and
  `eventId` idempotency; memory model (Place / Discovery / Connection);
  Living World state (availability, safety); `MapProvider` +
  `LongdoProvider`.
- **Trust layer:** publish validators (fact→source, interpretation≠fact,
  edge→evidence, invariant completeness).
- **Offline:** post-start caching (service worker or equivalent).
- **Tests:** golden E2E + all failure tests in §58–59.
- **Field test protocol** (§60–61).

## BROKEN

Nothing Discovery-related can be broken, because nothing exists. The handoff
itself states the prototype's GPS, navigation, Longdo, backend, database and
persistence were **simulated** — so even once BUILD #055 is supplied, those
parts must be treated as not implemented.

## TECHNICAL DEBT

For Discovery: none yet (greenfield).

Observed in Pramoon Live, recorded only so nobody reuses it by accident:
- No build/test tooling, no `package.json`, no lint/typecheck.
- All rules enforced client-side against Firestore (not a trust boundary).
- Global-script module system with load-order coupling.

## ARCHITECTURE GAPS

Target (§50) vs. what exists:

| Spec requires | Exists? |
|---|---|
| Mobile web frontend with `features/`, `services/`, `state/`, `types/` | No |
| API layer (server) | No — and Pramoon has no server at all |
| Server-validated state machine (§21, §52) | No — impossible in a client-only Firestore app without Cloud Functions or a server |
| Hidden map API key behind server (§24) | No |
| `ranking_configs` (configurable weights) | No |
| Seed pipeline `seed/nakhon-pathom/golden/*.json` | No |
| Publish-time validators | No |
| Dev-only debug mode | No |

**Architectural conclusion:** the spec (server-validated transitions,
idempotent events, server-side publish validation, hidden API keys) needs a
real API layer. Pramoon Live's client-only architecture is structurally
incompatible with that. Building inside it would be a rewrite that
destroys an unrelated working product — which the handoff forbids.

## DATA GAPS

- **No golden dataset** (0 of 6 places, 10 objects, 25 facts, 12
  connections, 30 discoveries, 8 templates, 6 stories, 10 sources).
- **No source documents.** The handoff lists Horse Rider facts (§33) and two
  official interpretations (§34), but **does not name the sources** they come
  from (e.g., the specific Fine Arts Department / National Museum Phra Pathom
  Chedi label, catalogue, or publication, with title, publisher, year, URL or
  page). Under the handoff's own trust policy (§6, §30) these facts cannot be
  published without `source_id`s, and **I will not invent sources.** These
  must be supplied or verified before THE LOST IMAGE can pass validation.
- **Coordinates / opening hours** for P001–P006 not provided — needed for
  geofencing and availability hard filters; must not be guessed (§23).
- **Object location inside the museum** (which gallery/room the Horse Rider
  is displayed in) — required for the SEARCH/ARRIVE steps to be physically
  truthful.
- **Photography** for the cinematic UI (§46) — needs licensed images.

## UX GAPS

All screens in §37–40 are unbuilt. Additionally, the specific BUILD #055
design decisions (time-budget UI, arrival copy tuning, unknown-graph framing)
are only described in prose in the handoff; without the prototype, visual
design must be recreated from the spec.

## TEST GAPS

- No test framework, no test files, no CI in either repo.
- Missing: golden E2E (§58), already-discovered, closed place, 7-minute
  budget, GPS lost, offline-after-start, invalid transition
  (`SEARCHING → COMPLETED`), unsupported fact, missing source, broken graph
  edge, broken discovery (§59), iPhone QA.

## SECURITY GAPS

- Discovery: no API, so no auth, no rate limiting, no key hiding yet.
  Longdo key must be proxied server-side (§24).
- Location data is personal data — needs a retention policy and a clear
  permission explanation (§26) before any field test.
- Pramoon Live (not in scope, noted for the owner): all authorization is
  client-side; Firestore security rules are not in the repo, so they could
  not be audited.

---

## NEXT IMPLEMENTATION ORDER

### Step 0 — Decision needed from the product owner (blocking)

1. **Where does NAKHON PATHOM DISCOVERY live?** Recommended: its **own
   repository** (e.g., `1stkub/Game`, which is empty, or a new
   `nakhon-pathom-discovery` repo). Not inside `pamoon`: it is a different
   product with an incompatible architecture, and mixing them would couple
   two unrelated deploys.
2. **Supply BUILD #055** (zip, HTML file, or repo link) if it exists
   anywhere — so its UX decisions are reused rather than re-derived.
3. **Supply sources** for the Horse Rider facts and interpretations (§33–34)
   and coordinates/hours for P001 and P002 at minimum.

### Step 1+ — Once unblocked (proposed, follows handoff §63)

Proposed stack (greenfield, matches §50): TypeScript monorepo — Vite +
React mobile web (`src/…`), a small Node API (`server/…`, e.g. Hono or
Express) with SQLite for sessions/memory in the slice, JSON seed under
`seed/nakhon-pathom/golden/`, Vitest for unit/engine tests, Playwright
(WebKit + iPhone viewport) for the golden E2E.

1. Scaffold repo + tooling (typecheck, lint, test, CI).
2. Types for the world model, memory, graph, invariant, session (§7–22).
3. Golden seed for **THE LOST IMAGE only** (P001, P002, Horse Rider, its
   facts/interpretations/sources, CONNECTION-HORSE-CHULA, DISC-001,
   EXP-LOST-IMAGE-001, 3 unknown neighbours).
4. Publish validators (fact→source, edge→evidence, invariant) + failure tests.
5. Adventure state machine on the server + idempotent events + tests.
6. `POST /api/discover` with hard filters (safety, availability,
   feasibility, invariant, time) and configurable ranking; `NO_DISCOVERY`
   path.
7. Memory updates per §39 (DISC-001 = CONNECTED; Chula Prathon **not**
   VISITED).
8. Frontend golden loop screens (§37–40), iPhone-first.
9. Location service (permission, accuracy, debounce, hysteresis, manual
   fallback) + `MapProvider` with a stub, then `LongdoProvider` via server.
10. Offline-after-start cache, debug panel (dev only).
11. Golden E2E + failure tests green → iPhone QA → field test protocol.

---

## RISK LEVEL: **HIGH**

Not because of code quality — because the premise of the handoff (an
existing BUILD #055 codebase to extend) does not hold in the reachable
repositories, and the golden content lacks citable sources required by the
product's own trust rules. Both must be resolved before implementation can
start without either overwriting an unrelated product or inventing data.
