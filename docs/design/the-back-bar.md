# The Back Bar — Design System

Design system for the home-bartender pantry application (inventory shelf, "what can I
make," shopping-list gap analysis, recipe index). The visual identity is established and
**non-negotiable** — extend it, don't reinterpret it. Tokens live in
[`tokens.css`](./tokens.css); treat that file as the source of truth for values.

## Concept

An 1885 Gilded Age hotel bar bill, rendered as a modern dark-mode interface. References:
engraved liquor labels, Victorian hotel menus, brass rail and bottle-green leather. The
product thesis is **"templates, not recipes"** — the UI should feel like a well-kept
ledger, not a lifestyle app.

## Color tokens

Exact values — do not adjust.

| Token | Value | Role |
|---|---|---|
| `--green-900` | `#122E26` | App background (ballroom green) |
| `--green-800` | `#1A3B2F` | Card / raised surface |
| `--brass-500` | `#C6A15B` | Primary accent, selection, in-stock state |
| `--cream-100` | `#F1E8D6` | Primary text |
| `--cream-400` | `#B9AE97` | Secondary text, labels |
| `--sage-600` | `#6E8177` | Disabled / not-in-bar ingredient text |
| `--rose-300` | `#D8A79A` | "Near miss" section headers |
| `--rose-400` | `#C99287` | Missing-ingredient callouts |
| `--ox-700` | `#7A3B33` | Destructive actions, remove-from-shelf |

### Semantic mapping (core UX vocabulary — keep it strict)

- **Brass** = you have it / selected / can pour
- **Cream** = neutral content
- **Sage** = you don't have it (calm absence, not an error)
- **Rose** = actionable gap (one bottle away, shopping list)
- **Oxblood** = removal / destructive only

Never use rose or oxblood for decoration.

## Typography

- **Display: Libre Caslon Display** — drink names, screen titles, the ratio device.
  Never below 20px.
- **Body: Libre Caslon Text** (400/700 + italic) — everything else. Italic is reserved
  for ingredient names and editorial asides.
- **Utility caps: Libre Caslon Text 600, uppercase, letterspacing 0.18–0.32em** —
  eyebrows, family tags, section headers, buttons. This letterspaced-caps treatment is
  the system's utility voice. **No sans-serif anywhere.**

### Type scale specimen

Display 44 / 32 / 24 · Body 17 / 15 · Caption 13 · Caps 11–13.

## Shape & structure

- **Corners:** 2px max. This is a ledger, not a bubble.
- **Borders:** 1px `rgba(198, 161, 91, 0.3)` on cards. The **double-rule** (3px + 1px
  offset) is reserved for page/modal frames only.
- **Ornament:** the diamond fleuron (–◆–) is the only decorative mark. Use it as a
  section divider, never inline.
- **Signature element:** the **ratio device** — large brass Caslon numerals with
  letterspaced labels beneath, e.g. `2 : ¾ : ¾` over `SPIRIT · CITRUS · SWEET`. Every
  recipe detail view leads with it.

## Motion

Minimal. 150–200ms ease-out on state changes (chip select, card stock-state flip). No
parallax, no page transitions. Respect `prefers-reduced-motion`.

## Component inventory (build in this order)

1. **Ingredient chip** — the atomic unit. States: default (outlined), in-shelf (brass
   fill, green text), disabled/sage. Tap target ≥ 44px.
2. **Shelf row** — ingredient + optional bottle detail (brand, volume remaining as a
   fraction, not a progress bar) + quiet remove action.
3. **Drink card** — display-face name, family tag (caps utility), italic ingredient run
   with per-ingredient stock coloring, missing-line in rose.
4. **Match header** — count + fleuron dividers ("14 DRINKS", "ONE BOTTLE AWAY · 6").
5. **Shopping list item** — rose accent, shows which drinks each purchase unlocks
   ("unlocks 4"); check-off interaction moves it to shelf.
6. **Ratio device** — parameterized (2–4 parts, custom labels).
7. **Family tag / filter bar** — the five families as a segmented control in caps
   utility style.
8. **Search field** — cream text on `green-800`, brass caret, no pill shape.
9. **Empty states** — italic Caslon, always directive ("Add a citrus and a sweetener"),
   never apologetic.
10. **Quantity stepper**, **modal frame** (double-rule), **toast** (brass rule, bottom,
    text-only).

## States to design explicitly

Every component: default / hover / focus-visible (**2px brass outline, 2px offset**) /
active / disabled.

Drink card additionally: full-match, partial-match, near-miss (exactly one missing),
no-match.

## Accessibility floor

- Verify **WCAG AA contrast** for every token pair actually used. Brass-on-green and
  sage-on-green are the borderline pairs — test them first, and darken the background
  (not the accent) if either fails at body sizes.
- Stock state is **never communicated by color alone** — pair with weight,
  strikethrough, or the missing-line text.
- Full keyboard operability on chips and steppers.

## Anti-goals (reject these even if they "improve" the design)

- No sans-serif, no system-font fallback visible in shipped UI
- No gradients, glassmorphism, neon, or glow effects
- No steampunk drift: no gears, no aged-paper textures, no faux distressing
- No emoji in UI copy; no cocktail-glass iconography as decoration
- No rounded-pill buttons; no progress rings
- Don't lighten the greens for "readability" — fix contrast via type weight/size first

## Deliverables checklist

1. Token sheet (all values above as CSS custom properties) — see
   [`tokens.css`](./tokens.css)
2. Type scale specimen (display 44/32/24, body 17/15, caption 13, caps 11–13)
3. Each component in all states, desktop + 390px mobile
4. Two assembled screens to validate the system: **Shelf** (inventory) and **Tonight**
   (what-can-I-make + near misses + shopping list)
