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

/** Which of `n` focusable segments a key sends the focus to from segment `at`,
 *  or -1 for a key the bar leaves to the browser. */
function nextSegment(key, at, n) {
  switch (key) {
    case "ArrowRight":
      return (at + 1) % n;
    case "ArrowLeft":
      return (at - 1 + n) % n;
    case "Home":
      return 0;
    case "End":
      return n - 1;
    default:
      return -1;
  }
}

/** The five drink families as a segmented control. Segments never shrink below
 *  their label: in a narrow container the bar grows past its edge so a scrolling
 *  wrapper can pan it — previously the last families were clipped away on phones.
 *
 *  The bar is one Tab stop (a roving tabindex): the segment the focus is on
 *  while it is in the bar, otherwise the selected one, otherwise the first that
 *  can take focus. ArrowLeft and ArrowRight move the focus along the bar,
 *  wrapping at either end; Home and End jump to the ends. Moving the focus
 *  selects nothing; Enter or Space selects, as a click does. */
export function FamilyFilterBar({ families = [], value, onChange, disabled = [] }) {
  injectOnce();
  const [focused, setFocused] = React.useState(null);
  const enabled = families.filter((f) => !disabled.includes(f));
  const stop = enabled.includes(focused) ? focused : enabled.includes(value) ? value : enabled[0];

  const onKeyDown = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const segments = Array.from(e.currentTarget.querySelectorAll(".bb-fam__btn")).filter((b) => !b.disabled);
    const at = segments.indexOf(e.target);
    const next = at === -1 ? -1 : nextSegment(e.key, at, segments.length);
    if (next === -1) return;
    e.preventDefault();
    segments[next].focus();
  };

  return (
    <div className="bb-fam" role="group" aria-label="Drink family" onKeyDown={onKeyDown}>
      {families.map((f) => (
        <button
          key={f}
          type="button"
          className="bb-fam__btn"
          aria-pressed={value === f}
          disabled={disabled.includes(f)}
          tabIndex={f === stop ? 0 : -1}
          onFocus={() => setFocused(f)}
          onBlur={(e) => {
            if (!e.currentTarget.parentNode.contains(e.relatedTarget)) setFocused(null);
          }}
          onClick={() => onChange && onChange(f)}
        >
          {f}
        </button>
      ))}
    </div>
  );
}
