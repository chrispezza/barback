import React from "react";

const CSS = `
.bb-chip{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:2px;border:1px solid var(--rule-hairline);background:transparent;color:var(--cream-100);font-family:var(--font-body);font-family:var(--font-serif);font-size:15px;font-style:italic;line-height:1;cursor:pointer;transition:var(--transition-state);-webkit-tap-highlight-color:transparent}
.bb-chip:hover{border-color:var(--rule-strong);background:var(--brass-wash)}
.bb-chip:focus-visible{outline:2px solid var(--brass-500);outline-offset:2px}
.bb-chip:active{background:rgba(198,161,91,0.18)}
.bb-chip[data-state="have"]{background:var(--brass-500);border-color:var(--brass-500);color:var(--green-900);font-weight:700}
.bb-chip[data-state="have"]:hover{background:#D3B171;border-color:#D3B171}
.bb-chip[data-state="absent"]{color:var(--sage-600);border-color:rgba(110,129,119,0.45)}
.bb-chip[data-state="absent"]:hover{color:var(--cream-400);border-color:var(--rule-hairline);background:transparent}
.bb-chip[disabled]{opacity:0.55;cursor:not-allowed;color:var(--sage-600);border-color:rgba(110,129,119,0.35);background:transparent}
.bb-chip__mark{font-family:var(--font-body);font-style:normal;font-size:11px;letter-spacing:0;opacity:0.9}
.bb-chip__count{font-family:var(--font-body);font-style:normal;font-size:11px;font-weight:600;letter-spacing:0.10em;text-transform:uppercase}
`;

const STYLE_ID = "bb-css-ingredient-chip";
function injectOnce() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** The atomic unit: one ingredient, in or out of the bar. */
export function IngredientChip({ label, state = "default", count, disabled = false, onToggle, ...rest }) {
  injectOnce();
  return (
    <>
      <button
        type="button"
        className="bb-chip"
        data-state={state}
        disabled={disabled}
        aria-pressed={state === "have"}
        onClick={onToggle}
        {...rest}
      >
        {state === "have" && <span className="bb-chip__mark" aria-hidden="true">✓</span>}
        <span>{label}</span>
        {count != null && <span className="bb-chip__count">{count}</span>}
      </button>
    </>
  );
}
