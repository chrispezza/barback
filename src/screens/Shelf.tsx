import { ShelfRow } from '@ds/inventory/ShelfRow';
import { EmptyState } from '@ds/feedback/EmptyState';
import { useBarId, useProfile, useShelf, useShelfMutation } from '../api/queries';

export function Shelf() {
  const barId = useBarId();
  const { data: profile } = useProfile();
  const shelf = useShelf(barId);
  const mutation = useShelfMutation(barId, profile?.id);

  const rows = shelf.data?.data ?? [];

  return (
    <main class="screen">
      <h1>Shelf</h1>
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
