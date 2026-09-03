import React from "react";

const CSS = `
.bb-fam{display:inline-flex;min-width:100%;box-sizing:border-box;align-items:stretch;border:1px solid var(--rule-hairline);border-radius:2px;overflow:hidden}
.bb-fam__btn{flex:1 0 auto;min-height:44px;padding:0 14px;border:0;border-left:1px solid var(--rule-faint);background:transparent;color:var(--cream-400);font-family:var(--font-body);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.10em;text-indent:0.10em;cursor:pointer;white-space:nowrap;transition:var(--transition-state)}
.bb-fam__btn:first-child{border-left:0}
.bb-fam__btn:hover{color:var(--cream-100);background:var(--brass-wash)}
.bb-fam__btn:focus-visible{outline:2px solid var(--brass-500);outline-offset:-2px}
.bb-fam__btn[aria-pressed="true"]{background:var(--brass-500);color:var(--green-900)}
.bb-fam__btn[aria-pressed="true"]:hover{background:#D3B171}
.bb-fam__btn:disabled{color:var(--sage-600);cursor:not-allowed;background:transparent}
`;

const STYLE_ID = "bb-css-family-filter-bar";
function injectOnce() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** The five drink families as a segmented control. Segments never shrink below
 *  their label: in a narrow container the bar grows past its edge so a scrolling
 *  wrapper can pan it — previously the last families were clipped away on phones. */
export function FamilyFilterBar({ families = [], value, onChange, disabled = [] }) {
  injectOnce();
  return (
    <div className="bb-fam" role="group" aria-label="Drink family">
      {families.map((f) => (
        <button
          key={f}
          type="button"
          className="bb-fam__btn"
          aria-pressed={value === f}
          disabled={disabled.includes(f)}
          onClick={() => onChange && onChange(f)}
        >
          {f}
        </button>
      ))}
    </div>
  );
}
