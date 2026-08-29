---
name: create-equivalence-class-table
description: >
  Creates formatted Excel files with Nanook tables (decision, matrix, and specification
  tables) for arbitrary test objects (pages, APIs, forms). Includes color formatting,
  formulas, correct marker logic, the CASCADE pattern, multiplicity, tags/filters,
  and 100% coverage.
  Trigger: "create equivalence class table", "create decision table",
  "equivalence class table", "test data table", "nanook table", "matrix table",
  "specification table"
version: 0.1.0
---

# Create a Nanook Decision Table

Creates formatted Excel files with Nanook Decision Tables for arbitrary test objects
(pages, APIs, forms). Includes color formatting, formulas, correct marker logic, and 100% coverage.

## Technology
- **exceljs** (not xlsx) — required for cell styling (fills, fonts) and formulas
- Nanook's `ImporterXlsx` reads the generated file — so the structure must exactly match the ParserDecision format

## The Table Is the Source of Truth — Not the Script That Generated It

A generator script may **create** a table; once it exists, the table is the original, and
human edits to it must survive. If re-running your generator overwrites a hand-edited
workbook, the script is the source and the table a mere printout — nobody will read it,
and errors in the script look correct in the script's own output.

Corollary: **judge coverage by opening the .xlsx**, never by reading the generator's log.
The log shows what the script *intends*, not what is in the workbook.

## Three Table Forms — and When to Use Which

Nanook knows **three** sheet forms, routed by the identifier in cell A1:

> Does the case describe **what a thing IS** → decision table (`<DECISION_TABLE>`).
> Does it describe **what BECOMES of it** → matrix table (`<MATRIX_TABLE>`).
> Does it only describe **which RULES the fields obey** (mandatory, min/max, format)
> → specification table — Nanook generates the decision table from it.

A customer is a decision table. "Customer gets anonymized" is a matrix row. A form of
twelve standard mandatory fields is a candidate for a specification table.

### Matrix tables (`<MATRIX_TABLE>`)

Rows = source states, columns = actions, **every filled cell is one test case**. The real
win are the **empty cells**: in a decision table a forbidden transition must be written as
its own error case — and can be forgotten invisibly. In the matrix it is a hole in a grid,
and a grid can be inspected at a glance.

Geometry traps (both cost real debugging time because they look like logic errors):

- The meta block has **six** labeled rows AND six labeled columns (`name`, `shortName`,
  `position`, `execute`, `generator`, `description`) — labels are checked literally.
- Data starts at row **8** and column **8** (a blank line sits between meta block and
  matrix). Starting at 7 shifts the whole grid and silently produces the wrong number of
  cases.
- `<END>` is required **twice**: in row 0 after the last column AND in column 0 after the
  last row. If one is missing, the sheet is skipped silently.
- Case names are positional (`r1:c2`) — map them to `<source>→<action>` for reports.

### Specification tables

Instead of hand-writing equivalence classes, each row declares a field and its **rules**;
Nanook's `ParserSpecificationConverter` generates a full decision table from it (classes,
one error TC per error class, severity rows).

Three blocks, separated by keywords in column A: the **fields** block (field name,
internal name, one column per rule), the **Severity** block (each rule column needs
exactly one severity), and the **Rule** block (every rule must be defined AND used), then
`<END>`.

Built-in rules: `PK` (adds a "record exists / is new" secondary-data section), `TYPE`
(`string`/`integer`/`float`/`date`/`boolean` with type-specific error classes), `C1`
mandatory, `C2`/`C3` min/max (also add `exactly min`/`exactly max` boundary classes),
`C4` email, `C5` regex. Custom rules: implement `RuleConverterPlugin` and register it on
`createDefaultConverterRegistry()`.

When to use: many fields with standard validation — the classes would be mechanical.
When NOT: as soon as classes are domain decisions (behavior classes, code lists, base
states, CASCADE fine-tuning) — then write the decision table yourself.

**A1-marker trap (nanook-table ≤ 3.0.0):** the docs say `<SPECIFICATION>`, but
`createDefaultFileProcessor()` registered the parser only under
`<SPECIFICATION_TABLE>` — the documented sheet was **silently ignored** (info-level log
only). Fixed in 3.0.1: the factory registers both markers. On older versions write
`<SPECIFICATION_TABLE>` in A1. In general: the `registerParser` key must literally equal
the A1 content.

## 100% Coverage Is the Target for Data Tables

A data/decision table is built to **exactly 100.00%** coverage — less is a finding, not a
style choice. The CASCADE triangle plus multiplicity make this reachable without
exploding the combination count. Three habits keep the target honest:

1. **Pre-calculate before building** (step 5 below): required TCs = sum of all
   non-preferred EqClasses + 1 happy. If the summary formula doesn't hit 100.00%, the
   markers are wrong — not the expectation.
2. **Measure in the workbook, never in the log.** The summary row (column D) is the only
   number that counts.
3. **If the total explodes** (code list, >8 fields): don't lower the target — switch
   tools. Multiplicity for codes that behave alike, sub-tables for field groups.

The only legitimate exception below 100% are **multi-step flow tables** with entangled
dependencies, where the last percent is disproportionately expensive — and even there it
is a deliberate, documented decision, not a leftover. Flows count cases, not
combinations; their referenced data tables still carry the 100% obligation.

