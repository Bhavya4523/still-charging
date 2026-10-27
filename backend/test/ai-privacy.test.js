import test from 'node:test';
import assert from 'node:assert/strict';
import { runAiRequest, validateAiRequest } from '../src/routes/ai.js';
import { askOllama } from '../src/providers/ollama.js';
import { askGroq } from '../src/providers/groq.js';

const valid = { mode: 'local', task: 'normalize', description: 'UPI NETFLIX.COM 14/10/2026 INR 649.00 REF 12345678', language: 'English', consent: true };
const normalized = { provider: 'fake local', text: JSON.stringify({ name: 'Netflix', category: 'Streaming', confidence: 'high', explanation: 'Recognized service name.', alternative: '', warning: '' }) };

test('No-AI mode cannot dispatch to a model provider', async () => {
  let calls = 0;
  await assert.rejects(runAiRequest({ ...valid, mode: 'none' }, { local: async () => calls++, cloud: async () => calls++ }));
  assert.equal(calls, 0);
});

test('local mode calls only the local provider and strips transaction-like fields', async () => {
  let cloudCalls = 0;
  let received;
  const result = await runAiRequest(valid, { local: async input => { received = input; return normalized; }, cloud: async () => { cloudCalls++; } });
  assert.equal(result.data.name, 'Netflix');
  assert.equal(received.description.includes('14/10/2026'), false);
  assert.equal(received.description.includes('649'), false);
  assert.equal(received.description.includes('12345678'), false);
  assert.equal(cloudCalls, 0);
});

test('Ollama provider uses only its configured local endpoint and model', async () => {
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.OLLAMA_BASE_URL;
  const oldModel = process.env.OLLAMA_MODEL;
  let requested;
  process.env.OLLAMA_BASE_URL = 'http://ollama-test:1234/';
  process.env.OLLAMA_MODEL = 'test-gemma';
  globalThis.fetch = async (url, options) => {
    requested = { url, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ name: 'Netflix', category: 'Streaming', confidence: 'high', explanation: 'Known merchant.', alternative: '', warning: '' }) } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await askOllama({ task: 'normalize', description: 'NETFLIX', language: 'English' });
    assert.equal(requested.url, 'http://ollama-test:1234/api/chat');
    assert.equal(requested.body.model, 'test-gemma');
    assert.equal(result.provider, 'Ollama · test-gemma');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = oldUrl;
    if (oldModel === undefined) delete process.env.OLLAMA_MODEL; else process.env.OLLAMA_MODEL = oldModel;
  }
});

test('cloud schema rejects amounts, dates, account identifiers, and transaction arrays', () => {
  for (const extra of [{ amount: 649 }, { date: '2026-10-14' }, { accountNumber: '1234' }, { transactions: [] }, { statement: 'private' }]) {
    assert.throws(() => validateAiRequest({ ...valid, mode: 'cloud', ...extra }), /Only mode/);
  }
  assert.throws(() => validateAiRequest({ ...valid, mode: 'cloud', consent: false }), /consent/);
});

test('missing Groq key fails the selected cloud provider without calling another provider', async () => {
  const prior = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    let localCalls = 0;
    await assert.rejects(askGroq({ task: 'normalize', description: 'NETFLIX', language: 'English' }), /GROQ_API_KEY/);
    await assert.rejects(runAiRequest({ ...valid, mode: 'cloud' }, { local: async () => { localCalls++; return normalized; }, cloud: askGroq }));
    assert.equal(localCalls, 0);
  } finally { if (prior !== undefined) process.env.GROQ_API_KEY = prior; }
});

test('provider failure never triggers a fallback provider', async () => {
  let cloudCalls = 0;
  await assert.rejects(runAiRequest(valid, { local: async () => { throw new Error('Ollama down'); }, cloud: async () => { cloudCalls++; } }), /Ollama down/);
  assert.equal(cloudCalls, 0);
});

test('malformed or incomplete provider JSON is rejected', async () => {
  await assert.rejects(runAiRequest(valid, { local: async () => ({ provider: 'local', text: '{bad json' }) }), /malformed JSON/);
  await assert.rejects(runAiRequest(valid, { local: async () => ({ provider: 'local', text: JSON.stringify({ name: 'X' }) }) }), /invalid merchant/);
});
