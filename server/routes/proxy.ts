import { Router } from 'express';
import Parser from 'rss-parser';
import { validateUrl } from '../utils/urlValidation.js';

const router = Router();
const parser = new Parser({
  customFields: {
    item: [['itunes:duration', 'itunesDuration'], ['enclosure', 'enclosure']],
  },
});

// Fix bare attributes (e.g. <tag attr> -> <tag attr="attr">) which are invalid XML
// but appear in some podcast feeds like BBC.
function sanitizeXml(xml: string): string {
  return xml.replace(/<([a-zA-Z][a-zA-Z0-9:_-]*)((?:\s+[a-zA-Z][a-zA-Z0-9:_-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*\s*)(\/?)>/g,
    (_match, tag, attrs, close) => {
      const fixed = attrs.replace(
        /\s+([a-zA-Z][a-zA-Z0-9:_-]*)(?=\s+[a-zA-Z]|\/?>|\s*$)(?!\s*=)/g,
        ' $1="$1"'
      );
      return `<${tag}${fixed}${close}>`;
    }
  );
}

router.get('/feed', async (req, res) => {
  const url = req.query.url;
  if (typeof url !== 'string' || !url) {
    res.status(400).json({ error: 'Missing or invalid url parameter' });
    return;
  }

  // Fix #1 / #16: Validate URL scheme and reject private/internal IPs
  const validation = await validateUrl(url);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error || 'Invalid URL' });
    return;
  }

  try {
    // Fetch using the original URL — DNS was already validated above to block
    // private/internal IPs (SSRF protection). We don't pin to the resolved IP
    // because replacing the hostname breaks TLS SNI for HTTPS URLs.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000); // 30s timeout
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'PodReader/1.0',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const rawXml = await response.text();
    const xml = sanitizeXml(rawXml);
    const feed = await parser.parseString(xml);

    const episodes = (feed.items || []).map(item => {
      const audioUrl =
        item.enclosure?.url ||
        (item as any).enclosure?.['$']?.url ||
        '';

      return {
        guid: item.guid || item.link || item.title || '',
        feedUrl: url,
        title: item.title || 'Untitled',
        pubDate: item.isoDate || item.pubDate || '',
        duration: (item as any).itunesDuration || '',
        audioUrl,
        description: item.contentSnippet || item.content || '',
      };
    });

    // Sanitise image URL to only allow http/https protocols
    const rawImageUrl = feed.image?.url || (feed as any).itunes?.image || '';
    let safeImageUrl = '';
    if (rawImageUrl) {
      try {
        const imgParsed = new URL(rawImageUrl);
        if (imgParsed.protocol === 'http:' || imgParsed.protocol === 'https:') {
          safeImageUrl = rawImageUrl;
        }
      } catch {
        // Invalid URL — leave empty
      }
    }

    res.json({
      title: feed.title || 'Untitled Feed',
      description: feed.description || '',
      imageUrl: safeImageUrl,
      episodes,
    });
  } catch (err: any) {
    // Fix #13: Log full error server-side, return generic message to client
    console.error('Feed fetch error:', err);
    res.status(502).json({ error: 'Failed to fetch feed' });
  }
});

export default router;
