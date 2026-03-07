import { Router } from 'express';
import { getStatus, ensureReady, stop } from '../whisperCpp.js';

const router = Router();

router.get('/local-whisper/status', async (_req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err: any) {
    console.error('Local whisper status error:', err);
    res.status(500).json({ error: 'Failed to get local whisper status' });
  }
});

router.post('/local-whisper/setup', async (_req, res) => {
  try {
    // Fire-and-forget — frontend polls status
    ensureReady().catch((err) => {
      console.error('Local whisper setup error:', err);
    });
    res.json({ message: 'Setup started' });
  } catch (err: any) {
    console.error('Local whisper setup error:', err);
    res.status(500).json({ error: 'Failed to start setup' });
  }
});

router.post('/local-whisper/stop', async (_req, res) => {
  try {
    await stop();
    res.json({ message: 'whisper-server stopped' });
  } catch (err: any) {
    console.error('Local whisper stop error:', err);
    res.status(500).json({ error: 'Failed to stop whisper-server' });
  }
});

export default router;
