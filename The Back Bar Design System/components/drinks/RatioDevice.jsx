import React from "react";

const CSS = `
.bb-ratio{display:flex;align-items:flex-start;gap:0}
.bb-ratio__part{display:flex;flex-direction:column;align-items:center;padding:0 18px}
.bb-ratio__part:first-child{padding-left:0}
.bb-ratio__part:last-child{padding-right:0}
.bb-ratio__num{font-family:var(--font-display);color:var(--brass-500);line-height:1;font-variant-numeric:diagonal-fractions}
.bb-ratio__label{margin-top:12px;font-family:var(--font-body);font-weight:600;text-transform:uppercase;letter-spacing:0.16em;color:var(--cream-400);text-indent:0.16em;white-space:nowrap}
.bb-ratio__colon{font-family:var(--font-display);color:var(--rule-strong);line-height:1;align-self:flex-start}
`;

const SIZES = { lg: { num: 44, label: 11, colon: 32 }, md: { num: 32, label: 11, colon: 24 }, sm: { num: 24, label: 10, colon: 18 } };

/** The signature element: brass Caslon numerals with letterspaced labels beneath. */
export function RatioDevice({ parts = [], size = "lg" }) {
  const s = SIZES[size] || SIZES.lg;
  return (
    <>
      <style>{CSS}</style>
      <div className="bb-ratio" role="group" aria-label={parts.map((p) => `${p.value} ${p.label}`).join(", ")}>
        {parts.map((p, i) => (
          <React.Fragment key={p.label + i}>
            {i > 0 && <span className="bb-ratio__colon" style={{ fontSize: s.colon, lineHeight: `${s.num}px` }} aria-hidden="true">:</span>}
            <div className="bb-ratio__part">
              <span className="bb-ratio__num" style={{ fontSize: s.num }}>{p.value}</span>
              <span className="bb-ratio__label" style={{ fontSize: s.label }}>{p.label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </>
  );
}
