One ingredient as a tappable 44px chip — use anywhere the user adds, removes or filters by ingredient.

```jsx
<IngredientChip label="Lime juice" state="have" onToggle={() => toggle("lime")} />
<IngredientChip label="Orgeat" state="absent" />
```

States: `default` (outlined), `have` (brass fill, green text, ✓ mark — never colour alone), `absent` (sage), plus `disabled`. Focus-visible is a 2px brass outline at 2px offset.
