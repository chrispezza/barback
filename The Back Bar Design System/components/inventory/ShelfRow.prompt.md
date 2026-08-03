A ledger line for one bottle on the shelf — use for the Shelf inventory list.

```jsx
<ShelfRow name="Rye whiskey" brand="Rittenhouse" volume="750ml" remaining="¾" onRemove={drop} />
<ShelfRow name="Sweet vermouth" brand="Cocchi" empty />
```

Remaining volume is always a fraction glyph, never a progress bar. The remove action stays invisible until hover or keyboard focus and turns oxblood on hover.
