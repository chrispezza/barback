---
title: "ADR-001: Bar Assistant as upstream appliance, pinned to releases"
description: >-
  Run Bar Assistant as an unmodified published Docker image pinned to a release
  tag. Never fork or patch the backend; keep a read-only source clone for
  reference only.
lastUpdated: 2026-08-02T00:00:00.000Z
tableOfContents: true
pagefind: true
---

## Status

Accepted

## Context

Barback is a new client for the [Bar Assistant](https://github.com/karlomikus/bar-assistant)
API. Bar Assistant already provides the expensive domain machinery — 500+ recipe
datapack, member inventories, can-make cocktail filtering, shopping-list gap
analysis, Meilisearch indexing — behind a documented OpenAPI contract. During
initial exploration we ran the API built from source at the `develop` branch,
which meant coding against an unreleased, moving API contract.

## Decision Drivers

- **Contract stability**: a client build needs a fixed API surface.
- **Maintenance cost**: every backend patch is a permanent rebase tax against an
  actively developed upstream.
- **Leverage**: the recipe dataset and gap-analysis endpoints are the product's
  foundation and already exist upstream.

## Considered Options

### Option 1: Fork Bar Assistant and push to our own remote

**Pros:** full control; can add domain tables directly.
**Cons:** immediate drift from upstream; we own security patches and
migrations forever; implies ownership we don't want.

### Option 2: Build our own backend (e.g., Go)

**Pros:** stack fully ours.
**Cons:** rebuilds hundreds of hours of domain work (datapack, inventory
model, search indexing) for no product gain.

### Option 3: Appliance — published image, pinned release, read-only reference clone

**Pros:** zero backend maintenance; stable versioned contract; upgrades are a
tag bump; local clone still available for reading domain code and the OpenAPI
spec.
**Cons:** feature gaps must be solved client-side or upstream (see ADR-002).

## Decision

We will go with **Option 3**. The runtime is the published
`barassistant/server` image pinned to an exact release tag (currently
`5.15.3`; Docker Hub tags carry no `v` prefix) in [deploy/docker-compose.yml](../../deploy/docker-compose.yml).
The local source clone stays checked out at the same tag, is never pushed to
any remote, and is never patched. Upgrades are deliberate: bump the tag, read
the changelog, re-test the client.

## Consequences

### Positive

- Backend ownership reduced to a few lines of compose config.
- API contract matches published OpenAPI docs for the pinned version.
- Upstream improvements arrive by tag bump.

### Negative

- Missing domain concepts cannot be added server-side; they must live in the
  client or in upstream-native extension points (tags, custom fields) —
  addressed in ADR-002.
- Upstream breaking changes (v6) will require a planned client migration.

## Validation

- **No fork exists**: the clone has no `origin` push and no local commits.
- **Version drift**: `GET /api/server/version` reports the pinned tag, not
  `develop`.

## References

- ADR-002 (families/ratio data ownership), ADR-005 (deployment topology)
- https://github.com/karlomikus/bar-assistant
- https://docs.barassistant.app/