## Formulas and Colors Are Mandatory Parts of Every Table

A workbook without living sum formulas and without color formatting is unfinished — even
if Nanook parses it fine. The machine needs neither; the **human** needs both, and the
table is the artifact a human reads.

- **All counts and sums as live formulas** (`{ formula: … }`), never pre-computed
  numbers — a static number silently goes stale after the first human edit. A coverage
  disaster is only *visible* because the formula is in the sheet.
- **Colors follow one rule: blue = input, green = result** (see the color table below).
  At 40+ rows and 20+ TC columns, structure without color becomes an unreadable wall.
- **Acceptance happens in the spreadsheet, not in the log**: open the file, read the
  percentage, see the colors. That is verification step 2 and must not be skipped.

## General Workflow: From Test Object to Decision Table

### Step 1: Analyze the test object
- Which fields does the page/form/API have?
- Which fields are mandatory, which are optional?
- Which validation rules apply? (min/max, format, dependencies)
- Are there logical field groups? (address, date, line items)

### Step 2: Form field groups → table structure
- **< 6 fields**: A single table is sufficient
- **6-8 fields**: Check whether splitting makes sense
- **> 8 fields**: Split into sub-tables (see Multi-Sheet Strategy)
- Align with the test object: UI tabs, API objects, business domains

### Step 3: Define EqClasses per field
- For each field: Which equivalence classes exist? (see patterns below)
- At least 2 EqClasses per field (valid + at least 1 invalid/variant)
- Choose descriptive names: "valid", "empty", "tooLong", "negative"

### Step 4: Plan test cases
- 1 happy-path TC (all fields valid)
- 1 error TC per non-preferred EqClass (for 100% CASCADE)
- Optional: additional valid variants (e.g. optional fields empty)
- TC order: **error TCs first, valid TCs last** (more readable CASCADE)

### Step 5: Pre-calculate coverage
```
total = product of all EqClass counts
Required TCs for 100% CASCADE = (sum of all non-preferred EqClasses) + 1 happy
```

### Step 6: Generate and verify the Excel file
- Run the script → generate the Excel file
- Open it in a spreadsheet app → check colors, formulas, markers
- Run Nanook generate → verify the fixtures

## Column Layout (ParserDecision)

| Column | Content |
|--------|--------|
| A (1) | Name / field name |
| B (2) | Section type (FieldSection, FieldSubSection, ExecuteSection, ...) |
| C (3) | Equivalence class name / count (on FieldSubSection header) |
| D (4) | Generator / TDG |
| E (5) | Comment |
| F+ (6+) | Test case columns |

## Row Order in the Excel File

```
<DECISION_TABLE>     ← Header with TC names in column F+
Execute              ← ExecuteSection: T/F per TC
NeverExecute         ← NeverExecuteSection: T/F (optional)
Multiply             ← MultiplicitySection: 1 per TC
FieldSection         ← Group header (e.g. "Billing Address")
  FieldSubSection    ← Field header (e.g. "billingName"), C=COUNTA formula
    EqClass rows     ← Equivalence classes with markers
  FieldSubSection    ← next field
    ...
GeneratorSwitch      ← GeneratorSwitchSection (optional)
Filter               ← FilterSection (optional)
Summary              ← SummarySection with coverage formulas
Expected Result      ← MultiRowSection (error codes as rows, see below)
Category             ← TagSection with "negative"/"valid" rows
<END>
```

## All Section Types (10 total)

### Always used
| Section | Type | Rows | Description |
|---------|-----|--------|-------------|
| FieldSection | Multi-Row | 1+ FSS | Groups fields (e.g. "Billing Address") |
| FieldSubSection | Multi-Row | 1+ EqClass | One field with its equivalence classes |
| ExecuteSection | Single-Row | 1 | T=generate, F=only usable via reference |
| MultiplicitySection | Single-Row | 1 | How often to generate the TC (default: 1) |
| SummarySection | Single-Row | 1 | Coverage calculation (max. 1 per table) |
| MultiRowSection | Multi-Row | 1+ | Expected results, error messages, actions |
| TagSection | Multi-Row | 1+ | Labels/tags for TCs (happy-path, smoke, etc.) |

### Optional / advanced
| Section | Type | Description |
|---------|-----|-------------|
| NeverExecuteSection | Single-Row | Opposite of ExecuteSection: T=do not generate when referenced |
| FilterSection | Multi-Row | Filter expressions for conditional TC inclusion. Only on master TCs, not on referenced ones |
| GeneratorSwitchSection | Multi-Row | Disable specific generators per TC |

### ExecuteSection values
- **True**: `x`, `1`, `y`, `j`, `yes`, `ja`, `si`, `true`, `ok`, `T` (case-insensitive)
- **False**: `F` or any other value
- **CAUTION**: 'x' is recognized as TRUE! For sub-tables always use 'F'

## Marker System

### Marker types
| Marker | Meaning | COUNTA | Data generation |
|--------|-----------|--------|------------------|
| `x` | Selected (only value) | Yes | Is used |
| `a` | Preferred (among several) | Yes | Is preferred |
| `e` | Fallback (among several) | Yes | Only when no `a` is present |
| `i` | Impossible (logically impossible) | Yes | Is NOT used |
| empty | Not marked | No | Not used |

### Marker rules by test-case type

