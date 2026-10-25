// Express-App: liefert die PWA aus und stellt /api/scan und /api/enrich bereit.
import express from 'express';
import { join } from 'node:path';
import { AppError } from './claude.js';
import { requireAccessCode } from './auth.js';
import { createRateLimiter } from './rateLimit.js';
import { validateImages } from './images.js';
import { buildServiceWorker } from './serviceWorker.js';

const HOUR = 60 * 60 * 1000;

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self' blob: data:",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), interest-cohort=()',
  });
  next();
}

// Protokolliert nur Methode, Pfad, Status und Dauer. Niemals Inhalte.
function requestLog(logger) {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/api/')) logger.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  };
}

/**
 * @param {object} deps
 * @param {object} deps.config
 * @param {object} deps.claude Dienst mit scan(images) und enrich(words)
 */
export function createApp({ config, claude, logger = console }) {
  const {
    accessCode,
    publicDir,
    examplesDir,
    swTemplatePath,
    scanLimitPerHour = 30,
    enrichLimitPerHour = 30,
    maxImages = 4,
    maxImageBytes = 4 * 1024 * 1024,
  } = config;

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(requestLog(logger));

  const scanLimiter = createRateLimiter({ limit: scanLimitPerHour, windowMs: HOUR });
  const enrichLimiter = createRateLimiter({ limit: enrichLimitPerHour, windowMs: HOUR });
  const failureLimiter = createRateLimiter({ limit: 20, windowMs: 15 * 60 * 1000 });

  const api = express.Router();
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.get('/health', (req, res) => res.json({ ok: true }));
  api.use(express.json({ limit: Math.ceil(maxImageBytes * 1.4 * maxImages) + 10_000 }));
  api.use(requireAccessCode({ accessCode, failureLimiter }));

  api.post('/check', (req, res) => {
    res.json({ ok: true, model: claude.model, scanLimitPerHour });
  });

  // Zählt erst nach der Eingabeprüfung, damit fehlerhafte Anfragen kein Kontingent verbrauchen.
  const takeQuota = (limiter, res) => {
    const r = limiter.hit('global');
    if (r.ok) return true;
    res.set('Retry-After', String(r.retryAfterSec));
    const minutes = Math.max(1, Math.ceil(r.retryAfterSec / 60));
    res.status(429).json({
      error: 'rate_limited',
      message: `Für diese Stunde sind genug Anfragen gemacht. In etwa ${minutes} Minuten geht es wieder.`,
    });
    return false;
  };

  api.post('/scan', async (req, res, next) => {
    try {
      const images = validateImages(req.body?.images, { maxImages, maxImageBytes });
      if (!takeQuota(scanLimiter, res)) return;
      const result = await claude.scan(images);
      res.json({
        unitTitle: result.unitTitle,
        entries: result.entries,
        notes: result.notes,
        usage: { costUsd: result.costUsd ?? null, model: result.model },
      });
    } catch (err) {
      next(err);
    }
  });

  api.post('/enrich', async (req, res, next) => {
    try {
      const words = req.body?.words;
      if (!Array.isArray(words) || words.length === 0) {
        throw new AppError(400, 'no_words', 'Es wurden keine Wörter mitgeschickt.');
      }
      if (words.length > 40) throw new AppError(400, 'too_many_words', 'Bitte höchstens 40 Wörter auf einmal ergänzen.');
      const clean = words
        .filter((w) => w && typeof w.english === 'string' && w.english.trim())
        .map((w) => ({
          english: w.english.trim().slice(0, 120),
          german: (Array.isArray(w.german) ? w.german : []).map((g) => String(g).slice(0, 120)).slice(0, 8),
          wordType: typeof w.wordType === 'string' ? w.wordType.slice(0, 30) : '',
        }));
      if (!clean.length) throw new AppError(400, 'no_words', 'Es wurden keine Wörter mitgeschickt.');
      if (!takeQuota(enrichLimiter, res)) return;
      const result = await claude.enrich(clean);
      res.json({ items: result.items, usage: { costUsd: result.costUsd ?? null, model: result.model } });
    } catch (err) {
      next(err);
    }
  });

  api.use((req, res) => res.status(404).json({ error: 'not_found', message: 'Diese Adresse gibt es nicht.' }));

  // Fehler immer als verständliches JSON, ohne Inhalte der Anfrage.
  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'too_large', message: 'Die Fotos sind zu groß. Bitte weniger oder kleinere Fotos senden.' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'bad_json', message: 'Die Anfrage war fehlerhaft.' });
    }
    logger.error(`API-Fehler: ${err?.name ?? 'Error'} ${err?.status ?? ''}`.trim());
    res.status(500).json({ error: 'server_error', message: 'Auf dem Server ist ein Fehler aufgetreten.' });
  });

  app.use('/api', api);

  const swSource = buildServiceWorker({ publicDir, examplesDir, templatePath: swTemplatePath });
  app.get('/sw.js', (req, res) => {
    res.set({ 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' });
    res.send(swSource);
  });

  const staticOptions = {
    index: 'index.html',
    setHeaders(res, path) {
      if (path.includes(`${join('vendor', 'tesseract')}`)) res.set('Cache-Control', 'public, max-age=604800');
      else res.set('Cache-Control', 'no-cache');
      if (path.endsWith('.webmanifest')) res.set('Content-Type', 'application/manifest+json');
      if (path.endsWith('.gz')) res.set('Content-Type', 'application/octet-stream');
    },
  };
  app.use('/examples', express.static(examplesDir, staticOptions));
  app.use(express.static(publicDir, staticOptions));

  return app;
}
