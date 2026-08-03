import React from "react";

const CSS = `
.bb-drink{display:block;width:100%;text-align:left;background:var(--green-800);border:1px solid var(--rule-hairline);border-radius:2px;padding:18px 20px 16px;cursor:pointer;transition:var(--transition-state)}
.bb-drink:hover{border-color:var(--rule-strong);background:var(--surface-card-hover)}
.bb-drink:focus-visible{outline:2px solid var(--brass-500);outline-offset:2px}
.bb-drink:active{background:var(--surface-card-active)}
.bb-drink[data-match="none"]{opacity:0.6}
.bb-drink[data-match="none"]:hover{opacity:0.8}
.bb-drink__top{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
.bb-drink__name{font-family:var(--font-display);font-size:24px;line-height:1.18;color:var(--cream-100);margin:0}
.bb-drink[data-match="full"] .bb-drink__name{color:var(--brass-500)}
.bb-drink__family{flex:none;font-family:var(--font-body);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.10em;text-indent:0.10em;color:var(--cream-400)}
.bb-drink__ing{margin:10px 0 0;font-family:var(--font-serif);font-size:15px;line-height:1.5;font-style:italic;color:var(--cream-100)}
.bb-drink__sep{font-style:normal;color:var(--rule-strong);margin:0 6px}
.bb-drink__have{color:var(--cream-100)}
.bb-drink__missing{color:var(--sage-600)}
.bb-drink__missing-line{margin:12px 0 0;font-family:var(--font-body);font-size:13px;color:var(--rose-400);font-style:normal}
.bb-drink__missing-line em{font-style:italic;font-family:var(--font-serif)}
.bb-drink__pour{margin:12px 0 0;font-family:var(--font-body);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.10em;text-indent:0.10em;color:var(--brass-500)}
`;

const MATCH_NOTE = { full: "Can pour", partial: null, near: null, none: null };

/** A drink in a list: name, family, ingredient run with per-ingredient stock colouring. */
export function DrinkCard({ name, family, ingredients = [], match = "full", onSelect }) {
  const missing = ingredients.filter((i) => !i.have).map((i) => i.name);
  return (
    <>
      <style>{CSS}</style>
      <button type="button" className="bb-drink" data-match={match} onClick={onSelect}>
        <span className="bb-drink__top">
          <h3 className="bb-drink__name">{name}</h3>
          {family && <span className="bb-drink__family">{family}</span>}
        </span>
        <p className="bb-drink__ing">
          {ingredients.map((ing, i) => (
            <React.Fragment key={ing.name + i}>
              {i > 0 && <span className="bb-drink__sep" aria-hidden="true">·</span>}
              <span className={ing.have ? "bb-drink__have" : "bb-drink__missing"}>{ing.name}</span>
            </React.Fragment>
          ))}
        </p>
        {match === "full" && <p className="bb-drink__pour">{MATCH_NOTE.full}</p>}
        {missing.length > 0 && (
          <p className="bb-drink__missing-line">
            {missing.length === 1 ? "One bottle away: " : `Missing ${missing.length}: `}
            <em>{missing.join(", ")}</em>
          </p>
        )}
      </button>
    </>
  );
}
