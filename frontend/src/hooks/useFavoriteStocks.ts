import { useEffect, useState } from 'react';

const storageKey = 'roxstock:favorite-stocks-v1';
const defaultFavorites = ['hyundai', 'samsung'];

function readFavorites(): Set<string> {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== null) {
      const ids: unknown = JSON.parse(stored);
      if (Array.isArray(ids) && ids.every((id) => typeof id === 'string')) return new Set(ids);
    }
  } catch {
    // Keep the initial favorites if storage is unavailable or contains invalid data.
  }
  return new Set(defaultFavorites);
}

export function useFavoriteStocks() {
  const [favoriteIds, setFavoriteIds] = useState(readFavorites);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...favoriteIds]));
    } catch {
      // Favorites still work for the current screen when storage is unavailable.
    }
  }, [favoriteIds]);

  const toggleFavorite = (id: string) => {
    setFavoriteIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return { favoriteIds, toggleFavorite };
}
