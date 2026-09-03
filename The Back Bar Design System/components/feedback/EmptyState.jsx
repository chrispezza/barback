import React from "react";

const CSS = `
.bb-empty{padding:40px 24px;text-align:center}
.bb-empty__fleuron{font-size:11px;color:var(--rule-strong);letter-spacing:0.16em}
.bb-empty__title{margin:16px 0 0;font-family:var(--font-display);font-size:24px;line-height:1.18;color:var(--cream-100)}
.bb-empty__body{margin:10px auto 0;max-width:38ch;font-family:var(--font-serif);font-size:15px;line-height:1.5;font-style:italic;color:var(--cream-400)}
.bb-empty__action{margin-top:20px;display:inline-flex}
`;

const STYLE_ID = "bb-css-empty-state";
function injectOnce() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** Directive, never apologetic. */
export function EmptyState({ title, body, action }) {
  injectOnce();
  return (
    <>
      <div className="bb-empty">
        <div className="bb-empty__fleuron" aria-hidden="true">—◆—</div>
        {title && <h3 className="bb-empty__title">{title}</h3>}
        {body && <p className="bb-empty__body">{body}</p>}
        {action && <div className="bb-empty__action">{action}</div>}
      </div>
    </>
  );
}
