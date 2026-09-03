import React from "react";

const CSS = `
.bb-row{display:flex;align-items:center;gap:16px;min-height:56px;padding:10px 0;border-bottom:1px solid var(--rule-faint)}
.bb-row__main{flex:1;min-width:0}
.bb-row__name{font-family:var(--font-serif);font-size:17px;font-style:italic;color:var(--cream-100);line-height:1.3}
.bb-row[data-empty="true"] .bb-row__name{color:var(--sage-600);text-decoration:line-through;text-decoration-color:rgba(156,175,164,0.6)}
.bb-row[data-optional="true"] .bb-row__name{color:var(--cream-400)}
.bb-row__detail{margin-top:3px;font-family:var(--font-body);font-size:13px;color:var(--cream-400)}
.bb-row__brand{font-style:normal;font-family:var(--font-body)}
.bb-row__sep{color:var(--rule-strong);margin:0 6px}
.bb-row__frac{color:var(--brass-500);font-variant-numeric:diagonal-fractions}
.bb-row__opt{font-weight:600;font-size:11px;letter-spacing:0.10em;text-transform:uppercase}
.bb-row__remove{flex:none;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0 8px;border:0;border-radius:2px;background:transparent;color:var(--cream-400);font-family:var(--font-body);font-size:11px;font-weight:600;letter-spacing:0.10em;text-transform:uppercase;cursor:pointer;opacity:0;transition:var(--transition-state),opacity var(--dur-fast) var(--ease-out)}
.bb-row:hover .bb-row__remove,.bb-row__remove:focus-visible{opacity:1}
.bb-row__remove:hover{color:var(--rose-300);background:var(--ox-wash)}
.bb-row__remove:focus-visible{outline:2px solid var(--brass-500);outline-offset:2px}
.bb-row__remove:active{background:var(--ox-wash);color:var(--rose-300)}
`;

const STYLE_ID = "bb-css-shelf-row";
function injectOnce() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** One bottle on the shelf: ingredient, optional bottle detail, quiet remove.
 *  An optional recipe line reads cream-400 with the word "optional" — absence of
 *  an optional is not a gap, so it is never struck through. */
export function ShelfRow({ name, brand, volume, remaining, empty = false, optional = false, onRemove }) {
  injectOnce();
  const hasDetail = brand || volume || remaining || optional;
  return (
    <div className="bb-row" data-empty={empty && !optional ? "true" : "false"} data-optional={optional ? "true" : "false"}>
      <div className="bb-row__main">
        <div className="bb-row__name">{name}</div>
        {hasDetail && (
          <div className="bb-row__detail">
            {brand && <span className="bb-row__brand">{brand}</span>}
            {brand && volume && <span className="bb-row__sep">·</span>}
            {volume && <span>{volume}</span>}
            {remaining && <span className="bb-row__sep">·</span>}
            {remaining && <span className="bb-row__frac">{remaining} left</span>}
            {optional && (brand || volume || remaining) && <span className="bb-row__sep">·</span>}
            {optional && <span className="bb-row__opt">optional</span>}
          </div>
        )}
      </div>
      {onRemove && (
        <button type="button" className="bb-row__remove" onClick={onRemove} aria-label={`Remove ${name} from shelf`}>
          Remove
        </button>
      )}
    </div>
  );
}
