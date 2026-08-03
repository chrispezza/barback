The single text input in the system — shelf search, recipe search, add-a-bottle.

```jsx
<SearchField label="Shelf" value={q} onChange={setQ} onClear={() => setQ("")} />
```

Focus is a 2px brass outline at 2px offset on the whole field; the caret is brass. Clear action appears only when there is a value.
