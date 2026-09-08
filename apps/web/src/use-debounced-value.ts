import { useEffect, useState } from 'react';

export const SEARCH_DEBOUNCE_MILLISECONDS = 300;

export function useDebouncedValue<T>(value: T, delay = SEARCH_DEBOUNCE_MILLISECONDS): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeoutId);
  }, [delay, value]);

  return debouncedValue;
}
