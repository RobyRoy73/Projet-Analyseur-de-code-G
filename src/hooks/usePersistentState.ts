import { useEffect, useState } from 'react';

/** useState mémorisé dans localStorage. Si le stockage est bloqué, l'état reste en mémoire. */
export function usePersistentState<T extends object>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? ({ ...initial, ...(JSON.parse(raw) as Partial<T>) } as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* stockage indisponible : on ignore */
    }
  }, [key, value]);
  return [value, setValue];
}

/** Déclenche le téléchargement d'un fichier texte généré dans le navigateur. */
export function downloadText(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