**1. Target field (the field this TC tests):**
- Mark ONLY the target EqClass with `x`
- Leave all other EqClasses empty
- COUNTA = 1

**2. Happy-path TC, non-target field:**
- Mark ONLY the valid EqClass with `x`
- No `e` on invalid values (logically wrong: "all valid" cannot cover "Invalid > 100%")
- COUNTA = 1

**3. Error TC, non-target field — do NOT open all fields blanketly:**

The obvious rule ("valid EqClass `a`, all others `e`, on EVERY non-target field") is
wrong: it double-counts coverage and can mathematically **never** reach 100%. Each error
TC that leaves the other fields open claims their entire subspace; a later TC that opens
the same fields buys the same space twice. Measured on an 18-field table: **1168.33%**.

Correct is the **CASCADE triangle** (full chapter below): a field is *open* (`a` on the
preferred class, `e` on the rest) only in the error columns of fields **BEFORE** it in
field order. From its own block on it is *closed*: exactly one `x` on the preferred
class. The sum then telescopes to exactly the total.

The triangle assumes TCs ordered by field and exactly one error TC per non-preferred
EqClass. Where that does not hold (entangled dependencies, conditional fields), don't
force the shape — **measure the overlap** instead: the goal is "no double counting", not
the pattern itself.

**4. Impossible (`i`):**
- For logically impossible combinations (e.g. UI hides the field)
- Counts for COUNTA/coverage but is not generated
- Serves to bring the table to 100% coverage

### Rule: Single marker = always `x`
When only ONE EqClass is marked for a field in a TC, `x` must be used (not `a`).

### Multiple candidates of the same tier are chosen RANDOMLY

`a` and `x` form ONE preferred set; if several rows of a field carry them in the same TC,
Nanook picks one at random (`Math.random`) — likewise among several `e` when no `a`/`x`
exists. Two `x` on the same field are therefore not an error but a **non-deterministic
test case**: the same run produces sometimes one class, sometimes the other. CASCADE
avoids this (exactly one `a`); if you deviate, know what you get. Also: any non-empty
value other than `a`/`x`/`i` counts as `e` — a typo like `w` silently participates in the
selection.

## Formulas (all values as Excel formulas, no static numbers)

### FieldSubSection header (column C)
```
=COUNTA(C_eqStart:C_eqEnd)
```
Counts the EqClass names → yields the number of equivalence classes.

### FieldSubSection header (TC columns)
```
=COUNTA(F_eqStart:F_eqEnd)
```
Counts the markers per TC → yields how many EqClasses this TC covers.

### Summary (column C) — total combinations
```
=C_fss1 * C_fss2 * C_fss3 * ...
```
Product of all FieldSubSection C values = total number of possible combinations.

### Summary (TC columns) — per-TC coverage
```
=F_fss1 * F_fss2 * F_fss3 * ...
```
Product of all FieldSubSection COUNTA values for this TC.

### Summary (column E) — sum of all TC coverages
```
=SUM(F_summary:lastTC_summary)
```

### Summary (column D) — percentage
```
=E_summary / C_summary
```
Format: `0.00%`

## Color Formatting

| Row type | Background | Font |
|---|---|---|
| `<DECISION_TABLE>` header | Dark blue #0070C0 | White, bold |
| ExecuteSection | Blue #4472C4 | White |
| MultiplicitySection | Blue #4472C4 | White |
| FieldSection header | Blue #4472C4 | White |
| FieldSubSection header | Blue #4472C4 | White |
| EqClass data rows | No fill | Default |
| SummarySection | Green #00B050 | White, bold |
| MultiRowSection header | Green #00B050 | White, bold |
| MultiRowSection data | No fill | Default |
| TagSection header | Green #00B050 | White, bold |
| TagSection data | No fill | Default |
| `<END>` | Blue #4472C4 | White |

> The rule behind the list, instead of memorizing colors: **blue = input, green =
> result.** Everything up to and including the fields is blue (what the test PUTS IN);
> everything from the summary on is green (what COMES OUT — coverage, reaction, effect,
> tags).

## TC column formatting
- Horizontal: center
- Vertical: middle
- Width: 5

## Column widths
- A (Name): 25
- B (Type): 20
- C (EqClass): 30
- D (Generator): 15 (or 35 if no percent in D)
- E (Comment): 30

## EqClass Patterns for Common Field Types

Invalid EqClasses should always have `errorCode` and `errorMessage`. These are rendered
in the Expected Result section as their own rows (see "Expected Result — error-code rows").
Valid variants (e.g. `credit_note` as an alternative type) have no `errorCode`.

### Mandatory text field (e.g. name, street)
| EqClass | Generator | Comment | errorCode | errorMessage |
|---------|-----------|-----------|-----------|-------------|
| valid | `gen:N:faker:person.fullName` | Valid value | — | — |
| empty | `` | Mandatory field empty | `NAME_EMPTY` | Name is a required field |
| whitespace | `   ` | Only whitespace | `NAME_WHITESPACE` | Name must not consist of whitespace only |
| tooLong | `gen:N:faker:string.alpha(300)` | Exceeds max length | `NAME_TOO_LONG` | Name exceeds max length |

### Optional text field (e.g. notes, comment)
| EqClass | Generator | Comment | errorCode |
|---------|-----------|-----------|-----------|
| valid | `gen:N:faker:lorem.paragraph` | Valid value | — |
| empty | `` | Optionally empty (valid!) | — (no error!) |

