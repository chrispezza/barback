import { useLocation } from 'preact-iso';
import { FAMILIES, familyByTag, type FamilyDef } from '../data/families';
import { useBarId, useTags } from '../api/queries';

interface ActiveFamily {
  def: FamilyDef;
  /** Bar Assistant tag id, once the family tags exist upstream. */
  tagId: number | undefined;
}

/** Reads ?family=<tag-suffix> from the URL (frontend-spec §6). */
export function useActiveFamily(): ActiveFamily | undefined {
  const { query } = useLocation();
  const barId = useBarId();
  const { data: tags } = useTags(barId);
  const slug = query['family'];
  if (!slug) return undefined;
  const def = familyByTag(`family:${slug}`);
  if (!def) return undefined;
  return { def, tagId: tags?.find((t) => t.name === def.tag)?.id };
}

/**
 * Segmented, single-select family bar (frontend-spec §6). Skeleton markup —
 * The Back Bar's caps utility styling lands with the design system.
 */
export function FamilyPicker() {
  const { route, url, query } = useLocation();
  const active = query['family'];

  function select(suffix: string | null) {
    const path = url.split('?')[0] ?? '/';
    route(suffix ? `${path}?family=${suffix}` : path);
  }

  return (
    <nav aria-label="Drink family">
      <button type="button" aria-pressed={!active} onClick={() => select(null)}>
        ALL
      </button>
      {FAMILIES.map((f) => {
        const suffix = f.tag.replace('family:', '');
        return (
          <button
            type="button"
            key={f.tag}
            aria-pressed={active === suffix}
            onClick={() => select(suffix)}
          >
            {f.displayName}
          </button>
        );
      })}
    </nav>
  );
}
