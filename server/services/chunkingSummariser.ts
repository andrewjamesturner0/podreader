const CHUNK_CHARS = 16_000;   // ~2,000 tokens (1 token ≈ 4–8 chars)
const OVERLAP_CHARS = 1_600;  // ~200 tokens overlap for context continuity

export async function summariseWithChunking(
  transcript: string,
  callLlm: (text: string, instruction?: string) => Promise<string>,
): Promise<string> {
  const chunks: string[] = [];
  for (let i = 0; i < transcript.length; i += CHUNK_CHARS - OVERLAP_CHARS) {
    chunks.push(transcript.slice(i, i + CHUNK_CHARS));
  }

  // Summarise each chunk serially to avoid concurrent RAM pressure
  const chunkSummaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Chunked summarisation: chunk ${i + 1}/${chunks.length}`);
    chunkSummaries.push(await callLlm(chunks[i]));
  }

  // Compose final summary from chunk summaries
  console.log('Chunked summarisation: composing final summary');
  return callLlm(
    chunkSummaries.join('\n\n'),
    'Synthesise these section summaries into a single coherent thematic summary:',
  );
}
