---
name: nanook-test-flow
description: >
  Connects Nanook data tables (decision and matrix tables) into executable test flows:
  a flow table where one row is one test and the columns are its steps, each step
  referencing a case of a data table, a page action, or a registered function that
  takes its data by reference. Covers the flow table format, the step grammar, the
  runner contract (namespaces, consumed expectations, boundaries), the function
  registry with its "why not a table" rule, and the mistakes that turn flows back into
  code. Trigger: "test flow", "flow table", "connect tables to a test", "sequence of
  table cases", "nanook flow", "data reference for a function", "ablauf tabelle"
version: 0.1.0
---

# Nanook Test Flow — From Data Tables to a Test Sequence

Nanook's decision and matrix tables describe **what a thing is** and **what it becomes**
(`create-equivalence-class-table`). A running suite executes each case in isolation
(`nanook-app-runner`). What neither covers is the **sequence**: create a customer, save,
open it, check it; create three bookings, book them, run the VAT return, compare. This
skill describes the third table kind — the **flow table** — and the runner that drives it.

| Question | Skill |
|---|---|
| How do I write decision / matrix / specification tables? | `create-equivalence-class-table` |
| How do the generated cases become a running suite for an app? | `nanook-app-runner` |
| How do I chain cases from several tables into one test? | **this one** |

🔴 Nanook itself (`@xhubio/nanook-table`) does **not** know flow tables. Its processor
handles `<DECISION_TABLE>` and `<MATRIX_TABLE>`; on a `<FLOW_TABLE>` it throws *"There is
no parser for the table type"* — and since a processor loads all workbooks of a folder
together, one flow sheet in the data folder breaks the whole build. Flow tables live in
their **own folder** and have their **own reader** (`references/flow-reader.ts`; the reference
resolver shared with the matrix runner is `references/fall-referenz.ts`).

```
testdata-definition/
├── data/   — decision and matrix tables   (nanook reads them → suites/*.json)
└── flow/   — flow tables                   (the flow reader reads them → the flow runner)
```

## The Flow Table

**One row is one test. The columns are its steps, in order.** A1 holds `<FLOW_TABLE>`,
row 2 is the header, three fixed columns come first.

```
tc_id │ name        │ description │ <fn:function>       │ CustomerCreate │ <pc:customer> │ CustomerCreate<mode:check>
TC1   │ round trip  │ …           │ businessWithLogin   │ OK_1           │ save          │ OK_1
TC2   │ rejected    │ …           │ businessWithLogin   │ E_noName       │ save          │
```

The rule is the same for every column: **the header says where the step comes from, the
cell says which one.** An empty cell means *this test does not take this step*.

| Header | Cell | Meaning |
|---|---|---|
| bare sheet name (`CustomerCreate`) | `OK_1` | one case of that decision table — enter its fields |
| same | `A1..A6` | a **range**: six cases, one call each |
| `CustomerCreate<mode:check>` | `OK_1` | **the same case, read back**: open the record and assert exactly these values |
| `<fn:name>` | `businessWithLogin` | a registered function (cell = function name) |
| `<fn:book>` | `ref::BookingCreate::OK_1` | a registered function **with a data reference**: the function takes its inputs and its expectation from that case |
| `<pc:customer>` | `save` | a control of the page class `customer` — the runner clicks it |
| `…@label` | — | a **label** for the reader (`@beforeSend`), no effect |
| `<pc:…>` / `<fn:…>` with `-` suffix on the cell | `save-` | "must be rejected" — only where no table carries the expectation |

Why this orientation: an earlier draft had steps as rows and flows as columns. Then every
genuinely different test needs its own sheet. With rows as tests, one sheet holds a whole
family, and two tests use **different cases of the same table** (TC1 takes `OK_1`, TC2
takes `E_noName`) without a new sheet.

### The expectation lives in the referenced table — and it is consumed

A table step only *enters* data. Nothing is measured until the next `<pc:>` step submits.
The runner remembers the expectation of the case (`accepted` / `rejected`, as the decision
table declares it) and settles it at the next page action. **If an expectation is still
open at the end of the row, the test is red**: the row named a case whose outcome nobody
looked at — the most common way to be green without knowing anything.

