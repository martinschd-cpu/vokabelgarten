// Einfaches Rate Limit mit gleitendem Zeitfenster, im Arbeitsspeicher.
// Für eine private App mit einer Serverinstanz reicht das völlig aus.

export function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map();

  function prune(key, t) {
    const list = (hits.get(key) ?? []).filter((ts) => t - ts < windowMs);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  }

  return {
    /** Zählt einen Versuch. Liefert ok=false, wenn das Limit erreicht ist. */
    hit(key = 'global') {
      const t = now();
      const list = prune(key, t);
      if (list.length >= limit) {
        return { ok: false, remaining: 0, retryAfterSec: Math.ceil((windowMs - (t - list[0])) / 1000) };
      }
      list.push(t);
      hits.set(key, list);
      return { ok: true, remaining: limit - list.length, retryAfterSec: 0 };
    },
    /** Prüft, ohne zu zählen. */
    check(key = 'global') {
      const t = now();
      const list = prune(key, t);
      if (list.length >= limit) {
        return { ok: false, retryAfterSec: Math.ceil((windowMs - (t - list[0])) / 1000) };
      }
      return { ok: true, retryAfterSec: 0 };
    },
  };
}
