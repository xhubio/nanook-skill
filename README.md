# nanook-skill

Agent skills for table-driven testing with Nanook — structured test case design for pages, APIs, and forms, plus the execution architecture that runs the generated cases.

Install with:

```bash
npx skills add xhubio/nanook-skill
```

## Skills

### create-equivalence-class-table

Creates formatted Excel tables (decision, matrix, and specification tables) for equivalence class testing. Works with any test object — pages, APIs, forms.

**Trigger phrases:** "create equivalence class table", "decision table", "equivalence class table", "test data table", "nanook table", "matrix table", "specification table"

#### What it does

1. Analyzes your test object (fields, validation rules, dependencies)
2. Groups fields and structures them into decision tables
3. Defines equivalence classes per field (valid + invalid partitions)
4. Plans test cases using the CASCADE pattern for 100% coverage
5. Generates a color-formatted `.xlsx` file with formulas, ready for Nanook's `ImporterXlsx`

Also covers: matrix tables (state transitions), specification tables (rule-based
generation), multiplicity for code lists, tags/filters for named subsets, and the
processor's logger-based error contract.

### nanook-app-runner

Connects an application to a table-driven Playwright test execution: one shared runner
over generated suite files, page objects under a common contract, base states created via
API instead of UI clicks (factor 200–400), and resource pooling by effect profile (15
permission profiles instead of 400 users).

**Trigger phrases:** "connect app to nanook", "table-driven test execution", "page object contract", "base state setup", "suite runner", "user pooling"

#### Generated Excel structure

- **Column A–E:** Field definitions (name, section type, equivalence classes, generators, comments)
- **Column F+:** Test cases with markers (`x` = selected, `a` = preferred, `e` = fallback, `i` = impossible)
- **Formulas:** Automatic COUNTA for equivalence class counts and coverage percentages
- **Color coding:** Blue headers, green summary sections

#### CASCADE pattern

The skill applies the CASCADE technique to achieve exactly 100% equivalence class coverage with the minimum number of test cases. Each non-preferred equivalence class gets its own error test case, and `a`/`e` markers are placed only on fields after the target — producing a decreasing product series that sums to the total combinations.

#### Technology

Uses `exceljs` for Excel generation with cell styling and formula support. Output is fully compatible with Nanook's `ParserDecision` format.

## Supported agents

Works with Claude Code, Cursor, GitHub Copilot, Cline, and other agents that support the skills ecosystem.

## Links

- [Nanook documentation](https://nanook.xhub.io)
- [@xhubio/nanook-table](https://github.com/xhubio/nanook-table) — the core table engine