### Email field
| EqClass | Generator | Comment | errorCode | errorMessage |
|---------|-----------|-----------|-----------|-------------|
| valid | `gen:N:faker:internet.email` | Valid email | — | — |
| invalid | `not-an-email` | Wrong format | `EMAIL_FORMAT` | Email has the wrong format |
| empty | `` | Empty (mandatory=error, optional=valid) | `EMAIL_EMPTY` | Email is a required field |

### Numeric field (e.g. quantity, price)
| EqClass | Generator | Comment | errorCode | errorMessage |
|---------|-----------|-----------|-----------|-------------|
| valid | `100` | Valid value | — | — |
| zero | `0` | Zero value (context-dependent) | `QTY_ZERO` | Quantity must not be zero |
| negative | `-1` | Negative value | `QTY_NEGATIVE` | Quantity must not be negative |
| tooHigh | `999999` | Above maximum | `QTY_TOO_HIGH` | Quantity exceeds maximum |

### Date field
| EqClass | Generator | Comment | errorCode | errorMessage |
|---------|-----------|-----------|-----------|-------------|
| valid | `2026-03-01` | Valid date | — | — |
| empty | `` | No date | `DATE_EMPTY` | Date is a required field |
| invalid | `not-a-date` | Not a valid date | `DATE_FORMAT` | Date has the wrong format |
| past | `2020-01-01` | Date in the past | — (often valid) | — |
| future | `2030-12-31` | Date in the future | — (often valid) | — |

### Select/Dropdown (e.g. country, type)
| EqClass | Generator | Comment | errorCode | errorMessage |
|---------|-----------|-----------|-----------|-------------|
| valid | `DE` | Valid value | — | — |
| invalid | `INVALID` | Not in the list | `COUNTRY_INVALID` | Invalid country code |
| empty | `` | No selection | `COUNTRY_EMPTY` | Country code is a required field |

### Boolean/Checkbox
| EqClass | Generator | Comment | errorCode |
|---------|-----------|-----------|-----------|
| true | `true` | Enabled | — |
| false | `false` | Disabled | — |

### Notes on EqClasses
- Not every field needs every variant — only the **business-relevant** ones
- Fewer EqClasses = smaller combination space = easier to reach 100%
- `i` (impossible) for logically impossible combinations (e.g. UI hides the field)
- For dependencies between fields: check whether references/self-refs are needed
- **errorCode** only on EqClasses that trigger an error, NOT on valid variants
- **errorCode** should match the system's actual error code (e.g. API error codes)

## Data in Cells: Static, Generator, Reference

### Static data
Any value that does NOT start with `gen:` or `ref:` is used directly as test data.
```
DE              ← Used as the string "DE"
100             ← Used as the string "100"
not-an-email    ← Used as a string
```

### Generator syntax
```
gen:<instanceId>:<generatorName>:<parameter>
```
| Part | Description |
|------|-------------|
| instanceId | Groups related generations. Same ID = same data |
| generatorName | Name of the registered generator (e.g. "faker") |
| parameter | Generator-specific (e.g. faker function) |

**Instance-ID reuse** — related fields:
```
gen:1:faker:person.fullName    ← Person 1
gen:1:faker:internet.email     ← Email of person 1 (same instance!)
gen:2:faker:person.fullName    ← Person 2 (different instance)
```

**Common faker functions:**
```
person.fullName, person.firstName, person.lastName
internet.email, internet.url
location.street, location.city, location.zipCode, location.country
lorem.paragraph, lorem.sentence, lorem.word
commerce.productName, commerce.price
string.alpha(N), string.numeric(N), string.uuid
date.recent, date.future, date.past
phone.number
```

### Self-references
Reference another field in the same test case:
```
ref:::fieldName:    ← Value of "fieldName" in the same TC
```
Useful when a field depends on the value of another.

### Composing values from other fields — post-processing

