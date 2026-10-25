// Anbindung an die Claude API: Vokabelfotos erkennen und Beispielsätze ergänzen.
// Bilder werden nur weitergereicht, nie gespeichert oder geloggt.
import Anthropic from '@anthropic-ai/sdk';
import { SCAN_SCHEMA, ENRICH_SCHEMA, parseScanResult, parseEnrichResult, ScanParseError } from './scanSchema.js';
import { SCAN_SYSTEM_PROMPT, SCAN_USER_PROMPT, ENRICH_SYSTEM_PROMPT } from './prompts.js';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

// Modelle, die serverseitige Ausweichmodelle bei einer Ablehnung unterstützen.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

// Preise in US-Dollar pro 1 Mio. Tokens (Eingabe, Ausgabe), nur für die Kostenanzeige.
const PRICES = {
  'claude-fable-5-1': [10, 50],
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};

export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function estimateCostUsd(model, usage) {
  const price = PRICES[model];
  if (!price || !usage) return null;
  const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  const output = usage.output_tokens ?? 0;
  return Math.round(((input * price[0] + output * price[1]) / 1e6) * 10000) / 10000;
}

function mapApiError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AppError(502, 'upstream_auth', 'Der Server hat keinen gültigen Claude-Schlüssel. Bitte Eltern Bescheid sagen.');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AppError(503, 'upstream_busy', 'Die Erkennung ist gerade ausgelastet. Bitte in ein paar Minuten nochmal versuchen.');
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AppError(422, 'upstream_rejected', 'Das Foto konnte nicht verarbeitet werden. Bitte ein anderes Foto versuchen.');
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AppError(502, 'upstream_unreachable', 'Der Erkennungsdienst ist gerade nicht erreichbar. Bitte später nochmal versuchen.');
  }
  if (err instanceof Anthropic.APIError) {
    return new AppError(502, 'upstream_error', 'Bei der Erkennung ist ein Fehler aufgetreten. Bitte nochmal versuchen.');
  }
  return err;
}

/**
 * @param {object} options
 * @param {string} [options.apiKey]
 * @param {string} [options.model]
 * @param {string} [options.effort] leer lassen, um den Modellstandard zu nutzen
 * @param {object} [options.client] eigener Client, z. B. für Tests
 */
export function createClaudeService({ apiKey, model = DEFAULT_MODEL, effort = 'medium', client } = {}) {
  const anthropic = client ?? new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });

  async function request({ system, content, schema, maxTokens }) {
    const params = {
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
      output_config: {
        format: { type: 'json_schema', schema },
        ...(effort ? { effort } : {}),
      },
    };
    let response;
    try {
      response = FALLBACK_MODELS.has(model)
        ? await anthropic.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await anthropic.messages.create(params);
    } catch (err) {
      throw mapApiError(err);
    }
    if (response.stop_reason === 'refusal') {
      throw new AppError(422, 'refused', 'Auf diesem Foto konnten keine Vokabeln erkannt werden. Bitte ein anderes Foto versuchen.');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new AppError(422, 'too_long', 'Auf den Fotos sind zu viele Wörter auf einmal. Bitte weniger Fotos pro Durchgang nehmen.');
    }
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const usedModel = response.model || model;
    return { text, usage: response.usage, model: usedModel, costUsd: estimateCostUsd(usedModel, response.usage) };
  }

  return {
    model,

    /** @param {{mediaType: string, data: string}[]} images Base64 ohne Data-URL-Präfix */
    async scan(images) {
      const content = [
        ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } })),
        { type: 'text', text: SCAN_USER_PROMPT },
      ];
      const res = await request({ system: SCAN_SYSTEM_PROMPT, content, schema: SCAN_SCHEMA, maxTokens: 16000 });
      try {
        return { ...parseScanResult(res.text), usage: res.usage, costUsd: res.costUsd, model: res.model };
      } catch (err) {
        if (err instanceof ScanParseError) {
          throw new AppError(502, 'bad_response', 'Die Erkennung hat eine unlesbare Antwort geliefert. Bitte nochmal versuchen.');
        }
        throw err;
      }
    },

    /** @param {{english: string, german: string[], wordType?: string}[]} words */
    async enrich(words) {
      const list = words
        .map((w, i) => `${i + 1}. ${w.english} = ${w.german.join('; ')}${w.wordType ? ` (${w.wordType})` : ''}`)
        .join('\n');
      const res = await request({
        system: ENRICH_SYSTEM_PROMPT,
        content: [{ type: 'text', text: `Words:\n${list}` }],
        schema: ENRICH_SCHEMA,
        maxTokens: 16000,
      });
      try {
        return { ...parseEnrichResult(res.text, words), usage: res.usage, costUsd: res.costUsd, model: res.model };
      } catch (err) {
        if (err instanceof ScanParseError) {
          throw new AppError(502, 'bad_response', 'Die Beispielsätze konnten nicht gelesen werden. Bitte nochmal versuchen.');
        }
        throw err;
      }
    },
  };
}
