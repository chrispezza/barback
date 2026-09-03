---
title: "ADR-006: Design system consumed as an unmodified vendored delivery"
description: >-
  The delivered design system lives in-repo as-is; the app imports its jsx
  components through an @ds alias with their shipped d.ts typings. No npm
  packaging, no TSX rewrite. Amended 2026-09-02: fixes land as numbered
  in-repo revisions rather than going back to an external design side.
lastUpdated: 2026-09-02T00:00:00.000Z
tableOfContents: true
pagefind: true
---

## Status

Accepted — amended 2026-09-02 (see Amendment: in-repo revisions).

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

We will go with **Option 3**. The delivery at `The Back Bar Design System/`
stays the single home of the visual layer; fixes and improvements land there as
folder updates rather than being patched around in `src/`. App-side
compositions of DS components (screens, `FamilyPicker`) live in `src/` and are
ours.

*As originally written this clause read "is never edited; fixes and improvements
go back to the design side". There is no external design side to return to — see
the amendment below.*

## Consequences

### Positive

- Design revisions are a folder swap plus a diff review.
- Strict TS coverage of DS props with zero conversion work.
- The old `docs/design/` brief is preserved as historical intent, marked
  superseded.

### Negative

- Two component idioms coexist (`className` jsx in the DS, Preact tsx in
  `src/`).
- ~~Per-instance style injection is mildly wasteful in long lists until
  hoisted.~~ Fixed in Revision 2: styles inject once per document.
- Provenance is now a documented history rather than a byte-for-byte match
  (see the amendment).

## Validation

- **Provenance**: the delivered state is the initial commit of the DS folder;
  every later change is a numbered revision with a changelog row in
  `The Back Bar Design System/readme.md`. `git log` on the folder is the audit
  trail.
- **Containment**: `src/` contains no re-implementation of a DS component and
  no CSS overriding DS internals beyond documented composition hooks.
- **Type gate**: `pnpm build` fails on misuse of any DS component prop.

## Amendment: in-repo revisions (2026-09-02)

### What changed

A UX audit of the app found nine defects that live in the delivery itself:
a segmented control that clipped its own last segments below 390px, a card
rendered as a `<button>` wrapping heading and paragraph content, a compact
button size that broke the system's stated 44px floor, three text pairs below
WCAG AA (including one the system's own readme forbids), and per-instance
style injection. All of them are visible to a user of the app.

### Why the original clause could not hold

The clause assumed a design side to return fixes to. There is none: the system
was authored from a written brief in a single pass, and the repo holds the only
copy. "Never edited" therefore had exactly two possible outcomes — ship the
defects, or work around them in `src/` with overrides that fork the visual layer
in the worse direction, silently and without a changelog.

### The revised rule

The folder is still the single home of the visual layer and is still never
patched from `src/`. Changes to it are **numbered revisions**: a changelog table
in the readme naming every component touched, what changed and why. Revision 2
is the audit remediation. New component props are additive and optional, so a
revision never breaks an existing composition.

### What this costs

The original validation — a byte-identical diff against the delivered zip —
is retired; it can never pass again. Provenance moves from "is it unchanged?"
to "is every change recorded?", which `git log` and the readme answer together.
If an external design source ever exists, reconciliation is a diff against
Revision 1, which remains in the history.

## References

- ADR-003 (client stack)
- `The Back Bar Design System/readme.md` (delivery, departures, index, revisions)
