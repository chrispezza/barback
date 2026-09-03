import { useState } from 'preact/hooks';
import { Button } from '@ds/core/Button';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import { ShelfRow } from '@ds/inventory/ShelfRow';
import { EmptyState } from '@ds/feedback/EmptyState';
import { IngredientChip } from '@ds/inventory/IngredientChip';
import { SearchField } from '@ds/forms/SearchField';
import {
  useBarId,
  useIngredientsByIds,
  useProfile,
  useShelf,
  useShelfMutation,
} from '../api/queries';
import { useIngredientSearch } from '../api/search';
import type { Ingredient } from '../api/types';
import { useLogout } from '../app';
import { ErrorLine } from '../components/ErrorLine';
import { useDebounced } from '../hooks';

/** Root ancestor id from the materialized path; a root groups under itself. */
function rootIdOf(ingredient: Ingredient): number {
  const first = ingredient.materialized_path?.split('/')[0];
  return first ? Number(first) : ingredient.id;
}

export function Shelf() {
  const barId = useBarId();
  const { data: profile } = useProfile();
  const shelf = useShelf(barId);
  const mutation = useShelfMutation(barId, profile?.id);
  const logout = useLogout();

  const [q, setQ] = useState('');
  const results = useIngredientSearch(useDebounced(q, 200));
  const shelfIds = new Set(shelf.data?.data.map((i) => i.id) ?? []);

  const rows = shelf.data?.data ?? [];

  // Ledger grouping: bottles under their root ancestor (Spirits, Liqueurs…).
  const rootIds = [...new Set(rows.map(rootIdOf))];
  const rootNames = useIngredientsByIds(barId, rootIds);
  const groups = new Map<string, Ingredient[]>();
  for (const row of rows) {
    const label = rootNames.data?.get(rootIdOf(row)) ?? '';
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  // Spirits lead the ledger; the rest read alphabetically.
  const groupNames = [...groups.keys()].sort((a, b) =>
    a === 'Spirits' ? -1 : b === 'Spirits' ? 1 : a.localeCompare(b),
  );
  const isGrouped = rootNames.data !== undefined && !groups.has('');

  function removeRow(ingredient: Ingredient) {
    if (!mutation.isPending) {
      mutation.mutate({ ingredientId: ingredient.id, action: 'remove' });
    }
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
          {results.data?.map((hit) => {
            const isOnShelf = shelfIds.has(hit.id);
            return (
              <IngredientChip
                key={hit.id}
                label={hit.name}
                state={isOnShelf ? 'have' : 'default'}
                disabled={mutation.isPending}
                onToggle={() =>
                  mutation.mutate({
                    ingredientId: hit.id,
                    action: isOnShelf ? 'remove' : 'add',
                  })
                }
              />
            );
          })}
          {results.data?.length === 0 && (
            <p class="recipe-aside">Nothing by that name.</p>
          )}
        </div>
      )}
      <p class="recipe-aside shelf-count" aria-busy={!shelf.data}>
        {shelf.data
          ? `${shelf.data.meta?.total ?? rows.length} bottles on the shelf.`
          : 'Counting the shelf…'}
      </p>
      {shelf.isError && <ErrorLine onRetry={() => void shelf.refetch()} />}

      {isGrouped ? (
        groupNames.map((label) => (
          <section key={label}>
            <MatchHeader label={label} count={groups.get(label)?.length} align="left" />
            {groups.get(label)?.map(shelfRowLine)}
          </section>
        ))
      ) : (
        <div>{rows.map(shelfRowLine)}</div>
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
