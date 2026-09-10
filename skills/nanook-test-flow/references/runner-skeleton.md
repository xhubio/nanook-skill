# Flow runner — skeleton and invariants

The reference implementation (`ablauf.spec.ts`, ~420 lines) lives in the xhubio SaaS
kernel under `repo/tools/playwright/dashandwerk/tests/`. This is its shape, reduced to
what a port needs. Names are TypeScript-ish; the app-specific parts are marked.

```ts
// per flow workbook in flow/, per sheet with <FLOW_TABLE> in A1
for (const tc of flow.cases) {
  test(`${tc.id} — ${tc.name}`, async ({ page, context, browser }) => {
    test.setTimeout(180_000)                       // a flow is longer than a case

    const ctx = makeContext()                      // own(namespace) / all (read-only, throws on unset)
    let pending: { sheet, tc, expects: 'accepted' | 'rejected' } | undefined
    const values: Record<sheet, Record<field, string>> = {}   // what a table step entered
    const setCase: Record<sheet, caseName> = {}              // which case it was
    let apiState: { authCookie, ctx, setup } | undefined      // ONE starting point per test
    let ranSteps = 0

    const runStep = async (step) => {
      const col = step.column

      // ── <fn:…> ────────────────────────────────────────────────────────────
      if (col.kind === 'function') {
        const fn = FUNCTIONS[col.functionName]         // header names the verb
        if (!fn) throw new Error(`function not registered — add it to flow/registry.ts WITH a reason`)
        if (!apiState && fn.needsApi) apiState = await fn.needsApi(marker)
        const resolved = step.ref ? await resolveRef(step.ref) : undefined  // ref::Sheet::Case
        if (fn.needs === 'case' && !resolved) throw new Error(`${name} needs a data reference`)
        if (resolved && step.rejectSuffix) throw new Error(`'-' on a referenced cell: two expectation sources`)
        const verdict = await fn.run({ page, context, browser, ctx: { own: ctx.own(ns), all: ctx.all }, api: apiState, case: resolved })
        if (verdict) {
          const mustSucceed = resolved ? resolved.expectation !== 'rejected' : step.succeeds
          expect(verdict.ok, `${name}: ${verdict.message}`).toBe(mustSucceed)
        }
        return
      }

      // ── <pc:class> ────────────────────────────────────────────────────────
      if (col.kind === 'page') {
        const pc = PAGE_CLASSES[col.eqClass]           // every page object must be registered
        await pc.pageObject.operate(page, [{ name: step.value, click: true }])
        const seen = await pc.pageObject.reaction(page) // observe, never judge (page contract)
        ctx.own(ns).reaction = seen.kind
        if (pending) {                                 // settle the open expectation of the table step
          expect(seen.kind).toBe(pending.expects)      // messages: name sheet/case, name the field on rejection
          pending = undefined
          return
        }
        expect(seen.kind === 'accepted').toBe(step.succeeds)   // no table behind it: the '-' suffix rules
        return
      }

      // ── bare sheet name — a case of a decision table ──────────────────────
      const boundary = boundaryOf(col.table)           // app register: UI mask or API — ONE mapping, no second table
      const suite = await loadSuite(suiteFileFor(col.table))
      const found = suite.tests.find(t => t.name === step.value) ?? throw(`unknown case; existing: …`)

      if (boundary.kind === 'api') {
        if (col.mode === 'check') throw new Error(`<mode:check> at the API boundary — effects belong into the decision table`)
        if (!apiState) apiState = await boundary.api.setup(marker)
        else if (apiState.setup !== boundary.api.setup) throw new Error(`second starting point in one chain`)
        const expected = expectationFor(found, 'api') ?? expectationFor(found, 'ui') ?? throw(`case names no expectation`)
        const answer = await createViaApi(boundary.api, found, apiState.ctx, apiState.authCookie)
        ctx.own(ns).id = answer.id
        expect(answer.ok).toBe(expected.result !== 'rejected')  // settled immediately: the API answers at once
        return
      }

      if (col.mode === 'check') {                      // ── read back ──
        if (!boundary.page.readBack) throw new Error(`no read-back: an assertion without an instrument`)
        if (!values[col.table]) throw new Error(`nothing was entered for this table`)
        if (setCase[col.table] !== step.value) throw new Error(`check names a different case than was entered`)
        const { read, deviations } = await boundary.page.readBack(page, values[col.table])
        expect(Object.keys(read).length).toBeGreaterThan(0)
        expect(deviations).toEqual([])
        return
      }

      // ── enter ──
      const expected = expectationFor(found, 'ui') ?? throw(`case names no UI expectation`)
      const wasSet = await boundary.page.operate(page, fieldsOf(found) /* without the submit control */)
      values[col.table] = wasSet; setCase[col.table] = step.value
      pending = { sheet: col.table, tc: step.value, expects: expected.result }   // settled by the next <pc:>
    }

    try {
      for (const step of tc.steps) { await test.step(`${step.column.head} = ${step.value}`, () => runStep(step)); ranSteps++ }
    } catch (e) {
      annotate('not driven', tc.steps.slice(ranSteps + 1).map(s => s.column.head).join(' → '))
      throw e
    }
    annotate('written, never read', [...ctx.written].filter(k => !ctx.read.has(k)))
    expect(pending, `"${pending?.sheet}/${pending?.tc}" was entered but never submitted — outcome unmeasured`).toBeUndefined()
  })
}
```

## `resolveRef` — one resolver, shared with the matrix runner

```ts
// ref::Sheet::Case          → suites/<sheet>.json → tests.find(name === Case)
// ref::Sheet::[A1-A6]       → the cases of the range, in order
// ref::MatrixSheet::draft→send → { startState: resolveRef(row ref), action: column, expectation: cell }
```

Sheet → suite file: two spellings exist in practice (`CustomerCreate` → `customercreate.json`,
a country sheet `CompanyCreateDE` → `companycreate-de.json`). Try both; a resolver that knows
only one fails 160 cases with a message that correctly blames the setup.

## The registry entry

```ts
interface FlowFunction {
  reason: string                    // WHY this is not a table — mandatory, enforced by the type
  needs?: 'case' | 'none'           // 'case': must be called with ref::; throws otherwise
  needsApi?: (marker) => Promise<{ authCookie; ctx }>   // names ITS starting point; never a default
  run(args: { page; context; browser; ctx; api?; case? }): Promise<void | { ok: boolean; message: string }>
}
```

A verdict is optional. Without one, only "did not throw" counts. With one, the runner
judges — the function observes (same split as the page contract).
