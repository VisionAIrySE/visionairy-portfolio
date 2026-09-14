const { readAnswer } = require('./readAnswer.js');

function makeOpenRouterPool({
  model = 'openai/gpt-5.6-luna',
  apiKey,
  ceilingUsd = 2,
  hardKillMs = 30000,
  maxTokens = 400,
  fetchFn = fetch,
  onCall = null,
} = {}) {
  let spent = 0;
  let reserved = 0;
  let closed = false;
  const reservationPerCall = 0.01;

  async function ask(question) {
    const began = Date.now();
    if (closed) return { answer: null, why: 'the OpenRouter writer is closed', readerExhausted: true };
    if (!apiKey) return { answer: null, why: 'OpenRouter access is not configured', readerExhausted: true };
    if (spent + reserved + reservationPerCall > ceilingUsd) {
      return { answer: null, why: `the OpenRouter $${ceilingUsd.toFixed(2)} run ceiling was reached`, readerExhausted: true };
    }
    reserved += reservationPerCall;
    try {
      const response = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Write polished business English and answer with JSON only. No preamble or code fences.' },
            { role: 'user', content: String(question) },
          ],
          temperature: 0.2,
          max_tokens: maxTokens,
          reasoning: { effort: 'none' },
          usage: { include: true },
        }),
        signal: AbortSignal.timeout(hardKillMs),
      });
      if (!response.ok) {
        let why = `OpenRouter returned ${response.status}`;
        try {
          const failure = await response.json();
          if (failure.error && failure.error.message) why += `: ${String(failure.error.message).slice(0, 160)}`;
        } catch { /* status remains useful */ }
        return { answer: null, why, readerExhausted: [401, 402, 403, 429].includes(response.status) };
      }
      const payload = await response.json();
      const cost = Number(payload.usage && payload.usage.cost || 0);
      spent += cost;
      const text = String(payload.choices?.[0]?.message?.content || '');
      const parsed = readAnswer(text);
      if (onCall) onCall({ ms: Date.now() - began, answered: Boolean(parsed && parsed.answer), cost, spent });
      return parsed;
    } catch (error) {
      return { answer: null, why: error.name === 'TimeoutError' ? 'OpenRouter did not answer within the time limit' : error.message };
    } finally {
      reserved -= reservationPerCall;
    }
  }

  return {
    ask,
    close() { closed = true; },
    get spent() { return spent; },
    get waiting() { return 0; },
  };
}

module.exports = { makeOpenRouterPool };
