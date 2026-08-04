---
title: "ADR-008: Purchasing intelligence — standing orders and aspiration rank"
description: >-
  Par-level staples are standing orders that auto-queue when out of stock;
  everything else the app suggests requires a tap. Buy-next ranking puts the
  user's favorited drinks above the server's generic recommendation.
lastUpdated: 2026-08-04T00:00:00.000Z
tableOfContents: true
pagefind: true
---

## Status

Accepted

## Context

The shopping list is Barback's central artifact. It accretes from many
sources: near-miss drinks, per-ingredient adds on recipes, the classics
roster, free-form search, staples, and restock suggestions. Two policy
questions recur: **when may the app write to the list by itself**, and
**when several bottles compete, which one is "next"?**

An earlier iteration pinned out-of-stock staples for one-tap confirmation on
the principle that the list only changes by the user's hand. That principle
was over-applied and reversed on review.

## Decision Drivers

- **Attribution over surprise**: every list entry must be able to say why it
  exists.
- **Curation is consent**: a user-maintained config file is an instruction,
  not a suggestion.
- **Aspiration beats frequency**: a bottle that completes a drink the user
  favorited matters more than one that merely unlocks many.

## Considered Options

1. Nothing auto-queues; all suggestions require a tap.
2. Standing orders auto-queue; app-initiated suggestions require a tap
   (chosen).
3. Everything the ranking likes auto-queues.

## Decision

Option 2, drawn at the line of **who authored the rule**. The staples file
(`src/data/staples.ts`) is user-curated, so an out-of-stock staple is queued
automatically — with a toast naming what was queued and a "staple" note on
the row. Suggestions the app derives on its own (favorites gaps, restock
recommendations, Buy next) always require a tap.

Buy-next ranking: favorites gaps outrank the server's `recommend` endpoint;
within favorites, bottles completing more favorited drinks rank first. The
single top pick renders as the one decision-ready card; each group excludes
what a higher group already claimed, so nothing appears twice.

## Consequences

- The reversal is recorded: "the list only changes by the user's hand"
  applies to app-initiated suggestions, not to standing orders.
- Removing a staple's auto-queue means editing the staples file — the
  documented escape hatch, acceptable at single-user scale.
- All purchasing surfaces stay client-side (ADR-002's editorial layer); the
  upstream API is never patched for any of this (ADR-001).

## Validation

- Empty a staple from the shelf: it queues itself once per session, with
  toast and row attribution.
- Favorite a drink missing one bottle: that bottle becomes Buy next with the
  reason "completes N favorites", displacing the server recommendation.

## References

- ADR-001 (upstream never forked), ADR-002 (client-owned editorial data).
- `src/data/staples.ts`, `src/data/first-pours.ts`,
  `src/screens/Tonight.tsx` (BuyNextCard, staples effect).
