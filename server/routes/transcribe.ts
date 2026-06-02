import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { validateUrl } from '../utils/urlValidation.js';
import {
  tmpDir, cleanUp, getFileSize, reencodeToMp3, splitAudio,
  transcribeFile, transcribeFileLocal,
  MAX_CHUNK_SIZE, CHUNK_DURATION, MAX_DOWNLOAD_SIZE,
} from '../utils/transcription.js';

const router = Router();

// Fix #2: Download with size limit
async function downloadAudio(url: string, dest: string): Promise<void> {
  const headers: Record<string, string> = {
    'User-Agent': 'PodReader/1.0',
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 minutes
  const res = await fetch(url, { headers, signal: controller.signal }).finally(() => clearTimeout(timeout));
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download audio: ${res.status}`);
  }

  // Check Content-Length header if available
  const contentLength = res.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_DOWNLOAD_SIZE) {
    throw new Error('Audio file exceeds maximum allowed size');
  }

  const nodeStream = Readable.fromWeb(res.body as any);
  const writeStream = fs.createWriteStream(dest);

  let downloaded = 0;
  nodeStream.on('data', (chunk: Buffer) => {
    downloaded += chunk.length;
    if (downloaded > MAX_DOWNLOAD_SIZE) {
      nodeStream.destroy(new Error('Audio file exceeds maximum allowed size'));
    }
  });

  await pipeline(nodeStream, writeStream);
}

router.post('/transcribe', async (req, res) => {
  const { audioUrl, provider = 'openai' } = req.body;
  // Fix #3: Only use server-side env var for API key
  const apiKey = process.env.OPENAI_API_KEY;

  if (!audioUrl) {
    res.status(400).json({ error: 'Missing audioUrl' });
    return;
  }
  if (provider === 'openai' && !apiKey) {
    res.status(400).json({ error: 'No OpenAI API key configured. Set OPENAI_API_KEY environment variable on the server.' });
    return;
  }

  // Fix #2: Validate audio URL against SSRF
  const validation = await validateUrl(audioUrl);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error || 'Invalid audio URL' });
    return;
  }

  const workDir = tmpDir();
  const parsedAudioUrl = new URL(audioUrl);
  const ext = path.extname(parsedAudioUrl.pathname) || '.mp3';
  const rawFile = path.join(workDir, `audio_raw${ext}`);

  try {
    // Fix #17: Sanitised log messages — no URLs
    console.log('Starting audio download...');
    // Fetch using the original URL — DNS was already validated above.
    // We don't pin to the resolved IP because it breaks TLS SNI for HTTPS URLs.
    await downloadAudio(audioUrl, rawFile);
    const fileSize = getFileSize(rawFile);
    console.log(`Downloaded: ${(fileSize / 1024 / 1024).toFixed(1)}MB`);

    let filesToTranscribe: string[];

    if (fileSize > MAX_CHUNK_SIZE) {
      // Re-encode to smaller format and split
      console.log('File too large, re-encoding to mp3...');
      const encodedFile = path.join(workDir, 'audio.mp3');
      await reencodeToMp3(rawFile, encodedFile);

      const encodedSize = getFileSize(encodedFile);
      console.log(`Re-encoded: ${(encodedSize / 1024 / 1024).toFixed(1)}MB`);

      if (encodedSize > MAX_CHUNK_SIZE) {
        console.log('Still too large, splitting into chunks...');
        const chunkDir = path.join(workDir, 'chunks');
        fs.mkdirSync(chunkDir, { recursive: true });
        filesToTranscribe = await splitAudio(encodedFile, chunkDir, CHUNK_DURATION);
        console.log(`Split into ${filesToTranscribe.length} chunks`);
      } else {
        filesToTranscribe = [encodedFile];
      }
    } else {
      filesToTranscribe = [rawFile];
    }

    // Transcribe each chunk sequentially
    const transcripts: string[] = [];
    for (let i = 0; i < filesToTranscribe.length; i++) {
      console.log(`Transcribing chunk ${i + 1}/${filesToTranscribe.length} (provider: ${provider})...`);
      const text = provider === 'local'
        ? await transcribeFileLocal(filesToTranscribe[i])
        : await transcribeFile(filesToTranscribe[i], apiKey!);
      transcripts.push(text);
    }

    const transcript = transcripts.join(' ');
    // Fix #17: Log character count, not URLs
    console.log(`Transcription complete: ${transcript.length} chars`);

    res.json({ transcript });
  } catch (err: any) {
    // Fix #13: Log full error server-side, return generic message to client
    console.error('Transcription error:', err);
    res.status(500).json({ error: 'Transcription failed' });
  } finally {
    cleanUp(workDir);
  }
});

export default router;
