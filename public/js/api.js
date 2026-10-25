// Verbindung zum eigenen Server. Der App-Code wird bei jeder Anfrage mitgeschickt.
import { getSecrets } from './store.js';

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
  /** Fehler, bei denen die Offline-Erkennung eine sinnvolle Alternative ist. */
  get canFallback() {
    return ['offline', 'unreachable', 'timeout', 'upstream_unreachable', 'upstream_busy', 'not_configured'].includes(this.code) || this.status >= 500;
  }
}

export const isOnline = () => navigator.onLine !== false;

async function call(path, body, { code, timeoutMs = 30_000 } = {}) {
  if (!isOnline()) throw new ApiError('offline', 'Du bist gerade offline. Prüfe das WLAN oder die mobilen Daten.');
  const accessCode = code ?? (await getSecrets()).accessCode;
  if (!accessCode) throw new ApiError('no_code', 'Es ist noch kein App-Code eingegeben. Frag deine Eltern.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Code': accessCode },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new ApiError('timeout', 'Der Server hat zu lange gebraucht. Bitte nochmal versuchen.');
    throw new ApiError(isOnline() ? 'unreachable' : 'offline', isOnline() ? 'Der Server ist gerade nicht erreichbar.' : 'Du bist gerade offline.');
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // keine JSON-Antwort, z. B. Fehlerseite eines Proxys
  }
  if (!res.ok) {
    throw new ApiError(data?.error ?? 'http_error', data?.message ?? `Der Server antwortet mit Fehler ${res.status}.`, res.status);
  }
  return data;
}

export const api = {
  check: (code) => call('check', {}, { code, timeoutMs: 15_000 }),
  scan: (images) => call('scan', { images }, { timeoutMs: 180_000 }),
  enrich: (words) => call('enrich', { words }, { timeoutMs: 120_000 }),
};
