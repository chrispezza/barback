---
title: "ADR-002: Family taxonomy as API tags, ratio templates as client data"
description: >-
  The five-family taxonomy is stored as Bar Assistant tags so the API and
  search can filter on it; ratio templates are versioned typed data in the
  client repo keyed by cocktail slug. No BFF.
lastUpdated: 2026-08-02T00:00:00.000Z
tableOfContents: true
pagefind: true
---

## Status

Accepted

## Context

Barback's product thesis is "templates, not recipes": drinks belong to a small
set of families, and each recipe leads with a ratio device (e.g. `2 : ¾ : ¾ /
SPIRIT · CITRUS · SWEET`). Neither concept exists natively in Bar Assistant's
schema, and ADR-001 forbids adding backend tables. This data is editorial —
our curation, not user state.

## Decision Drivers

- **ADR-001 constraint**: no backend modifications.
- **Filterability**: the family filter bar is a core UI element and should use
  native API/search filtering, not client-side post-filtering.
- **Data ownership**: curation should be versioned, reviewable, and typed.
- **Simplicity**: single-user system; no justification for new services.

## Considered Options

### Option 1: Fork the backend and add tables

**Pros:** first-class schema.
**Cons:** violates ADR-001.

### Option 2: Everything in Bar Assistant custom fields/tags

**Pros:** one data store; editable via Salt Rim.
**Cons:** ratio templates are structured (parts, labels, ordering) and would be
stringly-typed into a generic mechanism we don't control; no type safety.

### Option 3: Thin backend-for-frontend service owning the taxonomy

**Pros:** full modeling freedom.
**Cons:** a second backend to run and secure for a single-user app; adds a
network hop to the hottest interactions.

### Option 4: Split by ownership — family assignments as tags, ratio templates as client data

**Pros:** family filtering works natively in the API and Meilisearch; tags ride
along in Bar Assistant backups/exports; ratio templates live as versioned,
typed modules in this repo with full TypeScript checking.
**Cons:** two homes for related concepts; client must join them at render time.

## Decision

We will go with **Option 4**. Family membership is assigned as Bar Assistant
tags (one tag per family) via the API. Ratio templates are typed data in the
client repo keyed by cocktail slug. The join happens in the client's data
layer.

## Consequences

### Positive

- Family filter bar uses native `tags` filtering in the API and search index.
- Ratio curation is code-reviewed, typed, and versioned with the UI that
  renders it.
- No new services.

### Negative

- A renamed upstream cocktail slug orphans its ratio template; the data layer
  must surface unmatched slugs during development.
- Seeding a fresh instance must re-apply family tags (scripted, idempotent).

## Validation

- **Filter parity**: selecting a family in the UI issues a single tag-filtered
  API/search query, no client-side filtering pass.
- **Orphan check**: a dev-mode report lists ratio templates whose slug matches
  no cocktail.

## References

- ADR-001 (appliance constraint), ADR-004 (search path)
- [docs/design/the-back-bar.md](../design/the-back-bar.md) — ratio device,
  family filter bar
