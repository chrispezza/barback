The workhorse of the Tonight and Recipes screens.

```jsx
<DrinkCard name="Daiquiri" family="Sour" match="full"
  ingredients={[{name:"White rum",have:true},{name:"Lime juice",have:true},{name:"Simple syrup",have:true}]} />
```

Match states: `full` (brass name, "Can pour"), `partial`, `near` (exactly one missing — pairs with a rose "One bottle away" line), `none` (dimmed). Stock is never colour alone: absent ingredients also drive the missing-line text.
