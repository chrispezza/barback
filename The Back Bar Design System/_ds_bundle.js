/* @ds-bundle: {"format":4,"namespace":"TheBackBarDesignSystem_3399bd","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"DrinkCard","sourcePath":"components/drinks/DrinkCard.jsx"},{"name":"MatchHeader","sourcePath":"components/drinks/MatchHeader.jsx"},{"name":"RatioDevice","sourcePath":"components/drinks/RatioDevice.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"ModalFrame","sourcePath":"components/feedback/ModalFrame.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"SearchField","sourcePath":"components/forms/SearchField.jsx"},{"name":"IngredientChip","sourcePath":"components/inventory/IngredientChip.jsx"},{"name":"QuantityStepper","sourcePath":"components/inventory/QuantityStepper.jsx"},{"name":"ShelfRow","sourcePath":"components/inventory/ShelfRow.jsx"},{"name":"FamilyFilterBar","sourcePath":"components/navigation/FamilyFilterBar.jsx"},{"name":"ShoppingListItem","sourcePath":"components/shopping/ShoppingListItem.jsx"}],"sourceHashes":{"components/core/Button.jsx":"d31c6d8bd075","components/drinks/DrinkCard.jsx":"a37a58875e5c","components/drinks/MatchHeader.jsx":"6bda32d7ed7f","components/drinks/RatioDevice.jsx":"3176a256d6d2","components/feedback/EmptyState.jsx":"3fb547aadac4","components/feedback/ModalFrame.jsx":"8a17fb528828","components/feedback/Toast.jsx":"8a59f76ca4ef","components/forms/SearchField.jsx":"3044603f6afe","components/inventory/IngredientChip.jsx":"0cb40a344f68","components/inventory/QuantityStepper.jsx":"e03615add0f9","components/inventory/ShelfRow.jsx":"da941dd85621","components/navigation/FamilyFilterBar.jsx":"67282307c97c","components/shopping/ShoppingListItem.jsx":"f828c0c7dcd3","ui_kits/back-bar-app/AppShell.jsx":"db681782b287","ui_kits/back-bar-app/MobileApp.jsx":"9d4c5411d999","ui_kits/back-bar-app/RecipeDetail.jsx":"03d6dcef8780","ui_kits/back-bar-app/ShelfScreen.jsx":"099484d94c3f","ui_kits/back-bar-app/TonightScreen.jsx":"53e9d0b8f4ea","ui_kits/back-bar-app/data.js":"17aa05c75ae4"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.TheBackBarDesignSystem_3399bd = window.TheBackBarDesignSystem_3399bd || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
.bb-btn[data-size="sm"]{min-height:36px;padding:0 14px;font-size:11px}
.bb-btn:disabled{background:transparent;border-color:rgba(110,129,119,0.4);color:var(--sage-600);cursor:not-allowed}
`;

/** The system's button: caps utility voice, 2px corners, never a pill. */
function Button({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  onClick,
  ...rest
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: "bb-btn",
    "data-variant": variant,
    "data-size": size,
    disabled: disabled,
    onClick: onClick
  }, rest), children));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/drinks/DrinkCard.jsx
