---
title: "ADR-011: Test gate — Vitest in the build, Playwright against fixtures before every PR"
description: >-
  Unit and component tests run in Vitest with Testing Library and are folded
  into pnpm build after the typecheck. Screen-level journeys run in Playwright
  against a production build whose API and search traffic is answered from
  fixtures derived from the pinned upstream, never the live stack, as a
  separate pnpm verify run before every PR. Everything runs locally; all of it
  is devDependencies with zero bundle impact.
lastUpdated: 2026-10-21T00:00:00.000Z
tableOfContents: true
pagefind: true
---

## Status

Accepted (2026-10-22, by the maintainer)

## Context

The client has no tests, no lint and no CI. `pnpm build` (`scripts/check.mjs`,
then `tsc -b && vite build`) is the only gate, so the only thing ever verified
mechanically is that the code type-checks and bundles. That is thin for what the
app now decides on the user's behalf:

- **What pours.** Stock colouring on every card ORs four upstream shelf flags
  (`isStocked`), and the match state a card shows is derived client-side, in three
  places, from those flags.
- **What a bottle is worth.** Brand-level children count toward parent-called
  recipes through the upstream hierarchy (`materialized_path`); the list says
  what a zero-unlock bottle builds toward.
- **What gets bought, and when the app writes the list by itself.** Buy-next
  ranking and the standing-order auto-queue are ADR-008 policy, implemented
  inline in `src/screens/Tonight.tsx`.
- **What shows when the API is gone.** The stamped list snapshot is the whole
  ADR-007 offline posture.

None of these has a check, and each is the kind of logic that changes by
accident in a refactor. Separately, the spec's interaction rules (optimistic chip
toggle, check-off ordering, search degradation) and journeys (frontend-spec §5,
§6) can only be checked by driving the screens.

Two constraints shape the answer. ADR-010 rules out CI minutes, so any new gate
runs on the maintainer's machine. ADR-003 makes bundle discipline ours: every new
dependency must state its bundle impact. And the full stack needs `op run` and
1Password for the Meilisearch master key (README), Docker, a seed and a family
tag pass — none of which a test gate may depend on.

## Decision Drivers

- **Local only**: no CI (ADR-010). A gate has to be fast enough that it is run.
- **Hermetic**: no Docker, no `op run`, no secrets, no live API. A test result
  must not depend on what is in the bar tonight.
- **Faithful to the contract**: fixtures must have the shape the pinned upstream
  (ADR-001, `v5.15.3`) actually emits, not the shape the client wishes it had.
- **Zero bundle impact**: test tooling never reaches the shipped JS (ADR-003).
- **Reuse the stack**: the `@ds` alias, the Preact preset and the react →
  preact/compat aliasing already live in `vite.config.ts`; a runner that needs
  them restated is a second place to drift.
- **Every check has a legal move** (ADR-010): an agent must be able to run the
  whole gate with nothing but `pnpm install`.

## Considered Options

### Option 1: Keep `pnpm build` as the only gate

**Pros:** no new dependencies; nothing to maintain.
**Cons:** the logic listed in Context stays unchecked; spec conformance is
asserted in prose only; every refactor of `Tonight.tsx` is a leap.

### Option 2: Vitest + Testing Library in the build; Playwright against fixtures as `pnpm verify`

**Pros:** Vitest runs on Vite's own config, so the `@ds` alias, the Preact
preset and the `.jsx` delivery (ADR-006) resolve exactly as they do in the app,
with no second transform pipeline. `@testing-library/preact` renders the real DS
components in jsdom. Unit runs take seconds, so they can sit inside
`pnpm build`. Playwright's built-in route interception answers `/bar/` and
`/search/` with no extra mocking library and drives the real production bundle
in a real browser, which is the only place focus, layout and the REST fallback
can be checked. `@axe-core/playwright` adds automated accessibility checks to
the same journeys.
**Cons:** five devDependencies and their transitive trees; fixtures are a
second model of the upstream contract and must be re-derived when the pinned tag
moves; Playwright needs a browser binary (~150 MB, downloaded once by
`pnpm exec playwright install chromium`).

### Option 3: As Option 2, but Playwright against the live compose stack

**Pros:** exercises the real matcher, real Meilisearch, real data.
**Cons:** needs Docker, `op run` and 1Password, a seed and the tag script before
a single assertion; results depend on bar state and datapack content; slow;
cannot run in a session that has no access to secrets. It fails the hermetic
and legal-move drivers outright.

### Option 4: Jest or `node:test` for units

**Pros:** familiar (Jest); zero dependencies (`node:test`).
**Cons:** neither reads `vite.config.ts`. Both need the `@ds` alias, JSX
transform, preact/compat aliasing and `.jsx` handling configured a second time,
and `node:test` has no DOM for component tests.

### Option 5: Hosted CI running Options 2's commands

**Pros:** the gate runs whether or not anyone remembers to.
**Cons:** ruled out by ADR-010's free-tier driver, which this record does not
reopen. (For the record: the repository is public, and GitHub does not meter
Actions minutes on public repositories, so the cost premise may no longer hold.
If ADR-010 is revisited, `pnpm build && pnpm verify` is the whole job.)

