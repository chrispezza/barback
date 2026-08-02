# Barback frontend spec

Grounded in the pinned Bar Assistant **v5.15.3** OpenAPI contract (ADR-001).
Every endpoint referenced below was verified against `docs/openapi-generated.yaml`
in the reference clone at tag `v5.15.3`. Visual layer is defined by
[The Back Bar](../design/the-back-bar.md); this spec covers structure, data,
and behavior only.

## 1. Screens & routes

| Route | Screen | Purpose |
|---|---|---|
| `/shelf` | **Shelf** | Inventory: what's in the bar, add/remove bottles |
| `/tonight` | **Tonight** | What can I make now + near misses + shopping list |
| `/drinks` | **Index** | Full recipe index, family filter bar, search |
| `/drinks/:slug` | **Recipe** | Ratio device + recipe detail with stock coloring |
| `/login` | Auth | Token acquisition |

Shelf and Tonight are the two system-validation screens from the design spec.
The shopping list renders inside Tonight (design: "actionable gap"), not as its
own top-level route.

## 2. API-to-screen mapping

All requests carry `Authorization: Bearer <token>`, `Accept: application/json`,
and the `Bar-Assistant-Bar-Id` header (bar id 1 in the seeded instance).

### Bootstrap (app start)

| Call | Purpose |
|---|---|
| `POST /auth/login` | Get token (stored per ADR-003; single-user home-lab) |
| `GET /profile` | User id (needed for all `/users/{id}/*` calls), memberships |
| `GET /bars/{id}` | `search_host` + `search_token` for Meilisearch (ADR-004) |

### Shelf

| Interaction | Call |
|---|---|
| List my shelf | `GET /ingredients?filter[on_shelf]=true` |
| All ingredients (picker) | `GET /ingredients` (paginated) / Meilisearch for type-ahead |
| Add to shelf (chip toggle) | `POST /users/{id}/ingredients/batch-store` |
| Remove from shelf | `POST /users/{id}/ingredients/batch-delete` |
| Bottle detail row | `GET /ingredients/{id}` (+ `/extra` for "unlocks N") |

### Tonight

| Section | Call |
|---|---|
| "14 DRINKS" (can make) | `GET /cocktails?filter[on_shelf]=true` |
| "ONE BOTTLE AWAY · 6" | `GET /cocktails?filter[missing_ingredients]=1` |
| Shopping list items | `GET /users/{id}/shopping-list` |
| "unlocks 4" per item | `GET /ingredients/{id}/extra` |
| Add gap to list | `POST /users/{id}/shopping-list/batch-store` |
| Check-off → shelf | `POST /users/{id}/ingredients/batch-store` + `POST /users/{id}/shopping-list/batch-delete` (sequenced; see §5) |
| Restock suggestions | `GET /bars/{id}/ingredients/recommend` (secondary, below the fold) |

The near-miss and can-make sets are **server-computed** — the client never
re-derives them. `missing_ingredients` composes with `tag_id`, so family
filtering applies to Tonight sections natively.

### Index / Recipe

| Interaction | Call |
|---|---|
| Browse + family filter | `GET /cocktails?filter[tag_id]=<family tag ids>` (paginated) |
| Search-as-you-type | Meilisearch direct with `search_token` (ADR-004) |
| Recipe detail | `GET /cocktails/{id}` (`include=ingredients` variants as needed) |
| Per-ingredient stock color | native: each ingredient entry in the cocktail resource carries `in_shelf` / `in_bar_shelf` booleans, and the cocktail itself carries `in_shelf` (verified live against v5.15.3) |
| Favorite | `POST /cocktails/{id}/toggle-favorite` |
| Similar drinks | `GET /cocktails/{id}/similar` |

## 3. Families & ratio data (ADR-002 contract)

### Family tags

Five tags in Bar Assistant named with a reserved prefix so editorial tags never
collide with user tags: `family:sour`, `family:spirit-forward`, `family:highball`,
`family:tiki`, `family:dessert` *(final taxonomy is Chris's call — prefix and
mechanism are the contract, names are content)*.

- Created and assigned via `POST /tags` / `PUT /cocktails/{id}` by an idempotent
  script in `scripts/` (extends the seed flow).
- The client fetches `GET /tags` at bootstrap, selects `family:*` tags, and maps
  them to the segmented filter bar in declared display order.

### Ratio templates (client-owned, typed)

```ts
interface RatioPart {
  value: string;          // display form: "2", "¾" — string, not float
  label: string;          // "SPIRIT", "CITRUS", "SWEET"
}

interface RatioTemplate {
  cocktailSlug: string;   // Bar Assistant cocktail slug (join key)
  parts: RatioPart[];     // 2–4 parts per the design system
}
```

Stored in `src/data/ratios.ts`. Join happens in the recipe query's `select`.
**Orphan check:** a dev-only assertion logs any `cocktailSlug` that matches no
cocktail in the index (ADR-002 validation).

## 4. State management (ADR-003)

TanStack Query with query keys scoped by bar:

- `['shelf']` — on-shelf ingredient list
- `['cocktails', filters]` — index and Tonight sections (near-miss = `{missing: 1}`)
- `['shopping-list']`
- `['cocktail', slug]`
- `['tags']`, `['profile']`, `['bar']` — bootstrap, long stale time

Shelf/shopping mutations invalidate `['shelf']`, `['shopping-list']`, and all
`['cocktails', *]` — can-make and near-miss are server-derived from shelf state,
so they must refetch after any shelf change.

## 5. Interaction rules

- **Chip toggle is optimistic**: flip UI state immediately, fire batch-store /
  batch-delete, roll back on error (design: 150–200 ms state motion; API
  latency must not gate the flip).
- **Check-off (shopping → shelf)** is two calls; run batch-store first, and on
  success batch-delete from the list. If the delete fails the item appears in
  both places — harmless, visible, self-healing on next sync. Never the reverse
  order (item vanishing entirely is data loss from the user's view).
- **Search degrades**: if Meilisearch is unreachable, type-ahead disables and
  Index falls back to `filter[name]` REST queries (ADR-004 consequence).
- **Empty states are directive** (design system §Empty states): Tonight with an
  empty shelf says what to add, wired from `bars/{id}/ingredients/recommend`.

## 6. Component contracts

Typed props for the design system's build-order inventory (states per the
design doc; all interactive elements keyboard-operable, focus-visible 2px brass
outline):

1. `IngredientChip { ingredient, state: 'default' | 'in-shelf' | 'disabled', onToggle }`
2. `ShelfRow { ingredient, bottle?: { brand, remainingFraction }, onRemove }` — fraction text, never a progress bar
3. `DrinkCard { cocktail, matchState: 'full' | 'partial' | 'near-miss' | 'none' }` — per-ingredient stock coloring from the cocktail resource
4. `MatchHeader { count, label }` — fleuron dividers
5. `ShoppingListItem { ingredient, unlocks: number, onCheckOff }`
6. `RatioDevice { parts: RatioPart[] }` — leads every recipe view
7. `FamilyBar { families, active, onSelect }` — segmented, caps utility voice
8. `SearchField`, 9. empty states, 10. `QuantityStepper` / `ModalFrame` / `Toast`

## 7. Open items (deliberately deferred)

- Final family taxonomy names (content decision, not architecture).
- Bottle-level "volume remaining" has no upstream field; candidate homes:
  user ingredient note or price/inventory records. Resolve when Shelf rows
  gain bottle detail (post-MVP).
