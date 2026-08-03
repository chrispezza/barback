const { Toast } = window.TheBackBarDesignSystem_3399bd;

function NavItem({ label, active, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: "block", width: "100%", textAlign: "left", minHeight: 44, padding: "0 0 0 14px",
      background: "transparent", border: 0, borderLeft: active ? "2px solid var(--brass-500)" : "2px solid transparent",
      color: active ? "var(--brass-500)" : "var(--cream-400)", fontFamily: "var(--font-body)", fontWeight: 600,
      fontSize: 12, textTransform: "uppercase", letterSpacing: "0.10em", textIndent: "0.10em", cursor: "pointer",
      transition: "var(--transition-state)",
    }}>{label}</button>
  );
}

function AppShell() {
  const [tab, setTab] = React.useState("tonight");
  const [shelf, setShelf] = React.useState(window.BB.shelf);
  const [bought, setBought] = React.useState(new Set());
  const [open, setOpen] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const have = new Set(shelf.map((b) => b.name));

  const add = (name) => {
    if (have.has(name)) return;
    setShelf((s) => [...s, { name, brand: "Unopened", volume: "750ml", remaining: "1" }]);
    setToast({ message: `${name} added to the shelf.`, tone: "neutral" });
  };
  const remove = (name) => {
    const prev = shelf;
    setShelf((s) => s.filter((b) => b.name !== name));
    setToast({ message: `${name} removed from the shelf.`, tone: "destructive", undo: () => setShelf(prev) });
  };
  const buy = (name) => {
    setBought((b) => { const n = new Set(b); n.has(name) ? n.delete(name) : n.add(name); return n; });
    if (!bought.has(name)) add(name);
  };

  React.useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--green-900)", display: "grid", gridTemplateColumns: "212px minmax(0,1fr)" }}>
      <nav style={{ borderRight: "1px solid var(--rule-hairline)", padding: "28px 20px", position: "sticky", top: 0, height: "100vh", boxSizing: "border-box" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, lineHeight: 1.15, color: "var(--cream-100)" }}>The<br />Back Bar</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 26px" }}>
          <span style={{ flex: 1, height: 1, background: "var(--rule-faint)" }} />
          <span style={{ fontSize: 10, color: "var(--rule-strong)" }}>◆</span>
          <span style={{ flex: 1, height: 1, background: "var(--rule-faint)" }} />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <NavItem label="Tonight" active={tab === "tonight"} onClick={() => setTab("tonight")} />
          <NavItem label="Shelf" active={tab === "shelf"} onClick={() => setTab("shelf")} />
        </div>
        <div style={{ position: "absolute", bottom: 28, left: 20, right: 20, fontSize: 13, fontStyle: "italic", fontFamily: "var(--font-serif)", color: "var(--sage-600)", lineHeight: 1.4 }}>
          {shelf.length} bottles · {window.BB.drinks.filter((d) => d.ing.every((i) => have.has(i))).length} pourable
        </div>
      </nav>

      <main style={{ padding: "28px 32px 96px", maxWidth: 1180 }}>
        {tab === "shelf"
          ? <ShelfScreen shelf={shelf} pantry={window.BB.pantry} onAdd={add} onRemove={remove} />
          : <TonightScreen drinks={window.BB.drinks} have={have} bought={bought} onBuy={buy} onOpen={setOpen} />}
      </main>

      <RecipeDetail drink={open} have={have} onClose={() => setOpen(null)} onAdd={(n) => { add(n); setOpen(null); }} />

      {toast && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60 }}>
          <Toast message={toast.message} tone={toast.tone} actionLabel={toast.undo ? "Undo" : undefined} onAction={() => { toast.undo && toast.undo(); setToast(null); }} />
        </div>
      )}
    </div>
  );
}

Object.assign(window, { AppShell, NavItem });
