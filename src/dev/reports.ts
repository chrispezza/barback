// ADR-002 validation reports (frontend-spec §3). Dev-only: loaded via dynamic
// import behind import.meta.env.DEV so none of this ships in the bundle.
import { api } from '../api/client';
import { RATIOS, normalizeSlug } from '../data/ratios';
import type { Cocktail, ListResponse } from '../api/types';

let hasRun = false;

export async function runDevReports(barId: number): Promise<void> {
  if (hasRun) return;
  hasRun = true;

  const cocktails: Cocktail[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const res = await api<ListResponse<Cocktail>>(
      `/cocktails?include=tags&per_page=100&page=${page}`,
      { barId },
    );
    cocktails.push(...res.data);
    lastPage = res.meta?.last_page ?? 1;
    page += 1;
  } while (page <= lastPage);

  const slugs = new Set(cocktails.map((c) => normalizeSlug(c.slug)));
  const orphanRatios = RATIOS.filter((r) => !slugs.has(r.cocktailSlug));

  const familyTagCount = (c: Cocktail) =>
    (c.tags ?? []).filter((t) => t.name.startsWith('family:')).length;
  const zeroFamily = cocktails.filter((c) => familyTagCount(c) === 0);
  const multiFamily = cocktails.filter((c) => familyTagCount(c) > 1);

  console.groupCollapsed(
    `[barback] ADR-002 reports — ${cocktails.length} cocktails, ` +
      `${orphanRatios.length} orphan ratios, ${multiFamily.length} multi-family, ` +
      `${zeroFamily.length} unfamilied`,
  );
  if (orphanRatios.length > 0) {
    console.warn(
      'Ratio templates matching no cocktail slug:',
      orphanRatios.map((r) => r.cocktailSlug),
    );
  }
  if (multiFamily.length > 0) {
    console.warn(
      'Cocktails with multiple family: tags (violates the partition rule):',
      multiFamily.map((c) => c.slug),
    );
  }
  // Zero-family is expected for the uncurated bulk — informational, collapsed.
  console.groupCollapsed(`Cocktails with no family: tag (${zeroFamily.length})`);
  console.log(zeroFamily.map((c) => c.slug).join('\n'));
  console.groupEnd();
  console.groupEnd();
}
