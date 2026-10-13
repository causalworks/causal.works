# /ship-check, Test Data

Reference runs for calibrating the scorecard and improving scoring consistency. Add new runs here as the skill gets used in the wild. Each entry includes the input summary, full scores, and notes on any judgment calls.

---

## Run 001, Red Mage AI Policy (draft)

**Date:** 2026-06-29
**Input type:** Policy document (draft, unpublished)
**Source:** `raw/ai-policy-draft.md`

**Input summary:**
Red Mage's draft AI policy covering: named accountable person (Andrés), client intake co-agent with 90-day retention and deletion on request, human review before all AI-assisted content delivery, bias review process with hard gate pre-deployment, EU AI Act Article 50 compliance (voluntary), GDPR for EU clients, EcoLogits sustainability tracking, quarterly review process, 24-hour incident response, ISO 42001 self-assessment path. Status: draft, not yet published.

**Scores:**

| Category | Raw | Max |
|---|---|---|
| Ownership | 16 | 24 |
| Responsibility | 13 | 24 |
| Accountability | 10 | 24 |

**Weighted total: 55/100**
**Band:** You've thought about this more than most. The gaps that surfaced? Now you can't unsee them. Good.

**Top gaps:**

| ID | Question | Score | Notes |
|---|---|---|---|
| O4 | If the current owner disappeared tomorrow, what would happen to this product and its users? | 0/3 | Solo practice with no succession plan. Andrés is named as accountable for everything, no backup. |
| O7 | Were the people most affected by this tool included in deciding whether it should exist? | 0/3 | Policy drafted by Andrés using a template. Nonprofits and underserved communities it covers were not consulted. |
| R5 | Do you know what external systems this depends on, and what your plan is if they go down? | 0/3 | AI providers not named in the policy. Client can't tell which platforms process their data or what happens if a provider changes terms. |

**Scoring notes:**
- O3 scored 3: data retention (90 days), deletion path, and GDPR explicitly addressed.
- A6 scored 3: quarterly review process is documented and structured.
- R3 scored 2: human review before delivery covers some wrong-output scenarios, but no explicit recovery path for deployed client tools.
- O7 was the highest-signal gap, it's the one a generic policy template would never surface. Specific to Red Mage's identity and ICP.

---

## Run 002, Red Mage ICP (Ideal Client Profile)

**Date:** 2026-06-29
**Input type:** Strategy document (internal, active)
**Source:** `strategy/icp.md`

**Input summary:**
Red Mage's ICP defining Operating ICP (US-based, $50k, $500k budget, 2-20 person teams, no internal dev team, AI-curious leadership) and Identity ICP (nonprofits, B Corps, Latino-led businesses, creative professionals, early-stage founders). Real client proof documented. Acquisition channels: Contra (primary), LinkedIn, speaking, referrals. Anti-personas defined. Concentration risk on Contra acknowledged. No review cadence. No stated feedback loop from client outcomes back into ICP. No user research with actual ICP clients documented.

**Scores:**

| Category | Raw | Max |
|---|---|---|
| Ownership | 11 | 24 |
| Responsibility | 14 | 24 |
| Accountability | 3 | 24 |

**Weighted total: 40/100**
**Band:** You've thought about this more than most. The gaps that surfaced? Now you can't unsee them. Good.

**Top gaps:**

| ID | Question | Score | Notes |
|---|---|---|---|
| O5 | Is there a stated plan for what this looks like in 6 months: maintained, deprecated, or handed off? | 0/3 | No trigger or cadence for revisiting the ICP. If Contra changes or client mix drifts, the ICP becomes quietly wrong. |
| A1 | Is there any mechanism to know something broke before users tell you? | 0/3 | No signal for ICP producing poor client matches before proposals go out, you find out after the engagement. |
| A6 | Is there a regular check-in, even an informal one, to assess whether this is still working as intended? | 0/3 | No review cadence. ICP exists but has no feedback loop. |

**Scoring notes:**
- Accountability scored 3/24 overall, the dominant finding. ICP is well-defined but entirely static with no monitoring.
- R1 scored 3: Operating ICP is specific and anti-personas are clearly documented (including what Red Mage does not do).
- R2 scored 3: Named user types with firmographic specifics.
- O3 scored 2: ICP is a strategy doc, not a data-collecting tool, question is partially applicable. Judgment call.
- A2 and A4 scored 0: no tracking of ICP-against-leads throughput, no stated response if a bad-fit client slips through pre-engagement.
- The Accountability score being nearly zero (3/24) while Responsibility was solid (14/24) is the diagnostic pattern here: strong definition, no feedback loop.

---

## Patterns across runs

- **O4 (succession)** appeared as a gap in both runs. Expected for a solo practice, worth flagging consistently.
- **O7 (community consultation)** is the Red Mage-specific question that generic frameworks miss. Score it conservatively, "we serve these communities" is not the same as "we consulted them."
- **Accountability is the most commonly missing category** in internally-focused artifacts (policies, strategy docs). These tools are designed to guide decisions, not to be monitored, so A-category gaps are structurally common, not a failure, just a pattern worth naming.
- **Draft/unpublished documents** should still be scored on whether the evidence exists in the doc, not on whether it's live. R4 (tested externally) will almost always be 0 for drafts.
