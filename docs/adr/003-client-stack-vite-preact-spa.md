---
title: "ADR-003: Client stack — Vite + Preact + TypeScript strict SPA"
description: >-
  Barback is a single-page app built with Vite, Preact, and strict TypeScript,
  with TanStack Query for server state. Not the Astro starter, not the Go
  starter.
lastUpdated: 2026-08-02T00:00:00.000Z
tableOfContents: true
pagefind: true
---

## Status

Accepted

## Context

Barback is app-shaped, not content-shaped: shelf mutations, optimistic
ingredient-chip toggles, quantity steppers, and live "what can I make"
recalculation are stateful, interaction-heavy flows against a remote API. Two
in-house starters existed as candidates (astro-performance-starter,
go-performance-starter) alongside a plain SPA scaffold.

## Decision Drivers

- **Interaction model**: hottest interactions need optimistic client state.
- **Architecture fit**: ADR-001/ADR-002 leave zero backends of ours; the
  client is static files.
- **Existing conventions**: TypeScript strict, Preact idioms, perf-budget
  discipline carry over from existing tooling.

## Considered Options

### Option 1: astro-performance-starter (Astro + Preact islands)

**Pros:** established in-house conventions and perf gates.
**Cons:** tuned for content sites; an app this interactive becomes one big
island, fighting the islands architecture for no benefit.

### Option 2: go-performance-starter (Go + templ + HTMX)

**Pros:** strong for apps that own their data; server-side API calls hide
tokens.
**Cons:** exists to build a server, and this architecture deliberately has
none of ours. It reintroduces a BFF: a Go proxy hop on every chip toggle
between browser and the PHP API, with a sqlc layer that has no database.
HTMX round-trips fight the optimistic-update grain of the shelf UX.

### Option 3: Vite + Preact + TypeScript strict SPA

**Pros:** matches the app's grain; TanStack Query provides caching and
optimistic mutations; deploy artifact is a static folder in the compose stack;
tokens.css from the design system drops in unchanged.
**Cons:** client-held API token (acceptable: single-user home-lab; Meilisearch
scoped keys are designed for browser exposure — see ADR-004).

## Decision

We will go with **Option 3**: Vite + Preact + TypeScript (strict) SPA, TanStack
Query for server state. Package manager is pnpm.

## Consequences

### Positive

- Optimistic shelf/chip state is idiomatic.
- No server to operate; deploys are static files (ADR-005).
- Existing TS conventions apply directly.

### Negative

- Bundle discipline is on us: new dependencies must note bundle-size impact.
- SPA routing/focus management must be handled deliberately for accessibility
  (the design system's focus-visible and keyboard rules).

## Validation

- **Interaction latency**: chip toggle reflects in UI in < 50 ms (optimistic),
  reconciles with API in the background.
- **Bundle budget**: initial JS under a stated budget checked in CI once CI
  exists.

## References

- ADR-001, ADR-002, ADR-004, ADR-005
- [docs/design/the-back-bar.md](../design/the-back-bar.md)
