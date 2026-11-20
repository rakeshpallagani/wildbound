// Persistence layer. Prototype uses localStorage; swap for a backend (Supabase/Firebase) later.
import { newState } from './engine.js';

const KEY = 'wildbound:v4';

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 4) return s;
    }
  } catch { /* storage unavailable or corrupt */ }
  return newState();
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return newState();
}