try { (() => {
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
const MATCH_NOTE = {
  full: "Can pour",
  partial: null,
  near: null,
  none: null
};

/** A drink in a list: name, family, ingredient run with per-ingredient stock colouring. */
function DrinkCard({
  name,
  family,
  ingredients = [],
  match = "full",
  onSelect
}) {
  const missing = ingredients.filter(i => !i.have).map(i => i.name);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "bb-drink",
    "data-match": match,
    onClick: onSelect
  }, /*#__PURE__*/React.createElement("span", {
    className: "bb-drink__top"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "bb-drink__name"
  }, name), family && /*#__PURE__*/React.createElement("span", {
    className: "bb-drink__family"
  }, family)), /*#__PURE__*/React.createElement("p", {
    className: "bb-drink__ing"
  }, ingredients.map((ing, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: ing.name + i
  }, i > 0 && /*#__PURE__*/React.createElement("span", {
    className: "bb-drink__sep",
    "aria-hidden": "true"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    className: ing.have ? "bb-drink__have" : "bb-drink__missing"
  }, ing.name)))), match === "full" && /*#__PURE__*/React.createElement("p", {
    className: "bb-drink__pour"
  }, MATCH_NOTE.full), missing.length > 0 && /*#__PURE__*/React.createElement("p", {
    className: "bb-drink__missing-line"
  }, missing.length === 1 ? "One bottle away: " : `Missing ${missing.length}: `, /*#__PURE__*/React.createElement("em", null, missing.join(", ")))));
}
Object.assign(__ds_scope, { DrinkCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/drinks/DrinkCard.jsx", error: String((e && e.message) || e) }); }

// components/drinks/MatchHeader.jsx
try { (() => {
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

/** Section header with fleuron dividers and a count. */
function MatchHeader({
  label,
  count,
  tone = "neutral",
  align = "center"
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    className: "bb-match",
    "data-tone": tone
  }, align === "center" && /*#__PURE__*/React.createElement("span", {
    className: "bb-match__rule"
  }), /*#__PURE__*/React.createElement("span", {
    className: "bb-match__fleuron",
    "aria-hidden": "true"
  }, "\u25C6"), /*#__PURE__*/React.createElement("h2", {
    className: "bb-match__text"
  }, label, count != null && /*#__PURE__*/React.createElement("span", {
    className: "bb-match__count"
  }, " \xB7 ", count)), /*#__PURE__*/React.createElement("span", {
    className: "bb-match__fleuron",
    "aria-hidden": "true"
  }, "\u25C6"), /*#__PURE__*/React.createElement("span", {
    className: "bb-match__rule"
  })));
}
Object.assign(__ds_scope, { MatchHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/drinks/MatchHeader.jsx", error: String((e && e.message) || e) }); }

// components/drinks/RatioDevice.jsx
try { (() => {
const CSS = `
.bb-ratio{display:flex;align-items:flex-start;gap:0}
.bb-ratio__part{display:flex;flex-direction:column;align-items:center;padding:0 18px}
.bb-ratio__part:first-child{padding-left:0}
.bb-ratio__part:last-child{padding-right:0}
.bb-ratio__num{font-family:var(--font-display);color:var(--brass-500);line-height:1;font-variant-numeric:diagonal-fractions}
.bb-ratio__label{margin-top:12px;font-family:var(--font-body);font-weight:600;text-transform:uppercase;letter-spacing:0.16em;color:var(--cream-400);text-indent:0.16em;white-space:nowrap}
.bb-ratio__colon{font-family:var(--font-display);color:var(--rule-strong);line-height:1;align-self:flex-start}
`;
const SIZES = {
  lg: {
    num: 44,
    label: 11,
    colon: 32
  },
  md: {
    num: 32,
    label: 11,
    colon: 24
  },
  sm: {
    num: 24,
    label: 10,
    colon: 18
  }
};

/** The signature element: brass Caslon numerals with letterspaced labels beneath. */
function RatioDevice({
  parts = [],
  size = "lg"
}) {
  const s = SIZES[size] || SIZES.lg;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    className: "bb-ratio",
    role: "group",
    "aria-label": parts.map(p => `${p.value} ${p.label}`).join(", ")
  }, parts.map((p, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: p.label + i
  }, i > 0 && /*#__PURE__*/React.createElement("span", {
    className: "bb-ratio__colon",
    style: {
      fontSize: s.colon,
      lineHeight: `${s.num}px`
    },
    "aria-hidden": "true"
  }, ":"), /*#__PURE__*/React.createElement("div", {
    className: "bb-ratio__part"
  }, /*#__PURE__*/React.createElement("span", {
    className: "bb-ratio__num",
    style: {
      fontSize: s.num
    }
  }, p.value), /*#__PURE__*/React.createElement("span", {
    className: "bb-ratio__label",
    style: {
      fontSize: s.label
    }
  }, p.label))))));
}
Object.assign(__ds_scope, { RatioDevice });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/drinks/RatioDevice.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
const CSS = `
.bb-empty{padding:40px 24px;text-align:center}
.bb-empty__fleuron{font-size:11px;color:var(--rule-strong);letter-spacing:0.16em}
.bb-empty__title{margin:16px 0 0;font-family:var(--font-display);font-size:24px;line-height:1.18;color:var(--cream-100)}
.bb-empty__body{margin:10px auto 0;max-width:38ch;font-family:var(--font-serif);font-size:15px;line-height:1.5;font-style:italic;color:var(--cream-400)}
.bb-empty__action{margin-top:20px;display:inline-flex}
`;

/** Directive, never apologetic. */
function EmptyState({
  title,
  body,
  action
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    className: "bb-empty"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bb-empty__fleuron",
    "aria-hidden": "true"
  }, "\u2014\u25C6\u2014"), title && /*#__PURE__*/React.createElement("h3", {
    className: "bb-empty__title"
  }, title), body && /*#__PURE__*/React.createElement("p", {
    className: "bb-empty__body"
  }, body), action && /*#__PURE__*/React.createElement("div", {
    className: "bb-empty__action"
  }, action)));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ModalFrame.jsx
try { (() => {
const CSS = `
.bb-frame{position:relative;background:var(--green-900);border:3px solid var(--rule-strong);border-radius:2px;padding:4px}
.bb-frame__inner{border:1px solid var(--rule-hairline);border-radius:2px;padding:28px 28px 24px}
.bb-frame__eyebrow{font-family:var(--font-body);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.16em;text-indent:0.16em;color:var(--cream-400)}
.bb-frame__title{margin:12px 0 0;font-family:var(--font-display);font-size:32px;line-height:1.12;color:var(--cream-100)}
.bb-frame__body{margin-top:18px}
.bb-frame__foot{margin-top:24px;padding-top:18px;border-top:1px solid var(--rule-faint);display:flex;justify-content:flex-end;gap:12px}
.bb-scrim{position:fixed;inset:0;background:var(--scrim);display:flex;align-items:center;justify-content:center;padding:24px;z-index:50}
`;

/** The double-rule frame — reserved for modals and page frames. */
function ModalFrame({
  eyebrow,
  title,
  children,
  footer,
  overlay = false,
  onDismiss
}) {
  const frame = /*#__PURE__*/React.createElement("div", {
    className: "bb-frame",
    role: "dialog",
    "aria-modal": overlay,
    "aria-label": title
  }, /*#__PURE__*/React.createElement("div", {
    className: "bb-frame__inner"
  }, eyebrow && /*#__PURE__*/React.createElement("div", {
    className: "bb-frame__eyebrow"
  }, eyebrow), title && /*#__PURE__*/React.createElement("h2", {
    className: "bb-frame__title"
  }, title), children && /*#__PURE__*/React.createElement("div", {
    className: "bb-frame__body"
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    className: "bb-frame__foot"
  }, footer)));
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), overlay ? /*#__PURE__*/React.createElement("div", {
    className: "bb-scrim",
    onClick: onDismiss
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation()
  }, frame)) : frame);
}
Object.assign(__ds_scope, { ModalFrame });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ModalFrame.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const CSS = `
.bb-toast{position:relative;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 20px;background:var(--green-900);border-top:1px solid var(--brass-500);width:100%}
.bb-toast__text{font-family:var(--font-body);font-size:15px;color:var(--cream-100)}
.bb-toast__text em{font-style:italic;font-family:var(--font-serif)}
.bb-toast__action{border:0;background:transparent;padding:0;min-height:44px;color:var(--brass-500);font-family:var(--font-body);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.10em;text-indent:0.10em;cursor:pointer;transition:var(--transition-state)}
.bb-toast__action:hover{color:var(--cream-100)}
.bb-toast__action:focus-visible{outline:2px solid var(--brass-500);outline-offset:2px}
.bb-toast[data-tone="destructive"]{border-top-color:var(--ox-700)}
.bb-toast[data-tone="destructive"] .bb-toast__action{color:var(--rose-300)}
`;

/** Text-only toast on a brass rule. Bottom of the viewport, no icon, no card. */
function Toast({
  message,
  actionLabel,
  onAction,
  tone = "neutral"
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    className: "bb-toast",
    "data-tone": tone,
    role: "status"
  }, /*#__PURE__*/React.createElement("span", {
    className: "bb-toast__text"
  }, message), actionLabel && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "bb-toast__action",
    onClick: onAction
  }, actionLabel)));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/SearchField.jsx
