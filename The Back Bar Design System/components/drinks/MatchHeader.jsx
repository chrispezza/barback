import React from "react";

const CSS = `
.bb-match{display:flex;align-items:center;gap:14px;padding:6px 0}
.bb-match__rule{flex:1;height:1px;background:var(--rule-faint)}
.bb-match__fleuron{font-size:11px;line-height:1;color:var(--rule-strong)}
.bb-match__text{font-family:var(--font-body);font-weight:600;text-transform:uppercase;letter-spacing:0.16em;font-size:12px;color:var(--cream-400);text-indent:0.16em;white-space:nowrap}
.bb-match[data-tone="gap"] .bb-match__text{color:var(--rose-300)}
.bb-match[data-tone="gap"] .bb-match__fleuron{color:var(--rose-400)}
.bb-match__count{color:var(--brass-500)}
.bb-match[data-tone="gap"] .bb-match__count{color:var(--rose-300)}
`;

const STYLE_ID = "bb-css-match-header";
function injectOnce() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** Section header with fleuron dividers and a count. */
export function MatchHeader({ label, count, tone = "neutral", align = "center" }) {
  injectOnce();
  return (
    <>
      <div className="bb-match" data-tone={tone}>
        {align === "center" && <span className="bb-match__rule" />}
        <span className="bb-match__fleuron" aria-hidden="true">◆</span>
        <h2 className="bb-match__text">
          {label}
          {count != null && <span className="bb-match__count"> · {count}</span>}
        </h2>
        <span className="bb-match__fleuron" aria-hidden="true">◆</span>
        <span className="bb-match__rule" />
      </div>
    </>
  );
}
