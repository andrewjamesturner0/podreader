import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { parseSrt } from '../utils/srtParser.js';
import {
  tmpDir, cleanUp, getFileSize, reencodeToMp3, splitAudio,
  transcribeFile, transcribeFileLocal,
  MAX_CHUNK_SIZE, CHUNK_DURATION,
} from '../utils/transcription.js';

const execFileAsync = promisify(execFile);

const router = Router();

const YOUTUBE_URL_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|m\.youtube\.com\/watch\?v=)/;

function isYouTubeUrl(url: string): boolean {
  return YOUTUBE_URL_RE.test(url);
}

// POST /api/youtube/info — fetch video metadata via yt-dlp
router.post('/youtube/info', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing url' });
    return;
  }
  if (!isYouTubeUrl(url)) {
    res.status(400).json({ error: 'Not a valid YouTube URL' });
    return;
  }

  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--dump-json', '--no-download', url,
    ], { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 });

    const info = JSON.parse(stdout);
    res.json({
      videoId: info.id,
      title: info.title || info.fulltitle || 'Untitled',
      description: info.description || '',
      duration: info.duration ? String(info.duration) : '',
      pubDate: info.upload_date
        ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}`
        : '',
      thumbnailUrl: info.thumbnail || '',
    });
  } catch (err: any) {
    console.error('YouTube info error:', err);
    res.status(500).json({ error: 'Failed to fetch YouTube video info' });
  }
});

// POST /api/youtube/transcript — get transcript (captions-first, Whisper fallback)
router.post('/youtube/transcript', async (req, res) => {
  const { url, provider = 'openai' } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing url' });
    return;
  }
  if (!isYouTubeUrl(url)) {
    res.status(400).json({ error: 'Not a valid YouTube URL' });
    return;
  }

  const workDir = tmpDir();

  try {
    // Step 1: Try to get captions
    console.log('Attempting to fetch YouTube captions...');
    let transcript: string | null = null;
    let source: 'captions' | 'whisper' = 'captions';

    try {
      await execFileAsync('yt-dlp', [
        '--write-auto-sub', '--write-sub',
        '--sub-lang', 'en',
        '--skip-download',
        '--convert-subs', 'srt',
        '-o', path.join(workDir, '%(id)s'),
        url,
      ], { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 });

      // Find the .srt file
      const files = fs.readdirSync(workDir).filter(f => f.endsWith('.srt'));
      if (files.length > 0) {
        const srtContent = fs.readFileSync(path.join(workDir, files[0]), 'utf-8');
        const parsed = parseSrt(srtContent);
        if (parsed.length > 50) {
          transcript = parsed;
          console.log(`Got captions: ${transcript.length} chars`);
        }
      }
    } catch (err) {
      console.log('No captions available, will fall back to Whisper');
    }

    // Step 2: Fall back to Whisper if no captions
    if (!transcript) {
      if (provider === 'openai' && !apiKey) {
        res.status(400).json({ error: 'No captions available and no OpenAI API key configured for Whisper fallback.' });
        return;
      }

      source = 'whisper';
      console.log('Downloading YouTube audio for Whisper transcription...');

      await execFileAsync('yt-dlp', [
        '-x', '--audio-format', 'mp3',
        '--audio-quality', '9',
        '-o', path.join(workDir, 'audio.%(ext)s'),
        url,
      ], { timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });

      // Find the downloaded audio file
      const audioFiles = fs.readdirSync(workDir).filter(f =>
        f.startsWith('audio.') && !f.endsWith('.srt')
      );
      if (audioFiles.length === 0) {
        throw new Error('Failed to download YouTube audio');
      }

      const rawFile = path.join(workDir, audioFiles[0]);
      const fileSize = getFileSize(rawFile);
      console.log(`Downloaded YouTube audio: ${(fileSize / 1024 / 1024).toFixed(1)}MB`);

      let filesToTranscribe: string[];

      if (fileSize > MAX_CHUNK_SIZE) {
        console.log('File too large, re-encoding to mp3...');
        const encodedFile = path.join(workDir, 'encoded.mp3');
        await reencodeToMp3(rawFile, encodedFile);

        const encodedSize = getFileSize(encodedFile);
        if (encodedSize > MAX_CHUNK_SIZE) {
          console.log('Still too large, splitting into chunks...');
          const chunkDir = path.join(workDir, 'chunks');
          fs.mkdirSync(chunkDir, { recursive: true });
          filesToTranscribe = await splitAudio(encodedFile, chunkDir, CHUNK_DURATION);
        } else {
          filesToTranscribe = [encodedFile];
        }
      } else {
        filesToTranscribe = [rawFile];
      }

      const transcripts: string[] = [];
      for (let i = 0; i < filesToTranscribe.length; i++) {
        console.log(`Transcribing chunk ${i + 1}/${filesToTranscribe.length} (provider: ${provider})...`);
        const text = provider === 'local'
          ? await transcribeFileLocal(filesToTranscribe[i])
          : await transcribeFile(filesToTranscribe[i], apiKey!);
        transcripts.push(text);
      }

      transcript = transcripts.join(' ');
      console.log(`YouTube Whisper transcription complete: ${transcript.length} chars`);
    }

    res.json({ transcript, source });
  } catch (err: any) {
    console.error('YouTube transcript error:', err);
    res.status(500).json({ error: 'Failed to get YouTube transcript' });
  } finally {
    cleanUp(workDir);
  }
});

export default router;