**Effects are measured per row, not only accepted/rejected.** A matrix or decision case
may carry effect rows (a number assigned, a field frozen, a balance) — the same
"payload, not arrival" rule as for single cases. The API boundary of a table carries a
`probe`; after a verb's read-back the runner checks every effect row of the referenced
case. 🔴 A case with effect rows whose boundary has no probe makes the step **red** ("an
effect without an instrument"), never silently green.

Consequences:

- No `3-` markers on table cells: the case already says whether it is an error case.
- No `<check:name>` column with an expected value in the cell. That was tried and removed:
  it declared an assertion for which no measuring instrument existed. `<mode:check>` on
  the data column reuses the fields the table already has — same cell, same case, written
  once and read once.
- A `<mode:check>` cell must name **the case that was entered**. A runner that reads the
  name and compares against "whatever was entered" would let
  `CustomerCreate=OK_1 → …<mode:check>=OK_minimal` pass green while claiming to have
  checked `OK_minimal`.

### The step context — namespaces instead of handles

Each test has one context. Every step writes its result into its **namespace**, and the
namespace is *what the step is*: the function name for `<fn:>`, the table name for a data
column, the page class for `<pc:>`. A later step reads `ctx.all.CustomerCreate.id`.

Registered functions get an interface: `own` (read/write, free keys) and `all` (read-only;
reading an **unset** key throws instead of yielding `undefined`). Two functions that form
a pair (`rememberHash` / `checkHash`) are written together and know each other's name —
no `@handle` mechanism is needed. Several columns on the same namespace are several
writes; the last wins, like any variable. The report carries the context after each step,
so this stays visible.

**Two objects of the same table** (a parent and a child category, two invoices, 25
customers) are **not** addressed through labels. The identity of a created object is
**sheet + case**: next to `ctx.all.CategoryCreate` (the last one written) the runner keeps
`ctx.all['CategoryCreate/OK_parent']` per created case, and a later step or a field of a
case addresses it as `ref::CategoryCreate::OK_parent` — in a secondary field
(`parentCategoryId = ref::CategoryCreate::OK_parent`, Nanook cascades such fields) or in
the cell. A second object is a **second case**; the same case twice in one row is one
identity (the second call overwrites). No new vocabulary, and `@label` stays a label.

### The data reference for functions — the rule that keeps code out of Excel

A registered function used to be a black box: the cell named it, and everything it
needed — values *and* expectations — lived as literals in code. Measured on a real
suite (2026-09-10): 78 registered functions, 24 direct `create` calls on entities that
**had** a data table, and expectations computed from the same constants as the inputs.
Such a test cannot go red: input and expectation are one literal.

The fix is not a new step kind. **The header names the verb, the cell names the noun:**

```
<fn:book>                     │ <fn:book>                          │ <fn:finalize>                          │ <fn:dispose>
ref::BookingCreate::OK_1      │ ref::BookingCreate::OK_expense     │ ref::InvoiceTransitions::draft→finalize           │ ref::AssetCreate::OK_3
```

- `ref::<Sheet>::<Case>` is Nanook's own reference syntax, shortened. The full form is
  `ref:<instance>:<Sheet>:<part>:<Case>` (`ReferenceDirective`): the **instance id**
  distinguishes several objects made from the same table, the **part** selects one field
  of it. An empty part means "the whole object" — in a table's primary section that is
  Nanook's *field merge* (the case's fields are mixed in). 🔴 To address an object you
  created, name the part: `parentCategoryId = ref:1:CategoryCreate:id:OK_root` creates
  instance 1 of `OK_root` as a whole object and takes its `id` — a value that exists only
  after creation, which the resolver reads from `ctx.all['Sheet/Case#instance']`. Two
  categories are `ref:1:…` and `ref:2:…`; the same instance twice is the same object; a
  tree of depth five is a chain of five cases. Primary data, secondary data, matrix axes
  and flow cells read the **same** form — one word, one meaning. (The project first tried
  to introduce a second word for "address"; the collision was a forgotten part, not a
  missing word.)
