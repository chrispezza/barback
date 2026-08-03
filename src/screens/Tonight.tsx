import { useLocation } from 'preact-iso';
import { useBarId, useCocktails } from '../api/queries';
import { FamilyPicker, useActiveFamily } from '../components/FamilyPicker';

export function Tonight() {
  const barId = useBarId();
  const family = useActiveFamily();
  const familyFilter = family?.tagId ? { tag_id: family.tagId } : {};

  const canMake = useCocktails(barId, { on_shelf: true, ...familyFilter });
  const nearMiss = useCocktails(barId, { missing_ingredients: 1, ...familyFilter });
  const { route } = useLocation();

  return (
    <main class="screen">
      <h1>Tonight</h1>
      <FamilyPicker />

      <section>
        <h2>{canMake.data?.meta?.total ?? '…'} drinks you can pour</h2>
        <ul>
          {canMake.data?.data.map((c) => (
            <li key={c.id}>
              <a href={`/drinks/${c.slug}`} onClick={(e) => { e.preventDefault(); route(`/drinks/${c.slug}`); }}>
                {c.name}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>One bottle away · {nearMiss.data?.meta?.total ?? '…'}</h2>
        <ul>
          {nearMiss.data?.data.map((c) => (
            <li key={c.id}>
              <a href={`/drinks/${c.slug}`} onClick={(e) => { e.preventDefault(); route(`/drinks/${c.slug}`); }}>
                {c.name}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
