import { useEffect, useState } from 'react';
import {useAuth} from '../auth/AuthGate';
import {authRequest} from '../auth/client';

const storageKey = 'roxstock:favorite-stocks-v1';
const defaultFavorites = ['hyundai', 'samsung'];

function readFavorites(key=storageKey): Set<string> {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      const ids: unknown = JSON.parse(stored);
      if (Array.isArray(ids) && ids.every((id) => typeof id === 'string')) return new Set(ids);
    }
  } catch {
    // Keep the initial favorites if storage is unavailable or contains invalid data.
  }
  return new Set(key===storageKey?defaultFavorites:[]);
}

export function useFavoriteStocks() {
  const {user}=useAuth();
  const key=user?`roxstock:user:${user.id}:favorite-stocks`:storageKey;
  const [favoriteIds, setFavoriteIds] = useState(()=>readFavorites(key));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify([...favoriteIds]));
    } catch {
      // Favorites still work for the current screen when storage is unavailable.
    }
  }, [favoriteIds]);

  const toggleFavorite = (id: string) => {
    setFavoriteIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if(user)void authRequest('settings',{favorites:[...next]}).catch(()=>{});
      return next;
    });
  };

  return { favoriteIds, toggleFavorite };
}
