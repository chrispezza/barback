import { useLocation } from 'preact-iso';
import { useBarId, useCocktails } from '../api/queries';
import { FamilyPicker, useActiveFamily } from '../components/FamilyPicker';
import { RatioDevice } from '../components/RatioDevice';

export function Drinks() {
  const barId = useBarId();
  const family = useActiveFamily();
  const { route } = useLocation();

  const filters = family?.tagId ? { tag_id: family.tagId } : {};
  const cocktails = useCocktails(barId, filters, 50);

  return (
    <main class="screen">
      <h1>Drinks</h1>
      <FamilyPicker />

      {family && (
        <header>
          <RatioDevice parts={family.def.canonicalRatio} />
          <p>
            <em>{family.def.blurb}</em>
            {family.tagId === undefined && ' (family not yet tagged upstream — showing all drinks)'}
          </p>
        </header>
      )}

      <p>{cocktails.data?.meta?.total ?? '…'} drinks</p>
      <ul>
        {cocktails.data?.data.map((c) => (
          <li key={c.id}>
            <a href={`/drinks/${c.slug}`} onClick={(e) => { e.preventDefault(); route(`/drinks/${c.slug}`); }}>
              {c.name}
            </a>
            {c.in_shelf && ' ✓'}
          </li>
        ))}
      </ul>
    </main>
  );
}