## Decision

We will go with **Option 2**.

**Dependencies.** Five devDependencies, none in `dependencies`:
`vitest`, `jsdom`, `@testing-library/preact`, `@playwright/test`,
`@axe-core/playwright`. Bundle impact: **none**. No file reachable from
`src/main.tsx` imports any of them; the shipped JS is unchanged by adding them.
`scripts/check.mjs` fails the build if any of them, or anything under
`@testing-library/`, `@vitest/` or `@axe-core/`, appears in `dependencies`.

**Unit and component tests (Vitest).** Tests live beside the code as
`src/**/*.test.ts` and `src/**/*.test.tsx`, run in jsdom, and import from
`vitest` explicitly (no globals). They cover `src/data/`, `src/api/` and
components, rendering real DS components through `@testing-library/preact`.
They never touch the network: anything that fetches is given a stubbed
`fetch`. Vitest's config extends `vite.config.ts` rather than restating it.

**Screen journeys (Playwright).** Specs live in `e2e/`. They run against a
production build of the client in the single-origin deploy shape (ADR-005:
relative `/bar` and `/search`), served by `vite preview`. Every request under
`/bar/` and `/search/` is answered by route interception from fixtures; a
request the fixtures do not answer fails the test instead of reaching a network.
Service workers are blocked except in a spec that is about the worker. The
fixtures are a small, stateful fake of the pinned upstream: shelf, list and
favourite writes change what later reads return, so a journey such as check-off
can be followed end to end.

**Fixtures.** Shared fixture data lives in `test/fixtures/`. Its shapes are
derived from `../bar-assistant-reference` at the pinned tag (ADR-001) and from
`src/api/types.ts`, with the upstream source cited where a field's presence is
conditional. Because the fixtures are a model of upstream behaviour, the model
has tests of its own beside it (`test/**/*.test.ts`, run by the same Vitest
pass), pinning it to the upstream lines it cites. Fixture records are typed as
the upstream resource and checked by
`tsc` for assignability to the client's types, so a client type that drifts
from the upstream shape fails the typecheck. Search fixtures cover both paths
ADR-004 describes: Meilisearch answering, and Meilisearch down with the REST
`filter[name]` fallback.

**The gate.**

- `pnpm build` runs `scripts/check.mjs`, then `tsc -b` (which now also checks
  test, fixture and e2e files), then `vitest run`, then `vite build`.
  `pnpm build:deploy` runs the same steps.
- `pnpm verify` runs the Playwright suite. It is run before every PR, after
  `pnpm build`.
- A PR body says which of the two ran and what they reported. There is no CI;
  nothing runs them for you.

**Tests are checks.** In ADR-010's sense, a test is a check: it is never deleted,
skipped or loosened to make a change pass. A test that encodes wrong behaviour
is changed in its own PR that says why, and a bug a test exposes is fixed in a
PR whose first commit is the failing test.

**Not adopted.** No coverage threshold (a number to chase, not a decision to
guard); no lint (a separate decision); no visual-diff snapshots (the design
system's rules are checked by axe and by explicit assertions instead).

## Consequences

### Positive

- The logic that decides what the user sees has executable examples, and the
  ADR-007 and ADR-008 validation scenarios become tests rather than prose.
- Spec conformance (frontend-spec §5, §6) is checked by driving the real bundle.
- `pnpm build` stays a single command, and still needs nothing but
  `pnpm install`.
- Accessibility regressions (focus, names, contrast) surface as failing journeys.

### Negative

- `pnpm build` gets slower by the length of the unit run, and `pnpm verify` adds
  a production build plus a browser run.
- The fixtures are a model of upstream behaviour (can-make, one-away,
  hierarchy matching). Where the model is wrong, journeys pass against an API
  that does not exist; the citations to the reference clone are the defence.
- Bumping the pinned image tag (ADR-001) now also means re-deriving the fixtures
  in the same PR.
- `pnpm verify` runs only when someone runs it. `main` is unprotected
  (ADR-010), so the catch is still the PR body and the diff.
- A browser binary must be installed once per machine.

## Validation

- **Bundle unchanged**: `vite build` output in `dist/assets/` is byte-identical
  before and after the harness lands.
- **Hermetic**: `pnpm build && pnpm verify` pass on a machine with Docker
  stopped and no `op` session, and with the network disabled once dependencies
  and the browser are installed.
- **Gate wired**: `node scripts/check.mjs` fails when a test package is moved to
  `dependencies`, or when `vitest` is installed and the `build` or
  `build:deploy` script no longer runs `vitest run`.
- **Fixtures faithful**: every conditional field in `test/fixtures/` cites the
  upstream line that emits it at the pinned tag.

## References

- ADR-001 (pinned upstream, the reference clone), ADR-003 (bundle discipline,
  focus management), ADR-004 (search and its REST fallback), ADR-005 (single
  origin), ADR-007 (snapshot), ADR-008 (standing orders, buy-next), ADR-010
  (records and checks pass a person; no CI)
- `docs/spec/frontend-spec.md` §5, §6
- https://vitest.dev, https://playwright.dev, https://github.com/dequelabs/axe-core-npm
