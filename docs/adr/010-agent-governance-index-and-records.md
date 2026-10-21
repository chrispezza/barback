---
title: "ADR-010: Agent governance — CLAUDE.md is an index, the ADRs are the rules"
description: >-
  CLAUDE.md indexes the ADRs by the paths that trigger them and does not restate
  their rules. Changes to an ADR, to CLAUDE.md or to the build check are
  proposed in a PR and merged by the maintainer, never by the agent that wrote
  them. One small local check guards three facts and names the ADR when it fails.
lastUpdated: 2026-10-21T00:00:00.000Z
tableOfContents: true
pagefind: true
---

## Status

Accepted — amended 2026-10-21 by ADR-011 (a fourth check, on the test gate).

## Context

Agents working in this repo are governed by `CLAUDE.md` and the records in
`docs/adr/`. `CLAUDE.md` was added on 2026-09-23 as a hand-written summary of
the ADRs' rules. Nineteen days later a review found three of its invariants
wrong:

- "import from `index.js` only": the design system has no `index.js`; every
  import in `src/` uses `@ds/<group>/<Component>`. Read literally, the rule
  forbids any new import.
- "no CSS that overrides DS internals": ADR-006 allows documented composition
  hooks, and `src/index.css` sizes `.bb-btn` from its row containers.
- "the client never bakes absolute URLs": ADR-005 and `src/api/client.ts` say
  not deeper than the API modules, which hold dev-only defaults.

All three are errors of restating a decision in a second place. Separately,
a 240-run test on another repository (chrispezza/portfolio#106; one repo,
three runs per cell, so leads and not proof) found that written rules reduce
violations of a recorded decision; that a rule with no compliant path halted
a harmless feature every time; that one run read the record forbidding its
change, made the change, then rewrote the record and the check to agree; that
a check whose failure message names the decision stopped agents that had no
documents at all; and that splitting rules across files made no measurable
difference against one file.

This repo's own history has the same shape as the rewritten record, done in
the open: PR #6 edited the design system, amended ADR-006 and retired its
validation in one change. That amendment was right, and only its PR
description separates it from the bad version.

## Decision Drivers

- **One home per rule**: a restated rule drifts; three did in nineteen days.
- **Every rule has a legal move**: an agent must be able to comply and still
  do ordinary work.
- **Records change in the open**: a wrong ADR should be amended, by a person
  who read the reason.
- **Free-tier budget**: no CI minutes for a single-maintainer repo.

## Considered Options

### Option 1: Keep CLAUDE.md as a restated summary and fix the three rules

**Pros:** smallest change; rules are in the file agents always load.
**Cons:** leaves the mechanism that produced the errors.

### Option 2: Split CLAUDE.md into layered or per-folder files

**Pros:** separation of concerns on paper.
**Cons:** the one test available found no behavioural difference; nested
files load without trace; more places to drift.

### Option 3: One root file that indexes the ADRs, plus a rule on who changes records

**Pros:** one home per rule; the index says when each ADR must be read; the
file stays short; nothing to keep in sync but one table row per ADR, which a
check can verify.
**Cons:** the rule text is one read away. In the test's single failing cell
the rule lived only in an on-demand record (two of three runs, one model),
so this is a real if weakly evidenced cost.

## Decision

We will go with **Option 3**.

- `CLAUDE.md` holds: what the repo is, the gate, an index of every ADR with
  the paths that require reading it, the rules no ADR holds, the
  maintainer-only list, and how to run and ship. It does not restate an ADR's
  rules. Where it and an ADR disagree, the ADR wins.
- Changing an ADR's Status or Decision, adding an ADR, or changing
  `CLAUDE.md` or `scripts/check.mjs` is proposed in a pull request and merged
  by the maintainer. An agent that finds a decision blocking its task stops
  and names the ADR; it may open the PR that amends the record, and leaves it
  unmerged. It never changes a record or a check to make a code change pass.
- `scripts/check.mjs` runs first in `pnpm build`. It checks that every ADR has
  an index row, that the compose image tag matches ADR-001, and that the
  service worker still skips `/bar/` and `/search/` (ADR-007). Each failure
  names the ADR and the legal ways forward. It runs locally; there is no CI.
  *Amended 2026-10-21: ADR-011 adds a fourth check, that test tooling stays in
  devDependencies and that the build still runs the unit tests.*

## Consequences

### Positive

- A rule is corrected in one place.
- A new ADR without an index row fails the build with a message saying so.
- An amended record always passes a person.

### Negative

- Agents must open an ADR to get its rule; the index only says when.
- Documentation changes to these files wait on the maintainer.
- The check is text matching. A refactor of `sw.js` that keeps the behaviour
  can fail it; the message says to update the check in the same reviewed PR.
- Nothing here is enforced against a determined edit: `main` is unprotected
  and the check is a file like any other. The catch is the PR diff.

## Validation

- **Index complete**: `node scripts/check.mjs` passes, and fails when an ADR
  file has no row.
- **No restated rules**: `CLAUDE.md` contains no invariant that an ADR owns.
- **Records pass a person**: every commit touching `docs/adr/`, `CLAUDE.md`
  or `scripts/check.mjs` arrives through a PR the maintainer merged.

## References

- ADR-001, ADR-006 (amendment), ADR-007
- chrispezza/portfolio#106 (the test record and its corrections)
- PR #6 (ADR-006 amended alongside the change it forbade), PR #12 (`CLAUDE.md` added)
