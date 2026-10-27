# Phase 4 — Salary Flow Implementation Plan

> Executed inline (superpowers:executing-plans), TDD for every pure module, one fresh whole-branch review at the end.

**Goal:** On payday Ali taps **Salary received**, types the amount, sees how the month went, decides what happens to the leftover, and starts the next plan prefilled from this one, all in one sheet with one Undo.

**Architecture:** One sheet with three steps (amount → close summary → new plan). Nothing is written until the final Save; then one Dexie transaction writes the salary entry, closes the open plan and creates the new plan with its envelopes, and one Undo toast reverts all of it. The plan form from phase 3 is reused for step 3. Home shows a nudge card once payday has passed and no plan started in this pay cycle.

**Spec:** `SPEC.md` §4 (plans), §6 Plan + Home, §7 Salary received, §10 phase 4. `CLAUDE.md`.

## Rulings (asked 2026-10-27)
- **Add to next Buffer:** the new plan's budget is salary + leftover. Stored as `plans.carry_in` on the new plan; Buffer starts higher by the leftover; "must not exceed" checks against salary + carry_in.
- **Move to Savings:** a note on the closed plan only (`plans.leftover` + `leftover_action = 'savings'`). Balances and the new plan don't change. The past plan sheet shows it.
- **Ignore:** recorded the same way (`leftover_action = 'ignore'`), nothing else.
- Leftover = the closed plan's variable left (SPEC §5) for the period ending yesterday. If it's 0 or less, there is no choice to make.

## Rulings taken up front (no question needed)
- Migration `plans_leftover`: `leftover numeric(14,2)` (> 0 when set), `leftover_action text` (savings/buffer/ignore; set together with leftover), `carry_in numeric(14,2) not null default 0` (≥ 0). Dexie v2 fills the new fields on rows already stored locally.
- The salary entry is dated today, category Salary (the income category named Salary, else the first income category), rate = effective rate now. Account chips default to the bank account.
- Step 3's salary field starts at the amount received (its GHS value at the frozen rate if it went into USD) and stays editable: it's the plan's budget number, not the entry.
- Envelopes prefill from the plan being closed (or the latest plan); on the very first plan, from the default shares (`suggestEnvelopes`).
- Payday nudge: shown when the most recent usual payday (on or before today) has passed and no plan started on or after 10 days before it (same early-salary window as `nextPayday`). Only shown once a plan exists; before that the "Set up your first salary plan" card covers it.
- The empty Plan screen keeps phase 3's "start a plan without recording a salary" as a quiet second button: on first run the salary may already be in the opening balance.

## Tasks
1. **Spec + DB:** SPEC §4/§6/§7 notes, migration via MCP, rename file to applied version, regenerate types, advisors, Dexie v2 upgrade.
2. **Pure core (TDD):** `dates.ts` `lastPayday`, `salaryDue`; `money.ts` `closeSummary`, `nextPlanAmounts`, `planStats.unallocated` counts `carry_in`.
3. **Store (TDD):** `savePlan` keeps/sets `carry_in`; `receiveSalary` (one transaction: entry + close + new plan) and `undoSalary`.
4. **UI:** `PlanForm` takes initial values and an `onSubmit`; `SalarySheet` (3 steps); Plan screen (Salary received primary, carried-over row, leftover note on past plans); Home nudge card. EN + AR strings.
5. **Verify + ship:** typecheck, tests, build, Playwright 390 + 1280 in EN and AR, fresh reviewer, deploy, PROGRESS.

## Review Focus
1. Undo after Salary received leaves the data exactly as before (entry gone, old plan open again, new plan and envelopes deleted).
2. Close summary numbers match the past plan sheet afterwards (same period end: the day before the new plan starts).
3. Buffer carry: allocated may reach salary + carry_in, never more, also when editing the new plan later.
4. Nudge doesn't show after an early salary, and does show when a salary is late past a month boundary.
5. Push order: plans before plan_envelopes in the outbox, so the new plan exists before its envelopes arrive.
