# The Back Bar — design system

A home-bartender pantry application: an inventory shelf, a "what can I make" match
engine, shopping-list gap analysis and a recipe index. The product thesis is
**templates, not recipes** — the interface should read like a well-kept ledger,
not a lifestyle app.

The visual identity is an 1885 Gilded Age hotel bar bill rendered as a modern
dark-mode interface: engraved liquor labels, Victorian hotel menus, brass rail
and bottle-green leather.

## Sources

This system was authored from a **written brand brief only** (pasted into the
project as the opening prompt: concept, exact token values, type rules, component
inventory, state matrix, accessibility floor and anti-goals). There was **no
codebase, Figma file, screenshot set or slide deck** attached — nothing was read
from a repository or design file, and nothing here was reverse-engineered from a
running product.

Consequences worth knowing:

- **No logo was supplied.** The brand mark is the name set in Libre Caslon
  Display; `assets/` contains no wordmark file. Do not invent one.
- **Fonts are self-hosted.** Libre Caslon Display, Libre Caslon Text and
  Instrument Sans ship as latin-subset woff2 in `assets/fonts/` (SIL OFL,
  licences alongside) and are declared in `tokens/fonts.css`. Revision 1 loaded
  them from the Google Fonts CDN; see Revisions.
- **No icon set was supplied** — see ICONOGRAPHY below; the system is
  deliberately icon-free.
- The component inventory is exactly the one the brief enumerated, plus one
  documented addition.

---

## Content fundamentals

The voice is a **house bartender writing in a ledger**: declarative, unhurried,
faintly editorial, never chirpy.

- **Person.** Second person, implied, and sparing: "Add a citrus and a
  sweetener." Never "we", never "let's", never "your bar is looking empty!".
- **Case.** Sentence case for all prose. UPPERCASE only in the letterspaced
  utility voice — eyebrows, section headers, family tags, buttons.
- **Sentences over labels.** Where a lifestyle app would print a badge, this one
  prints a clause: "One bottle away: *Cointreau*", "Unlocks 4".
- **Directive, never apologetic.** Empty states name the next action:
  "Nothing pours yet — add a citrus and a sweetener and six drinks open up."
  Never "Sorry, no results", never "Oops".
- **Numbers are stated flatly.** "14 drinks", "¾ left", "Unlocks 4". Fractions
  are typeset as fraction glyphs (¾, ⅓), never decimals and never percentages.
- **Ingredients are italic Caslon.** The serif italic is a semantic marker for
  ingredient names and editorial asides only — never for emphasis in UI labels,
  and never for numbers.
- **Editorial asides are allowed, one line, in italic:** "Stir with a big cube;
  the dilution is the recipe." They are the only ornament in the copy.
- **No emoji. Ever.** No exclamation marks. No product names in copy where a
  category word will do.

Sample copy that is on-voice:

> ONE BOTTLE AWAY · 6
> **Sidecar** — SOUR
> *Cognac · lemon juice · Cointreau*
> One bottle away: *Cointreau*

---

## Visual foundations

**Colour.** Ten values (`tokens/colors.css`). Ballroom green `#122E26` is the app
background; `#1E4438` is the only raised surface. Brass `#C6A15B` is the
single accent. The semantic mapping is strict and is the core UX vocabulary:
brass = you have it / selected / can pour; cream = neutral content; sage = you
don't have it (calm absence, not an error); rose = actionable gap (one bottle
away, shopping list); oxblood = removal only. Rose and oxblood are **never**
decorative. Tints are brass at fixed alphas (`--rule-hairline` .30,
`--rule-strong` .55, `--brass-wash` .10) — no new hues are introduced anywhere.

