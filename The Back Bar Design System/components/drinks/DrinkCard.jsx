import React from "react";

const CSS = `
.bb-drink{display:block;width:100%;box-sizing:border-box;text-align:left;text-decoration:none;color:inherit;background:var(--green-800);border:1px solid var(--rule-hairline);border-radius:2px;padding:18px 20px 16px;cursor:pointer;transition:var(--transition-state)}
.bb-drink:hover{border-color:var(--rule-strong)}
.bb-drink:hover .bb-drink__pour,.bb-drink:hover .bb-drink__family{color:var(--cream-100)}
.bb-drink:focus-visible{outline:2px solid var(--brass-500);outline-offset:2px}
.bb-drink:active{background:var(--surface-card-active)}
.bb-drink[data-match="none"]{border-color:var(--border-absent)}
.bb-drink[data-match="none"] .bb-drink__name{color:var(--cream-400)}
.bb-drink__top{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
.bb-drink__name{font-family:var(--font-display);font-weight:400;font-size:24px;line-height:1.18;color:var(--cream-100);margin:0}
.bb-drink[data-match="full"] .bb-drink__name{color:var(--brass-500)}
.bb-drink__fav{display:inline-block;margin-right:10px;font-size:0.62em;line-height:1;vertical-align:0.12em;color:var(--brass-500)}
.bb-drink__family{flex:none;font-family:var(--font-body);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.10em;text-indent:0.10em;color:var(--cream-400)}
.bb-drink__ing{margin:10px 0 0;font-family:var(--font-serif);font-size:15px;line-height:1.5;font-style:italic;color:var(--cream-100)}
.bb-drink__sep{font-style:normal;color:var(--rule-strong);margin:0 6px}
.bb-drink__have{color:var(--cream-100)}
.bb-drink__missing{color:var(--sage-600)}
.bb-drink__optional{color:var(--cream-400)}
.bb-drink__opt{margin-left:6px;font-family:var(--font-body);font-style:normal;font-weight:600;font-size:10px;letter-spacing:0.10em;text-transform:uppercase;color:var(--cream-400)}
.bb-drink__missing-line{margin:12px 0 0;font-family:var(--font-body);font-size:13px;color:var(--rose-300);font-style:normal}
.bb-drink__missing-line em{font-style:italic;font-family:var(--font-serif)}
.bb-drink__pour{margin:12px 0 0;font-family:var(--font-body);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.10em;text-indent:0.10em;color:var(--cream-400)}
.bb-drink__pour-mark{color:var(--brass-500);margin-right:6px}
`;

const STYLE_ID = "bb-css-drink-card";
function injectOnce() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

function isPlainClick(e) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/**
 * A drink in a list: name, family, ingredient run with per-ingredient stock
 * colouring. Given `href` it is a real link (open in new tab, copy link, history
 * all work); `onSelect` still fires on a plain click for client-side routing.
 * Optional ingredients never count as missing and are marked as optional in
 * words. No-match cards keep full legibility — the sage border and cream-400
 * name carry the state, never opacity.
 */
export function DrinkCard({ name, family, ingredients = [], match = "full", favorited = false, href, onSelect }) {
  injectOnce();
  const missing = ingredients.filter((i) => !i.have && !i.optional).map((i) => i.name);
  const body = (
    <>
      <span className="bb-drink__top">
        <h3 className="bb-drink__name">
          {favorited && <span className="bb-drink__fav" role="img" aria-label="Favorited">◆</span>}
          {name}
        </h3>
        {family && <span className="bb-drink__family">{family}</span>}
      </span>
      <p className="bb-drink__ing">
        {ingredients.map((ing, i) => (
          <React.Fragment key={ing.name + i}>
            {i > 0 && <span className="bb-drink__sep" aria-hidden="true">·</span>}
            <span className={ing.optional ? "bb-drink__optional" : ing.have ? "bb-drink__have" : "bb-drink__missing"}>
              {ing.name}
              {ing.optional && <span className="bb-drink__opt">optional</span>}
            </span>
          </React.Fragment>
        ))}
      </p>
      {match === "full" && (
        <p className="bb-drink__pour"><span className="bb-drink__pour-mark" aria-hidden="true">✓</span>Can pour</p>
      )}
      {missing.length > 0 && (
        <p className="bb-drink__missing-line">
          {missing.length === 1 ? "One bottle away: " : `Missing ${missing.length}: `}
          <em>{missing.join(", ")}</em>
        </p>
      )}
    </>
  );
  if (href) {
    const onClick = (e) => {
      if (!onSelect || !isPlainClick(e)) return;
      e.preventDefault();
      onSelect();
    };
    return <a className="bb-drink" href={href} data-match={match} onClick={onClick}>{body}</a>;
  }
  return (
    <button type="button" className="bb-drink" data-match={match} onClick={onSelect}>{body}</button>
  );
}
