import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB
export const CHUNK_DURATION = 15 * 60; // 15 minutes in seconds
export const MAX_DOWNLOAD_SIZE = 500 * 1024 * 1024; // 500MB

// Track active work directories for cleanup on crash
const activeWorkDirs = new Set<string>();

export function tmpDir(): string {
  const dir = path.join(os.tmpdir(), 'podreader-' + crypto.randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  activeWorkDirs.add(dir);
  return dir;
}

export function cleanUp(dir: string) {
  activeWorkDirs.delete(dir);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`Warning: failed to clean up temp dir ${dir}:`, err);
  }
}

// Clean up any active work directories on process exit
process.on('exit', () => {
  for (const dir of activeWorkDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`Warning: failed to clean up temp dir ${dir} on exit:`, err);
    }
  }
  activeWorkDirs.clear();
});

export function getFileSize(filePath: string): number {
  return fs.statSync(filePath).size;
}

export function reencodeToMp3(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegCommand = ffmpeg(input)
      .audioChannels(1)
      .audioBitrate('64k')
      .audioCodec('libmp3lame')
      .format('mp3')
      .output(output)
      .on('end', () => { clearTimeout(timer); resolve(); })
      .on('error', (err: Error) => {
        clearTimeout(timer);
        if (fs.existsSync(output) && fs.statSync(output).size > 0) {
          console.warn('ffmpeg exited with error but output file exists, continuing:', err.message);
          resolve();
        } else {
          reject(err);
        }
      });
    const timer = setTimeout(() => {
      ffmpegCommand.kill('SIGKILL');
      reject(new Error('ffmpeg re-encode timed out after 15 minutes'));
    }, 15 * 60 * 1000);
    ffmpegCommand.run();
  });
}

export function getAudioDuration(input: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}

export async function splitAudio(input: string, outputDir: string, segmentDuration: number): Promise<string[]> {
  const totalDuration = await getAudioDuration(input);
  const numChunks = Math.ceil(totalDuration / segmentDuration);
  const chunks: string[] = [];

  for (let i = 0; i < numChunks; i++) {
    const startTime = i * segmentDuration;
    const outputFile = path.join(outputDir, `chunk_${String(i).padStart(3, '0')}.mp3`);
    await new Promise<void>((resolve, reject) => {
      const ffmpegCommand = ffmpeg(input)
        .setStartTime(startTime)
        .duration(segmentDuration)
        .audioChannels(1)
        .audioBitrate('64k')
        .audioCodec('libmp3lame')
        .format('mp3')
        .output(outputFile)
        .on('end', () => { clearTimeout(timer); resolve(); })
        .on('error', (err: Error) => {
          clearTimeout(timer);
          if (fs.existsSync(outputFile) && fs.statSync(outputFile).size > 0) {
            console.warn('ffmpeg exited with error but output file exists, continuing:', err.message);
            resolve();
          } else {
            reject(err);
          }
        });
      const timer = setTimeout(() => {
        ffmpegCommand.kill('SIGKILL');
        reject(new Error('ffmpeg split timed out after 15 minutes'));
      }, 15 * 60 * 1000);
      ffmpegCommand.run();
    });
    chunks.push(outputFile);
  }

  return chunks;
}

const MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
  '.mp4': 'audio/mp4',
};

export async function transcribeFile(filePath: string, apiKey: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath) || '.mp3';

  const formData = new FormData();
  formData.append('model', 'whisper-1');
  formData.append('file', new Blob([buffer], { type: MIME_TYPES[ext] || 'audio/mpeg' }), `audio${ext}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Whisper API error ${response.status}: ${err}`);
  }

  const data = await response.json() as { text: string };
  return data.text;
}

export async function transcribeFileLocal(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath) || '.mp3';

  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: MIME_TYPES[ext] || 'audio/mpeg' }), `audio${ext}`);
  formData.append('response_format', 'json');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);
  const response = await fetch('http://127.0.0.1:8178/inference', {
    method: 'POST',
    body: formData,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Local whisper error ${response.status}: ${err}`);
  }

  const data = await response.json() as { text: string };
  return data.text;
}
