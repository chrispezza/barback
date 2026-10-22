import { useRef, useState } from 'preact/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@ds/core/Button';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import { ShelfRow } from '@ds/inventory/ShelfRow';
import { EmptyState } from '@ds/feedback/EmptyState';
import { IngredientChip } from '@ds/inventory/IngredientChip';
import { SearchField } from '@ds/forms/SearchField';
import {
  isShelfTogglePending,
  useBarId,
  useBars,
  useIngredientsByIds,
  useProfile,
  useShelf,
  useShelfMutation,
} from '../api/queries';
import { useIngredientSearch } from '../api/search';
import type { Ingredient } from '../api/types';
import { unlessFailed } from '../api/unlocks';
import { useLogout } from '../app';
import { ErrorLine } from '../components/ErrorLine';
import { isPlaced, ledgerGroups, rootIdOf, rootIdsOf } from '../data/hierarchy';
import { useDebounced } from '../hooks';

/** A run of ledger rows: a root's group, or the whole ledger while it is flat. */
export interface LedgerRun {
  /** The group's header label; none while the ledger is flat. */
  label?: string;
  rows: readonly { id: number }[];
}

/** Where the focus goes when Remove takes a bottle's row off the ledger. */
export type FocusAfterRemove =
  | { to: 'remove'; id: number }
  | { to: 'group'; label: string }
  | { to: 'screen' };

/**
 * Remove takes its row off the ledger, and the focused button with it, which
 * would leave a keyboard user on the page body (ADR-003 Consequences:
 * focus management handled deliberately). The focus goes to the next bottle's
 * Remove in the same group, or the one before it when the bottle was the
 * group's last. A group that empties is dropped, and the focus goes to the
 * heading of the group now in its place, or of the one before it when it was
 * the last: a heading says the group has gone before the next Enter could
 * remove a bottle from another group. When the shelf empties, the screen's
 * heading. Null when the bottle is not on the ledger.
 */
export function focusAfterRemove(ledger: readonly LedgerRun[], id: number): FocusAfterRemove | null {
  const at = ledger.findIndex((run) => run.rows.some((row) => row.id === id));
  const run = ledger[at];
  if (run === undefined) return null;
  const index = run.rows.findIndex((row) => row.id === id);
  const neighbour = run.rows[index + 1] ?? run.rows[index - 1];
  if (neighbour !== undefined) return { to: 'remove', id: neighbour.id };
  const label = (ledger[at + 1] ?? ledger[at - 1])?.label;
  return label === undefined ? { to: 'screen' } : { to: 'group', label };
}

/**
 * The element a FocusAfterRemove names inside the screen, found by the data
 * attributes Shelf puts on its own wrappers. A heading is made focusable for
 * the purpose (tabIndex -1: never a Tab stop), as RouteEffects does for the
 * screen's h1 (src/app.tsx); MatchHeader renders each group's heading as its
 * h2.
 */
function focusTarget(screen: HTMLElement, target: FocusAfterRemove): HTMLElement | null {
  if (target.to === 'remove') {
    return screen.querySelector<HTMLElement>(`[data-ingredient-id="${target.id}"] button`);
  }
  const heading =
    target.to === 'screen'
      ? screen.querySelector<HTMLElement>('h1')
      : ([...screen.querySelectorAll<HTMLElement>('[data-group]')]
          .find((group) => group.dataset['group'] === target.label)
          ?.querySelector<HTMLElement>('h2') ?? null);
  if (heading) heading.tabIndex = -1;
  return heading;
}

