import { useLocation } from 'preact-iso';
import { FamilyFilterBar } from '@ds/navigation/FamilyFilterBar';
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

const ALL = 'ALL';

/** Segmented, single-select family bar (frontend-spec §6). */
export function FamilyPicker() {
  const { route, url, query } = useLocation();
  const activeSuffix = query['family'];
  const activeDef = activeSuffix ? familyByTag(`family:${activeSuffix}`) : undefined;

  function onChange(name: string) {
    const path = url.split('?')[0] ?? '/';
    if (name === ALL) {
      route(path);
      return;
    }
    const def = FAMILIES.find((f) => f.displayName === name);
    if (def) route(`${path}?family=${def.tag.replace('family:', '')}`);
  }

  return (
    <div class="family-scroll">
      <FamilyFilterBar
        families={[ALL, ...FAMILIES.map((f) => f.displayName)]}
        value={activeDef?.displayName ?? ALL}
        onChange={onChange}
      />
    </div>
  );
}
