/**
 * Parse SRT subtitle content into plain text, stripping timestamps and indices.
 */
export function parseSrt(srt: string): string {
  return srt
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      // Skip empty lines, sequence numbers, and timestamp lines
      if (!trimmed) return false;
      if (/^\d+$/.test(trimmed)) return false;
      if (/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(trimmed)) return false;
      return true;
    })
    .map(line => line.replace(/<[^>]+>/g, '').trim()) // strip HTML tags (yt-dlp sometimes includes them)
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
