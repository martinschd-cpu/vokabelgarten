// Startpunkt des Servers. Alle Einstellungen kommen aus Umgebungsvariablen.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createClaudeService, DEFAULT_MODEL } from './claude.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const int = (value, fallback) => (Number.isFinite(Number.parseInt(value, 10)) ? Number.parseInt(value, 10) : fallback);

const model = env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
const claude = createClaudeService({
  apiKey: env.ANTHROPIC_API_KEY,
  model,
  effort: env.CLAUDE_EFFORT === undefined ? 'medium' : env.CLAUDE_EFFORT.trim(),
});

const app = createApp({
  claude,
  config: {
    accessCode: env.APP_ACCESS_CODE?.trim(),
    publicDir: join(root, 'public'),
    examplesDir: join(root, 'examples'),
    swTemplatePath: join(root, 'server', 'sw-template.js'),
    scanLimitPerHour: int(env.SCAN_LIMIT_PER_HOUR, 30),
    enrichLimitPerHour: int(env.ENRICH_LIMIT_PER_HOUR, 30),
    maxImageBytes: int(env.MAX_IMAGE_MB, 4) * 1024 * 1024,
  },
});

if (!env.APP_ACCESS_CODE) console.warn('Achtung: APP_ACCESS_CODE ist nicht gesetzt. Alle API-Anfragen werden abgelehnt.');
if (!env.ANTHROPIC_API_KEY) console.warn('Achtung: ANTHROPIC_API_KEY ist nicht gesetzt. Scans werden fehlschlagen.');

const port = int(env.PORT, 3000);
app.listen(port, () => console.log(`Vokabelgarten läuft auf Port ${port} (Modell: ${model})`));
