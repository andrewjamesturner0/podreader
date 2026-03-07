import { Router } from 'express';
import { getStatus, ensureReady, stop } from '../ollama.js';

const router = Router();

router.get('/local-llm/status', async (_req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err: any) {
    console.error('Local LLM status error:', err);
    res.status(500).json({ error: 'Failed to get local LLM status' });
  }
});

router.post('/local-llm/setup', async (_req, res) => {
  try {
    // Fire-and-forget — frontend polls status
    ensureReady().catch((err) => {
      console.error('Local LLM setup error:', err);
    });
    res.json({ message: 'Setup started' });
  } catch (err: any) {
    console.error('Local LLM setup error:', err);
    res.status(500).json({ error: 'Failed to start setup' });
  }
});

router.post('/local-llm/stop', async (_req, res) => {
  try {
    await stop();
    res.json({ message: 'Ollama stopped' });
  } catch (err: any) {
    console.error('Local LLM stop error:', err);
    res.status(500).json({ error: 'Failed to stop Ollama' });
  }
});

export default router;
