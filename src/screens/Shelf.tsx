import { useBarId, useProfile, useShelf, useShelfMutation } from '../api/queries';

export function Shelf() {
  const barId = useBarId();
  const { data: profile } = useProfile();
  const shelf = useShelf(barId);
  const mutation = useShelfMutation(barId, profile?.id);

  return (
    <main class="screen">
      <h1>Shelf</h1>
      <p>{shelf.data?.meta?.total ?? shelf.data?.data.length ?? '…'} ingredients in your bar</p>
      <ul>
        {shelf.data?.data.map((i) => (
          <li key={i.id}>
            {i.name}{' '}
            <button
              type="button"
              onClick={() => mutation.mutate({ ingredientId: i.id, action: 'remove' })}
            >
              remove
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