**Type.** Three roles, two-and-a-half faces. Libre Caslon Display carries the
brand voice — drink names, screen titles, the ratio numerals — never below 20px.
**Instrument Sans** carries the interface: body copy, labels, counts, bottle
detail and the utility caps voice (600, uppercase, 0.10em for buttons/eyebrows/
family tags, 0.16em for section headers and ratio labels). Libre Caslon Text
italic survives as a semantic marker only — ingredient names and one-line
editorial asides. Scale: display 44/32/24, body 17/15, caption 13, caps 11–13.
Letterspaced caps carry a matching `text-indent` so the optical centre stays true.

> **Deliberate departure from the original brief.** The brief forbade sans-serif
> anywhere. In practice an all-Caslon interface read dated rather than elegant, so
> the classical face was pulled back to where it earns its keep (the brand voice,
> the ratio device, ingredient italics) and the working UI moved to a contemporary
> grotesque. Tracking on the caps voice was also tightened from 0.18–0.32em to
> 0.10–0.16em for the same reason.

**Spacing & layout.** 4-based scale to 64 (`tokens/spacing.css`). 20px gutters at
390px, 32px on desktop. Shelf rows are 56px; every interactive target is at least
44px. Desktop is a fixed 212px nav rail plus a fluid column capped at 1180px;
Tonight adds a 320px sticky shopping-list rail. Reading measure is capped at
64ch. Nothing is centred except empty states and the ratio device.

**Backgrounds.** Flat green. No imagery, no photography, no texture, no
aged-paper grain, no repeating pattern, no gradient of any kind. Depth comes from
one step of surface lightness (green-900 → green-800) and a 1px brass hairline —
never from shadow. There are **no shadows in this system**, inner or outer.

**Borders, cards, frames.** Cards: `--green-800` fill, 1px `rgba(198,161,91,.30)`,
2px radius, no shadow. Corners are 2px maximum, system-wide — there is no pill,
no capsule, no circle, no progress ring. The double rule (3px + 1px at 4px
offset) is reserved for modals and page frames and appears nowhere else.
Dividers are 1px `--rule-faint` hairlines.

**Ornament.** One mark: the diamond fleuron ◆, used as a section divider flanked
by hairlines (`—◆—`), never inline in prose. No other decorative glyph.

**Signature element.** The ratio device: large brass Caslon numerals separated by
thin brass colons, with letterspaced caps labels beneath (2 : ¾ : ¾ /
SPIRIT · CITRUS · SWEET). Every recipe detail view leads with it; it is the
visual argument for "templates, not recipes".

**Motion.** 150ms (`--dur-fast`) for hover/select/focus, 200ms (`--dur-base`) for
stock-state flips and modal fades, both `cubic-bezier(.2,0,.2,1)`. Colour,
background and border transition; nothing translates, scales or bounces. No page
transitions, no parallax, no entrance animation, no skeleton shimmer. All
durations collapse to 0 under `prefers-reduced-motion`.

**Hover.** Border steps from `--rule-hairline` to `--rule-strong`, or a
`--brass-wash` fill appears; text steps cream-400 → cream-100. Brass surfaces
lighten to `#D3B171`. Nothing lifts, grows or glows.

**Press.** Brass surfaces darken to `#B78F4C`; outlined surfaces deepen their
wash to .18–.20 alpha. No scale transform.

**Focus.** `focus-visible` only: 2px solid brass, 2px offset (inset −2px inside
segmented controls). It is never removed and never restyled per component.

**Transparency & blur.** Transparency is used only for brass rules and washes and
the modal scrim `rgba(9,23,19,.72)`. **No blur, no glass, no backdrop-filter.**

**Imagery.** There is none. If product photography is ever introduced it must be
warm, low-key and unfiltered — but the system as shipped is typographic.

**State is never colour alone.** In-shelf pairs brass fill with a ✓ and bold
weight; absence pairs sage with a strikethrough or the rose missing-line text.

