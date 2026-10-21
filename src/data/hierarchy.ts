// Hierarchy-aware brand counting (frontend-spec §9 "Shelf ledger",
// "Hierarchy-aware brands"): pure derivations over the upstream ingredient
// hierarchy, kept out of the screens so they can be checked (ADR-011). No
// client-owned data lives here (ADR-002); every input is an upstream field.
//
// `materialized_path` upstream is the ancestor ids, root first, "/"-joined
// with a trailing "/" ("1/5/6/7/"), and null for a root
// (app/Models/ValueObjects/MaterializedPath.php in the reference clone).

import type { Ingredient, IngredientDetail } from '../api/types';

/**
 * Whether upstream has placed the row in the hierarchy. IngredientResource
 * always sends `materialized_path` (null for a root), so a row without one is
 * the client's own pending entry: a bottle toggled onto the shelf whose
 * read-back has not landed (useShelfMutation). It has no root to group under
 * yet, so the ledger leaves it out until it has.
 */
export function isPlaced(row: Pick<Ingredient, 'id' | 'materialized_path'>): boolean {
  return row.materialized_path !== undefined;
}

/** Root ancestor id from the materialized path; a root groups under itself. */
export function rootIdOf(ingredient: Pick<Ingredient, 'id' | 'materialized_path'>): number {
  const first = ingredient.materialized_path?.split('/')[0];
  return first ? Number(first) : ingredient.id;
}

/** Distinct root ids of the rows, in first-seen order — the ledger's name lookup. */
export function rootIdsOf(rows: Pick<Ingredient, 'id' | 'materialized_path'>[]): number[] {
  return [...new Set(rows.map(rootIdOf))];
}

export interface LedgerGroup<T> {
  /** The root ancestor's name: "Spirits", "Liqueurs"… */
  label: string;
  /** The group's bottles, in shelf order. */
  rows: T[];
}

/**
 * The shelf ledger: bottles grouped under their root ancestor's name, Spirits
 * first, the rest alphabetical. Null — render the flat list in shelf order —
 * until the root names have loaded, or while any row's root has no name.
 */
export function ledgerGroups<T extends Pick<Ingredient, 'id' | 'materialized_path'>>(
  rows: T[],
  rootNames: ReadonlyMap<number, string> | undefined,
): LedgerGroup<T>[] | null {
  if (rootNames === undefined) return null;
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const label = rootNames.get(rootIdOf(row)) ?? '';
    if (label === '') return null;
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  // Spirits lead the ledger; the rest read alphabetically.
  return [...groups.keys()]
    .sort((a, b) => (a === 'Spirits' ? -1 : b === 'Spirits' ? 1 : a.localeCompare(b)))
    .map((label) => ({ label, rows: groups.get(label) ?? [] }));
}

export interface Reach {
  /** Recipes that call the bottle, or its direct parent when `via` is set. */
  count: number;
  /** The direct parent's name, when the count is the parent's. */
  via?: string;
}

/**
 * The parent a bottle's reach falls back to: its direct parent, consulted only
 * when the bottle itself is in no recipe. Null when there is nothing to ask.
 */
export function reachFallbackParent(
  own: IngredientDetail | undefined,
): NonNullable<IngredientDetail['hierarchy']>['parent_ingredient'] {
  if (own?.cocktails_count !== 0) return null;
  return own.hierarchy?.parent_ingredient ?? null;
}

/**
 * How far a bottle reaches when it unlocks nothing outright: the recipes that
 * call it (its own `cocktails_count`), or — for a brand-level child that no
 * recipe names (Laphroaig 10) — its direct parent's count, said "via" the
 * parent (Islay Scotch). `own` and `parent` are the `GET /ingredients/{id}`
 * details, undefined while loading. Undefined when there is nothing to say.
 */
export function reachOf(
  own: IngredientDetail | undefined,
  parent: IngredientDetail | undefined,
): Reach | undefined {
  const ownCount = own?.cocktails_count;
  if (ownCount === undefined) return undefined;
  if (ownCount > 0) return { count: ownCount };
  const via = reachFallbackParent(own);
  const parentCount = parent?.cocktails_count;
  if (via !== null && parentCount !== undefined && parentCount > 0) {
    return { count: parentCount, via: via.name };
  }
  return undefined;
}

/** The list row's detail line for a reach: "In 12 drinks as Islay Scotch". */
export function reachDetail(reach: Reach): string {
  return `In ${reach.count} drink${reach.count === 1 ? '' : 's'}${
    reach.via ? ` as ${reach.via}` : ''
  }`;
}
