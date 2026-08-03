const { DrinkCard, MatchHeader, FamilyFilterBar, ShoppingListItem, EmptyState, Button } = window.TheBackBarDesignSystem_3399bd;

function matchOf(drink, have) {
  const missing = drink.ing.filter((i) => !have.has(i));
  if (missing.length === 0) return "full";
  if (missing.length === 1) return "near";
  if (missing.length <= drink.ing.length - 2) return "partial";
  return "none";
}

function TonightScreen({ drinks, have, onOpen, bought, onBuy }) {
  const [family, setFamily] = React.useState("All");
  const scored = drinks.map((d) => ({ ...d, match: matchOf(d, have), missing: d.ing.filter((i) => !have.has(i)) }));
  const inFamily = (d) => family === "All" || d.family === family;
  const pourable = scored.filter((d) => d.match === "full" && inFamily(d));
  const near = scored.filter((d) => d.match === "near" && inFamily(d));
  const rest = scored.filter((d) => (d.match === "partial" || d.match === "none") && inFamily(d));

  const gaps = {};
  scored.filter((d) => d.match === "near").forEach((d) => { gaps[d.missing[0]] = (gaps[d.missing[0]] || 0) + 1; });
  const list = Object.entries(gaps).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const card = (d) => (
    <DrinkCard key={d.name} name={d.name} family={d.family} match={d.match} onSelect={() => onOpen(d)}
      ingredients={d.ing.map((i) => ({ name: i, have: have.has(i) }))} />
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 48, alignItems: "start" }}>
      <div style={{ minWidth: 0 }}>
        <header style={{ paddingBottom: 20, borderBottom: "1px solid var(--rule-hairline)" }}>
          <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", textIndent: "0.16em", color: "var(--cream-400)" }}>The Back Bar</div>
          <h1 style={{ margin: "10px 0 18px", fontFamily: "var(--font-display)", fontSize: 44, lineHeight: 1.08, color: "var(--cream-100)" }}>Tonight</h1>
          <FamilyFilterBar families={["All", "Sour", "Old Fashioned", "Highball", "Martini", "Flip"]} value={family} onChange={setFamily} />
        </header>

        <section style={{ marginTop: 26 }}>
          <MatchHeader label={pourable.length === 1 ? "Drink" : "Drinks"} count={pourable.length} />
          {pourable.length === 0 ? (
            <EmptyState title="Nothing pours yet" body="Add a citrus and a sweetener and the sours open up." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12, marginTop: 12 }}>{pourable.map(card)}</div>
          )}
        </section>

        {near.length > 0 && (
          <section style={{ marginTop: 28 }}>
            <MatchHeader label="One bottle away" count={near.length} tone="gap" />
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12, marginTop: 12 }}>{near.map(card)}</div>
          </section>
        )}

        {rest.length > 0 && (
          <section style={{ marginTop: 28 }}>
            <MatchHeader label="Further off" count={rest.length} />
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12, marginTop: 12 }}>{rest.map(card)}</div>
          </section>
        )}
      </div>

      <aside style={{ background: "var(--green-800)", border: "1px solid var(--rule-hairline)", borderRadius: 2, padding: "20px 20px 24px", position: "sticky", top: 24 }}>
        <MatchHeader label="Shopping list" count={list.length} tone="gap" />
        <p style={{ margin: "12px 0 6px", fontSize: 15, fontStyle: "italic", fontFamily: "var(--font-serif)", color: "var(--cream-400)" }}>
          Buy in this order. Each line says what it opens.
        </p>
        {list.length === 0 ? (
          <EmptyState body="Nothing to buy — the shelf covers every drink in the index." />
        ) : (
          list.map(([name, n]) => (
            <ShoppingListItem key={name} name={name} unlocks={n} checked={bought.has(name)} onToggle={() => onBuy(name)} />
          ))
        )}
        <div style={{ marginTop: 20 }}>
          <Button variant="secondary" size="sm">Print the list</Button>
        </div>
      </aside>
    </div>
  );
}

Object.assign(window, { TonightScreen, matchOf });
