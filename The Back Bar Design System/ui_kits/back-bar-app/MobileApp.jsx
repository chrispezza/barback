const { DrinkCard, MatchHeader, FamilyFilterBar, ShoppingListItem, SearchField, ShelfRow, IngredientChip, Button, RatioDevice } = window.TheBackBarDesignSystem_3399bd;

function MobileTabBar({ tab, setTab }) {
  const item = (id, label) => (
    <button type="button" key={id} onClick={() => setTab(id)} style={{
      flex: 1, minHeight: 56, background: "transparent", border: 0, borderTop: tab === id ? "1px solid var(--brass-500)" : "1px solid transparent",
      color: tab === id ? "var(--brass-500)" : "var(--cream-400)", fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 11,
      textTransform: "uppercase", letterSpacing: "0.10em", textIndent: "0.10em", cursor: "pointer",
    }}>{label}</button>
  );
  return (
    <nav style={{ position: "sticky", bottom: 0, display: "flex", background: "var(--green-900)", borderTop: "1px solid var(--rule-hairline)" }}>
      {item("tonight", "Tonight")}{item("shelf", "Shelf")}{item("list", "List")}
    </nav>
  );
}

function MobileApp() {
  const [tab, setTab] = React.useState("tonight");
  const [family, setFamily] = React.useState("All");
  const [q, setQ] = React.useState("");
  const [shelf, setShelf] = React.useState(window.BB.shelf);
  const [bought, setBought] = React.useState(new Set());
  const have = new Set(shelf.map((b) => b.name));
  const add = (n) => setShelf((s) => s.some((b) => b.name === n) ? s : [...s, { name: n, brand: "Unopened", volume: "750ml", remaining: "1" }]);
  const scored = window.BB.drinks.map((d) => ({ ...d, missing: d.ing.filter((i) => !have.has(i)) }));
  const pourable = scored.filter((d) => d.missing.length === 0 && (family === "All" || d.family === family));
  const near = scored.filter((d) => d.missing.length === 1 && (family === "All" || d.family === family));
  const gaps = {};
  near.forEach((d) => { gaps[d.missing[0]] = (gaps[d.missing[0]] || 0) + 1; });

  const head = (title) => (
    <header style={{ padding: "22px 20px 16px", borderBottom: "1px solid var(--rule-hairline)" }}>
      <div style={{ fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", textIndent: "0.16em", color: "var(--cream-400)" }}>The Back Bar</div>
      <h1 style={{ margin: "8px 0 0", fontFamily: "var(--font-display)", fontSize: 32, lineHeight: 1.12, color: "var(--cream-100)" }}>{title}</h1>
    </header>
  );
  const card = (d) => (
    <DrinkCard key={d.name} name={d.name} family={d.family} match={d.missing.length === 0 ? "full" : d.missing.length === 1 ? "near" : "partial"}
      ingredients={d.ing.map((i) => ({ name: i, have: have.has(i) }))} />
  );

  return (
    <div style={{ width: 390, minHeight: 844, background: "var(--green-900)", display: "flex", flexDirection: "column", border: "1px solid var(--rule-hairline)" }}>
      <div style={{ flex: 1 }}>
        {tab === "tonight" && (<>
          {head("Tonight")}
          <div style={{ padding: "16px 20px 0" }}><FamilyFilterBar families={["All", "Sour", "Old Fashioned", "Highball"]} value={family} onChange={setFamily} /></div>
          <div style={{ padding: "20px 20px 0" }}>
            <MatchHeader label="Drinks" count={pourable.length} />
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>{pourable.slice(0, 3).map(card)}</div>
            <div style={{ height: 22 }} />
            <MatchHeader label="One bottle away" count={near.length} tone="gap" />
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>{near.slice(0, 2).map(card)}</div>
          </div>
        </>)}
        {tab === "shelf" && (<>
          {head("Shelf")}
          <div style={{ padding: "16px 20px 0" }}><SearchField value={q} placeholder="Search the shelf" onChange={setQ} onClear={() => setQ("")} /></div>
          <div style={{ padding: "18px 20px 0" }}>
            <MatchHeader label="On the shelf" count={shelf.length} />
            <div style={{ marginTop: 6 }}>
              {shelf.filter((b) => b.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8).map((b) => <ShelfRow key={b.name} {...b} onRemove={() => setShelf((s) => s.filter((x) => x.name !== b.name))} />)}
            </div>
            <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 10 }}>
              {window.BB.pantry.slice(0, 4).map((p) => <IngredientChip key={p} label={p} state={have.has(p) ? "have" : "default"} onToggle={() => add(p)} />)}
            </div>
          </div>
        </>)}
        {tab === "list" && (<>
          {head("Shopping list")}
          <div style={{ padding: "18px 20px 0" }}>
            <p style={{ margin: "0 0 8px", fontSize: 15, fontStyle: "italic", fontFamily: "var(--font-serif)", color: "var(--cream-400)" }}>Buy in this order. Each line says what it opens.</p>
            {Object.entries(gaps).sort((a, b) => b[1] - a[1]).map(([n, c]) => (
              <ShoppingListItem key={n} name={n} unlocks={c} checked={bought.has(n)} onToggle={() => { setBought((b) => { const s = new Set(b); s.has(n) ? s.delete(n) : s.add(n); return s; }); add(n); }} />
            ))}
            <div style={{ marginTop: 22 }}><RatioDevice size="sm" parts={[{ value: "2", label: "Spirit" }, { value: "¾", label: "Citrus" }, { value: "¾", label: "Sweet" }]} /></div>
            <p style={{ marginTop: 14, fontSize: 13, fontStyle: "italic", fontFamily: "var(--font-serif)", color: "var(--sage-600)" }}>Most of what you are missing is a sweetener, not a spirit.</p>
          </div>
        </>)}
      </div>
      <MobileTabBar tab={tab} setTab={setTab} />
    </div>
  );
}

Object.assign(window, { MobileApp, MobileTabBar });