**Accessibility.** Against the app background `#122E26`: cream-100 ≈ 12.9:1,
cream-400 ≈ 8.2:1, sage-600 ≈ 6.1:1, brass-500 ≈ 6.1:1, rose-300 ≈ 5.9:1.
Against the card surface `#1E4438`: cream-100 ≈ 9.0:1, sage-600 ≈ 4.7:1,
brass-500 ≈ 4.5:1 — brass therefore never carries small body copy on a card
(it is used for names at 24px, fills, and rules). Every text pair in use passes
AA. State is still never colour alone. Chips, steppers and the filter bar are
fully keyboard operable.

### Palette revisions

Three values were changed after contrast and legibility testing. The brief called
its palette non-negotiable; these are the exceptions, each with a reason.

| Token | Was | Now | Why |
| --- | --- | --- | --- |
| `--sage-600` | `#6E8177` | `#9CAFA4` | 3.4:1 failed AA while carrying the app's most common state ("you don't have it"). Now 6.1:1 on the app background, 4.7:1 on cards. The old value survives as `--sage-700` for decorative borders and dividers only — never text. |
| `--green-800` | `#1A3B2F` | `#1E4438` | Old surface was ~1.15:1 against the background, so cards read as outlines rather than surfaces — a problem in a system with no shadows. Now ~1.31:1: still a ledger, but the card exists. |
| `--ox-700` | `#7A3B33` | `#5F2E33` | Oxblood and rose were the same hue at different values, so "one bottle away" and "remove this bottle" could read as one signal in a dim room. Oxblood is now cooler and darker, and destructive treatments stay outline-and-text (never a filled oxblood button). |

New supporting tokens: `--surface-card-hover` `#244C3D`, `--surface-card-active`
`#1A3B2F` (the old surface value, now doing honest work as a pressed state) and
`--border-absent`.

---

## Iconography

**There is no icon system, and that is the design.** The brief supplies no icon
set and forbids cocktail-glass iconography, emoji and decorative glyphs. Meaning
is carried by type, colour and rules:

- Affordances are **words in the utility caps voice** — REMOVE, UNDO, CLEAR,
  ADD A BOTTLE — not glyphs.
- The only marks in the UI are three Unicode characters: the fleuron `◆`
  (section dividers), the check `✓` (in-shelf state, always alongside a fill and
  a weight change), and the middle dot `·` (ingredient-run separator).
  Steppers use `–` and `+` set in display Caslon.
- Quantities are **fraction glyphs** (¾ ⅓ ⅘), never bars, rings or gauges.
- No icon font, no SVG sprite, no PNG icons are shipped; `assets/` holds no
  glyph set. If a future surface genuinely needs an icon, bring the proposal to
  the brand owner rather than importing a CDN set — a stroke-icon library would
  read as a different system.

---

## Intentional additions

- **`Button`** (`components/core/`) — the brief specifies button *typography*
  but no button component, and every screen needs one. Caps utility voice,
  2px corners, 44px min height, four variants (primary / secondary / ghost /
  destructive).

Everything else maps 1:1 to the brief's numbered inventory.

---

## Index

| Path | What it is |
| --- | --- |
| `styles.css` | The single entry point consumers link. `@import` lines only. |
| `tokens/colors.css` | Base palette + semantic aliases (the UX vocabulary). |
| `tokens/typography.css` | Families, display/body/caps scales, tracking. |
| `tokens/spacing.css` | 4→64 scale, gutters, tap target, row height. |
| `tokens/shape.css` | 2px radius, hairline/frame rules, focus geometry. |
| `tokens/motion.css` | Durations, easing, reduced-motion collapse. |
| `tokens/fonts.css` | `@font-face` for the three faces, self-hosted from `assets/fonts/`. |
| `guidelines/*.card.html` | 17 foundation specimen cards — Colors, Type, Spacing, Brand. |
| `components/…` | The component library (below). |
| `ui_kits/back-bar-app/` | Desktop + 390px screens: Shelf and Tonight. See its README. |
| `thumbnail.html` | Homepage tile. |
| `SKILL.md` | Agent Skills front matter for use in Claude Code. |
| `assets/fonts/` | The seven woff2 faces and their licences. No logo, icons or imagery — none were supplied. |

