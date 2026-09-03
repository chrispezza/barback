import React from "react";

const CSS = `
.bb-shop{display:flex;align-items:center;gap:16px;width:100%;text-align:left;padding:12px 0;background:transparent;border:0;border-bottom:1px solid var(--rule-faint);cursor:pointer;transition:var(--transition-state)}
.bb-shop:hover .bb-shop__name{color:var(--rose-300)}
.bb-shop:focus-visible{outline:2px solid var(--brass-500);outline-offset:2px}
.bb-shop__box{flex:none;width:44px;height:44px;display:flex;align-items:center;justify-content:center}
.bb-shop__mark{width:18px;height:18px;border:1px solid var(--rose-400);border-radius:2px;display:flex;align-items:center;justify-content:center;color:var(--green-900);font-size:11px;line-height:1;transition:var(--transition-state)}
.bb-shop[data-checked="true"] .bb-shop__mark{background:var(--brass-500);border-color:var(--brass-500)}
.bb-shop__main{flex:1;min-width:0}
.bb-shop__name{font-family:var(--font-serif);font-size:17px;font-style:italic;color:var(--cream-100);transition:var(--transition-state)}
.bb-shop[data-checked="true"] .bb-shop__name{color:var(--sage-600);text-decoration:line-through;text-decoration-color:rgba(156,175,164,0.6)}
.bb-shop__meta{display:block;margin-top:3px;font-family:var(--font-body);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.10em;text-indent:0.10em;color:var(--cream-400)}
.bb-shop__unlocks{color:var(--rose-400)}
.bb-shop__sep{color:var(--rule-strong);margin:0 4px}
.bb-shop[data-checked="true"] .bb-shop__meta,.bb-shop[data-checked="true"] .bb-shop__unlocks{color:var(--sage-600)}
.bb-shop__note{flex:none;font-family:var(--font-serif);font-size:13px;color:var(--cream-400);font-style:italic}
`;

const STYLE_ID = "bb-css-shopping-list-item";
function injectOnce() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** One purchase on the list — rose accent, shows what it unlocks. Secondary
 *  facts (unlocks, detail) share one line under the name in one voice; `note`
 *  stays the trailing editorial aside. */
export function ShoppingListItem({ name, unlocks, detail, note, checked = false, onToggle }) {
  injectOnce();
  const hasMeta = unlocks != null || detail;
  return (
    <button type="button" className="bb-shop" data-checked={checked ? "true" : "false"} aria-pressed={checked} onClick={onToggle}>
      <span className="bb-shop__box">
        <span className="bb-shop__mark" aria-hidden="true">{checked ? "✓" : ""}</span>
      </span>
      <span className="bb-shop__main">
        <span className="bb-shop__name">{name}</span>
        {hasMeta && (
          <span className="bb-shop__meta">
            {unlocks != null && <span className="bb-shop__unlocks">Unlocks {unlocks}</span>}
            {unlocks != null && detail && <span className="bb-shop__sep" aria-hidden="true">·</span>}
            {detail && <span>{detail}</span>}
          </span>
        )}
      </span>
      {note && <span className="bb-shop__note">{note}</span>}
    </button>
  );
}
