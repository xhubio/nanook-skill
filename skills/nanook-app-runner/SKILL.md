---
name: nanook-app-runner
description: >
  Connects an application to a table-driven Playwright test execution: one shared
  runner over generated suite files, page objects under a common contract, base
  states created via API (login optimization), and resource pooling by effect
  profile. Execution side — table authoring is create-equivalence-class-table.
  Trigger: "connect app to nanook", "table-driven test execution", "page object
  contract", "base state setup", "suite runner", "user pooling", "nanook app runner"
version: 0.1.0
---

# Nanook App Runner — Table-Driven Test Execution for an Application

This skill describes the **execution side** of table-driven testing: how the test cases
that Nanook tables generate become a running Playwright (or API) test suite for an
application — without hand-written spec files per case.

| Question | Skill |
|---|---|
| How do I write the tables (EqClasses, CASCADE, 100%, references)? | `create-equivalence-class-table` |
| How do the tables become a running test execution for an app? | **this one** |

## The Architecture in One Picture

```
Table (.xlsx, source of truth)
    │  build step (nanook-table + a suite writer)
    ▼
suites/*.json          ← NO Playwright vocabulary (deliberately)
    │                     case = base state + actions + expectation (ui/api)
    ├────────────► API runner        checks the API boundary
    ▼
Browser runner (Playwright)          checks the UI boundary
    │  calls per app only a small "connection" object
    ▼
<app>/tests/suites.spec.ts           thin layer: ONE call into the shared runner
```

The division of labor — each row is a hard boundary:

| | who | why |
|---|---|---|
| Which cases exist | **table** | the domain opinion, editable without TypeScript |
| What the page can do and shows | **page object** | abstracts the UI, **never judges** |
| Whether it is correct | **shared runner** | the expectation stays in ONE place |
| What the app does differently | **app connection** | base state + entry point — and ONLY those |
| Base state (data) | **API** | ~50 ms instead of 10–20 s per case |
| Path to the page | **clicked** | only then is "arrived" a statement |

**Why the runner exists ONCE.** Before consolidation there were eleven suite-reading
specs (89–400 lines, four fifths identical scaffolding), later two per-app copies — and
every copy accumulated its own subtleties, of which nobody could say whether they were
intent or oversight. Copying the runner for a new app instead of connecting to it
rebuilds exactly that.

**Why no Playwright terms in the suite JSON.** The same file drives both the API runner
and the browser runner — the same cases hit two independently maintained rule sets. One
browser term in the data destroys that lever.

## Connecting a New Application — Checklist

1. **Register the app with the tooling** (an `apps` registry the build step and all
   guards iterate). An app that is not registered has suites nobody ever checks — the
   guard should **throw** on a registered-but-unwired app rather than skip it silently.
2. **Own port stack per app** so two sessions never share ports — shared ports are the
   most common source of misattributed measurements.
3. **App folder skeleton:**

   ```
   <app>/
   ├── app.ts                  app constants (URLs, run markers)
   ├── base-state.ts           API seeders: createUser, transferSession, create<Entity>…
   ├── browser.ts              cookie banner / consent handling (stays per app)
   ├── pages/
   │   ├── register.ts         suite pattern → page object (the registry)
   │   └── <page>.ts           one module per form/list, under the page contract
   ├── suites/*.json           generated — NEVER written or amended by hand
   ├── tests/suites.spec.ts    thin layer: one call into the shared runner
   └── playwright.config.ts    workers: 1 until concurrency is MEASURED safe
   ```

4. **The app connection object** — deliberately small; every extra field is a place
   where apps may drift apart again:

   | Field | What |
   |---|---|
   | `suitesDir` | the app's `suites/` folder |
   | `register` | suite pattern → page object. A suite without a registry entry is **reported**, never skipped — otherwise a new table counts as "tested" with zero cases |
   | `countryFrom` | locale/country derived from the suite name |
   | `cookieBanner` | consent handling, passed in per app |
   | `baseState` | establishes the starting point, returns the session cookie (lists seed their inventory with it — a second login would be a second user) |
   | `entry` | entry page + proof of login; differs per app and should be **measured**, not assumed (some apps redirect `/` to `/login` despite a valid session) |
   | `runtimeMarkers?` | markers whose value only this run knows (`marker::currentUserEmail`). Omitting is a **statement** ("my pages resolve their own"), not an oversight |

## Page Objects — the Page Contract

The contract lives **once**, shared by all apps. Never copy it per app: two classes of
the same name are not the same class, and the shared runner's `instanceof` will report
correct app behavior as a test failure.

### The four ground rules

1. **No `expect` inside a page object.** The page **observes and computes**; the runner
   judges. A module with its own assertion moves the expectation to where the domain
   owner no longer sees it (it belongs in the table).
2. **`Page` only as `import type`.** The module delivers data; it does not own a browser.
3. **Signatures come from the declared contract, not from the neighboring module.**
   Agreement that exists only because everyone copied the same example is a habit, not an
   interface — a missing return value silently becomes `undefined`; only a declared type
   turns the deviation into a compiler error.
4. **Three outcomes, not two**: accepted / rejected AND `NotEnterable` — "the UI cannot
   even be asked this question" (a filtered dropdown cannot take an invalid value). The
   application behaves correctly; without the distinction that correctness lands in the
   defect list.

### The two page kinds

**Create page** (`kind: 'create'`): `goThere(page, ctx)` → `operate(page, props)` →
`reaction(page)` → optional `readBack(page, wasSet)`.

- `operate` returns the prop names **this form does not have** — don't throw, don't
  swallow: a field the table knows and the form lacks is a report finding, not a case
  abort.
