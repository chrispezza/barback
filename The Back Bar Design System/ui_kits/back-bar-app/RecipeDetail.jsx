const { ModalFrame, RatioDevice, Button, IngredientChip } = window.TheBackBarDesignSystem_3399bd;

function RecipeDetail({ drink, have, onClose, onAdd }) {
  if (!drink) return null;
  const missing = drink.ing.filter((i) => !have.has(i));
  return (
    <ModalFrame
      overlay
      eyebrow={drink.family}
      title={drink.name}
      onDismiss={onClose}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        {missing.length > 0 && <Button size="sm" onClick={() => onAdd(missing[0])}>Add {missing[0]}</Button>}
      </>}
    >
      <div style={{ width: 460 }}>
        <RatioDevice parts={drink.ratio.map(([value, label]) => ({ value, label }))} size="lg" />
        <p style={{ margin: "26px 0 0", fontSize: 17, lineHeight: 1.5, fontStyle: "italic", fontFamily: "var(--font-serif)", color: "var(--cream-100)" }}>
          {drink.ing.map((i, n) => (
            <React.Fragment key={i}>
              {n > 0 && <span style={{ fontStyle: "normal", color: "var(--rule-strong)", margin: "0 6px" }}>·</span>}
              <span style={{ color: have.has(i) ? "var(--cream-100)" : "var(--sage-600)" }}>{i}</span>
            </React.Fragment>
          ))}
        </p>
        {missing.length > 0 && (
          <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--rose-400)" }}>
            {missing.length === 1 ? "One bottle away: " : `Missing ${missing.length}: `}<em>{missing.join(", ")}</em>
          </p>
        )}
        {drink.note && (
          <p style={{ margin: "20px 0 0", fontSize: 15, lineHeight: 1.5, fontStyle: "italic", fontFamily: "var(--font-serif)", color: "var(--cream-400)", maxWidth: "46ch" }}>{drink.note}</p>
        )}
        <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 10 }}>
          {drink.ing.map((i) => (
            <IngredientChip key={i} label={i} state={have.has(i) ? "have" : "absent"} onToggle={() => !have.has(i) && onAdd(i)} />
          ))}
        </div>
      </div>
    </ModalFrame>
  );
}

Object.assign(window, { RecipeDetail });
