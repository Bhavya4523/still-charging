import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { askOllama, checkOllama } from '../providers/ollama.js';
import { askGroq } from '../providers/groq.js';

const router = Router();

const allowedKeys = new Set(['mode', 'task', 'description', 'language', 'consent']);
export function validateAiRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowedKeys.has(key))) {
    throw new Error('Only mode, task, one merchant description, language, and consent are accepted.');
  }
  const { mode, task, description, language, consent } = body;
  if (!['local', 'cloud'].includes(mode) || !['normalize', 'draft'].includes(task) || typeof description !== 'string' || !description.trim() || description.length > 120) {
    throw new Error('Choose Local AI or Cloud AI and send one merchant description for an allowed task.');
  }
  if (!['English', 'Hindi', 'Marathi'].includes(language)) throw new Error('Unsupported draft language.');
  if (mode === 'cloud' && consent !== true) throw new Error('Cloud AI requires explicit consent for this request.');
  if (mode === 'local' && consent !== true) throw new Error('Confirm that this request will be processed by your local model.');
  const descriptionClean = description.trim()
    .replace(/\b\d{1,4}[/-]\d{1,2}[/-]\d{2,4}\b/g, '[date removed]')
    .replace(/(?:₹|\bINR\b|\bUSD\b|\$)\s?[\d,]+(?:\.\d{1,2})?/gi, '[amount removed]')
    .replace(/(?:^|\s)[-+]?\d[\d,]*(?:\.\d{1,2})?(?=\s|$)/g, ' [amount removed] ')
    .replace(/\b(?:x{2,}|\*{2,})[\dx* -]{0,12}\b/gi, '[reference removed]')
    .replace(/\b\d{4,}\b/g, '[reference removed]')
    .slice(0, 120);
  if (!descriptionClean.replace(/\[[^\]]+\]/g, '').trim()) throw new Error('No merchant name remains after removing transaction details.');
  const input = { task, description: descriptionClean, language };
  return { mode, input };
}

export async function runAiRequest(body, providers = { local: askOllama, cloud: askGroq }) {
  const { mode, input } = validateAiRequest(body);
  const response = await providers[mode](input);
  return validateProviderResult(input.task, response);
}

function validateProviderResult(task, response) {
  if (!response || typeof response !== 'object' || typeof response.text !== 'string') throw new Error('The model response was not valid. Please try again.');
  let data;
  try { data = JSON.parse(response.text.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim()); } catch { throw new Error('The model returned malformed JSON. Please try again.'); }
  if (task === 'normalize') {
    if (typeof data.name !== 'string' || data.name.length > 80 || typeof data.explanation !== 'string' || data.explanation.length > 240 || !['low', 'medium', 'high'].includes(data.confidence) || (data.alternative != null && typeof data.alternative !== 'string') || (data.warning != null && typeof data.warning !== 'string')) throw new Error('The model returned an invalid merchant suggestion. Please try again.');
    data = { name: data.name, explanation: data.explanation, confidence: data.confidence, alternative: data.alternative || '', warning: data.warning || '', category: typeof data.category === 'string' ? data.category.slice(0, 40) : 'Uncategorized' };
  } else {
    if (typeof data.subject !== 'string' || data.subject.length > 120 || typeof data.message !== 'string' || data.message.length > 1600) throw new Error('The model returned an invalid draft. Please try again.');
    data = { subject: data.subject, message: data.message };
  }
  return { provider: response.provider, data };
}

router.get('/status', async (req, res) => {
  const mode = req.query.mode;
  if (mode === 'cloud') return res.json({ mode, configured: Boolean(process.env.GROQ_API_KEY), available: Boolean(process.env.GROQ_API_KEY), provider: 'Groq', message: process.env.GROQ_API_KEY ? 'Cloud model is configured.' : 'Add GROQ_API_KEY to the backend environment.' });
  if (mode === 'local') {
    try {
      const status = await checkOllama();
      return res.json({ mode, ...status });
    } catch {
      return res.json({ mode, configured: true, available: false, provider: 'Ollama', message: 'Start Ollama locally and download the configured Gemma model.' });
    }
  }
  return res.status(400).json({ error: 'Choose local or cloud mode to check availability.' });
});

router.post('/', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false }), async (req, res) => {
  try {
    return res.json(await runAiRequest(req.body));
  } catch (error) {
    const clientError = /accepted|Choose|Unsupported|consent|Confirm|remains/.test(error.message);
    return res.status(clientError ? 400 : 503).json({ error: clientError ? error.message : `${error.message || 'AI is unavailable.'} Your statement remains in this browser; continue without AI or check the selected provider.` });
  }
});

export default router;
