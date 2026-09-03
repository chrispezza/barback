import React from "react";

const CSS = `
.bb-step{display:inline-flex;align-items:stretch;border:1px solid var(--rule-hairline);border-radius:2px;background:transparent}
.bb-step__btn{width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--brass-500);font-family:var(--font-display);font-size:20px;line-height:1;cursor:pointer;transition:var(--transition-state)}
.bb-step__btn:hover{background:var(--brass-wash)}
.bb-step__btn:focus-visible{outline:2px solid var(--brass-500);outline-offset:2px}
.bb-step__btn:active{background:rgba(198,161,91,0.2)}
.bb-step__btn:disabled{color:var(--sage-600);cursor:not-allowed;background:transparent}
.bb-step__val{min-width:56px;display:flex;align-items:center;justify-content:center;padding:0 8px;border-left:1px solid var(--rule-faint);border-right:1px solid var(--rule-faint);font-family:var(--font-display);font-size:20px;color:var(--cream-100)}
.bb-step__unit{margin-left:4px;font-family:var(--font-body);font-size:11px;font-weight:600;letter-spacing:0.10em;text-transform:uppercase;color:var(--cream-400)}
`;

const STYLE_ID = "bb-css-quantity-stepper";
function injectOnce() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** Keyboard-operable quantity stepper. */
export function QuantityStepper({ value, min = 0, max = 99, step = 1, unit, onChange }) {
  injectOnce();
  const set = (v) => onChange && onChange(Math.min(max, Math.max(min, v)));
  const onKeyDown = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); set(value + step); }
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); set(value - step); }
  };
  return (
    <>
      <div className="bb-step" role="group" onKeyDown={onKeyDown}>
        <button type="button" className="bb-step__btn" onClick={() => set(value - step)} disabled={value <= min} aria-label="Decrease">–</button>
        <div className="bb-step__val" role="spinbutton" tabIndex={0} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}>
          {value}{unit && <span className="bb-step__unit">{unit}</span>}
        </div>
        <button type="button" className="bb-step__btn" onClick={() => set(value + step)} disabled={value >= max} aria-label="Increase">+</button>
      </div>
    </>
  );
}