- The reaction carries a `source` (`form` | `browser` | `server`) — "the form catches it"
  versus "only the server does" is a statement. The third state `silent` (form still
  there, nothing reported) is the worst one and needs its own word.
- `readBack` receives the values that were set and returns what was read plus
  deviations — whether a deviation is bad is the runner's call.

**List page** (`kind: 'list'`): `readState` → `inventory(authCookie)` →
`instructions(tc)` → `check(state, inventory, instructions)`.

- **`inventory()` RETURNS the seeded records — the return value is the point.** What the
  list should show is **computed** from it, never asserted next to it. A seeding function
  without a return value lets expectation and inventory drift apart.
- Filter/sort/search knowledge lives in the page object (`instructions`), not in the
  runner — every list has different columns, states, and quirks; that is exactly why.
- `check` returns **findings**, not an abort: a list with wrong metric tiles AND wrong
  sort order should say both.
- Read row fields through a guarded accessor that **throws on a missing key**, never via
  direct property access: a dead reader makes a sort check not red but **empty**
  (`[undefined, …]` is "sorted"), and empty looks exactly like correct.
- No `?` on fields that a check reads: the `?` switches the compiler off as a witness —
  a module can then read a field it never sets, and the check passes emptily.

### `basis` — what the page presupposes

Each page declares the base state it needs as **one word** (e.g. `nothing` | `user` |
`signedIn` | `tenant`), not as a function: what gets built is the app's business (it has
the context, page, and credentials). Notes:

- `user` is not the weaker form of `signedIn` but the opposite statement: *a user exists
  and the browser is signed out* — needed only when the login form itself is the test
  subject.
- The type is the **union over all apps**; enforcement is a **runtime** statement: a
  base-state builder receiving a value its app doesn't know **throws** ("this app has no
  tenant concept").

## Base States — the Login Optimization

> **Data via API, path via clicks.** Setup through the UI costs 10–20 s per case, via
> API ~50 ms — factor 200–400. The path to the page under test is still clicked: only
> then is "arrived" a statement.

The pattern (with email verification enabled):

```
1) POST /api/auth/sign-up          create the user (unconfirmed)
2) confirmation link from the mail mock — via the FRONTEND URL, like a real user
3) POST /api/auth/sign-in          → set-cookie: session token
4) context.addCookies(...)         → the browser is signed in
```

Four traps, all real:

1. **The `Origin` header is mandatory** for auth frameworks like better-auth when
   calling from Node — without it: `403 Missing or null Origin`.
2. **The mail-mock port is a parameter, not an assumption** — a QA run may start the
   mock on a free port; the mail is then there and nowhere else.
3. **Mock mail lists are paginated** — without searching by address and a sufficient
   `limit`, your own mail hides behind everyone else's.
4. **A registration is unique per database.** Suites carry the addresses rolled at
   generation time; from the second run on they are taken — and "user already exists" is
   a rejection that turns a case green which expected a DIFFERENT rejection. Put a
   per-run marker into every address; for over-length addresses insert it
   **length-preserving** so the boundary case stays a boundary case.

**The table's secondary data is the pre-state** — the base-state builder reads it and
establishes it. Verify **every key you read against a real suite file**: a reader
comparing against a key no suite ever writes is wrong in every run, silently, and the
run stays green while the domain case never executes.

## Resource Pooling by Effect Profile

> **The pool key is the effect profile, not the test case.** 15 permission profiles
> across 400 test cases means ~15 users, not 400 — registration + confirmation + login
> is the most expensive setup, and it differs only per profile.

This is the same dedup rule as for base states in the tables ("a base state may only
exist if at least one assertion differs because of it"), applied to runtime:

1. **In the table** the permission profile is a secondary-data class (or a base state
   with `Execute = F`): `permissions: read_only`, `permissions: accountant`, …
   Deduplicate profiles BEFORE building — two profiles with identical effect profiles
   are one duplicate that costs runtime forever.
2. **In the base-state builder** lives the pool: a map profile → credentials, filled
   lazily — the first case of a profile creates the user, all later ones reuse it.
3. **Group execution by base state** so setup runs once per group (suites cut per table
   already do this; for cross-cutting pools use a worker-scoped fixture).

**The counter-rule, without which the saving gets expensive — share only what the test
does not mutate:**

| Case | User |
|---|---|
| Test checks what a profile may **see/do** (permission checks, lists, reads) | shared, from the pool |
| Test **mutates user-owned state** (password, profile, settings, inbox) | own user — or the pool user after the case is not the one before |
| Test mutates **tenant-owned state** | own tenant, OR serialize those cases — a shared user is a collision domain |

Parallelism stays a measurement: a pool additionally couples cases of the same profile.
Whoever raises `workers` first measures that pool users are collision-free.

## Runner Invariants You Must Not Break When Connecting

1. **Suites are never written or amended by hand** — changes go table → build → new
   JSON. A test case without a table row is an error.
2. **The suite format knows no framework vocabulary** — one file, two runners, two
   independent rule sets checking the same case.
3. **Directives and markers are resolved by the RUNNER, never by the data or the page.**
   Measured failure mode: a runner sent `gen::blank` as a literal string — the "field
   empty" cases were green because the server rejected the eleven characters as an
   invalid address, and the actual question was never asked. An unknown directive prefix
   **throws**.
4. **Gaps are a third outcome, never a silent skip**: a case without a fixture is
   counted and named (a `gap` outcome in the API runner, `test.skip` with a reason in
   the browser) — neither success nor failure.

## Verification After Connecting

1. Get a base-state-only spec green first (setup isolated, no test subject).
2. Run one suite, then the full run.
3. Read the runner's report list: "suite without a page" is a finding, not noise — every
   reported suite needs a registry entry or a deliberate `apiOnly` marking.
