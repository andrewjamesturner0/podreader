import { Router } from 'express';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { getSystemPrompt } from '../promptLoader.js';
import { summariseWithChunking } from '../services/chunkingSummariser.js';

const router = Router();

// Fix #12: Allowlist of permitted models per provider
const ALLOWED_MODELS_BY_PROVIDER: Record<string, string[]> = {
  openai: ['gpt-5-mini', 'gpt-4o-mini'],
  anthropic: ['claude-sonnet-4-5-20250929'],
  ollama: ['qwen2.5:3b-instruct'],
};

// Ollama chunking threshold — transcripts longer than this are map-reduced
const OLLAMA_CHUNK_THRESHOLD = parseInt(process.env.OLLAMA_CHUNK_THRESHOLD_CHARS || '16000', 10);

// Ollama per-chunk timeout (default 20 minutes) — applies to each individual LLM call
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_INFERENCE_TIMEOUT_MS || '1200000', 10);

// Serial lock for Ollama — prevents concurrent inference from thrashing RAM/SWAP
let ollamaLock = Promise.resolve<string>('');

function ollamaSerial(fn: () => Promise<string>): Promise<string> {
  const next = ollamaLock.then(fn, fn);
  ollamaLock = next;
  return next;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

router.post('/summarise', async (req, res) => {
  const { transcript, provider, model } = req.body;

  if (!transcript) {
    res.status(400).json({ error: 'Missing transcript' });
    return;
  }

  if (typeof transcript === 'string' && transcript.length > 500_000) {
    res.status(400).json({ error: 'Transcript too long (max 500,000 characters)' });
    return;
  }

  const chosenProvider = provider || 'openai';

  // Fix #12: Validate model against per-provider allowlist
  const allowedForProvider = ALLOWED_MODELS_BY_PROVIDER[chosenProvider];
  if (!allowedForProvider) {
    res.status(400).json({ error: 'Unknown provider' });
    return;
  }
  const chosenModel = model || allowedForProvider[0];
  if (!allowedForProvider.includes(chosenModel)) {
    res.status(400).json({ error: `Model '${chosenModel}' not allowed for provider '${chosenProvider}'. Permitted: ${allowedForProvider.join(', ')}` });
    return;
  }

  const systemPrompt = getSystemPrompt();

  try {
    let summary: string;

    if (chosenProvider === 'openai') {
      // Fix #3: Only use server-side env var for API key
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        res.status(400).json({ error: 'No OpenAI API key configured. Set OPENAI_API_KEY environment variable on the server.' });
        return;
      }
      const openai = new OpenAI({ apiKey, timeout: 120_000 });
      const response = await openai.chat.completions.create({
        model: chosenModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `---TRANSCRIPT START---\n${transcript}\n---TRANSCRIPT END---` },
        ],
        max_completion_tokens: 2000,
      });
      summary = response.choices[0]?.message?.content || '';
    } else if (chosenProvider === 'anthropic') {
      // Fix #3: Only use server-side env var for API key
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.status(400).json({ error: 'No Anthropic API key configured. Set ANTHROPIC_API_KEY environment variable on the server.' });
        return;
      }
      const anthropic = new Anthropic({ apiKey, timeout: 120_000 });
      const response = await anthropic.messages.create({
        model: chosenModel,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `---TRANSCRIPT START---\n${transcript}\n---TRANSCRIPT END---` },
        ],
      });
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
      summary = textBlock?.text ?? '';
    } else if (chosenProvider === 'ollama') {
      const ollama = new OpenAI({
        baseURL: 'http://127.0.0.1:11434/v1',
        apiKey: 'ollama',
      });

      async function callOllama(text: string, instruction?: string): Promise<string> {
        const userContent = instruction
          ? `${instruction}\n\n---TRANSCRIPT START---\n${text}\n---TRANSCRIPT END---`
          : `---TRANSCRIPT START---\n${text}\n---TRANSCRIPT END---`;
        const response = await withTimeout(
          ollama.chat.completions.create({
            model: chosenModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
            max_tokens: 2000,
          }),
          OLLAMA_TIMEOUT_MS,
          'Ollama inference',
        );
        return response.choices[0]?.message?.content || '';
      }

      summary = await ollamaSerial(async () => {
        if (transcript.length > OLLAMA_CHUNK_THRESHOLD) {
          console.log(`Transcript ${transcript.length} chars exceeds chunk threshold, using map-reduce`);
          return summariseWithChunking(transcript, callOllama);
        }
        return callOllama(transcript);
      });
    } else {
      // Should not be reachable due to earlier provider validation
      res.status(400).json({ error: 'Unknown provider' });
      return;
    }

    // Fix formatting: replace Unicode bullets with markdown list markers
    // and ensure blank lines before list items for proper CommonMark parsing
    summary = summary
      .replace(/^(\s*)•\s/gm, '$1- ')       // • → -
      .replace(/^(\s*)–\s/gm, '$1- ')       // – → -
      .replace(/^(\s*)—\s/gm, '$1- ')       // — → -
      .replace(/(\S)\n(- )/g, '$1\n\n$2');   // ensure blank line before list start

    console.log(`Summarisation complete (${chosenProvider}): ${summary.length} chars`);
    res.json({ summary });
  } catch (err: any) {
    // Fix #13: Log full error server-side, return generic message to client
    console.error('Summarisation error:', err);
    res.status(500).json({ error: 'Summarisation failed' });
  }
});

export default router;
