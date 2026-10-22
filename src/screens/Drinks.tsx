import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@ds/core/Button';
import { DrinkCard } from '@ds/drinks/DrinkCard';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import { RatioDevice } from '@ds/drinks/RatioDevice';
import { EmptyState } from '@ds/feedback/EmptyState';
import { SearchField } from '@ds/forms/SearchField';
import { useBarId, useBars, useCocktails, useShelf } from '../api/queries';
import { useCocktailSearch } from '../api/search';
import { shelfIndex, type Cocktail, type ListResponse } from '../api/types';
import { unlessFailed, useFamilyDrinks, useIndexPage } from '../api/unlocks';
import { ErrorLine } from '../components/ErrorLine';
import { FamilyPicker, useActiveFamily } from '../components/FamilyPicker';
import { cardIngredients, familyHoldsNoDrinks, familyNextStep, matchState } from '../data/match';
import { useDebounced } from '../hooks';

/**
 * The total of a count-only read, or undefined while it is unread, still
 * shows the previous family's answer (placeholderData across a family switch),
 * or has failed: the header never states another family's counts under this
 * one's name, nor the counts a failed refetch left in hand (ADR-007
 * Consequences; chrispezza/barback#105).
 */
function countOf(read: {
  data: ListResponse<Cocktail> | undefined;
  isError: boolean;
  isPlaceholderData: boolean;
}): number | undefined {
  return read.isPlaceholderData ? undefined : unlessFailed(read)?.meta?.total;
}

/** "of 23 sours", "of 1 sour": families.ts names the plural, and one drink
 *  drops its final "s" ("tiki drinks", "tiki drink"). */
function familyNoun(plural: string, count: number): string {
  return count === 1 ? plural.replace(/s$/, '') : plural;
}

