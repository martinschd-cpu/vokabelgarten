import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { createClaudeService, estimateCostUsd, AppError } from '../server/claude.js';

function fakeClient(response, sink) {
  const create = async (params) => {
    sink.push(params);
    if (response instanceof Error) throw response;
    return response;
  };
  return { messages: { create }, beta: { messages: { create } } };
}

const okResponse = (payload) => ({
  model: 'claude-opus-5-5',
  stop_reason: 'end_turn',
  usage: { input_tokens: 3000, output_tokens: 2000 },
  content: [{ type: 'text', text: JSON.stringify(payload) }],
});

test('Scan-Anfrage: Bild, strukturierte Ausgabe, Modell und Ausweichmodell', async () => {
  const sink = [];
  const svc = createClaudeService({
    model: 'claude-opus-5-5',
    client: fakeClient(okResponse({ unitTitle: 'Unit 2', entries: [{ english: 'cat', german: ['Katze'], phonetic: '', exampleSentence: '', exampleSentenceDe: '', wordType: '', confidence: 'hoch' }], notes: '' }), sink),
  });
  const r = await svc.scan([{ mediaType: 'image/jpeg', data: 'AAAA' }]);
  const p = sink[0];
  assert.equal(p.model, 'claude-opus-5-5');
  assert.equal(p.messages[0].content[0].type, 'image');
  assert.equal(p.messages[0].content[0].source.media_type, 'image/jpeg');
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.equal(p.output_config.effort, 'medium');
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(p.tool_choice, undefined, 'kein erzwungener Tool-Aufruf');
  assert.match(p.system, /sb\., sth\./);
  assert.equal(r.unitTitle, 'Unit 2');
  assert.equal(r.entries[0].english, 'cat');
  assert.equal(r.costUsd, 0.052);
});

test('andere Modelle ohne Ausweichmodell, Aufwand abschaltbar', async () => {
  const sink = [];
  const svc = createClaudeService({ model: 'claude-haiku-5-5', effort: '', client: fakeClient(okResponse({ unitTitle: '', entries: [], notes: '' }), sink) });
  await svc.scan([{ mediaType: 'image/png', data: 'AAAA' }]);
  assert.equal(sink[0].fallbacks, undefined);
  assert.equal(sink[0].output_config.effort, undefined);
});

test('Ablehnung und abgeschnittene Antworten werden zu verständlichen Fehlern', async () => {
  for (const stop of ['refusal', 'max_tokens']) {
    const svc = createClaudeService({ client: fakeClient({ ...okResponse({}), stop_reason: stop }, []) });
    await assert.rejects(svc.scan([{ mediaType: 'image/jpeg', data: 'A' }]), (e) => e instanceof AppError && e.status === 422);
  }
  const garbage = { ...okResponse({}), content: [{ type: 'text', text: 'nicht json' }] };
  const svc = createClaudeService({ client: fakeClient(garbage, []) });
  await assert.rejects(svc.scan([{ mediaType: 'image/jpeg', data: 'A' }]), (e) => e.code === 'bad_response');
});

test('API-Fehler werden auf deutsche Meldungen abgebildet', async () => {
  const conn = new Anthropic.APIConnectionError({ message: 'down' });
  const svc = createClaudeService({ client: fakeClient(conn, []) });
  await assert.rejects(svc.scan([{ mediaType: 'image/jpeg', data: 'A' }]), (e) => e.code === 'upstream_unreachable' && /nicht erreichbar/.test(e.message));
});

test('Ergänzen-Anfrage enthält die Wörter', async () => {
  const sink = [];
  const svc = createClaudeService({ client: fakeClient(okResponse({ items: [{ english: 'dog', exampleSentence: 'I have a dog.', exampleSentenceDe: 'Ich habe einen Hund.' }] }), sink) });
  const r = await svc.enrich([{ english: 'dog', german: ['Hund'], wordType: 'n' }]);
  assert.match(sink[0].messages[0].content[0].text, /1\. dog = Hund \(n\)/);
  assert.equal(r.items[0].exampleSentenceDe, 'Ich habe einen Hund.');
});

test('Kostenschätzung', () => {
  assert.equal(estimateCostUsd('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 0 }), 4);
  assert.equal(estimateCostUsd('unbekannt', { input_tokens: 1 }), null);
});