try { (() => {
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
function SearchField({
  value,
  placeholder = "Search the shelf",
  label,
  disabled = false,
  onChange,
  onClear
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    className: "bb-search"
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "bb-search__label"
  }, label), /*#__PURE__*/React.createElement("input", {
    className: "bb-search__input",
    type: "search",
    value: value,
    placeholder: placeholder,
    disabled: disabled,
    "aria-label": label || placeholder,
    onChange: e => onChange && onChange(e.target.value)
  }), value && onClear && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "bb-search__clear",
    onClick: onClear,
    "aria-label": "Clear search"
  }, "Clear")));
}
Object.assign(__ds_scope, { SearchField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SearchField.jsx", error: String((e && e.message) || e) }); }

// components/inventory/IngredientChip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.bb-chip{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:2px;border:1px solid var(--rule-hairline);background:transparent;color:var(--cream-100);font-family:var(--font-body);font-family:var(--font-serif);font-size:15px;font-style:italic;line-height:1;cursor:pointer;transition:var(--transition-state);-webkit-tap-highlight-color:transparent}
.bb-chip:hover{border-color:var(--rule-strong);background:var(--brass-wash)}
.bb-chip:focus-visible{outline:2px solid var(--brass-500);outline-offset:2px}
.bb-chip:active{background:rgba(198,161,91,0.18)}
.bb-chip[data-state="have"]{background:var(--brass-500);border-color:var(--brass-500);color:var(--green-900);font-weight:700}
.bb-chip[data-state="have"]:hover{background:#D3B171;border-color:#D3B171}
.bb-chip[data-state="absent"]{color:var(--sage-600);border-color:rgba(110,129,119,0.45)}
.bb-chip[data-state="absent"]:hover{color:var(--cream-400);border-color:var(--rule-hairline);background:transparent}
.bb-chip[disabled]{opacity:0.55;cursor:not-allowed;color:var(--sage-600);border-color:rgba(110,129,119,0.35);background:transparent}
.bb-chip__mark{font-family:var(--font-body);font-style:normal;font-size:11px;letter-spacing:0;opacity:0.9}
.bb-chip__count{font-family:var(--font-body);font-style:normal;font-size:11px;font-weight:600;letter-spacing:0.10em;text-transform:uppercase}
`;

/** The atomic unit: one ingredient, in or out of the bar. */
function IngredientChip({
  label,
  state = "default",
  count,
  disabled = false,
  onToggle,
  ...rest
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: "bb-chip",
    "data-state": state,
    disabled: disabled,
    "aria-pressed": state === "have",
    onClick: onToggle
  }, rest), state === "have" && /*#__PURE__*/React.createElement("span", {
    className: "bb-chip__mark",
    "aria-hidden": "true"
  }, "\u2713"), /*#__PURE__*/React.createElement("span", null, label), count != null && /*#__PURE__*/React.createElement("span", {
    className: "bb-chip__count"
  }, count)));
}
Object.assign(__ds_scope, { IngredientChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/inventory/IngredientChip.jsx", error: String((e && e.message) || e) }); }

// components/inventory/QuantityStepper.jsx
try { (() => {
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

/** Keyboard-operable quantity stepper. */
function QuantityStepper({
  value,
  min = 0,
  max = 99,
  step = 1,
  unit,
  onChange
}) {
  const set = v => onChange && onChange(Math.min(max, Math.max(min, v)));
  const onKeyDown = e => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      set(value + step);
    }
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      set(value - step);
    }
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    className: "bb-step",
    role: "group",
    onKeyDown: onKeyDown
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "bb-step__btn",
    onClick: () => set(value - step),
    disabled: value <= min,
    "aria-label": "Decrease"
  }, "\u2013"), /*#__PURE__*/React.createElement("div", {
    className: "bb-step__val",
    role: "spinbutton",
    tabIndex: 0,
    "aria-valuenow": value,
    "aria-valuemin": min,
    "aria-valuemax": max
  }, value, unit && /*#__PURE__*/React.createElement("span", {
    className: "bb-step__unit"
  }, unit)), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "bb-step__btn",
    onClick: () => set(value + step),
    disabled: value >= max,
    "aria-label": "Increase"
  }, "+")));
}
Object.assign(__ds_scope, { QuantityStepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/inventory/QuantityStepper.jsx", error: String((e && e.message) || e) }); }

// components/inventory/ShelfRow.jsx
try { (() => {
const CSS = `
.bb-row{display:flex;align-items:center;gap:16px;min-height:56px;padding:10px 0;border-bottom:1px solid var(--rule-faint)}
.bb-row__main{flex:1;min-width:0}
.bb-row__name{font-family:var(--font-serif);font-size:17px;font-style:italic;color:var(--cream-100);line-height:1.3}
.bb-row[data-empty="true"] .bb-row__name{color:var(--sage-600);text-decoration:line-through;text-decoration-color:rgba(156,175,164,0.6)}
.bb-row__detail{margin-top:3px;font-family:var(--font-body);font-size:13px;color:var(--cream-400)}
.bb-row__brand{font-style:normal;font-family:var(--font-body)}
.bb-row__sep{color:var(--rule-strong);margin:0 6px}
.bb-row__frac{color:var(--brass-500);font-variant-numeric:diagonal-fractions}
.bb-row__remove{flex:none;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0 8px;border:0;border-radius:2px;background:transparent;color:var(--cream-400);font-family:var(--font-body);font-size:11px;font-weight:600;letter-spacing:0.10em;text-transform:uppercase;cursor:pointer;opacity:0;transition:var(--transition-state),opacity var(--dur-fast) var(--ease-out)}
.bb-row:hover .bb-row__remove,.bb-row__remove:focus-visible{opacity:1}
.bb-row__remove:hover{color:var(--ox-700)}
.bb-row__remove:focus-visible{outline:2px solid var(--brass-500);outline-offset:2px}
.bb-row__remove:active{background:var(--ox-wash);color:var(--ox-700)}
`;

/** One bottle on the shelf: ingredient, optional bottle detail, quiet remove. */
function ShelfRow({
  name,
  brand,
  volume,
  remaining,
  empty = false,
  onRemove
}) {
  const hasDetail = brand || volume || remaining;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    className: "bb-row",
    "data-empty": empty ? "true" : "false"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bb-row__main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bb-row__name"
  }, name), hasDetail && /*#__PURE__*/React.createElement("div", {
    className: "bb-row__detail"
  }, brand && /*#__PURE__*/React.createElement("span", {
    className: "bb-row__brand"
  }, brand), brand && volume && /*#__PURE__*/React.createElement("span", {
    className: "bb-row__sep"
  }, "\xB7"), volume && /*#__PURE__*/React.createElement("span", null, volume), remaining && /*#__PURE__*/React.createElement("span", {
    className: "bb-row__sep"
  }, "\xB7"), remaining && /*#__PURE__*/React.createElement("span", {
    className: "bb-row__frac"
  }, remaining, " left"))), onRemove && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "bb-row__remove",
    onClick: onRemove,
    "aria-label": `Remove ${name} from shelf`
  }, "Remove")));
}
Object.assign(__ds_scope, { ShelfRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/inventory/ShelfRow.jsx", error: String((e && e.message) || e) }); }

// components/navigation/FamilyFilterBar.jsx
try { (() => {
const CSS = `
.bb-fam{display:flex;align-items:stretch;border:1px solid var(--rule-hairline);border-radius:2px;overflow:hidden}
.bb-fam__btn{flex:1;min-height:44px;padding:0 14px;border:0;border-left:1px solid var(--rule-faint);background:transparent;color:var(--cream-400);font-family:var(--font-body);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.10em;text-indent:0.10em;cursor:pointer;white-space:nowrap;transition:var(--transition-state)}
.bb-fam__btn:first-child{border-left:0}
.bb-fam__btn:hover{color:var(--cream-100);background:var(--brass-wash)}
.bb-fam__btn:focus-visible{outline:2px solid var(--brass-500);outline-offset:-2px}
.bb-fam__btn[aria-pressed="true"]{background:var(--brass-500);color:var(--green-900)}
.bb-fam__btn[aria-pressed="true"]:hover{background:#D3B171}
.bb-fam__btn:disabled{color:var(--sage-600);cursor:not-allowed;background:transparent}
`;

/** The five drink families as a segmented control. */
function FamilyFilterBar({
  families = [],
  value,
  onChange,
  disabled = []
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    className: "bb-fam",
    role: "group",
    "aria-label": "Drink family"
  }, families.map(f => /*#__PURE__*/React.createElement("button", {
    key: f,
    type: "button",
    className: "bb-fam__btn",
    "aria-pressed": value === f,
    disabled: disabled.includes(f),
    onClick: () => onChange && onChange(f)
  }, f))));
}
Object.assign(__ds_scope, { FamilyFilterBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/FamilyFilterBar.jsx", error: String((e && e.message) || e) }); }

// components/shopping/ShoppingListItem.jsx
try { (() => {
const CSS = `
.bb-shop{display:flex;align-items:center;gap:16px;width:100%;text-align:left;padding:12px 0;background:transparent;border:0;border-bottom:1px solid var(--rule-faint);cursor:pointer;transition:var(--transition-state)}
.bb-shop:hover .bb-shop__name{color:var(--rose-300)}
.bb-shop:focus-visible{outline:2px solid var(--brass-500);outline-offset:2px}
.bb-shop__box{flex:none;width:44px;height:44px;display:flex;align-items:center;justify-content:center}
.bb-shop__mark{width:18px;height:18px;border:1px solid var(--rose-400);border-radius:2px;display:flex;align-items:center;justify-content:center;color:var(--green-900);font-size:11px;line-height:1;transition:var(--transition-state)}
.bb-shop[data-checked="true"] .bb-shop__mark{background:var(--brass-500);border-color:var(--brass-500)}
.bb-shop__main{flex:1;min-width:0}
.bb-shop__name{font-family:var(--font-serif);font-size:17px;font-style:italic;color:var(--cream-100);transition:var(--transition-state)}
.bb-shop[data-checked="true"] .bb-shop__name{color:var(--sage-600);text-decoration:line-through;text-decoration-color:rgba(156,175,164,0.6)}
.bb-shop__unlocks{margin-top:3px;font-family:var(--font-body);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.10em;text-indent:0.10em;color:var(--rose-400)}
.bb-shop[data-checked="true"] .bb-shop__unlocks{color:var(--sage-600)}
.bb-shop__note{flex:none;font-family:var(--font-serif);font-size:13px;color:var(--cream-400);font-style:italic}
`;

/** One purchase on the list — rose accent, shows what it unlocks. */
function ShoppingListItem({
  name,
  unlocks,
  note,
  checked = false,
  onToggle
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "bb-shop",
    "data-checked": checked ? "true" : "false",
    "aria-pressed": checked,
    onClick: onToggle
  }, /*#__PURE__*/React.createElement("span", {
    className: "bb-shop__box"
  }, /*#__PURE__*/React.createElement("span", {
    className: "bb-shop__mark",
    "aria-hidden": "true"
  }, checked ? "✓" : "")), /*#__PURE__*/React.createElement("span", {
    className: "bb-shop__main"
  }, /*#__PURE__*/React.createElement("span", {
    className: "bb-shop__name"
  }, name), unlocks != null && /*#__PURE__*/React.createElement("span", {
    className: "bb-shop__unlocks",
    style: {
      display: "block"
    }
  }, "Unlocks ", unlocks)), note && /*#__PURE__*/React.createElement("span", {
    className: "bb-shop__note"
  }, note)));
}
Object.assign(__ds_scope, { ShoppingListItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shopping/ShoppingListItem.jsx", error: String((e && e.message) || e) }); }

// ui_kits/back-bar-app/AppShell.jsx
try { (() => {
const {
  Toast
} = window.TheBackBarDesignSystem_3399bd;
function NavItem({
  label,
  active,
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    style: {
      display: "block",
      width: "100%",
      textAlign: "left",
      minHeight: 44,
      padding: "0 0 0 14px",
      background: "transparent",
      border: 0,
      borderLeft: active ? "2px solid var(--brass-500)" : "2px solid transparent",
      color: active ? "var(--brass-500)" : "var(--cream-400)",
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: "0.10em",
      textIndent: "0.10em",
      cursor: "pointer",
      transition: "var(--transition-state)"
    }
  }, label);
}
function AppShell() {
  const [tab, setTab] = React.useState("tonight");
  const [shelf, setShelf] = React.useState(window.BB.shelf);
  const [bought, setBought] = React.useState(new Set());
  const [open, setOpen] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const have = new Set(shelf.map(b => b.name));
  const add = name => {
    if (have.has(name)) return;
    setShelf(s => [...s, {
      name,
      brand: "Unopened",
      volume: "750ml",
      remaining: "1"
    }]);
    setToast({
      message: `${name} added to the shelf.`,
      tone: "neutral"
    });
  };
  const remove = name => {
    const prev = shelf;
    setShelf(s => s.filter(b => b.name !== name));
    setToast({
      message: `${name} removed from the shelf.`,
      tone: "destructive",
      undo: () => setShelf(prev)
    });
  };
  const buy = name => {
    setBought(b => {
      const n = new Set(b);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
    if (!bought.has(name)) add(name);
  };
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: "var(--green-900)",
      display: "grid",
      gridTemplateColumns: "212px minmax(0,1fr)"
    }
  }, /*#__PURE__*/React.createElement("nav", {
    style: {
      borderRight: "1px solid var(--rule-hairline)",
      padding: "28px 20px",
      position: "sticky",
      top: 0,
      height: "100vh",
      boxSizing: "border-box"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 24,
      lineHeight: 1.15,
      color: "var(--cream-100)"
    }
  }, "The", /*#__PURE__*/React.createElement("br", null), "Back Bar"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      margin: "14px 0 26px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      height: 1,
      background: "var(--rule-faint)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--rule-strong)"
    }
  }, "\u25C6"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      height: 1,
      background: "var(--rule-faint)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(NavItem, {
    label: "Tonight",
    active: tab === "tonight",
    onClick: () => setTab("tonight")
  }), /*#__PURE__*/React.createElement(NavItem, {
    label: "Shelf",
    active: tab === "shelf",
    onClick: () => setTab("shelf")
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      bottom: 28,
      left: 20,
      right: 20,
      fontSize: 13,
      fontStyle: "italic",
      fontFamily: "var(--font-serif)",
      color: "var(--sage-600)",
      lineHeight: 1.4
    }
  }, shelf.length, " bottles \xB7 ", window.BB.drinks.filter(d => d.ing.every(i => have.has(i))).length, " pourable")), /*#__PURE__*/React.createElement("main", {
    style: {
      padding: "28px 32px 96px",
      maxWidth: 1180
    }
  }, tab === "shelf" ? /*#__PURE__*/React.createElement(ShelfScreen, {
    shelf: shelf,
    pantry: window.BB.pantry,
    onAdd: add,
    onRemove: remove
  }) : /*#__PURE__*/React.createElement(TonightScreen, {
    drinks: window.BB.drinks,
    have: have,
    bought: bought,
    onBuy: buy,
    onOpen: setOpen
  })), /*#__PURE__*/React.createElement(RecipeDetail, {
    drink: open,
    have: have,
    onClose: () => setOpen(null),
    onAdd: n => {
      add(n);
      setOpen(null);
    }
  }), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 60
    }
  }, /*#__PURE__*/React.createElement(Toast, {
    message: toast.message,
    tone: toast.tone,
    actionLabel: toast.undo ? "Undo" : undefined,
    onAction: () => {
      toast.undo && toast.undo();
      setToast(null);
    }
  })));
}
Object.assign(window, {
  AppShell,
  NavItem
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/back-bar-app/AppShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/back-bar-app/MobileApp.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  DrinkCard,
  MatchHeader,
  FamilyFilterBar,
  ShoppingListItem,
  SearchField,
  ShelfRow,
  IngredientChip,
  Button,
  RatioDevice
} = window.TheBackBarDesignSystem_3399bd;
function MobileTabBar({
  tab,
  setTab
}) {
  const item = (id, label) => /*#__PURE__*/React.createElement("button", {
    type: "button",
    key: id,
    onClick: () => setTab(id),
    style: {
      flex: 1,
      minHeight: 56,
      background: "transparent",
      border: 0,
      borderTop: tab === id ? "1px solid var(--brass-500)" : "1px solid transparent",
      color: tab === id ? "var(--brass-500)" : "var(--cream-400)",
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: "0.10em",
      textIndent: "0.10em",
      cursor: "pointer"
    }
  }, label);
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      position: "sticky",
      bottom: 0,
      display: "flex",
      background: "var(--green-900)",
      borderTop: "1px solid var(--rule-hairline)"
    }
  }, item("tonight", "Tonight"), item("shelf", "Shelf"), item("list", "List"));
}
function MobileApp() {
  const [tab, setTab] = React.useState("tonight");
  const [family, setFamily] = React.useState("All");
  const [q, setQ] = React.useState("");
  const [shelf, setShelf] = React.useState(window.BB.shelf);
  const [bought, setBought] = React.useState(new Set());
  const have = new Set(shelf.map(b => b.name));
  const add = n => setShelf(s => s.some(b => b.name === n) ? s : [...s, {
    name: n,
    brand: "Unopened",
    volume: "750ml",
    remaining: "1"
  }]);
  const scored = window.BB.drinks.map(d => ({
    ...d,
    missing: d.ing.filter(i => !have.has(i))
  }));
  const pourable = scored.filter(d => d.missing.length === 0 && (family === "All" || d.family === family));
  const near = scored.filter(d => d.missing.length === 1 && (family === "All" || d.family === family));
  const gaps = {};
  near.forEach(d => {
    gaps[d.missing[0]] = (gaps[d.missing[0]] || 0) + 1;
  });
  const head = title => /*#__PURE__*/React.createElement("header", {
    style: {
      padding: "22px 20px 16px",
      borderBottom: "1px solid var(--rule-hairline)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: "0.16em",
      textIndent: "0.16em",
      color: "var(--cream-400)"
    }
  }, "The Back Bar"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: "8px 0 0",
      fontFamily: "var(--font-display)",
      fontSize: 32,
      lineHeight: 1.12,
      color: "var(--cream-100)"
    }
  }, title));
  const card = d => /*#__PURE__*/React.createElement(DrinkCard, {
    key: d.name,
    name: d.name,
    family: d.family,
    match: d.missing.length === 0 ? "full" : d.missing.length === 1 ? "near" : "partial",
    ingredients: d.ing.map(i => ({
      name: i,
      have: have.has(i)
    }))
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 390,
      minHeight: 844,
      background: "var(--green-900)",
      display: "flex",
      flexDirection: "column",
      border: "1px solid var(--rule-hairline)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, tab === "tonight" && /*#__PURE__*/React.createElement(React.Fragment, null, head("Tonight"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 20px 0"
    }
  }, /*#__PURE__*/React.createElement(FamilyFilterBar, {
    families: ["All", "Sour", "Old Fashioned", "Highball"],
    value: family,
    onChange: setFamily
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "20px 20px 0"
    }
  }, /*#__PURE__*/React.createElement(MatchHeader, {
    label: "Drinks",
    count: pourable.length
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 12,
      marginTop: 12
    }
  }, pourable.slice(0, 3).map(card)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 22
    }
  }), /*#__PURE__*/React.createElement(MatchHeader, {
    label: "One bottle away",
    count: near.length,
    tone: "gap"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 12,
      marginTop: 12
    }
  }, near.slice(0, 2).map(card)))), tab === "shelf" && /*#__PURE__*/React.createElement(React.Fragment, null, head("Shelf"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 20px 0"
    }
  }, /*#__PURE__*/React.createElement(SearchField, {
    value: q,
    placeholder: "Search the shelf",
    onChange: setQ,
    onClear: () => setQ("")
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "18px 20px 0"
    }
  }, /*#__PURE__*/React.createElement(MatchHeader, {
    label: "On the shelf",
    count: shelf.length
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, shelf.filter(b => b.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8).map(b => /*#__PURE__*/React.createElement(ShelfRow, _extends({
    key: b.name
  }, b, {
    onRemove: () => setShelf(s => s.filter(x => x.name !== b.name))
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18,
      display: "flex",
      flexWrap: "wrap",
      gap: 10
    }
  }, window.BB.pantry.slice(0, 4).map(p => /*#__PURE__*/React.createElement(IngredientChip, {
    key: p,
    label: p,
    state: have.has(p) ? "have" : "default",
    onToggle: () => add(p)
  }))))), tab === "list" && /*#__PURE__*/React.createElement(React.Fragment, null, head("Shopping list"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "18px 20px 0"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 8px",
      fontSize: 15,
      fontStyle: "italic",
      fontFamily: "var(--font-serif)",
      color: "var(--cream-400)"
    }
  }, "Buy in this order. Each line says what it opens."), Object.entries(gaps).sort((a, b) => b[1] - a[1]).map(([n, c]) => /*#__PURE__*/React.createElement(ShoppingListItem, {
    key: n,
    name: n,
    unlocks: c,
    checked: bought.has(n),
    onToggle: () => {
      setBought(b => {
        const s = new Set(b);
        s.has(n) ? s.delete(n) : s.add(n);
        return s;
      });
      add(n);
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 22
    }
  }, /*#__PURE__*/React.createElement(RatioDevice, {
    size: "sm",
    parts: [{
      value: "2",
      label: "Spirit"
    }, {
      value: "¾",
      label: "Citrus"
    }, {
      value: "¾",
      label: "Sweet"
    }]
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 14,
      fontSize: 13,
      fontStyle: "italic",
      fontFamily: "var(--font-serif)",
      color: "var(--sage-600)"
    }
  }, "Most of what you are missing is a sweetener, not a spirit.")))), /*#__PURE__*/React.createElement(MobileTabBar, {
    tab: tab,
    setTab: setTab
  }));
}
Object.assign(window, {
  MobileApp,
  MobileTabBar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/back-bar-app/MobileApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/back-bar-app/RecipeDetail.jsx
try { (() => {
const {
  ModalFrame,
  RatioDevice,
  Button,
  IngredientChip
} = window.TheBackBarDesignSystem_3399bd;
function RecipeDetail({
  drink,
  have,
  onClose,
  onAdd
}) {
  if (!drink) return null;
  const missing = drink.ing.filter(i => !have.has(i));
  return /*#__PURE__*/React.createElement(ModalFrame, {
    overlay: true,
    eyebrow: drink.family,
    title: drink.name,
    onDismiss: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      onClick: onClose
    }, "Close"), missing.length > 0 && /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      onClick: () => onAdd(missing[0])
    }, "Add ", missing[0]))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 460
    }
  }, /*#__PURE__*/React.createElement(RatioDevice, {
    parts: drink.ratio.map(([value, label]) => ({
      value,
      label
    })),
    size: "lg"
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "26px 0 0",
      fontSize: 17,
      lineHeight: 1.5,
      fontStyle: "italic",
      fontFamily: "var(--font-serif)",
      color: "var(--cream-100)"
    }
  }, drink.ing.map((i, n) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, n > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontStyle: "normal",
      color: "var(--rule-strong)",
      margin: "0 6px"
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: have.has(i) ? "var(--cream-100)" : "var(--sage-600)"
    }
  }, i)))), missing.length > 0 && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "14px 0 0",
      fontSize: 13,
      color: "var(--rose-400)"
    }
  }, missing.length === 1 ? "One bottle away: " : `Missing ${missing.length}: `, /*#__PURE__*/React.createElement("em", null, missing.join(", "))), drink.note && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "20px 0 0",
      fontSize: 15,
      lineHeight: 1.5,
      fontStyle: "italic",
      fontFamily: "var(--font-serif)",
      color: "var(--cream-400)",
      maxWidth: "46ch"
    }
  }, drink.note), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 22,
      display: "flex",
      flexWrap: "wrap",
      gap: 10
    }
  }, drink.ing.map(i => /*#__PURE__*/React.createElement(IngredientChip, {
    key: i,
    label: i,
    state: have.has(i) ? "have" : "absent",
    onToggle: () => !have.has(i) && onAdd(i)
  })))));
}
Object.assign(window, {
  RecipeDetail
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/back-bar-app/RecipeDetail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/back-bar-app/ShelfScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  ShelfRow,
  IngredientChip,
  SearchField,
  Button,
  EmptyState,
  MatchHeader,
  QuantityStepper
} = window.TheBackBarDesignSystem_3399bd;
function ShelfScreen({
  shelf,
  pantry,
  onAdd,
  onRemove
}) {
  const [q, setQ] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const have = new Set(shelf.map(b => b.name));
  const rows = shelf.filter(b => b.name.toLowerCase().includes(q.toLowerCase()) || (b.brand || "").toLowerCase().includes(q.toLowerCase()));
  const spirits = rows.filter(b => ["Rye whiskey", "White rum", "Cognac", "Gin", "Bourbon", "Aged rum", "Tequila"].includes(b.name));
  const modifiers = rows.filter(b => !spirits.includes(b));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 24,
      paddingBottom: 20,
      borderBottom: "1px solid var(--rule-hairline)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: "0.16em",
      textIndent: "0.16em",
      color: "var(--cream-400)"
    }
  }, "The Back Bar"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: "10px 0 0",
      fontFamily: "var(--font-display)",
      fontSize: 44,
      lineHeight: 1.08,
      color: "var(--cream-100)"
    }
  }, "Shelf")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 280
    }
  }, /*#__PURE__*/React.createElement(SearchField, {
    value: q,
    placeholder: "Search the shelf",
    onChange: setQ,
    onClear: () => setQ("")
  })), /*#__PURE__*/React.createElement(Button, {
    onClick: () => setAdding(!adding)
  }, adding ? "Done" : "Add a bottle"))), adding && /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "22px 0",
      borderBottom: "1px solid var(--rule-faint)"
    }
  }, /*#__PURE__*/React.createElement(MatchHeader, {
    label: "Pantry",
    align: "center"
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "12px 0 14px",
      fontSize: 15,
      fontStyle: "italic",
      fontFamily: "var(--font-serif)",
      color: "var(--cream-400)"
    }
  }, "Tap what is in the house. Brass means you have it."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 10
    }
  }, pantry.map(p => /*#__PURE__*/React.createElement(IngredientChip, {
    key: p,
    label: p,
    state: have.has(p) ? "have" : "default",
    onToggle: () => have.has(p) ? onRemove(p) : onAdd(p)
  })))), shelf.length === 0 ? /*#__PURE__*/React.createElement(EmptyState, {
    title: "The shelf is bare",
    body: "Add a base spirit, a citrus and a sweetener \u2014 six drinks open up on the first three bottles.",
    action: /*#__PURE__*/React.createElement(Button, {
      onClick: () => setAdding(true)
    }, "Add a bottle")
  }) : rows.length === 0 ? /*#__PURE__*/React.createElement(EmptyState, {
    title: "Nothing by that name",
    body: "Try the brand instead, or clear the search and browse the shelf."
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
      gap: "0 48px",
      marginTop: 26
    }
  }, /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement(MatchHeader, {
    label: "Spirits",
    count: spirits.length,
    align: "center"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, spirits.map(b => /*#__PURE__*/React.createElement(ShelfRow, _extends({
    key: b.name
  }, b, {
    onRemove: () => onRemove(b.name)
  }))))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement(MatchHeader, {
    label: "Modifiers & mixers",
    count: modifiers.length,
    align: "center"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, modifiers.map(b => /*#__PURE__*/React.createElement(ShelfRow, _extends({
    key: b.name
  }, b, {
    onRemove: () => onRemove(b.name)
  })))))), /*#__PURE__*/React.createElement("footer", {
    style: {
      marginTop: 34,
      paddingTop: 18,
      borderTop: "1px solid var(--rule-faint)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontStyle: "italic",
      fontFamily: "var(--font-serif)",
      color: "var(--cream-400)"
    }
  }, "Bottles on the shelf"), /*#__PURE__*/React.createElement(QuantityStepper, {
    value: shelf.length,
    min: 0,
    max: 99,
    unit: "btl",
    onChange: () => {}
  })));
}
Object.assign(window, {
  ShelfScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/back-bar-app/ShelfScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/back-bar-app/TonightScreen.jsx
try { (() => {
const {
  DrinkCard,
  MatchHeader,
  FamilyFilterBar,
  ShoppingListItem,
  EmptyState,
  Button
} = window.TheBackBarDesignSystem_3399bd;
function matchOf(drink, have) {
  const missing = drink.ing.filter(i => !have.has(i));
  if (missing.length === 0) return "full";
  if (missing.length === 1) return "near";
  if (missing.length <= drink.ing.length - 2) return "partial";
  return "none";
}
function TonightScreen({
  drinks,
  have,
  onOpen,
  bought,
  onBuy
}) {
  const [family, setFamily] = React.useState("All");
  const scored = drinks.map(d => ({
    ...d,
    match: matchOf(d, have),
    missing: d.ing.filter(i => !have.has(i))
  }));
  const inFamily = d => family === "All" || d.family === family;
  const pourable = scored.filter(d => d.match === "full" && inFamily(d));
  const near = scored.filter(d => d.match === "near" && inFamily(d));
  const rest = scored.filter(d => (d.match === "partial" || d.match === "none") && inFamily(d));
  const gaps = {};
  scored.filter(d => d.match === "near").forEach(d => {
    gaps[d.missing[0]] = (gaps[d.missing[0]] || 0) + 1;
  });
  const list = Object.entries(gaps).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const card = d => /*#__PURE__*/React.createElement(DrinkCard, {
    key: d.name,
    name: d.name,
    family: d.family,
    match: d.match,
    onSelect: () => onOpen(d),
    ingredients: d.ing.map(i => ({
      name: i,
      have: have.has(i)
    }))
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) 320px",
      gap: 48,
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      paddingBottom: 20,
      borderBottom: "1px solid var(--rule-hairline)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: "0.16em",
      textIndent: "0.16em",
      color: "var(--cream-400)"
    }
  }, "The Back Bar"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: "10px 0 18px",
      fontFamily: "var(--font-display)",
      fontSize: 44,
      lineHeight: 1.08,
      color: "var(--cream-100)"
    }
  }, "Tonight"), /*#__PURE__*/React.createElement(FamilyFilterBar, {
    families: ["All", "Sour", "Old Fashioned", "Highball", "Martini", "Flip"],
    value: family,
    onChange: setFamily
  })), /*#__PURE__*/React.createElement("section", {
    style: {
      marginTop: 26
    }
  }, /*#__PURE__*/React.createElement(MatchHeader, {
    label: pourable.length === 1 ? "Drink" : "Drinks",
    count: pourable.length
  }), pourable.length === 0 ? /*#__PURE__*/React.createElement(EmptyState, {
    title: "Nothing pours yet",
    body: "Add a citrus and a sweetener and the sours open up."
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
      gap: 12,
      marginTop: 12
    }
  }, pourable.map(card))), near.length > 0 && /*#__PURE__*/React.createElement("section", {
    style: {
      marginTop: 28
    }
  }, /*#__PURE__*/React.createElement(MatchHeader, {
    label: "One bottle away",
    count: near.length,
    tone: "gap"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
      gap: 12,
      marginTop: 12
    }
  }, near.map(card))), rest.length > 0 && /*#__PURE__*/React.createElement("section", {
    style: {
      marginTop: 28
    }
  }, /*#__PURE__*/React.createElement(MatchHeader, {
    label: "Further off",
    count: rest.length
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
      gap: 12,
      marginTop: 12
    }
  }, rest.map(card)))), /*#__PURE__*/React.createElement("aside", {
    style: {
      background: "var(--green-800)",
      border: "1px solid var(--rule-hairline)",
      borderRadius: 2,
      padding: "20px 20px 24px",
      position: "sticky",
      top: 24
    }
  }, /*#__PURE__*/React.createElement(MatchHeader, {
    label: "Shopping list",
    count: list.length,
    tone: "gap"
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "12px 0 6px",
      fontSize: 15,
      fontStyle: "italic",
      fontFamily: "var(--font-serif)",
      color: "var(--cream-400)"
    }
  }, "Buy in this order. Each line says what it opens."), list.length === 0 ? /*#__PURE__*/React.createElement(EmptyState, {
    body: "Nothing to buy \u2014 the shelf covers every drink in the index."
  }) : list.map(([name, n]) => /*#__PURE__*/React.createElement(ShoppingListItem, {
    key: name,
    name: name,
    unlocks: n,
    checked: bought.has(name),
    onToggle: () => onBuy(name)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm"
  }, "Print the list"))));
}
Object.assign(window, {
  TonightScreen,
  matchOf
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/back-bar-app/TonightScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/back-bar-app/data.js
try { (() => {
window.BB = (() => {
  const shelf = [{
    name: "Rye whiskey",
    brand: "Rittenhouse Bottled-in-Bond",
    volume: "750ml",
    remaining: "¾"
  }, {
    name: "White rum",
    brand: "Plantation 3 Star",
    volume: "750ml",
    remaining: "½"
  }, {
    name: "Cognac",
    brand: "Pierre Ferrand 1840",
    volume: "750ml",
    remaining: "⅔"
  }, {
    name: "Gin",
    brand: "Beefeater",
    volume: "1L",
    remaining: "⅘"
  }, {
    name: "Sweet vermouth",
    brand: "Cocchi di Torino",
    volume: "750ml",
    remaining: "⅓"
  }, {
    name: "Dry vermouth",
    brand: "Dolin",
    volume: "375ml",
    remaining: "¼"
  }, {
    name: "Angostura bitters",
    brand: "House",
    volume: "200ml",
    remaining: "⅞"
  }, {
    name: "Lime juice",
    brand: "Fresh",
    volume: "—",
    remaining: "½"
  }, {
    name: "Lemon juice",
    brand: "Fresh",
    volume: "—",
    remaining: "⅓"
  }, {
    name: "Simple syrup",
    brand: "House 1:1",
    volume: "500ml",
    remaining: "⅔"
  }, {
    name: "Demerara syrup",
    brand: "House 2:1",
    volume: "250ml",
    remaining: "¾"
  }, {
    name: "Campari",
    brand: "Campari",
    volume: "750ml",
    remaining: "⅖"
  }, {
    name: "Soda water",
    brand: "Topo Chico",
    volume: "355ml",
    remaining: "1"
  }];
  const pantry = ["Orgeat", "Curaçao", "Cointreau", "Green Chartreuse", "Maraschino", "Aged rum", "Tequila", "Cream", "Egg white", "Orange flower water", "Absinthe", "Grapefruit juice", "Honey syrup", "Aperol", "Prosecco", "Bourbon", "Peychaud's bitters", "Bénédictine"];
  const drinks = [{
    name: "Daiquiri",
    family: "Sour",
    ing: ["White rum", "Lime juice", "Simple syrup"],
    ratio: [["2", "Rum"], ["¾", "Lime"], ["¾", "Syrup"]],
    note: "The proof of a bar. If the rum is good, the drink is good."
  }, {
    name: "Manhattan",
    family: "Old Fashioned",
    ing: ["Rye whiskey", "Sweet vermouth", "Angostura bitters"],
    ratio: [["2", "Rye"], ["1", "Vermouth"], ["2", "Dashes"]],
    note: "Stirred, never shaken. The vermouth lives in the fridge."
  }, {
    name: "Sidecar",
    family: "Sour",
    ing: ["Cognac", "Lemon juice", "Cointreau"],
    ratio: [["2", "Cognac"], ["¾", "Lemon"], ["¾", "Orange"]]
  }, {
    name: "Negroni",
    family: "Old Fashioned",
    ing: ["Gin", "Campari", "Sweet vermouth"],
    ratio: [["1", "Gin"], ["1", "Bitter"], ["1", "Vermouth"]],
    note: "Equal parts. Stir with a big cube; the dilution is the recipe."
  }, {
    name: "Old Fashioned",
    family: "Old Fashioned",
    ing: ["Rye whiskey", "Demerara syrup", "Angostura bitters"],
    ratio: [["2", "Rye"], ["¼", "Sugar"], ["2", "Dashes"]]
  }, {
    name: "Martini",
    family: "Martini",
    ing: ["Gin", "Dry vermouth"],
    ratio: [["2½", "Gin"], ["¾", "Vermouth"]]
  }, {
    name: "Gin Rickey",
    family: "Highball",
    ing: ["Gin", "Lime juice", "Soda water"],
    ratio: [["2", "Gin"], ["¾", "Lime"], ["3", "Soda"]]
  }, {
    name: "Americano",
    family: "Highball",
    ing: ["Campari", "Sweet vermouth", "Soda water"],
    ratio: [["1", "Bitter"], ["1", "Vermouth"], ["3", "Soda"]]
  }, {
    name: "Whiskey Sour",
    family: "Sour",
    ing: ["Rye whiskey", "Lemon juice", "Simple syrup", "Egg white"],
    ratio: [["2", "Rye"], ["¾", "Lemon"], ["¾", "Syrup"]]
  }, {
    name: "Mai Tai",
    family: "Sour",
    ing: ["Aged rum", "Lime juice", "Orgeat", "Curaçao"],
    ratio: [["2", "Rum"], ["¾", "Lime"], ["½", "Orgeat"], ["½", "Orange"]]
  }, {
    name: "Last Word",
    family: "Sour",
    ing: ["Gin", "Green Chartreuse", "Maraschino", "Lime juice"],
    ratio: [["¾", "Gin"], ["¾", "Herbal"], ["¾", "Maraschino"], ["¾", "Lime"]]
  }, {
    name: "Corpse Reviver №2",
    family: "Sour",
    ing: ["Gin", "Cointreau", "Lemon juice", "Absinthe"],
    ratio: [["¾", "Gin"], ["¾", "Orange"], ["¾", "Lemon"], ["1", "Dash"]]
  }, {
    name: "Boulevardier",
    family: "Old Fashioned",
    ing: ["Bourbon", "Campari", "Sweet vermouth"],
    ratio: [["1½", "Bourbon"], ["1", "Bitter"], ["1", "Vermouth"]]
  }, {
    name: "Vieux Carré",
    family: "Old Fashioned",
    ing: ["Rye whiskey", "Cognac", "Sweet vermouth", "Bénédictine"],
    ratio: [["1", "Rye"], ["1", "Cognac"], ["1", "Vermouth"], ["½", "Herbal"]]
  }, {
    name: "Ramos Gin Fizz",
    family: "Flip",
    ing: ["Gin", "Cream", "Egg white", "Orange flower water", "Lemon juice"],
    ratio: [["2", "Gin"], ["1", "Cream"], ["½", "Lemon"]]
  }, {
    name: "Paloma",
    family: "Highball",
    ing: ["Tequila", "Grapefruit juice", "Lime juice", "Soda water"],
    ratio: [["2", "Tequila"], ["2", "Grapefruit"], ["½", "Lime"]]
  }];
  const families = ["All", "Sour", "Old Fashioned", "Highball", "Martini", "Flip"];
  return {
    shelf,
    pantry,
    drinks,
    families
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/back-bar-app/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.DrinkCard = __ds_scope.DrinkCard;

__ds_ns.MatchHeader = __ds_scope.MatchHeader;

__ds_ns.RatioDevice = __ds_scope.RatioDevice;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.ModalFrame = __ds_scope.ModalFrame;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.SearchField = __ds_scope.SearchField;

__ds_ns.IngredientChip = __ds_scope.IngredientChip;

__ds_ns.QuantityStepper = __ds_scope.QuantityStepper;

__ds_ns.ShelfRow = __ds_scope.ShelfRow;

__ds_ns.FamilyFilterBar = __ds_scope.FamilyFilterBar;

__ds_ns.ShoppingListItem = __ds_scope.ShoppingListItem;

})();
