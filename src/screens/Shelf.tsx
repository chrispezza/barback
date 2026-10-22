import { useState } from 'preact/hooks';
import { Button } from '@ds/core/Button';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import { ShelfRow } from '@ds/inventory/ShelfRow';
import { EmptyState } from '@ds/feedback/EmptyState';
import { IngredientChip } from '@ds/inventory/IngredientChip';
import { SearchField } from '@ds/forms/SearchField';
import {
  useBarId,
  useBars,
  useIngredientsByIds,
  useProfile,
  useShelf,
  useShelfMutation,
} from '../api/queries';
import { useIngredientSearch } from '../api/search';
import type { Ingredient } from '../api/types';
import { useLogout } from '../app';
import { ErrorLine } from '../components/ErrorLine';
import { isPlaced, ledgerGroups, rootIdOf, rootIdsOf } from '../data/hierarchy';
import { useDebounced } from '../hooks';

export function Shelf() {
  const barId = useBarId();
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
  // (ADR-004). A search with neither answering, or one waiting paused for the
  // network while the device is offline (chrispezza/barback#107), has no
  // answer: the chip row says so in the error voice and shows no chip, not even
  // one from an earlier query (ADR-007 Consequences; the Index's search rule).
  // A paused search goes out again by itself on reconnect.
  const searchUnanswered = results.isError || results.isPaused;
  const hits = searchUnanswered ? undefined : results.data;
  const shelfIds = new Set(shelf.data?.data.map((i) => i.id) ?? []);

  const rows = shelf.data?.data ?? [];
  const bottleCount = shelf.data?.meta?.total ?? rows.length;

  // Ledger grouping: bottles under their root ancestor (Spirits, Liqueurs…).
  // A bottle just tapped on has no place in the hierarchy until the shelf is
  // read back; its chip and the count carry it until then. So does a bottle
  // whose group is being named, so the groups already named stay put. Only
  // while that lookup is out: paused offline, every bottle shows, flat.
  const placedRows = rows.filter(isPlaced);
  const rootNames = useIngredientsByIds(barId, rootIdsOf(placedRows));
  const ledgerRows =
    rootNames.isPlaceholderData && rootNames.fetchStatus === 'fetching'
      ? placedRows.filter((r) => rootNames.data.has(rootIdOf(r)))
      : placedRows;
  const groups = ledgerGroups(ledgerRows, rootNames.data);

  function removeRow(ingredient: Ingredient) {
    mutation.toggle({ ingredient, action: 'remove' });
  }

  // The remove action is always visible (touch-reachable) but quiet at rest;
  // the destructive treatment appears on hover/focus — see index.css.
  const shelfRowLine = (i: Ingredient) => (
    <div class="shelf-row-line" key={i.id}>
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
    <main class="screen screen--narrow">
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
          {hits?.length === 0 && (
            <p class="recipe-aside">Nothing by that name.</p>
          )}
        </div>
      )}
      {/* "Counting the shelf…" only while the count is under way: a shelf
          that cannot be read, its own read or the bar's having failed, is
          answered by the error line alone. One bottle is "1 bottle". */}
      {(shelf.data || !shelfFailed) && (
        <p class="recipe-aside shelf-count" aria-busy={!shelf.data}>
          {shelf.data
            ? `${bottleCount} bottle${bottleCount === 1 ? '' : 's'} on the shelf.`
            : 'Counting the shelf…'}
        </p>
      )}
      {(shelfFailed || profileFailed) && <ErrorLine onRetry={retry} />}

      {groups ? (
        groups.map(({ label, rows: groupRows }) => (
          <section key={label}>
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
