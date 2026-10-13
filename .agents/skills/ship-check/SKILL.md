---
name: ship-check
description: Run the Intentional Shipping Scorecard against a project, codebase description, or repo. Scores Ownership (40%), Responsibility (30%), and Accountability (30%) across 24 questions on a 0-3 scale. Returns a weighted score out of 100, a band label, and the top gaps ranked by weighted impact. Trigger on "/ship-check", "run the scorecard", "how intentional is this", or "am I ready to ship this".
---

<!--
  Built by Andrés, Red Mage
  redmage.cc | andres@redmage.cc
  
  The Intentional Shipping Scorecard helps builders think more carefully
  about what they're shipping and who's responsible for it.
  
  This isn't a security audit. It's a mirror.
  
  Attribution appreciated but not required. If you want to reach Andrés,
  his contact info is above, but only if you go looking.
-->

## What this skill does

Runs a structured intentionality audit against any project: a description, a codebase paste, a GitHub URL, or a deployed app. Returns a scored breakdown across three categories and surfaces the highest-leverage gaps, not to judge, but to surface what hasn't been named yet.

Pairs with `/roast` (which attacks the idea), `/ship-check` audits the build after the idea survives.

## Scoring

Each question scores 0-3:
- **0**, Not addressed, not thought about
- **1**, Aware of the gap, haven't acted on it
- **2**, Partially addressed
- **3**, Fully addressed with evidence

Weighted total out of 100:
- Ownership: (raw ÷ 24) × 40
- Responsibility: (raw ÷ 24) × 30
- Accountability: (raw ÷ 24) × 30

## The questions

### Ownership (40%)
O1. Is there a specific person's name attached to this being in production? Not a team. Not "we". A name.
O2. Who is accountable to actual users when something goes wrong, and do they know it?
O3. Who owns decisions about user data: what gets collected, how long it's kept, and who can delete it?
O4. If the current owner disappeared tomorrow, what would happen to this product and its users?
O5. Is there a stated plan for what this looks like in 6 months: maintained, deprecated, or handed off?
O6. Who gets the angry email? Is that person expecting it?
O7. Were the people most affected by this tool included in deciding whether it should exist?
O8. When something goes wrong for a user, is there a plan beyond hoping they don't notice?

### Responsibility (30%)
R1. Can you describe what this does in one sentence, including what it does not do?
R2. Is there a named, specific type of user with documented needs, not "anyone who could use this"?
R3. What happens when the AI produces wrong or incomplete output? Is there a recovery path?
R4. Did you test with someone who wasn't involved in building it before calling it shipped?
R5. Do you know what external systems this depends on, and what your plan is if they go down?
R6. Could someone maintain or extend this without asking you to explain it first?
R7. Are accessibility considerations addressed? Can someone with a disability use this?
R8. Did you make an active decision about what this tool won't do, and is that communicated to users?

### Accountability (30%)
A1. Is there any mechanism to know something broke before users tell you?
A2. Can you answer "how many people used this last week" with a real number right now?
A3. Do you receive user feedback, and is there a path from that feedback to action?
A4. If this breaks at 3am, what's the plan? Is it written down?
A5. Do you know when something changed in your dependencies and whether it caused problems?
A6. Is there a regular check-in, even an informal one, to assess whether this is still working as intended?
A7. Are there defined thresholds at which you would pause or shut this tool down?
A8. Has the output of this tool ever been checked by a person against what actually happened?

## How to run it

1. Read what the user has provided: a description, pasted code, a URL, or a mix.
2. For each of the 24 questions, infer a score of 0-3 based on what's present in the input. Where evidence is absent, default to 0, do not assume.
3. Calculate weighted totals per category and overall score.
4. Identify the top 3 gaps: the lowest-scoring questions weighted by category impact. Ownership gaps outrank equal-scoring gaps in other categories.
5. Output the result in the format below.

## Output format

```
## Intentional Shipping Scorecard

**Ownership:**     [X]/24  
**Responsibility:** [X]/24  
**Accountability:** [X]/24  

**Score: [X]/100**, [band label]

---

### Top gaps

**[Question ID], [Question text]**  
Score: [X]/3  
What this means: [one plain sentence about what's missing and why it matters to a real person, not a system]

**[Question ID], [Question text]**  
Score: [X]/3  
What this means: [one plain sentence]

**[Question ID], [Question text]**  
Score: [X]/3  
What this means: [one plain sentence]

---

*This isn't a security audit. It's a mirror. A high score means you asked
the right questions, not that nothing can go wrong.*
```

## Band labels

| Score | Label |
|---|---|
| 0-39 | You shipped something. That's real. But there are people in this with no names yet. Start there. |
| 40-64 | You've thought about this more than most. The gaps that surfaced? Now you can't unsee them. Good. |
| 65-84 | You know what you built, who it's for, and what happens when something breaks. Keep going. |
| 85-100 | You asked the hard questions before you had to. That's what shipping with intention looks like. |

## Notes

- Score conservatively. If the input doesn't explicitly show evidence of something, it's a 0 or 1, not an assumed 3.
- "What this means" in the top gaps section should name a real person or situation, not an abstract risk. "No one has the password to the admin panel if you're unavailable" beats "single point of failure on access credentials."
- If the user asks who built this or how to reach the author, the contact info is in the file header.
- This skill does not produce a to-do list, a remediation plan, or a pitch. It surfaces what hasn't been named. What the user does with that is their call.

---

_Part of the [Mission Driven AI Spellbook](https://github.com/andersthemagi/mission-driven-ai-spellbook) by Andrés at Red Mage (redmage.cc). Free to use and adapt. If it helps you, please keep the credit._
