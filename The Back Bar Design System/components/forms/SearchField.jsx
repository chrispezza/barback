import React from "react";

const CSS = `
.bb-search{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 12px;background:var(--green-800);border:1px solid var(--rule-hairline);border-radius:2px;transition:var(--transition-state)}
.bb-search:hover{border-color:var(--rule-strong)}
.bb-search:focus-within{outline:2px solid var(--brass-500);outline-offset:2px;border-color:var(--rule-strong)}
.bb-search__label{font-family:var(--font-body);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.10em;text-indent:0.10em;color:var(--cream-400);white-space:nowrap}
.bb-search__input{flex:1;min-width:0;background:transparent;border:0;outline:none;caret-color:var(--brass-500);color:var(--cream-100);font-family:var(--font-body);font-size:17px;line-height:1.4;padding:9px 0}
.bb-search__input::placeholder{color:var(--sage-600);font-family:var(--font-serif);font-style:italic}
.bb-search__input:disabled{color:var(--sage-600);cursor:not-allowed}
.bb-search__clear{flex:none;width:44px;height:44px;margin-right:-12px;border:0;background:transparent;color:var(--cream-400);font-family:var(--font-body);font-size:15px;cursor:pointer;transition:var(--transition-state)}
.bb-search__clear:hover{color:var(--cream-100)}
.bb-search__clear:focus-visible{outline:2px solid var(--brass-500);outline-offset:-2px}
`;

/** Cream on green-800, brass caret, square corners. */
export function SearchField({ value, placeholder = "Search the shelf", label, disabled = false, onChange, onClear }) {
  return (
    <>
      <style>{CSS}</style>
      <div className="bb-search">
        {label && <span className="bb-search__label">{label}</span>}
        <input
          className="bb-search__input"
          type="search"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={label || placeholder}
          onChange={(e) => onChange && onChange(e.target.value)}
        />
        {value && onClear && (
          <button type="button" className="bb-search__clear" onClick={onClear} aria-label="Clear search">Clear</button>
        )}
      </div>
    </>
  );
}
