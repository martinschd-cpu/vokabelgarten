// Zugangsschutz über einen geheimen App-Code (Umgebungsvariable APP_ACCESS_CODE).
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value) => createHash('sha256').update(String(value), 'utf8').digest();

/** Vergleicht in konstanter Zeit, damit die Antwortzeit nichts über den Code verrät. */
export function codeMatches(expected, given) {
  if (!expected || typeof given !== 'string' || !given) return false;
  return timingSafeEqual(digest(expected), digest(given.trim()));
}

/**
 * Express-Middleware. Erwartet den Code im Header X-App-Code.
 * Zu viele Fehlversuche von einer Adresse werden vorübergehend gesperrt.
 */
export function requireAccessCode({ accessCode, failureLimiter }) {
  return (req, res, next) => {
    if (!accessCode) {
      return res.status(503).json({
        error: 'not_configured',
        message: 'Der Server ist noch nicht eingerichtet (APP_ACCESS_CODE fehlt).',
      });
    }
    const ip = req.ip || 'unknown';
    const blocked = failureLimiter.check(ip);
    if (!blocked.ok) {
      res.set('Retry-After', String(blocked.retryAfterSec));
      return res.status(429).json({
        error: 'too_many_attempts',
        message: 'Zu viele falsche Versuche. Bitte später nochmal probieren.',
      });
    }
    if (!codeMatches(accessCode, req.get('x-app-code'))) {
      failureLimiter.hit(ip);
      return res.status(401).json({ error: 'invalid_code', message: 'Der App-Code stimmt nicht.' });
    }
    next();
  };
}
