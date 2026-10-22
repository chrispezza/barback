import { useLocation } from 'preact-iso';
import { FamilyFilterBar } from '@ds/navigation/FamilyFilterBar';
import { FAMILIES, type FamilyDef } from '../data/families';
import { useBarId, useTags } from '../api/queries';

interface ActiveFamily {
  def: FamilyDef;
  /** Bar Assistant tag id; undefined while GET /tags is in flight (and, in a
   *  dev build only, for a family not yet tagged upstream). */
  tagId: number | undefined;
  /**
   * True while GET /tags has neither answered nor failed (it waits on the
   * bar, so it stays true while /bars is unanswered): the URL names this
   * family, but whether it has a tag, and which, is not yet known. A read
   * scoped to it waits rather than go out unscoped, so the family's name is
   * never shown over the whole bar (ADR-002 Validation;
   * chrispezza/barback#73).
   */
  pending: boolean;
}

/**
 * Upstream tag ids by name, or undefined while GET /tags has not answered. A
 * fetch that failed before it ever answered knows of no tag; one that fails
 * on a later refetch keeps what it had.
 */
function useUpstreamTags(): ReadonlyMap<string, number> | undefined {
  const { data, isError } = useTags(useBarId());
  if (data) return new Map(data.map((t) => [t.name, t.id]));
  return isError ? new Map() : undefined;
}

/**
 * The families the bar offers (frontend-spec §3): those with an upstream tag,
 * in declared order. Until the tags answer, the declared set, so the bar does
 * not jump. A family with no tag has nothing to filter by (ADR-002), so it is
 * not offered — except in a dev build, which keeps it so Drinks can say it is
 * untagged.
 */
function familiesOnBar(tags: ReadonlyMap<string, number> | undefined): FamilyDef[] {
  if (tags === undefined || import.meta.env.DEV) return FAMILIES;
  return FAMILIES.filter((f) => tags.has(f.tag));
}

function resolve(suffix: string | undefined, tags: ReadonlyMap<string, number> | undefined): ActiveFamily | undefined {
  if (!suffix) return undefined;
  const def = familiesOnBar(tags).find((f) => f.tag === `family:${suffix}`);
  return def && { def, tagId: tags?.get(def.tag), pending: tags === undefined };
}

/**
 * Reads ?family=<tag-suffix> from the URL (frontend-spec §6). Only a family
 * the bar offers resolves: one with no upstream tag is no family.
 */
export function useActiveFamily(): ActiveFamily | undefined {
  const { query } = useLocation();
  return resolve(query['family'], useUpstreamTags());
}

const ALL = 'ALL';

/** Segmented, single-select family bar (frontend-spec §6). */
export function FamilyPicker() {
  const { route, url, query } = useLocation();
  const tags = useUpstreamTags();
  const families = familiesOnBar(tags);
  const active = resolve(query['family'], tags);

  // Upstream has no family tag at all: a bar of one "All" offers nothing.
  if (families.length === 0) return null;

  function onChange(name: string) {
    const path = url.split('?')[0] ?? '/';
    if (name === ALL) {
      route(path);
      return;
    }
    const def = families.find((f) => f.displayName === name);
    if (def) route(`${path}?family=${def.tag.replace('family:', '')}`);
  }

  return (
    <div class="family-scroll">
      <FamilyFilterBar
        families={[ALL, ...families.map((f) => f.displayName)]}
        value={active?.def.displayName ?? ALL}
        onChange={onChange}
      />
    </div>
  );
}