- The runner resolves the case and hands it to the function: `args.case = { sheet, tc,
  fields, secondary, expectation }`. The function reads its values **from there** — no
  literals.
- The case's expectation is consumed like a table step's. A function's verdict is held
  against `case.expectation`, never against a `-` suffix; a `-` on a referenced cell is a
  read error (two expectation sources would hide each other).
- A **matrix cell** reference (`ref::InvoiceTransitions::draft→finalize`) yields the start state (the
  row, itself a `ref::` to a create case), the action (the column) and the expected
  outcome (the cell). "finalized × edit = forbidden" becomes one cell, not a function.
- A function declares whether it needs a case (`needs: 'case' | 'none'`). One that needs a
  case and is called without a reference throws — no silent fallback to literals.
- A verb declares its call kind (`kind: 'mutation' | 'query'`): a tRPC query called as a
  POST answers 405, the state does not change, and a "nothing changed" check would pass
  green without ever having called the procedure.

What legitimately stays a function, with the `reason` field that every registry entry
must carry: a **file** as input or output (the cell can name a fixture, but the bytes are
not a table), a **second party** (second browser context, portal token), the **base
state** (register, log in, transfer the session — every row would be identical), and
**evaluations over a set** (a VAT return over a period, a filter over many items). Even
those take their **expected numbers** by reference from a table.

🔴 "It is a sequence, not a case" is **not** a reason. That sentence describes the matrix
table exactly (rows = states, columns = actions, each cell a case). If 24 functions in a
registry carry that reason, the vocabulary is missing a reference, not the tables a form.

## The Runner Contract

The flow runner is ~400 lines of app code (`references/runner-skeleton.md`). It does not
replace the suite runner; it reuses its suite files, page objects and API boundaries.

| What | Who decides |
|---|---|
| Which steps, in which order | the **flow table** |
| Which values a step enters | the **decision table** (by case name) |
| Whether the outcome is right | the **decision/matrix table** (expectation), never the runner |
| What the page can do | the **page object** (contract from `nanook-app-runner`) |
| Which boundary a table is driven at (UI mask or API) | the app's **register** — one place, no second mapping in the flow runner |
| Everything that cannot be a table | the **function registry**, each entry with a `reason` |

Invariants the runner enforces:

