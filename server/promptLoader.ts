import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const promptPath = path.resolve(__dirname, '..', 'prompt.md');

let cached: string | null = null;

export function getSystemPrompt(): string {
  if (!cached) {
    cached = fs.readFileSync(promptPath, 'utf-8');
  }
  return cached;
}