export function Drinks() {
  const barId = useBarId();
  const family = useActiveFamily();
  const { route, url, query } = useLocation();

  // A cold start with the API out of reach (ADR-007; chrispezza/barback#68):
  // /bars fails first, and every read keyed on the bar, search included, stays
  // disabled and never errors on its own. The index and the matches say so as
  // a read of their own that failed does, and Retry asks again for /bars too.
  const bars = useBars();
  const barsFailed = barId === undefined && bars.isError;
  /** Ask again for what failed: the bar the section waits on, and its own reads. */
  function retry(...own: { isError: boolean; refetch: () => Promise<unknown> }[]) {
    if (barsFailed) void bars.refetch();
    for (const read of own) if (read.isError) void read.refetch();
  }

  // Search is a filter on the index, not a second list: Meilisearch (or the
  // REST name filter) ranks the ids, then the full resources come back with
  // stock flags so hits render as the same cards as everything else.
  const [searchQuery, setSearchQuery] = useState('');
  const hasQuery = searchQuery.trim().length >= 1;
  const searchHits = useCocktailSearch(useDebounced(searchQuery, 200));
  // A search with no answer says so and states nothing it once read
  // (ADR-007): no count, and no card left over from an earlier answer. It
  // failed, or the device is offline and the read waits paused for the
  // network (chrispezza/barback#107); a paused read goes out again by itself
  // on reconnect.
  const searchUnanswered = searchHits.isError || searchHits.isPaused;
  const answer = searchUnanswered ? undefined : searchHits.data;
  const hitIds = answer?.hits.map((h) => h.id) ?? [];
  const hitCocktails = useCocktails(
    barId,
    { id: hitIds.join(',') },
    Math.max(hitIds.length, 1),
    hasQuery && hitIds.length > 0,
  );
  const hitRank = new Map(hitIds.map((id, i) => [id, i]));
  // The by-id read keeps its previous answer across a key change; only the
  // cards this answer ranked are listed, and none while that read has failed
  // or waits offline: their stock marks would be cached answers (ADR-007).
  const hitsUnanswered = hitCocktails.isError || hitCocktails.isPaused;
  const hits = hitsUnanswered
    ? []
    : (hitCocktails.data?.data ?? [])
        .filter((c) => hitRank.has(c.id))
        .sort((a, b) => (hitRank.get(a.id) ?? 0) - (hitRank.get(b.id) ?? 0));
  // "Matches · 50" over twelve cards says why the rest are not listed.
  const partial =
    answer !== undefined && !hitCocktails.isPlaceholderData && hits.length > 0 && answer.total > hits.length
      ? `The first ${hits.length} of ${answer.total} — type more of the name to narrow them.`
      : null;

  const page = Math.max(1, Number(query['page']) || 1);
  const showFavorites = query['fav'] === '1';
  // The family's tag id is known once GET /tags answers. Until then its reads
  // wait: asked for without the tag they would be the whole index, listed
  // under this family's header (ADR-002 Validation: one tag-filtered query;
  // chrispezza/barback#73). The list shows its heading with no count meanwhile.
  const familyPending = family?.pending === true;
  const filters = {
    ...(family?.tagId !== undefined ? { tag_id: family.tagId } : {}),
    ...(showFavorites ? { favorites: true } : {}),
  };
  // Across a page change the page in hand stays until the next lands; across
  // a family or favourites change, nothing does (indexPageOptions).
  const cocktails = useIndexPage(barId, filters, 50, page, !familyPending);
  // A read whose refetch failed keeps its last answer beside the error, and
  // its cards' match marks are stock answers: the list shows the error line
  // alone, with no count, no card and no pager (ADR-007 Consequences, "No
  // stock answer is ever served stale"; chrispezza/barback#105).
  const listed = unlessFailed(cocktails);

  function buildUrl(next: number, fav: boolean) {
    const path = url.split('?')[0] ?? '/drinks';
    const params = new URLSearchParams();
    const suffix = query['family'];
    if (suffix) params.set('family', suffix);
    if (fav) params.set('fav', '1');
    if (next > 1) params.set('page', String(next));
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }

  function goToPage(next: number) {
    route(buildUrl(next, showFavorites));
  }

  // Family stock summary (frontend-spec §6): "You can pour 8 of 23 sours · 6
  // are one bottle away", every count the pagination total of a tag_id-filtered
  // read. The total is a count-only read of its own: the list below carries
  // the favourites filter, and the family's total does not.
  const hasFamilyTag = family?.tagId !== undefined;
  const familyTotal = useCocktails(barId, { tag_id: family?.tagId }, 1, hasFamilyTag);
  const familyCanMake = useCocktails(
    barId,
    { on_shelf: true, tag_id: family?.tagId },
    1,
    hasFamilyTag,
  );
  const familyNearMiss = useCocktails(
    barId,
    { missing_ingredients: 1, tag_id: family?.tagId },
    1,
    hasFamilyTag,
  );
  const total = countOf(familyTotal);
  const canMake = countOf(familyCanMake);
  const nearMiss = countOf(familyNearMiss);
  // A family that holds no drinks states no "0 of 0": the header says so, and
  // where to go instead (frontend-spec §5 "Empty states are directive";
  // chrispezza/barback#74).
  const summary =
    family !== undefined &&
    hasFamilyTag &&
    total !== undefined &&
    total > 0 &&
    canMake !== undefined &&
    nearMiss !== undefined
      ? `You can pour ${canMake} of ${total} ${familyNoun(family.def.plural, total)} · ${
          nearMiss === 1 ? '1 is one bottle away.' : `${nearMiss} are one bottle away.`
        }`
      : null;

  const lastPage = listed?.meta?.last_page ?? 1;

  // GET /cocktails carries no variant flags: a card reads a held child brand
  // off the shelf (chrispezza/barback#20). Only off a shelf that answered: a
  // refetch that failed leaves the last answer in hand, and a brand taken off
  // the shelf since would still read as held. Without it a card reads its own
  // line flags (chrispezza/barback#104).
  const shelf = useShelf(barId);
  const shelfRead = unlessFailed(shelf);
  const shelfIdx = shelfRead ? shelfIndex(shelfRead.data) : undefined;
  // The index draws on the list, the shelf its cards are read against, and the
  // family's three counts. One line for whatever failed, and Retry asks for
  // each of them again, or the list comes back alone: the cards against no
  // shelf, or no summary, with nothing to say why (ADR-007 Consequences, "say
  // so in the error voice"; chrispezza/barback#104 Option 1, the fallback
  // cards only under an error line).
  const indexReads = [cocktails, shelf, familyTotal, familyCanMake, familyNearMiss];
  const indexFailed = barsFailed || indexReads.some((read) => read.isError);
  // A search's hits are read against the same shelf.
  const searchFailed = searchUnanswered || hitsUnanswered || barsFailed || shelf.isError;

  // Where nothing in the family pours, the header names what opens it, from
  // the gaps the family's cards name (frontend-spec §6 Journey 2,
  // "Family-aware empty states ... come from this journey's gap data";
  // chrispezza/barback#74): the sentence Tonight's family empty state says.
  // Its drinks are every page of the family, the first the list's own read;
  // they are asked for only once the counts say nothing pours. Only against a
  // shelf that answered (shelfIdx): without it, a bottle a held child brand
  // covers would be named (chrispezza/barback#20).
  const nothingPours = summary !== null && canMake === 0;
  const familyDrinks = useFamilyDrinks(barId, family?.tagId, nothingPours);
  let nextStep: string | undefined;
  if (family !== undefined && hasFamilyTag && total === 0) {
    nextStep = familyHoldsNoDrinks(family.def.plural);
  } else if (
    family !== undefined &&
    nothingPours &&
    shelfIdx !== undefined &&
    typeof familyDrinks !== 'string' &&
    // The count says the family holds drinks: a read that lists none says
    // nothing beside it.
    familyDrinks.length > 0
  ) {
    nextStep = familyNextStep(familyDrinks, shelfIdx, family.def.plural);
  }

  const card = (c: Cocktail) => (
    <li key={c.id}>
      <DrinkCard
        name={c.name}
        favorited={c.is_favorited}
        href={`/drinks/${c.slug}`}
        ingredients={cardIngredients(c, shelfIdx)}
        match={matchState(c, shelfIdx)}
      />
    </li>
  );

  return (
    <main class="screen screen--index">
      <h1>Drinks</h1>
      <FamilyPicker />

      <SearchField
        value={searchQuery}
        label="Find a drink"
        placeholder="Search by name"
        onChange={setSearchQuery}
        onClear={() => setSearchQuery('')}
      />

      {hasQuery ? (
        <section aria-live="polite">
          {/* Every match, not the page that came back (Content fundamentals:
              numbers are stated flatly). */}
          <MatchHeader label="Matches" count={answer?.total} />
          {/* Search answers from Meilisearch or, failing that, the REST name
              filter (ADR-004); the hits then come back as full cards, read
              against the shelf. One line for whichever failed. */}
          {searchFailed && <ErrorLine onRetry={() => retry(searchHits, hitCocktails, shelf)} />}
          {answer?.total === 0 && <p class="recipe-aside">Nothing by that name.</p>}
          {partial && <p>{partial}</p>}
          <ul class="card-list">{hits.map(card)}</ul>
        </section>
      ) : (
        <>
          {family && (
            <header>
              <div class="recipe-ratio">
                <RatioDevice parts={family.def.canonicalRatio} size="md" />
              </div>
              <p class="recipe-aside">
                {family.def.blurb}
                {import.meta.env.DEV &&
                  family.tagId === undefined &&
                  !family.pending &&
                  ' — dev: family not yet tagged upstream; showing all drinks.'}
              </p>
              {summary && <p>{summary}</p>}
              {nextStep && <p class="recipe-aside">{nextStep}</p>}
            </header>
          )}

          <p class="favorites-filter-row">
            <Button
              variant={showFavorites ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={showFavorites}
              onClick={() => route(buildUrl(1, !showFavorites))}
            >
              {showFavorites ? '✓ Favorites' : 'Favorites'}
            </Button>
          </p>

          <MatchHeader label={showFavorites ? 'Favorites' : 'The index'} count={listed?.meta?.total} />
          {showFavorites && listed?.meta?.total === 0 && (
            <EmptyState
              body="Nothing favorited yet — Favorite on any recipe starts the collection."
              action={
                <Button variant="secondary" size="sm" onClick={() => route('/first-pours')}>
                  Start with the classics
                </Button>
              }
            />
          )}
          {indexFailed && <ErrorLine onRetry={() => retry(...indexReads)} />}
          <ul class="card-list">{listed?.data.map(card)}</ul>

          {lastPage > 1 && (
            <div class="pager">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </Button>
              <span class="pager-info">
                Page {page} of {lastPage}
              </span>
              <Button variant="ghost" size="sm" disabled={page >= lastPage} onClick={() => goToPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
