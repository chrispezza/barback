---
title: "ADR-006: Design system consumed as an unmodified vendored delivery"
description: >-
  The delivered design system lives in-repo as-is; the app imports its jsx
  components through an @ds alias with their shipped d.ts typings. No npm
  packaging, no TSX rewrite, no edits to the delivery.
lastUpdated: 2026-08-02T00:00:00.000Z
tableOfContents: true
pagefind: true
---

## Status

Accepted

## Context

"The Back Bar" design system was authored externally (from the written brief)
and delivered as a self-contained folder: CSS token files behind a single
`styles.css` entry, 13 React-flavored `.jsx` components each with a `.d.ts`
declaration, guideline specimen cards and reference UI kits. The delivery also
documents deliberate departures from the original brief (Instrument Sans
interface voice, contrast-driven palette revisions, tightened caps tracking).
The app is a Preact + strict-TypeScript SPA (ADR-003).

## Decision Drivers

- **Provenance**: keep a clean boundary between what was delivered and what we
  wrote, so future design-system updates can land as folder replacements.
- **Type safety**: component usage must type-check under strict TS.
- **Low ceremony**: single-consumer, single-repo — packaging overhead buys
  nothing.

## Considered Options

### Option 1: Publish as a private npm package

**Pros:** conventional dependency boundary.
**Cons:** versioning/publishing ceremony for exactly one consumer; slows the
design-iteration loop to a release cycle.

### Option 2: Rewrite components as TSX inside `src/`

**Pros:** idiomatic project code.
**Cons:** forks the delivery — every upstream design revision becomes a manual
merge; provenance dissolves; the shipped `.d.ts` typings already provide strict
type coverage without a rewrite.

### Option 3: Vendored folder, imported in place via alias

**Pros:** delivery stays byte-identical to what the design agent shipped
(`git log` shows it landing in one commit); `@ds/*` alias (vite `resolve.alias`
+ tsconfig `paths`) resolves each import to the `.jsx` at runtime and its
sibling `.d.ts` for types; react imports resolve through preact/compat, which
the stack already aliases.
**Cons:** `.jsx` in a strict-TS repo is unusual; component-internal `<style>`
injection ships once per rendered instance (accepted for now — hoisting is a
future optimization, not a consumption-model change).

## Decision

We will go with **Option 3**. The delivery at `The Back Bar Design System/` is
never edited; fixes and improvements go back to the design side (e.g. the
`Button.d.ts` missing `type` prop) and land as folder updates. App-side
compositions of DS components (screens, `FamilyPicker`) live in `src/` and are
ours.

## Consequences

### Positive

- Design revisions are a folder swap plus a diff review.
- Strict TS coverage of DS props with zero conversion work.
- The old `docs/design/` brief is preserved as historical intent, marked
  superseded.

### Negative

- Two component idioms coexist (`className` jsx in the DS, Preact tsx in
  `src/`).
- Per-instance style injection is mildly wasteful in long lists until hoisted.

## Validation

- **Cleanliness**: `git diff` of the DS folder against the delivered zip stays
  empty.
- **Type gate**: `pnpm build` fails on misuse of any DS component prop.

## References

- ADR-003 (client stack)
- `The Back Bar Design System/readme.md` (delivery, departures, index)