1. **One API starting point per test.** The first step that needs one creates it (from the
   table's boundary or from what the function names); a later step demanding a *different*
   one throws. Running the second silently inside the first is half a precondition that
   looks whole. **Action sheets** (`ChecklistTick`, `TimeEntryBill`) therefore have **no
   starting point of their own**: their precondition — the record the action targets — is a
   data column *before* them in the same row, and the verb takes its target from
   `ctx.all['Sheet/Case']`. A verb never creates its own target. For the isolated suite
   runner the same precondition is a `precondition` hook on the shared starting point, not
   a separate `setup`; "skip the setup when the target is already in context" was rejected —
   one sheet would have two behaviours, and the skip is a silent fallback.
2. **`<mode:check>` needs a read-back.** A page object without `readBack` cannot check;
   the runner throws instead of passing — an assertion without an instrument only looks
   like one. At the API boundary `<mode:check>` is rejected: what must hold after creating
   belongs as an **effect** into the decision table, where a measurer measures it. But a
   `<mode:check>` on a **UI** column is allowed even when the case was created at the API
   earlier in the row — the check reads "the values of this case" through the page
   object's `readBack`; where the record came from does not matter. That is how a flow
   states "created via API, seen in the mask", the sentence no single table can say.
3. **A broken chain says what was not measured.** On an exception the report lists the
   remaining step headers ("not driven: → …"). A torn chain must not look like a single
   failure when nothing is known about the rest.
4. **Written but never read** is reported, not failed: a step doing work nobody uses.
5. **Timeouts**: a flow is longer than a case by construction (setup, login, navigation,
   form). Raise the per-test timeout; a timeout at a selector reads like a missing testid
   and is usually the 30-second default.

## Connecting a Project — Checklist

1. Create `testdata-definition/flow/` next to `data/`; put nothing but flow workbooks there.
   Decide per workbook whether it is hand-written or built by a script, and commit the source.
2. Add the flow reader (`references/flow-reader.ts`; depends only on `exceljs`) and the
   reference resolver (`references/fall-referenz.ts`). Sheets are
   recognized by `<FLOW_TABLE>` in A1; the reader takes the folder, no per-sheet
   registration.
3. Build the runner from `references/runner-skeleton.md`: dispatch on column kind, keep
   `pending`, resolve boundaries via the app's existing registers, resolve `ref::` via
   the same resolver the matrix runner uses (lift it into a shared module — do not copy).
4. Create `flow/registry.ts` with `FUNCTIONS` (each with `reason`, `run`, optional
   `needsApi`, `needs`) and `PAGE_CLASSES` (**register every page object that exists** —
   an unregistered page object is the most common reason a flow grows a hand-written
   function: measured 1 of 12 registered, 75 lines of manual form driving for a page that
   had a module).
5. Write the first flow sheet with the round trip: base-state function → data column →
   `<pc:>` save → `<mode:check>`. Green, then the mutation probe: change one field value
   in the data table — the flow must go red.
6. Add a guard test with **two upper bounds** — non-verb functions and verbs, counted
   separately (measured count with the commit SHA in the header; each may only fall).
   "Done" is not a number but a rule: every remaining non-verb entry carries a reason
   from the four catalog classes — file · second party or bridge · base state ·
   evaluation over a set — and the reason **names** the file, the party or the aggregate.
   Whatever count that yields is the bound. A bound may rise only when the cause is
   "more measured, not more defects", and the decomposition stands in the commit.

## Mistakes That Turn Flows Back Into Code

- **Function with literals.** `const BOOKINGS = [...]` inside the registry, and the
  expected sum computed from the same array. Replace with `ref::` cells; the sum becomes
  an expectation in the table.
- **"There is no create table for X"** as a reason. That describes a missing sheet, not
  a reason for a function. Add the sheet.
- **"25 identical rows"** as a reason for creating 25 records in code. That is what the
  range syntax (`A1..A25`) is for — check whether the runner implements ranges before the
  reader does; measured: the reader knew ranges, the runner rejected them, and no sheet
  used them.
- **Unregistered page objects.** See checklist item 4.
- **One action sheet with an `action` field** that picks the procedure. One sheet, one
  boundary, one procedure — three operations are three sheets. A dispatch field is a
  second sheet→procedure mapping next to the app's register.
- **Matrix tables that no flow reads.** Five matrix sheets existed, 24 functions
  re-implemented their cells. A matrix cell reference from a function fixes both.
- **Editing a generated artifact** instead of its source. The direction is one way:
  source → `suites/*.json` → runner. The source is **what a human edits and commits**:
  the workbook, if it is written by hand; the **builder script**, if the workbook is
  generated from one (the flow workbook of the reference project is built by a
  1,000-line script with one block per sheet — there, the script is the point of truth
  and the workbook is an output like the suites). Never edit the output; never keep
  both a script and hand edits on the same workbook — the next build wins. When a
  workbook has overtaken its script (hand-made cases the script does not know), let the
  script catch up **once**, prove it reproduces the checked-in workbook cell for cell,
  and add a guard "workbook = builder output" per built sheet so the double source
  cannot come back. Stock data (25 customers) is not a set of equivalence classes: it is
  a **data catalog sheet** referenced as a range, not 25 cases of a decision table.
- **Losing rows when converting.** When a flow moves from `<fn:>` columns to table
  columns, count test rows and verdicts before and after; a sheet whose row count fell is
  a finding, not a cleanup.

## Verification

- Reader unit tests: header kinds, `@label`, `<mode:…>`, ranges, `ref::` cells, `-` on a
  referenced cell ⇒ error, unknown `<kind:>` ⇒ error (never read as a sheet name).
- One flow per data boundary (UI and API) green **and** red under a table mutation.
- The guard on registry size; the count of `<fn:>`-only sheets as a second upper bound.
