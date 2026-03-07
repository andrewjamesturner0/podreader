const YOUTUBE_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|m\.youtube\.com\/watch\?.*v=)([\w-]{11})/,
];

/**
 * Extract a YouTube video ID from a URL, or return null if not a YouTube URL.
 */
export function extractYouTubeVideoId(url: string): string | null {
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