**One cell carries exactly ONE directive** — generator, reference, or static value.
Chaining two `ref:` in one cell does not work. The way to compose (`"{firstName}
{lastName}"`) is a **generator with post-processing**: `createPostProcessDirectives()`
registers the need, `postProcess()` runs **after all generators finished** ("to resolve
dependencies on data produced by other generators") and may write into
`request.testcaseData`. Field order in the table is irrelevant for this — the composed
field may sit above its sources.

Three rules that matter here:
1. `doGenerate` returns a recognizable placeholder, not the empty string — if it survives
   into the result, post-processing did not run, and an empty string would be
   indistinguishable from an intended blank.
2. A missing source field is an abort, not a gap — otherwise a half-composed value
   surfaces only in the browser.
3. Uniqueness belongs in the generator, where it can be enforced (e.g. email addresses
   that act as login keys) — and an enforcement that never triggered is
   indistinguishable from a broken one, so force the collision in a dedicated test.

### Generator lifecycle — order, retry, persistence

| Knob | What it does |
|---|---|
| `order` (default 1000) | generator directives execute in ascending order — a generator that needs another one's output gets sequencing via a smaller number on the supplier |
| `undefined` retry | if `generate()` returns `undefined`, the processor **defers** the directive and retries later — the mechanism for "my dependency is not there yet". An intended blank is `''`, not `undefined` |
| `loadStore()`/`saveStore()` | run once before/after the whole run — the place for persistence across runs (e.g. issued email addresses, to avoid collisions in the NEXT run) |

**`generate()` memoizes per `instanceId`**: "for the same instance ID, the same generated
data object is expected." A test calling the same generator twice with the same ID gets
the FIRST value back the second time — and measures nothing. One ID per call.

## Test Case Definition

Every test case needs:
1. **Name** (in the header) — sequential (`invalid_1`, `valid_1`) in sub-tables, descriptive in main tables
2. **Type**: happy-path or error TC (determines marker logic)
3. **Target field(s)**: which field(s) this TC tests
4. **Target EqClass**: which EqClass is selected on the target field
5. **Expected result**: error-code row with `x` marker (or `valid` row)
6. **Category**: `negative` or `valid` row with `x` marker

### TC naming: sequential vs. descriptive

| Case type | Naming | Example | Reason |
|---|---|---|---|
| **Error case** | Sequential | `E_1`, `E_2`, …, `E_n` | Range references `[E_1-24]` require consecutive numbers |
| **Valid case** | Descriptive | `OK_1`, `OK_vat_empty` | Referenced individually — readability matters more |
| **Base state** (Execute=F) | Descriptive | `record_exists`, `user_unconfirmed` | Referenced by name on purpose |

Caution: "main tables can use descriptive names because they are never range-referenced"
stops being true the moment a **suite table** collects their cases by range — then the
main table is range-referenced too. The descriptive text is not lost: put it in a **tag
row** (`description`) so it travels with the generated data. A red run reporting only
`E_17` is unreadable otherwise.

## Data Structures for Field Definitions

```typescript
interface EqClass {
  name: string          // EqClass name (e.g. "valid", "empty")
  generator: string     // Generator/value (e.g. "gen:1:faker:person.fullName")
  comment: string       // Description
  targetTcs: string[]   // Which TCs select this EqClass as target
  preferred: boolean    // Is this the valid/preferred value?
  errorCode?: string    // Expected error code when this EqClass triggers an error
  errorMessage?: string // Human-readable error description for the expected-result row
}

interface FieldDef {
  name: string          // Field name
  eqClasses: EqClass[]  // Equivalence classes
  targetTcs: string[]   // Which TCs test this field
}

interface SectionDef {
  name: string          // Section name (e.g. "Billing Address")
  fields: FieldDef[]    // Fields in this section
}
```

## Expected Result — Error-Code Rows

Instead of generic "valid"/"error" values, error codes are rendered as **separate rows**.
This is more readable, because error codes and error descriptions have more room.

### Structure

```
Expected Result  | MultiRowSection |                        |                                        | TC1 | TC2 | ... | valid_1
                 |                 | valid                  | Data is valid, no error                |     |     |     |   x
                 |                 | NAME_EMPTY             | Name is a required field               |  x  |     |     |
                 |                 | NAME_WHITESPACE        | Name must not be only whitespace       |     |  x  |     |
                 |                 | EMAIL_FORMAT           | Email has the wrong format             |     |     |  x  |
                 |                 | valid_variant          | Valid variant, no error                |     |     |     |
```

### Rules

- **Row `valid`**: `x` on all TCs that expect no error (happy-path)
- **Error-code rows**: one row per unique `errorCode` from the EqClasses
  - Column C: error code (e.g. `NAME_EMPTY`)
  - Column D: human-readable error description (`errorMessage`)
  - TC columns: `x` on the TC that triggers this error
- **Row `valid_variant`**: `x` on TCs whose target EqClass has no `errorCode`
  (e.g. `credit_note` as an alternative invoice type — valid, but not preferred)
- Error codes are derived from the `errorCode` property of the TC's target EqClass
- A TC has exactly **one** error-code row with `x` (or `valid`/`valid_variant`)

## Category TagSection

Instead of a single "category" row with values, `negative` and `valid` are rendered as
**separate rows**, each with `x` markers.

### Structure

```
Category         | TagSection      |                        |                                        | TC1 | TC2 | ... | valid_1
                 |                 | negative               |                                        |  x  |  x  |  x  |
                 |                 | valid                  |                                        |     |     |     |   x
```

### Rules

- **Header**: column A = `Category`, column B = `TagSection`
- **Row `negative`**: `x` on all TCs whose target EqClass has an `errorCode`
- **Row `valid`**: `x` on happy-path TCs and TCs without an `errorCode` (valid variants)
- A TC gets `x` in exactly one of the two rows

## Tags + Filters — Running a Subset Without a Second Workbook

The table carries ALL cases; which ones a run executes is decided by **tags** (on the
TCs) plus a **filter** (on the processor). This is the table-side way to a named sample —
a `smoke` tag on the happy paths for CI while the local run drives everything, instead of
two workbooks or commented-out sheets.

1. **TagSection**: the tag value is the **row name** (column C, e.g. `smoke`); any
   non-empty cell in a TC column attaches it. Tags from **referenced** TCs are collected
   too — a case referencing a `smoke` base state carries `smoke` along.
2. **FilterSection**: per row a **processor name** (column C) and an **expression**
   (column D); a non-empty TC cell activates that row for the TC. Filters run only on
   **master** TCs, never on referenced ones.
3. **Registration in the script** — without it the FilterSection has no effect:

```ts
processor.registerFilter(new SimpleArrayFilterProcessor('include', ','))       // only TCs with one of the tags
processor.registerFilter(new SimpleArrayIgnoreFilterProcessor('exclude', ',')) // drop TCs with one of the tags
```

The processor receives `filter(tags, expression)` — `'smoke,regression'` split by the
delimiter, matched against the TC's tags. Custom logic: implement
`FilterProcessorInterface`. The GeneratorSwitchSection is the counterpart on the
generator level (turn individual generators off per TC, e.g. an expensive API-seeding
generator in a dry run).

## Verification After Creation

1. `npx tsx scripts/create-<name>-table.ts` — generate the Excel file
2. Open the Excel file in LibreOffice/Numbers — check colors, formulas, markers
3. `npx tsx scripts/generate-<name>-fixtures.ts` — Nanook parses and generates
4. Verify: correct number of fixtures, data correct

### Errors Land in the LOGGER, Not in a Throw

`TestcaseProcessor` does **not** throw on most defects — dangling references, missing
target tables, unresolvable generators are collected in `logger.entries.error`, and
`process()` returns "successfully". The default logger (`LoggerMemory`) is an instance
nobody looks at: whoever does not pass their own logger and read it afterwards has thrown
away **the only error signal there is**. Since nanook-table 3.0.0 this is pinned as the
contract ("the logger is not optional").

```ts
const logger = new LoggerMemory()
// … process() …
const errors = logger.entries.error ?? []
if (errors.length > 0) process.exit(1)
```

Every generate/check script adopts this pattern — a run without logger evaluation cannot
fail, which makes it a prop, not a check.

## Two Kinds of Tables — Data and Test Cases

The most important distinction lives entirely in the `ExecuteSection`:

| Kind | Execute | Purpose | Example |
|---|---|---|---|
| **Data table** | **F** in EVERY column | only produces data, never runs by itself | `User`, `Company` |
| **Test-case table** | **T** | every column becomes a test case that actually runs | `Login`, `Registration` |

A data table describes an **entity** and is used exclusively via `ref:`. Name it after
the thing (`User`), not after a screen (`Login`) — the same user feeds registration,
login, invitation, and every base state. A data table left on `T` produces test cases
nobody wanted: "user with empty name" is a data record, not a test.

**A test-case table does NOT repeat the field classes.** Field definitions live in the
data table; the test-case table describes only the **cases** and pulls data via range
references (`ref::User:email:[E_1-16]` — all error cases at once). Whoever re-lists the
field classes in the test-case table maintains them in two places from then on — and the
second place drifts.

### Base states — test cases that other test cases use

A base state is not a second concept, just a column with `ExecuteSection = F`: it is not
generated on its own, but very much generated when another test case references it. This
answers "starting from which state do we test?" without every test assembling its own
starting point.

The rule that keeps the catalog small: **a base state may only exist if at least one
downstream assertion differs because of it.** Two states with identical effect profiles
are not a pair but a duplicate — and duplicates cost runtime forever. Enforce it in the
generator script (e.g. `assertNoDuplicateProfiles`) so the rule cannot soften later.

What a base state is NOT: a shortcut to save classes. Fields still need their full
EqClasses (valid/empty/whitespace/invalid) — the base state merely selects the valid one.

### References do NOT resolve across files

A test-case table and the data tables it uses must be **sheets of ONE workbook**.
Spread across files, the reference fails at generation time ("The targetTable 'X' does
not exists") — the table itself looks correct until then.

## References Between Tables (Nanook's Core Feature)

### Concept
A main table can reference sub-tables. The reference is placed as the **generator value** in an EqClass row (column D).

### Reference syntax
```
ref:InstanceId:TableName:FieldName:TestcaseName
```

**CAUTION:** FieldName comes BEFORE TestcaseName! (Code: `parts[3]=targetFieldName, parts[4]=targetTestcaseName`)

| Part | Required | Description |
|------|---------|-------------|
| `ref` | Yes | Keyword (parts[0]) |
| InstanceId | No | Groups related references (parts[1]) |
| TableName | No | Target table, empty = same table (parts[2]) |
| FieldName | No | Specific field, empty = no data value (parts[3]) |
| TestcaseName | Yes | Target test case (parts[4]) |

### Examples
```
ref:1:BillingAddress:billingName:validAddress   ← Field billingName from validAddress in BillingAddress
ref:1:BillingAddress:street:validAddress        ← same instance, different field
ref:1:BillingAddress::validAddress              ← without FieldName (instance only)
ref:::password:                                  ← Self-reference (same table)
```

### Range references
```
ref::TableName::[tc_prefix_1-N]
```
- Square brackets `[prefix_1-N]` reference multiple TCs (prefix_1, prefix_2, ..., prefix_N)
- InstanceId MUST be empty for ranges (code checks this and logs an error)
- Creates a copy of the calling TC per referenced TC
- **Cartesian product**: multiple range references in one TC multiply!

#### Range parsing (code: `processRanges`)
```
[invalid_1-7]   → invalid_1, invalid_2, ..., invalid_7
[valid_1-2]     → valid_1, valid_2
[T3-4]          → T3, T4
[a1-3,b1-2]     → a1, a2, a3, b1, b2  (comma-separated ranges)
```
Regex: `/(\D*)(\d+)-(\d+)$/` — non-digit prefix + start number + end number

### Valid/Invalid Strategy with Ranges

Sub-table TCs are named using the `valid_N` and `invalid_N` scheme.
The main table then has only 2 EqClasses per reference field:

```
billingScenario (FieldSubSection)
  valid      | ref::BillingAddress::valid_1           | Single-ref (1 fixture)
  invalid    | ref::BillingAddress::[invalid_1-7]     | Range-ref (7 fixtures)
```

**Why "valid" as single-ref and "invalid" as range:**
- Error TCs need every error variant → range expands automatically
- Non-target fields always reference valid_1 → no unnecessary multiplication
- Result: billingInvalid → 7 fixtures, datesInvalid → 4 fixtures, etc.
- Cartesian product stays small: 1 × 1 × 9 = 9 (not 2 × 4 × 9 = 72)

**Naming convention in sub-tables (sequential!):**
```
invalid_1  ← First error case (error-first!)
invalid_2  ← Second error case
...
invalid_N  ← Last error case
valid_1    ← Standard happy-path (all fields valid)
valid_2    ← Variant (e.g. minimal required fields)
```

**Why sequential numbers in sub-tables:**
- Range references `[invalid_1-N]` require consecutive numbers
- Main table references `ref::SellerData::[invalid_1-17]` → expands to invalid_1, invalid_2, ..., invalid_17
- Descriptive names (e.g. `seller.name_empty`) would make range references impossible
- The mapping of TC name → tested field/EqClass is visible from the table structure

**Naming convention in the main table (descriptive):**
```
format_xrechnung        ← Descriptive name (no range-ref onto the main table)
sellerData_invalid      ← Sub-table referenced by range
buyerData_invalid       ← Sub-table referenced by range
valid_1                 ← Happy-path
```
Main tables are not referenced by range, so descriptive names can be used.

### Multi-Sheet Architecture
```
<name>-tests.xlsx
├── Sheet "MainTable"        ← Main table (execute=T), CASCADE, 100%
│   subTableAScenario         ← valid (single-ref) + invalid (range-ref)
│   subTableBScenario         ← valid (single-ref) + invalid (range-ref)
│   directField1, field2      ← Direct fields (valid/empty)
├── Sheet "SubTableA"        ← Sub-table (execute=F), CASCADE, 100%
├── Sheet "SubTableB"        ← Sub-table (execute=F), CASCADE, 100%
└── ...
```

### Important reference rules
- **ExecuteSection='F'** on sub-tables: TCs are only executed via reference, no own fixtures
- **Filters** in referenced TCs are NOT executed (only on the master TC)
- **Tags** from referenced TCs are collected
- **NeverExecuteSection**: prevents referencing from other TCs (opposite of ExecuteSection=F!)
- **Table names** must be unique across all loaded spreadsheets
- Each reference resolution creates a new instance of the referenced TC

### Splitting Tables (Multi-Sheet Strategy)

#### When to split?
- Table has more than 6-8 fields → combinations explode (e.g. 18 fields = 25M combinations)
- Field groups logically belong together (address, date, line items)
- Different main scenarios need different sub-tables
- Coverage below ~80% despite correct markers → table is too large

#### Splitting follows the test object
The table structure mirrors the test object — not the other way around:
- **UI form**: each logical form section (tab, accordion, wizard step) can become a sheet
- **API endpoint**: request body structure drives the split (nested objects → sub-sheets)
- **Business domain**: bounded contexts / aggregate boundaries as natural seams
- **Reuse**: the same sub-table (e.g. address) can be referenced from different main tables

#### Procedure

**1. Identify field groups:**
Group fields that belong together from a business perspective.

**2. Each group becomes a standalone sheet:**
- Own `<DECISION_TABLE>` header
- Own test cases (happy-path + error cases for this group)
- Own coverage calculation → target 100% per sub-table
- Small combination count → easy to reach 100%

**3. Main table references sub-sheets:**
- For each field group a FieldSubSection with reference EqClasses
- Each EqClass refers to a TC in the sub-table

**4. Example main table (valid/invalid with ranges):**
```
<DECISION_TABLE>              | billingInvalid | datesInvalid | validAll
FieldSection "Billing"
  billingScenario (FSS)       | COUNTA
    valid                     | ref::SubA::valid_1           |   | x  | x
    invalid                   | ref::SubA::[invalid_1-7]     | x | e  |
FieldSection "Dates"
  dateScenario (FSS)          | COUNTA
    valid                     | ref::SubB::valid_1            | a | x  | x
    invalid                   | ref::SubB::[invalid_1-4]      | e |    |
```

## Multiplicity — Driving a Code List Without Exploding the Combinatorics

A field with a code list modeled as **one EqClass per code** multiplies the sheet's total
by the list length (40 codes on one field of a header sheet ⇒ hundreds of thousands of
combinations, coverage collapses to near zero — and someone caps the list to one code so
anything runs at all).

The solution: **behavior classes** instead of value classes, with the count in the
`MultiplicitySection`:

| EqClass | Multiplicity | Meaning |
|---|---|---|
| `like_base_variant` | 1 | the happy case, unchanged (preferred) |
| `allowed` | **n** | every allowed code of the list, one per instance |
| `not_allowed` | 1 | a code this format does not know |
| `missing` | 1 | field omitted |

**Nanook does not choose the values — your generator does.** `multiplicity: n` clones the
case definition n times and numbers the clones (`tc.1` … `tc.n`); all instances carry the
**same** generator expression. The generator reads the instance number from the case name
and picks the code:

```ts
const instance = Number(/\.(\d+)$/.exec(testCase.name)?.[1] ?? '1')
const code = codesOfList[instance - 1]
```

Pick **sequentially, not randomly** — a randomly chosen code makes a red run
irreproducible.

When multiplicity, when individual classes? Multiplicity for code lists whose codes
behave alike (currency, country, unit). Individual classes when specific values behave
**differently** and that difference is the point of the table — then it deserves its own
sheet, not a row in the header sheet.

## CASCADE Pattern for 100% Coverage

### Concept
With the CASCADE technique, `a`/`e` markers are placed only on fields that come **after** the target field in field order. Fields **before** the target field only get `x` on the preferred value (just like the happy-path).

### Why does CASCADE work?
Each TC covers less than the previous one. The products form a decreasing series:
```
TC1 (field 1):   1 × 2 × 2 × 2 × 2 = 16  (a/e on fields 2-5)
TC2 (field 2):   1 × 1 × 2 × 2 × 2 =  8  (a/e on fields 3-5)
TC3 (field 3):   1 × 1 × 1 × 2 × 2 =  4  (a/e on fields 4-5)
TC4 (field 4):   1 × 1 × 1 × 1 × 2 =  2  (a/e on field 5)
TC5 (field 5):   1 × 1 × 1 × 1 × 1 =  1  (no field after)
TC6 (happy):     1 × 1 × 1 × 1 × 1 =  1
                                      ──
Sum:                                  32 = 2^5 = total
```

### Prerequisite for exactly 100%
**Every non-preferred EqClass needs its own error TC.**
Then the sum of the products equals the total exactly.

**Special case: all fields have 2 EqClasses:**
```
total = 2^n   (n = number of fields)
sum   = 2^(n-1) + 2^(n-2) + ... + 2^0 + 1 = 2^n
```

**General: fields with different EqClass counts (e.g. 3, 2, 2, 2, 3, 3):**
Works too! Every non-preferred EqClass produces a TC with product:
```
product(TC) = 1^(fields before) × product(EqClass counts of fields after)
```
All products + happy-path(1) = total.

**Example BillingAddress (3x2x2x2x3x3 = 216):**
```
billingName:   empty(72) + whitespace(72)          = 144
street:        empty(36)                           =  36
postalCode:    empty(18)                           =  18
city:          empty(9)                            =   9
country:       invalid_3chars(3) + empty(3)        =   6
customerEmail: invalid(1) + empty(1)               =   2
happy:                                             =   1
                                               Sum: 216 = 100%
```

### Implementation
Every non-happy TC needs a **target field** (the field it tests). The fields must have a fixed order.

**Marker logic per TC:**
1. **Happy-path TC**: all fields `x` on preferred → product = 1
2. **Error/target TC**:
   - Target field: `x` on target EqClass → COUNTA = 1
   - Fields BEFORE the target: `x` on preferred → COUNTA = 1
   - Fields AFTER the target: `a` on preferred, `e` on the rest → COUNTA = n

### When to use CASCADE?
- Main tables with reference fields (valid/invalid per ref → 2 EqClasses)
- Sub-tables with arbitrary EqClass counts per field
- When the coverage sum must hit the total exactly (100%)

### When NOT to use CASCADE?
- When fields belong together logically and must always be marked together
- When >100% coverage is intentionally desired (maximum coverage)

### TC order: error-first
More readable for humans: **error TCs first, valid TCs last.**
The CASCADE staircase pattern (a/e markers from left to right) becomes immediately visible.
```
                    | inv_1 | inv_2 | inv_3 | inv_4 | valid_1
field1 valid        |       |   x   |   x   |   x   |   x
       empty        |   x   |       |       |       |
field2 valid        |   a   |       |   x   |   x   |   x
       empty        |   e   |   x   |       |       |
field3 valid        |   a   |   a   |       |   x   |   x
       empty        |   e   |   e   |   x   |       |
field4 valid        |   a   |   a   |   a   |       |   x
       empty        |   e   |   e   |   e   |   x   |
```
The a/e markers form a triangle — you can immediately tell whether the pattern is correct.

## Important Notes

- `exceljs` is 1-based (column 1 = A, row 1 = first row)
- Write formulas as `{ formula: '...' }`, NOT as a string
- The percent cell needs `numFmt: '0.00%'`
- Call `row.commit()` after changes
- Apply styling AFTER writing the data (otherwise `commit()` overwrites the style)
- `exceljs` shares style objects between cells — set styles with a **fresh object per
  cell** (`cell.style = { …copies }`), or a `numFmt` set on one cell bleeds into others
- A percent format survives its content: a cell that once held text keeps its old format
  when a formula arrives — set `numFmt` per cell, on the cell, deliberately
- **TC columns end at the first empty header cell** (row 1): an accidentally inserted
  blank column silently cuts off every test case behind it — the fixture count shrinks
  with no error message
- A sheet whose A1 matches no registered parser key is skipped silently (info log only) —
  intentional for documentation sheets, fatal for a typo in the marker
- Nanook's ImporterXlsx reads the Excel file — formulas don't need to be evaluated, but the structure must be correct
