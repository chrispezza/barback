import React from "react";

const CSS = `
.bb-frame{position:relative;background:var(--green-900);border:3px solid var(--rule-strong);border-radius:2px;padding:4px}
.bb-frame__inner{border:1px solid var(--rule-hairline);border-radius:2px;padding:28px 28px 24px}
.bb-frame__eyebrow{font-family:var(--font-body);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.16em;text-indent:0.16em;color:var(--cream-400)}
.bb-frame__title{margin:12px 0 0;font-family:var(--font-display);font-size:32px;line-height:1.12;color:var(--cream-100)}
.bb-frame__body{margin-top:18px}
.bb-frame__foot{margin-top:24px;padding-top:18px;border-top:1px solid var(--rule-faint);display:flex;justify-content:flex-end;gap:12px}
.bb-scrim{position:fixed;inset:0;background:var(--scrim);display:flex;align-items:center;justify-content:center;padding:24px;z-index:50}
`;

const STYLE_ID = "bb-css-modal-frame";
function injectOnce() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** The double-rule frame — reserved for modals and page frames. */
export function ModalFrame({ eyebrow, title, children, footer, overlay = false, onDismiss }) {
  injectOnce();
  const frame = (
    <div className="bb-frame" role="dialog" aria-modal={overlay} aria-label={title}>
      <div className="bb-frame__inner">
        {eyebrow && <div className="bb-frame__eyebrow">{eyebrow}</div>}
        {title && <h2 className="bb-frame__title">{title}</h2>}
        {children && <div className="bb-frame__body">{children}</div>}
        {footer && <div className="bb-frame__foot">{footer}</div>}
      </div>
    </div>
  );
  return (
    <>
      {overlay ? <div className="bb-scrim" onClick={onDismiss}><div onClick={(e) => e.stopPropagation()}>{frame}</div></div> : frame}
    </>
  );
}
