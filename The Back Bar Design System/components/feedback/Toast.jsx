import React from "react";

const CSS = `
.bb-toast{position:relative;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 20px;background:var(--green-900);border-top:1px solid var(--brass-500);width:100%;box-sizing:border-box}
.bb-toast__text{font-family:var(--font-body);font-size:15px;color:var(--cream-100)}
.bb-toast__text em{font-style:italic;font-family:var(--font-serif)}
.bb-toast__action{border:0;background:transparent;padding:0 8px;min-height:44px;min-width:44px;color:var(--brass-500);font-family:var(--font-body);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.10em;text-indent:0.10em;cursor:pointer;transition:var(--transition-state)}
.bb-toast__action:hover{color:var(--cream-100)}
.bb-toast__action:focus-visible{outline:2px solid var(--brass-500);outline-offset:2px}
.bb-toast[data-tone="destructive"]{border-top-color:var(--ox-700)}
.bb-toast[data-tone="destructive"] .bb-toast__action{color:var(--rose-300)}
`;

const STYLE_ID = "bb-css-toast";
function injectOnce() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** Text-only toast on a brass rule. Bottom of the viewport, no icon, no card.
 *  Destructive toasts are announced assertively (they carry the Undo). */
export function Toast({ message, actionLabel, onAction, tone = "neutral" }) {
  injectOnce();
  return (
    <div className="bb-toast" data-tone={tone} role={tone === "destructive" ? "alert" : "status"}>
      <span className="bb-toast__text">{message}</span>
      {actionLabel && (
        <button type="button" className="bb-toast__action" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}
