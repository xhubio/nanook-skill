# nanook-skill

Agent skills for creating equivalence-class-tables — structured test case design for pages, APIs, and forms.

Install with:

```bash
npx skills add xhubio/nanook-skill
```

## Skills

### create-equivalence-class-table

Creates formatted Excel decision tables for equivalence class testing. Works with any test object — pages, APIs, forms.

**Trigger phrases:** "create equivalence class table", "decision table", "equivalence class table", "test data table", "nanook table"

#### What it does

1. Analyzes your test object (fields, validation rules, dependencies)
2. Groups fields and structures them into decision tables
3. Defines equivalence classes per field (valid + invalid partitions)
4. Plans test cases using the CASCADE pattern for 100% coverage
5. Generates a color-formatted `.xlsx` file with formulas, ready for Nanook's `ImporterXlsx`

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
