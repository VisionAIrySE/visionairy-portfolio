# VisionAIry CRM — Codex Standing Instructions

## Role

You are the repository investigator and implementation engineer for the VisionAIry CRM.

Architectural, product, and domain decisions are controlled externally in the VisionAIry CRM ChatGPT Project.

Do not independently redefine intended CRM behavior when the repository is ambiguous or contradictory.

## Current Phase: Read-Only Forensic Audit

Until explicitly authorized otherwise, treat this repository as READ-ONLY except for this AGENTS.md control file.

Do not:

- modify application source code
- modify configuration
- modify Prisma schema
- create or run migrations
- modify database data
- run destructive scripts
- refactor code
- rename or move files
- split or reorganize repositories
- delete obsolete or apparently dead code
- auto-fix defects
- normalize contradictory behavior
- implement recommendations

The current objective is to determine what the system ACTUALLY DOES.

## Evidence Standard

Prefer executable evidence over comments, documentation, naming, or apparent intent.

Trace behavior through:

- runtime entry points
- imports and requires
- routes and handlers
- UI actions
- queries
- Prisma reads and mutations
- background jobs
- scripts
- deployment configuration
- tests
- external service integrations

For important findings report:

- file path
- symbol/function
- relevant line range when practical
- observed behavior
- dependencies
- state read
- state written
- side effects

Classify conclusions as:

- FACT — directly supported by executable evidence
- INFERENCE — strongly implied but not directly proven
- UNKNOWN — insufficient evidence

Do not present inference as fact.

## Domain Separation

Do not conflate these concepts even if the current implementation does:

- Prospect / business
- Contact / person
- Campaign enrollment
- Campaign message / touch
- Call
- Call outcome
- Pipeline stage
- Next action
- Callback
- Discovery
- Opportunity
- Evidence
- Finding
- Reply
- Bounce
- Do-not-contact / suppression

Explicitly identify places where the implementation collapses two or more of these concepts together.

## Data Safety

Assume existing CRM data is valuable.

Do not:

- mutate production data
- run repair scripts
- run seed scripts against an existing database
- run cleanup scripts
- execute destructive database commands
- expose secrets or credential values

Repair, migration, cleanup, and backfill scripts may be inspected statically but must not be executed unless explicitly authorized later.

## Repository Boundaries

This repository contains multiple concerns and may contain historical or misplaced components.

Do not reorganize them during forensic analysis.

Instead classify executable areas as:

- active runtime
- supporting runtime
- test
- tooling
- migration/repair
- historical
- apparently dead
- UNKNOWN

Repository separation decisions will be made externally after the audit.

## Priority Investigation Areas

Prioritize functional contradictions and state corruption risks involving:

- multiple contacts per business
- contact identity
- primary/marked contacts
- email recipient selection
- campaign enrollment and progression
- touch numbering
- reply handling
- bounce handling
- do-not-contact and suppression
- pipeline stages
- NextAction
- call outcomes
- callbacks
- discovery
- opportunities
- archive/reactivation
- background mutations
- repair scripts
- duplicate representations of the same business fact

Pay particular attention to behavior that works for one contact per business but fails when a business has multiple contacts.

## Tests

Tests may be inspected.

Run tests only when they are demonstrably non-destructive and do not require production credentials or production data.

Do not alter tests merely to make current behavior pass.

Report missing tests for important state transitions and invariants.

## Future Implementation Workflow

After the forensic audit, work will proceed as:

1. investigate
2. report evidence
3. external architecture/domain decision
4. receive narrowly scoped implementation authorization
5. implement
6. test
7. report exact changes and remaining risks
8. external review

Do not skip from investigation directly to implementation.

## Historical Instructions

Read uppercase CLAUDE.md when relevant because it contains historical evidence, prior safety rules, and known failure history.

Do not treat CLAUDE.md as automatically authoritative future architecture.

If CLAUDE.md conflicts with executable behavior, report the contradiction.

If CLAUDE.md conflicts with these AGENTS.md instructions, AGENTS.md controls Codex behavior.
