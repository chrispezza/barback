import { useEffect, useState } from 'preact/hooks';
import { ShelfRow } from '@ds/inventory/ShelfRow';
import { EmptyState } from '@ds/feedback/EmptyState';
import { IngredientChip } from '@ds/inventory/IngredientChip';
import { SearchField } from '@ds/forms/SearchField';
import { useBarId, useProfile, useShelf, useShelfMutation } from '../api/queries';
import { useIngredientSearch } from '../api/search';

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function Shelf() {
  const barId = useBarId();
  const { data: profile } = useProfile();
  const shelf = useShelf(barId);
  const mutation = useShelfMutation(barId, profile?.id);

  const [q, setQ] = useState('');
  const results = useIngredientSearch(useDebounced(q, 200));
  const shelfIds = new Set(shelf.data?.data.map((i) => i.id) ?? []);

  const rows = shelf.data?.data ?? [];

  return (
    <main class="screen">
      <h1>Shelf</h1>

      <SearchField
        value={q}
        label="Add a bottle"
        placeholder="Search ingredients"
        onChange={setQ}
        onClear={() => setQ('')}
      />
      {q.trim().length >= 2 && (
        <div class="chip-row">
          {results.data?.map((hit) => {
            const isOnShelf = shelfIds.has(hit.id);
            return (
              <IngredientChip
                key={hit.id}
                label={hit.name}
                state={isOnShelf ? 'have' : 'default'}
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
      <p class="recipe-aside">
        {shelf.data ? `${shelf.data.meta?.total ?? rows.length} bottles on the shelf.` : '…'}
      </p>
      <div>
        {rows.map((i) => (
          <ShelfRow
            key={i.id}
            name={i.name}
            onRemove={() => mutation.mutate({ ingredientId: i.id, action: 'remove' })}
          />
        ))}
      </div>
      {shelf.data && rows.length === 0 && (
        <EmptyState
          title="Nothing on the shelf"
          body="Add the bottles you own and Tonight starts answering for itself."
        />
      )}
    </main>
  );
}
