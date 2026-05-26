---
name: project-user-state
description: User's actual retirement plan data — accounts, properties, settings, expenses for Mike & Juliet
metadata:
  type: project
---

User's real retirement state data (last provided 2026-05-26). Key facts:

**People:** Mike (S1, age 50) and Juliet (S2, age 54). Both retire Jan 2027/2028 respectively.

**Settings:**
- Return range: 5–6% | Inflation range: 1.5–5% | Property appreciation: 1% | Rent growth: 2%
- Tax rise: +10 points starting 2038
- Withdrawal order: inherited_ira → taxable → traditional → roth → hsa
- Roth conv: fill_12, both_retired start, first_SS end, start after inherited depleted
- Inherited IRA strategy: fill_first
- SS: Mike claims at 70 ($45,255/yr), Juliet claims at 63 ($23,095/yr)
- SWR: 4% dynamic

**Liquid Accounts (total ~$5.0M):**
- Joint Brokerage: $1,449,609 (basis $1M, 0.7% div yield)
- S1 IRA: $765,775
- S1 Roth: $84,100
- S1 SEP (tiny): $939
- S1 401k pre: $830,079
- S2 Roth: $60,594
- S2 IRA: $56,806
- S2 SEP: $141,083 (contributing $20k/yr)
- Inherited IRA: $528,000 (inherited 2026, RMD already taken)
- "inherited" taxable: $849,996 (basis $850k, 0.7% div yield)
- S1 401k pre (Roth): $234,125

**Properties (total value ~$5.6M):**
- Primary Home: $1,850,000, loan $409,158 @ 2.875%, payoff 2051-Jul
- 171 (rental): $1,250,000, loan $264,853 @ 3.625%, rent $5,001/mo, basis $220k, 9 yrs depreciated, payoff 2050-Jun
- 14008 (rental): $1,249,999, loan $782,843 @ 3.5%, rent $5,500/mo, no basis, payoff 2051
- 14016 (rental): $1,250,000, loan $447,131 @ 3.625%, rent $5,350/mo, no basis, payoff 2050-Jun

**Expenses:**
- Base: $10,000/mo
- Large: Wedding gift $30k (2029), Alex downpayment $100k (2031), Europe trip $20k (2026), Remodel $20k (2026), Missing rent $30k (2026)
- Recurring: Medical $30k/yr (2027–2065, inflated), Car $500/mo (2050–2065), Travel $25k/yr (2027–2037)

**Why:** Used for calculation reviews and debugging. When user pastes state data, compare against this baseline.
**How to apply:** When user asks to verify calculations or reports unexpected results, reference this data to reason about what the projection should show.
