const { ShelfRow, IngredientChip, SearchField, Button, EmptyState, MatchHeader, QuantityStepper } = window.TheBackBarDesignSystem_3399bd;

function ShelfScreen({ shelf, pantry, onAdd, onRemove }) {
  const [q, setQ] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const have = new Set(shelf.map((b) => b.name));
  const rows = shelf.filter((b) => b.name.toLowerCase().includes(q.toLowerCase()) || (b.brand || "").toLowerCase().includes(q.toLowerCase()));
  const spirits = rows.filter((b) => ["Rye whiskey", "White rum", "Cognac", "Gin", "Bourbon", "Aged rum", "Tequila"].includes(b.name));
  const modifiers = rows.filter((b) => !spirits.includes(b));
  return (
    <div>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, paddingBottom: 20, borderBottom: "1px solid var(--rule-hairline)" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", textIndent: "0.16em", color: "var(--cream-400)" }}>The Back Bar</div>
          <h1 style={{ margin: "10px 0 0", fontFamily: "var(--font-display)", fontSize: 44, lineHeight: 1.08, color: "var(--cream-100)" }}>Shelf</h1>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 280 }}><SearchField value={q} placeholder="Search the shelf" onChange={setQ} onClear={() => setQ("")} /></div>
          <Button onClick={() => setAdding(!adding)}>{adding ? "Done" : "Add a bottle"}</Button>
        </div>
      </header>

      {adding && (
        <section style={{ padding: "22px 0", borderBottom: "1px solid var(--rule-faint)" }}>
          <MatchHeader label="Pantry" align="center" />
          <p style={{ margin: "12px 0 14px", fontSize: 15, fontStyle: "italic", fontFamily: "var(--font-serif)", color: "var(--cream-400)" }}>Tap what is in the house. Brass means you have it.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {pantry.map((p) => (
              <IngredientChip key={p} label={p} state={have.has(p) ? "have" : "default"} onToggle={() => (have.has(p) ? onRemove(p) : onAdd(p))} />
            ))}
          </div>
        </section>
      )}

      {shelf.length === 0 ? (
        <EmptyState title="The shelf is bare" body="Add a base spirit, a citrus and a sweetener — six drinks open up on the first three bottles." action={<Button onClick={() => setAdding(true)}>Add a bottle</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing by that name" body="Try the brand instead, or clear the search and browse the shelf." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "0 48px", marginTop: 26 }}>
          <section>
            <MatchHeader label="Spirits" count={spirits.length} align="center" />
            <div style={{ marginTop: 8 }}>
              {spirits.map((b) => <ShelfRow key={b.name} {...b} onRemove={() => onRemove(b.name)} />)}
            </div>
          </section>
          <section>
            <MatchHeader label="Modifiers & mixers" count={modifiers.length} align="center" />
            <div style={{ marginTop: 8 }}>
              {modifiers.map((b) => <ShelfRow key={b.name} {...b} onRemove={() => onRemove(b.name)} />)}
            </div>
          </section>
        </div>
      )}

      <footer style={{ marginTop: 34, paddingTop: 18, borderTop: "1px solid var(--rule-faint)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontStyle: "italic", fontFamily: "var(--font-serif)", color: "var(--cream-400)" }}>Bottles on the shelf</span>
        <QuantityStepper value={shelf.length} min={0} max={99} unit="btl" onChange={() => {}} />
      </footer>
    </div>
  );
}

Object.assign(window, { ShelfScreen });
