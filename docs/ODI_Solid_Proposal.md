# ODI Solid Application

## Organisational information page

### Please expand on your choice of project stage, stating any other considerations we should take into account or if you feel you are between stages. (100 words max)

Causal.works is an initiative to build a multi-module platform including organizational management tools, cooperative collaboration methods, and a personal civic action app. The current build is created by an experienced nonprofit professional working with coding agents. A functioning version exists that now requires experienced human collaborators to support continuing refinement and completion in all areas including platform architecture, app functionality, UI and UX design, systems frameworks, and rollout path. The Solid integration (detailed in the Technical section) is built and self-tested, not yet independently reviewed, and only supports Documents so far.

---

## Project information page

### Please share a brief description of your project
What is your project, who is it for,  what problem are you aiming to solve, and how does solid it in to the solution? (Maximum 300 words) 

Causal.works is an initiative to develop platform cooperatives for nonprofits and coalitions working on human systems change needed to live within Earth's planetary boundaries — climate action, education, advocacy, culture work, and other fields. These cooperatives own and manage their own shared data infrastructure. Causal.works can be retired once the platform template propagates to self-managed cooperatives.

Two problems compound each other. Many advocacy groups report limited leverage when acting in parallel — each running campaigns, mobilizing members, and targeting decision-makers independently, without coordinated timing or concentrated pressure. Meanwhile the data systems these groups rely on are rented from vendors with no stake in their mission, and their records sit in the vendor's database, outside their control. Groups that own the tools managing their data begin to leverage new power.

The platform is guided by planetary boundaries science, which defines ecological limits, and the Earth4All turnarounds strategy, which offers policy recommendations that define shared context and goals. The Cooperative workspace provides collaboration resources — peer network, library, work pool, and a workshop for systems analysis — alongside an enterprise management tool set: budgeting, accounting, fundraising, membership, sponsorship, compliance, and governance. Agency is a personal civic app that informs individual decision-making with leverage-point logic grounded in these frameworks, centralizing the actions people can take: where they bank and invest, petitions, comments on pending legislation, protests, volunteering, and advocacy to elected officials and proxies.

Solid has been central to the platform's sovereignty goal since inception. Each organization's documents live in its own pod, and the organization grants, limits, and withdraws access to them — including for auditors and funders who hold no Solid identity of their own. Today the platform still holds the credential that controls each pod; removing that is our main technical goal.



### What are the intended impacts of your project, and how do you intend to measure them? (Maximum 100 words)

Solid becomes an integrated platform component providing real data sovereignty to organizations and contributing to the Solid ecosystem. Organizations hold pods isolated from each other, with control resting with each organization's administrator. Adoption is measured by organizations with active pods, per-user logins issued, and sovereignty exercised. The broader goal is organizations with affordable, high-quality data tools, coordinating strategies that have significantly greater effect than acting alone. Shifting organizations to this model, while giving individuals powerful engagement tools, can meaningfully advance human systems change. Building platform versions usable in regions beyond the US and Europe is another important goal.



### Please share a rough project roadmap with key goals, dates, or other project considerations. These can be estimates. (Maximum 100 words)

Overall, the roadmap is to complete the tool set, integrate expert feedback and user testing, attain certifications, and roll out to a first cohort of real organizations. The Solid roadmap: near-term, put each organization's administrator in control of their own pod via their own Solid-OIDC identity, with the platform limited to a scoped, revocable delegation; mid-term, derive pod grants automatically from that delegation through the platform's role system; longer-term, extend sovereignty beyond Documents to Budget, Accounting, Compliance, and Reports, and to Agency users' civic-action records held in their own pod.
---

## Technical page

### Please describe your current technical stack, if any.

Node.js/Express backend, PostgreSQL with row-level security, static HTML/CSS/vanilla JS frontend, self-managed VPS. Self-hosted Community Solid Server, multi-tenant (one server, one pod per organization), ACP-based access control. Integrations: Postmark (email), Xero (OAuth, chart of accounts and actuals sync), Plaid (bank feeds), Gemini (email-to-action extraction, financial narrative text), FEC and Google Civic Information APIs (representative/election data), Federal Register and EIP Oil & Gas Watch (permitting-notice feeds), ProPublica Nonprofit Explorer (organization verification), Mobilize (local event feeds). Public repository: github.com/causalworks/causal.works.


### What type of technical support do you require?


Each organization's pod already lives under its own dedicated, self-registered CSS account with no shared administrative credential — but control today still runs through a service credential that the platform developer holds. We're seeking help putting an organization administrator in control of their own pod through their own Solid-OIDC identity, with the platform limited to a scoped, revocable delegation and to issuing or terminating pods, and confirming this is the right ownership model as we scale to many organizations on one CSS instance. The prototype includes one demo organization running a live pod.

Auditors, funders, and other data recipients often don't hold a WebID, so we built email-verified, time-limited, revocable links for them. We're seeking to confirm whether this fits how Solid expects non-Solid access to be handled, and get guidance on improvements. We also see this as a Solid propagation opportunity — some of these recipients themselves may want their own pod once they've used one. We'd value input on a realistic development path for this — potentially a platform cooperative hosting pods for outside organizations and individuals as its own service, commissioned through the organizations' relationships that already connect them.

Account deletion already exists in CSS's own API, but we couldn't find a pod ownership transfer mechanism anywhere. We're seeking guidance on what other lifecycle operations we should plan for, such as admin offboarding, credential recovery, WebID change, pod export, and migration between servers.

Every grant/revoke writes to our database and a retry queue in one transaction, and a worker then pushes the actual .acr change to CSS. We've seen a write get stuck mid-delivery without a clear root cause, and we're seeking a second opinion on this design, especially failure recovery.

Only static documents sync to the pod today; Budget, Compliance, and Reports are live, changing, relational data. We're seeking help designing that sync pattern, since it isn't an extension of the document pattern we already built but a different design challenge.

Overall, the Solid implementation in Causal.works requires a full assessment by experienced humans. Feedback and advice is sought in all areas.