export function Shelf() {
  const barId = useBarId();
  const queryClient = useQueryClient();
  const screen = useRef<HTMLElement>(null);
  const profileQuery = useProfile();
  const profile = profileQuery.data;
  const shelf = useShelf(barId);
  const mutation = useShelfMutation(barId, profile?.id);
  const logout = useLogout();

  // A cold start with the API out of reach (ADR-007; chrispezza/barback#68):
  // /bars and /profile fail first, and the reads keyed on them stay disabled,
  // so they never error on their own. The ledger is keyed on the bar id; every
  // shelf write is a /users/{id}/* call (frontend-spec §2), so the picker and
  // Remove wait on the profile. Either failing is said in the error voice, as
  // the shelf's own read failing is, and Retry asks again for what failed.
  const bars = useBars();
  const barsFailed = barId === undefined && bars.isError;
  const profileFailed = profile?.id === undefined && profileQuery.isError;
  const shelfFailed = shelf.isError || barsFailed;
  function retry() {
    if (barsFailed) void bars.refetch();
    if (profileFailed) void profileQuery.refetch();
    if (shelf.isError) void shelf.refetch();
  }

  const [q, setQ] = useState('');
  const results = useIngredientSearch(useDebounced(q, 200));
  // The picker answers from Meilisearch or, failing that, the REST name filter
  // (ADR-004). A search with neither answering has no answer, and nor has one
  // that waits paused: offline a search fails (networkMode 'always',
  // src/api/client.ts), but a retry that comes due while the page is hidden
  // waits until the page is shown again, and goes out by itself then
  // (query-core's retryer; chrispezza/barback#143). The chip row says so in
  // the error voice and shows no chip, not even one from an earlier query
  // (ADR-007 Consequences; the Index's search rule).
  const searchUnanswered = results.isError || results.isPaused;
  const hits = searchUnanswered ? undefined : results.data;
  // What the chips are marked against, and what decides the write a tap
  // sends: the shelf as last read, or nothing — before its first answer, and
  // once a read of it has failed (a refetch that fails keeps its last answer
  // beside the error; unlessFailed). A chip marked from a stale shelf would
  // send batch-delete for a bottle no longer there, or batch-store for one
  // already on it (ADR-007 Consequences, "No stock answer is ever served
  // stale"; chrispezza/barback#105). With the shelf unknown, a chip claims no
  // state (no "have" mark, no aria-pressed either way) and is held: a tap
  // sends nothing, and the page's error line says why. Held is aria-disabled,
  // never disabled, so a chip keeps the focus a keyboard gave it when a read
  // fails under it (Chromium blurs a focused button that gains `disabled`).
  // A read under way with an answer in hand is not unknown: the toggle cancels
  // it (shelfToggleOptions).
  const shelfRead = unlessFailed(shelf);
  const shelfIds = shelfRead && new Set(shelfRead.data.map((i) => i.id));

  const rows = shelf.data?.data ?? [];
  const bottleCount = shelf.data?.meta?.total ?? rows.length;

  // Ledger grouping: bottles under their root ancestor (Spirits, Liqueurs…).
  // A bottle just tapped on has no place in the hierarchy until the shelf is
  // read back; its chip and the count carry it until then. So does a bottle
  // whose group is being named, so the groups already named stay put. Only
  // while that lookup is fetching: once it has failed (as it does offline) or
  // waits paused (a retry due while the page is hidden), every bottle shows,
  // flat (chrispezza/barback#143).
  const placedRows = rows.filter(isPlaced);
  const rootNames = useIngredientsByIds(barId, rootIdsOf(placedRows));
  const ledgerRows =
    rootNames.isPlaceholderData && rootNames.fetchStatus === 'fetching'
      ? placedRows.filter((r) => rootNames.data.has(rootIdOf(r)))
      : placedRows;
  const groups = ledgerGroups(ledgerRows, rootNames.data);

  function removeRow(ingredient: Ingredient) {
    // A second press on a row whose toggle is still out is dropped by
    // toggleShelf, and the row stays: so does the focus.
    if (!isShelfTogglePending(queryClient, barId, ingredient.id)) {
      // Moved before the row goes, while every target is still on the page;
      // the rows and groups that stay are keyed, so the target stays with them.
      const target = focusAfterRemove(groups ?? [{ rows: ledgerRows }], ingredient.id);
      if (target && screen.current) focusTarget(screen.current, target)?.focus();
    }
    mutation.toggle({ ingredient, action: 'remove' });
  }

  // The remove action is always visible (touch-reachable) but quiet at rest;
  // the destructive treatment appears on hover/focus — see index.css.
  const shelfRowLine = (i: Ingredient) => (
    <div class="shelf-row-line" key={i.id} data-ingredient-id={i.id}>
      <div class="shelf-row-main">
        <ShelfRow name={i.name} />
      </div>
      <Button
        variant="destructive"
        size="sm"
        aria-label={`Remove ${i.name} from the shelf`}
        onClick={() => removeRow(i)}
      >
        Remove
      </Button>
    </div>
  );

  return (
    <main class="screen screen--narrow" ref={screen}>
      <h1>Shelf</h1>

      <SearchField
        value={q}
        label="Add a bottle"
        placeholder="Search ingredients"
        onChange={setQ}
        onClear={() => setQ('')}
      />
      {q.trim().length >= 1 && (
        <div class="chip-row">
          {searchUnanswered && (
            <ErrorLine
              onRetry={() => {
                if (results.isError) void results.refetch();
              }}
            />
          )}
          {hits?.map((hit) => {
            if (shelfIds === undefined) {
              // Held, claiming no state: the chip's rest props reach its
              // button, after the aria-pressed it would otherwise set.
              return (
                <IngredientChip
                  key={hit.id}
                  label={hit.name}
                  aria-pressed={undefined}
                  aria-disabled="true"
                />
              );
            }
            const isOnShelf = shelfIds.has(hit.id);
            return (
              <IngredientChip
                key={hit.id}
                label={hit.name}
                state={isOnShelf ? 'have' : 'default'}
                onToggle={() =>
                  mutation.toggle({
                    ingredient: hit,
                    action: isOnShelf ? 'remove' : 'add',
                  })
                }
              />
            );
          })}
          {/* Directive, never apologetic: the line names what to do next
              (DS readme, Content fundamentals). The bar holds the kinds of
              bottle (rum, gin) and only some brands under them. */}
          {hits?.length === 0 && (
            <p class="recipe-aside">
              Nothing by that name — try fewer letters, or the kind of bottle rather than its brand.
            </p>
          )}
        </div>
      )}
      {/* "Counting the shelf…" only while the count is under way: a shelf
          that cannot be read, its own read or the bar's having failed, is
          answered by the error line alone. One bottle is "1 bottle". A count
          is set in the interface face, never italic Caslon, which is for
          ingredient names and asides and "never for numbers" (DS readme,
          Content fundamentals; chrispezza/barback#66). */}
      {(shelf.data || !shelfFailed) && (
        <p class="shelf-count" aria-busy={!shelf.data}>
          {shelf.data
            ? `${bottleCount} bottle${bottleCount === 1 ? '' : 's'} on the shelf.`
            : 'Counting the shelf…'}
        </p>
      )}
      {(shelfFailed || profileFailed) && <ErrorLine onRetry={retry} />}

      {groups ? (
        groups.map(({ label, rows: groupRows }) => (
          <section key={label} class="shelf-group" data-group={label}>
            <MatchHeader label={label} count={groupRows.length} align="left" />
            {groupRows.map(shelfRowLine)}
          </section>
        ))
      ) : (
        <div>{ledgerRows.map(shelfRowLine)}</div>
      )}

      {shelf.data && rows.length === 0 && (
        <EmptyState
          title="Nothing on the shelf"
          body="Add the bottles you own and Tonight starts answering for itself."
        />
      )}

      {/* The rail carries Log out on desktop; on a phone it lives here. */}
      <p class="logout-row">
        <Button variant="ghost" size="sm" onClick={logout}>
          Log out
        </Button>
      </p>
    </main>
  );
}