### Components

| Group | Components |
| --- | --- |
| `components/inventory/` | `IngredientChip`, `ShelfRow`, `QuantityStepper` |
| `components/drinks/` | `DrinkCard`, `RatioDevice`, `MatchHeader` |
| `components/shopping/` | `ShoppingListItem` |
| `components/navigation/` | `FamilyFilterBar` |
| `components/forms/` | `SearchField` |
| `components/feedback/` | `EmptyState`, `ModalFrame`, `Toast` |
| `components/core/` | `Button` *(intentional addition)* |

Each directory holds `<Name>.jsx`, `<Name>.d.ts`, `<Name>.prompt.md` and one
`@dsCard` HTML showing the component in its states.

---

## Anti-goals

Reject these even when they seem like improvements: a visible system-font
fallback; sans-serif in the brand voice (titles, drink names, ratio numerals) or
in ingredient runs; gradients, glassmorphism, neon, glow; steampunk drift
(gears, aged paper, faux distressing); emoji; cocktail-glass iconography as
decoration; rounded pills; progress rings; lightening the greens for
"readability" — fix contrast with type weight and size first.

---

## Revisions

### Revision 2 — 2 September 2026

Findings from the first UX audit of the consuming app, fixed at the source
(ADR-006: the app never patches the delivery; changes land here as a folder
update). Every change is backward compatible; new props are optional.

| Component | Change | Why |
| --- | --- | --- |
| `FamilyFilterBar` | Bar is `inline-flex; min-width: 100%`; segments `flex: 1 0 auto`. | At 375px the bar clipped its own segments (TIKI and DESSERT never rendered). It now overflows into the consumer's scrolling wrapper. |
| `Button` | `size="sm"` keeps the 44px floor (padding drops to 12px). New `type` prop (default `"button"`). Typings gain `aria-label`, `title`. | The system states a 44px minimum and shipped a 36px variant; forms had no submit button, so Return did not submit. |
| `DrinkCard` | `href` renders a real `<a>`; `favorited` renders a brass ◆ announced "Favorited"; ingredients accept `optional` (cream-400 + "optional", never missing). CAN POUR line is cream-400 with a brass ✓; missing-line is rose-300; no-match cards use the absent border and a cream-400 name instead of opacity; hover steps the border only. | A `<button>` around `<h3>`/`<p>` is invalid and unnamed, and a navigating card should be a link. Brass 11px on green-800 was 4.46:1 and rose-400 13px was 4.10:1; whole-card opacity took every colour below AA and signalled state by colour alone. On the hover surface the caps line and sage run also fell under AA. |
| `ShoppingListItem` | New `detail` prop: one secondary line under the name, caps voice, shared with `unlocks`. `note` remains the trailing italic aside. | Consumers were putting three kinds of fact in two voices. |
| `ShelfRow` | New `optional` prop; remove hover uses rose-300 on the ox wash. | Optional recipe lines need a word, not a strikethrough. Ox-700 text on green-900 was 1.33:1. |
| `SearchField` | Hides the platform search-cancel glyph. | Two clear affordances, one in the platform's blue. |
| `Toast` | `role="alert"` for the destructive tone; action gets a 44px box. | The Undo after a removal should be announced assertively. |
| `RatioDevice` | Labels wrap to 12em. | Ingredient-named parts must fit 390px. |
| all | Styles inject once per document (`<style id="bb-css-…">`) instead of once per instance. | A 50-card index shipped 50 copies of the card CSS. |
| `tokens/fonts.css` | Self-hosted `@font-face`, `font-display: fallback`. | The runtime CDN dependency put the system-font fallback (anti-goal #1) on screen whenever the installed app was offline. |

Not yet revised: the UI kit pages (`ui_kits/back-bar-app/*.html`) load
`_ds_bundle.js`, which is a stale build of revision 1 and fails in a classic
script; rebuild the bundle before relying on the kit.
