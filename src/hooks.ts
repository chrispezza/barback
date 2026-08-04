import { useEffect, useState } from 'preact/hooks';

/** Debounce a changing value — used by the type-ahead pickers. */
export function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
