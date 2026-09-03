import React from "react";

const CSS = `
.bb-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 20px;border-radius:2px;border:1px solid var(--brass-500);background:var(--brass-500);color:var(--green-900);font-family:var(--font-body);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.10em;text-indent:0.10em;cursor:pointer;transition:var(--transition-state)}
.bb-btn:hover{background:#D3B171;border-color:#D3B171}
.bb-btn:focus-visible{outline:2px solid var(--brass-500);outline-offset:2px}
.bb-btn:active{background:#B78F4C;border-color:#B78F4C}
.bb-btn[data-variant="secondary"]{background:transparent;color:var(--brass-500)}
.bb-btn[data-variant="secondary"]:hover{background:var(--brass-wash);color:var(--cream-100)}
.bb-btn[data-variant="ghost"]{background:transparent;border-color:transparent;color:var(--cream-400)}
.bb-btn[data-variant="ghost"]:hover{color:var(--cream-100);background:var(--brass-wash)}
.bb-btn[data-variant="destructive"]{background:transparent;border-color:var(--ox-700);color:var(--rose-300)}
.bb-btn[data-variant="destructive"]:hover{background:var(--ox-wash)}
.bb-btn[data-size="sm"]{min-height:44px;padding:0 12px;font-size:11px}
.bb-btn:disabled{background:transparent;border-color:rgba(110,129,119,0.4);color:var(--sage-600);cursor:not-allowed}
`;

/* Styles are injected once per document, not once per instance (revision 2). */
const STYLE_ID = "bb-css-button";
function injectOnce() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** The system's button: caps utility voice, 2px corners, never a pill. The
 *  compact size keeps the 44px floor and gives up horizontal padding instead. */
export function Button({ children, variant = "primary", size = "md", type = "button", disabled = false, onClick, ...rest }) {
  injectOnce();
  return (
    <button type={type} className="bb-btn" data-variant={variant} data-size={size} disabled={disabled} onClick={onClick} {...rest}>
      {children}
    </button>
  );
}
