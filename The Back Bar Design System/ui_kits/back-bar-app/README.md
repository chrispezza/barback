# UI kit — The Back Bar app

The two screens that validate the system.

| File | What it is |
| --- | --- |
| `index.html` | Desktop app, click-through. Nav rail (Tonight / Shelf), recipe modal, toasts with undo. |
| `mobile.html` | 390px app: Tonight, Shelf, Shopping list, bottom tab bar. |
| `AppShell.jsx` | Nav rail, shelf state, toast host. |
| `TonightScreen.jsx` | Match engine (full / near / partial / none), family filter, shopping-list sidebar. |
| `ShelfScreen.jsx` | Inventory ledger, pantry add-mode, search, remove. |
| `RecipeDetail.jsx` | Double-rule modal led by the ratio device. |
| `MobileApp.jsx` | 390px composition of the same components. |
| `data.js` | Fake shelf, pantry and 16-drink index. |

Everything on screen composes the primitives in `/components` — no screen re-implements a chip, card, header or button.

Interactions that work: switch tabs, filter by family, search the shelf, add bottles from the pantry, remove a bottle (oxblood toast with Undo), open a drink (modal + ratio device), check off a shopping-list line (moves the bottle to the shelf and re-scores every drink).
